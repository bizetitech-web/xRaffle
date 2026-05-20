import express from 'express';
import { realtimeGateway } from './realtime.gateway.js';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { logInfo, logWarn, logError } from '../../../utils/logger.js';

// In-memory metrics for failure modes
const realtimeTokenMetrics = {
  rateLimitExceeded: 0,
  invalidIdempotencyKey: 0,
  idempotencyReplay: 0,
  cacheEviction: 0,
};
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
const REALTIME_TOKEN_IDEMPOTENCY_KEY_MIN_LENGTH = parsePositiveInt(process.env.REALTIME_TOKEN_IDEMPOTENCY_KEY_MIN_LENGTH, 8);
const REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH = parsePositiveInt(process.env.REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH, 128);
const REALTIME_TOKEN_IDEMPOTENCY_MAX_ENTRIES = parsePositiveInt(process.env.REALTIME_TOKEN_IDEMPOTENCY_MAX_ENTRIES, 1000);
const REALTIME_TOKEN_STATE_CLEANUP_INTERVAL = parsePositiveInt(process.env.REALTIME_TOKEN_STATE_CLEANUP_INTERVAL, 50);
const REALTIME_TOKEN_IDEMPOTENCY_KEY_ALLOWED_PATTERN = /^[A-Za-z0-9._:-]+$/;

let realtimeTokenStateOperationCount = 0;

function cleanupRealtimeTokenState(now = Date.now()) {
  for (const [userId, bucket] of realtimeTokenBuckets.entries()) {
    if (now - bucket.windowStart >= REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS) {
      realtimeTokenBuckets.delete(userId);
      logInfo('Rate limit bucket evicted', { userId });
    }
  }

  for (const [cacheKey, entry] of realtimeTokenIdempotencyCache.entries()) {
    if (now >= entry.expiresAt) {
      realtimeTokenIdempotencyCache.delete(cacheKey);
      logInfo('Idempotency cache entry expired', { cacheKey });
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
    logWarn('Idempotency cache evicted oldest entry due to capacity', { oldestKey });
    realtimeTokenMetrics.cacheEviction++;
  }
}

function buildIdempotencyCacheKey(userId, idempotencyKey) {
  return `${userId}:${idempotencyKey}`;
}

function isValidIdempotencyKey(idempotencyKey) {
  if (idempotencyKey.length < REALTIME_TOKEN_IDEMPOTENCY_KEY_MIN_LENGTH) {
    return false;
  }

  if (idempotencyKey.length > REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH) {
    return false;
  }

  return REALTIME_TOKEN_IDEMPOTENCY_KEY_ALLOWED_PATTERN.test(idempotencyKey);
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
    logInfo('Idempotency cache entry expired on read', { cacheKey });
    return null;
  }

  logInfo('Idempotency cache hit', { userId, idempotencyKey });
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
  logInfo('Cached realtime token response', { userId, idempotencyKey });
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
    logInfo('Started new rate limit window', { userId });

    return {
      allowed: true,
      retryAfterSeconds: Math.ceil(REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS / 1000),
      remaining: Math.max(REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS - 1, 0),
    };
  }

  if (existing.count >= REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS) {
    logWarn('Rate limit exceeded', { userId, errorCode: 'RATE_LIMIT_EXCEEDED' });
    realtimeTokenMetrics.rateLimitExceeded++;
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
    logWarn('Realtime token request rate limited', { userId, errorCode: 'RATE_LIMIT_EXCEEDED' });
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

  if (!isValidIdempotencyKey(idempotencyKey)) {
    logWarn('Invalid Idempotency-Key format', { userId, idempotencyKey, errorCode: 'INVALID_IDEMPOTENCY_KEY' });
    realtimeTokenMetrics.invalidIdempotencyKey++;
    return res.status(400).json({
      error: `Idempotency-Key must be ${REALTIME_TOKEN_IDEMPOTENCY_KEY_MIN_LENGTH}-${REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH} characters and use only letters, numbers, dot, underscore, colon, or hyphen.`,
    });
  }

  const cachedResponse = readRealtimeTokenResponseFromCache(userId, idempotencyKey);
  if (cachedResponse) {
    res.set('X-Idempotency-Replayed', 'true');
    logInfo('Replayed cached realtime token response', { userId, idempotencyKey });
    realtimeTokenMetrics.idempotencyReplay++;
    return res.json(cachedResponse);
  }

  req.realtimeTokenIdempotencyKey = idempotencyKey;
  res.set('X-Idempotency-Replayed', 'false');
  return next();
}

// Phase 2 smoke endpoint for websocket readiness and contracts visibility.

// Health endpoint
router.get('/realtime/health', (_req, res) => {
  res.json(realtimeGateway.getHealthSnapshot());
});

// Metrics endpoint (for test/ops visibility)
router.get('/realtime/metrics', (_req, res) => {
  res.json({ ...realtimeTokenMetrics });
});

router.post('/realtime/token', authenticate, canAccessOrganization, enforceRealtimeTokenIdempotency, enforceRealtimeTokenRateLimit, asyncHandler(async (req, res) => {
  try {
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
    logInfo('Issued new realtime socket token', {
      userId: req.user.sub,
      idempotencyKey: req.realtimeTokenIdempotencyKey || null,
      expiresIn,
    });
  } catch (err) {
    logError('Error issuing realtime socket token', { userId: req.user?.sub, error: err });
    res.status(500).json({ error: 'Internal server error' });
  }
}));

export const realtimeRoutesTesting = {
  resetRealtimeTokenRateLimitState() {
    realtimeTokenBuckets.clear();
    realtimeTokenIdempotencyCache.clear();
    realtimeTokenStateOperationCount = 0;
    // Reset metrics
    realtimeTokenMetrics.rateLimitExceeded = 0;
    realtimeTokenMetrics.invalidIdempotencyKey = 0;
    realtimeTokenMetrics.idempotencyReplay = 0;
    realtimeTokenMetrics.cacheEviction = 0;
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
      idempotencyKeyMinLength: REALTIME_TOKEN_IDEMPOTENCY_KEY_MIN_LENGTH,
      idempotencyKeyMaxLength: REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH,
      idempotencyMaxEntries: REALTIME_TOKEN_IDEMPOTENCY_MAX_ENTRIES,
    };
  },
  isValidIdempotencyKey,
  getMetricsSnapshot() {
    return { ...realtimeTokenMetrics };
  },
};

export default router;
