import express from 'express';
import { realtimeGateway } from './realtime.gateway.js';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { realtimeGatewayTesting } from './realtime.gateway.js';

const router = express.Router();
const realtimeTokenBuckets = new Map();
const realtimeTokenIdempotencyCache = new Map();

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS = parsePositiveInt(process.env.REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS, 20);
const REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS, 60_000);
const REALTIME_TOKEN_IDEMPOTENCY_TTL_MS = parsePositiveInt(process.env.REALTIME_TOKEN_IDEMPOTENCY_TTL_MS, 15_000);
const REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH = parsePositiveInt(process.env.REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH, 128);
const REALTIME_TOKEN_IDEMPOTENCY_MAX_ENTRIES = parsePositiveInt(process.env.REALTIME_TOKEN_IDEMPOTENCY_MAX_ENTRIES, 1000);
const REALTIME_TOKEN_STATE_CLEANUP_INTERVAL = parsePositiveInt(process.env.REALTIME_TOKEN_STATE_CLEANUP_INTERVAL, 50);

let realtimeTokenStateOperationCount = 0;

function cleanupRealtimeTokenState(now = Date.now()) {
  for (const [userId, bucket] of realtimeTokenBuckets.entries()) {
    if (now - bucket.windowStart >= REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS) {
      realtimeTokenBuckets.delete(userId);
    }
  }

  for (const [cacheKey, entry] of realtimeTokenIdempotencyCache.entries()) {
    if (now >= entry.expiresAt) {
      realtimeTokenIdempotencyCache.delete(cacheKey);
    }
  }
}

function maybeCleanupRealtimeTokenState(now = Date.now()) {
  realtimeTokenStateOperationCount += 1;
  if (realtimeTokenStateOperationCount % REALTIME_TOKEN_STATE_CLEANUP_INTERVAL !== 0) {
    return;
  }

  cleanupRealtimeTokenState(now);
}

function enforceIdempotencyCacheCapacity() {
  while (realtimeTokenIdempotencyCache.size > REALTIME_TOKEN_IDEMPOTENCY_MAX_ENTRIES) {
    const oldestKey = realtimeTokenIdempotencyCache.keys().next().value;
    if (!oldestKey) {
      break;
    }

    realtimeTokenIdempotencyCache.delete(oldestKey);
  }
}

function buildIdempotencyCacheKey(userId, idempotencyKey) {
  return `${userId}:${idempotencyKey}`;
}

function readRealtimeTokenResponseFromCache(userId, idempotencyKey) {
  maybeCleanupRealtimeTokenState();

  const cacheKey = buildIdempotencyCacheKey(userId, idempotencyKey);
  const existing = realtimeTokenIdempotencyCache.get(cacheKey);

  if (!existing) {
    return null;
  }

  const now = Date.now();
  if (now >= existing.expiresAt) {
    realtimeTokenIdempotencyCache.delete(cacheKey);
    return null;
  }

  return existing.payload;
}

function cacheRealtimeTokenResponseForKey(userId, idempotencyKey, payload) {
  maybeCleanupRealtimeTokenState();

  const cacheKey = buildIdempotencyCacheKey(userId, idempotencyKey);
  realtimeTokenIdempotencyCache.set(cacheKey, {
    expiresAt: Date.now() + REALTIME_TOKEN_IDEMPOTENCY_TTL_MS,
    payload,
  });

  enforceIdempotencyCacheCapacity();
}

function consumeRealtimeTokenSlot(userId) {
  const now = Date.now();
  maybeCleanupRealtimeTokenState(now);

  const existing = realtimeTokenBuckets.get(userId);

  if (!existing || now - existing.windowStart >= REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS) {
    realtimeTokenBuckets.set(userId, {
      windowStart: now,
      count: 1,
    });

    return {
      allowed: true,
      retryAfterSeconds: Math.ceil(REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS / 1000),
      remaining: Math.max(REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS - 1, 0),
    };
  }

  if (existing.count >= REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS - (now - existing.windowStart), 0);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(Math.ceil(retryAfterMs / 1000), 1),
      remaining: 0,
    };
  }

  existing.count += 1;

  return {
    allowed: true,
    retryAfterSeconds: Math.ceil((REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS - (now - existing.windowStart)) / 1000),
    remaining: Math.max(REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS - existing.count, 0),
  };
}

function enforceRealtimeTokenRateLimit(req, res, next) {
  const userId = req.user?.sub;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const decision = consumeRealtimeTokenSlot(userId);
  res.set('X-RateLimit-Limit', String(REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS));
  res.set('X-RateLimit-Remaining', String(decision.remaining));

  if (!decision.allowed) {
    res.set('Retry-After', String(decision.retryAfterSeconds));
    return res.status(429).json({
      error: 'Too many realtime token requests. Please retry later.',
      retryAfterSeconds: decision.retryAfterSeconds,
    });
  }

  return next();
}

function enforceRealtimeTokenIdempotency(req, res, next) {
  const userId = req.user?.sub;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!idempotencyKey) {
    req.realtimeTokenIdempotencyKey = null;
    return next();
  }

  if (idempotencyKey.length > REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH) {
    return res.status(400).json({
      error: `Idempotency-Key is too long (max ${REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH} characters).`,
    });
  }

  const cachedResponse = readRealtimeTokenResponseFromCache(userId, idempotencyKey);
  if (cachedResponse) {
    res.set('X-Idempotency-Replayed', 'true');
    return res.json(cachedResponse);
  }

  req.realtimeTokenIdempotencyKey = idempotencyKey;
  res.set('X-Idempotency-Replayed', 'false');
  return next();
}

// Phase 2 smoke endpoint for websocket readiness and contracts visibility.
router.get('/realtime/health', (_req, res) => {
  res.json(realtimeGateway.getHealthSnapshot());
});

router.post('/realtime/token', authenticate, canAccessOrganization, enforceRealtimeTokenIdempotency, enforceRealtimeTokenRateLimit, asyncHandler(async (req, res) => {
  const roleLevel = req.userRole?.level ?? req.user?.role_level;
  const role = req.userRole?.name ?? req.user?.role ?? 'user';
  const hotelCompanyId = req.hotelCompanyId ?? req.user?.hotel_company_id ?? null;
  const expiresIn = Number(process.env.REALTIME_TOKEN_TTL_SECONDS || 3600);

  const socketToken = realtimeGatewayTesting.issueRealtimeToken({
    sub: req.user.sub,
    email: req.user.email,
    role,
    roleLevel,
    hotelCompanyId,
  }, {
    expiresInSeconds: expiresIn,
  });

  const responsePayload = {
    socketToken,
    expiresIn,
  };

  if (req.realtimeTokenIdempotencyKey) {
    cacheRealtimeTokenResponseForKey(req.user.sub, req.realtimeTokenIdempotencyKey, responsePayload);
  }

  res.json(responsePayload);
}));

export const realtimeRoutesTesting = {
  resetRealtimeTokenRateLimitState() {
    realtimeTokenBuckets.clear();
    realtimeTokenIdempotencyCache.clear();
    realtimeTokenStateOperationCount = 0;
  },
  consumeRealtimeTokenSlot,
  cacheRealtimeTokenResponseForKey,
  readRealtimeTokenResponseFromCache,
  cleanupRealtimeTokenState,
  getStateSizeSnapshot() {
    return {
      buckets: realtimeTokenBuckets.size,
      idempotencyEntries: realtimeTokenIdempotencyCache.size,
    };
  },
  getConfigSnapshot() {
    return {
      idempotencyMaxEntries: REALTIME_TOKEN_IDEMPOTENCY_MAX_ENTRIES,
    };
  },
};

export default router;
