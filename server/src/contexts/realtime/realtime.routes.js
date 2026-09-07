import { randomUUID } from 'crypto';
import express from 'express';
import { realtimeGateway, realtimeGatewayTesting } from './realtime.gateway.js';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { logInfo, logWarn, logError } from '../../../utils/logger.js';

const router = express.Router();

const inMemoryAuditLog = [];
const AUDIT_LOG_TEST_MODE = process.env.AUDIT_LOG_TEST_MODE === '1';

const realtimeTokenMetrics = {
  rateLimitExceeded: 0,
  invalidIdempotencyKey: 0,
  idempotencyReplay: 0,
  cacheEviction: 0,
};

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

function correlationIdMiddleware(req, res, next) {
  const headerKey = 'x-correlation-id';
  let correlationId = req.get(headerKey) || req.headers[headerKey] || null;
  if (!correlationId) {
    correlationId = randomUUID();
  }
  req.correlationId = correlationId;
  res.set(headerKey, correlationId);
  next();
}

router.use(correlationIdMiddleware);

export function resetInMemoryAuditLog() {
  inMemoryAuditLog.length = 0;
}

export function getInMemoryAuditLog() {
  return [...inMemoryAuditLog];
}

export function auditLogRealtimeTokenEvent({ eventType, userId, idempotencyKey, correlationId, status, error, details }) {
  const entry = {
    eventType,
    userId,
    idempotencyKey,
    correlationId,
    status,
    error: error ? (error.message || error) : undefined,
    ...details,
  };

  logInfo('AUDIT realtime token', entry);
  if (AUDIT_LOG_TEST_MODE) {
    inMemoryAuditLog.push(entry);
  }
}

function cleanupRealtimeTokenState(now = Date.now(), correlationId = null) {
  for (const [userId, bucket] of realtimeTokenBuckets.entries()) {
    if (now - bucket.windowStart >= REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS) {
      realtimeTokenBuckets.delete(userId);
      logInfo('Rate limit bucket evicted', { userId, correlationId });
    }
  }

  for (const [cacheKey, entry] of realtimeTokenIdempotencyCache.entries()) {
    if (now >= entry.expiresAt) {
      realtimeTokenIdempotencyCache.delete(cacheKey);
      logInfo('Idempotency cache entry expired', { cacheKey, correlationId });
    }
  }
}

function maybeCleanupRealtimeTokenState(now = Date.now(), correlationId = null) {
  realtimeTokenStateOperationCount += 1;
  if (realtimeTokenStateOperationCount % REALTIME_TOKEN_STATE_CLEANUP_INTERVAL !== 0) {
    return;
  }
  cleanupRealtimeTokenState(now, correlationId);
}

function enforceIdempotencyCacheCapacity(correlationId = null) {
  while (realtimeTokenIdempotencyCache.size > REALTIME_TOKEN_IDEMPOTENCY_MAX_ENTRIES) {
    const oldestKey = realtimeTokenIdempotencyCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    realtimeTokenIdempotencyCache.delete(oldestKey);
    realtimeTokenMetrics.cacheEviction += 1;
    logWarn('Idempotency cache evicted oldest entry due to capacity', { oldestKey, correlationId });
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

function readRealtimeTokenResponseFromCache(userId, idempotencyKey, correlationId = null) {
  maybeCleanupRealtimeTokenState(undefined, correlationId);

  const cacheKey = buildIdempotencyCacheKey(userId, idempotencyKey);
  const existing = realtimeTokenIdempotencyCache.get(cacheKey);
  if (!existing) {
    return null;
  }

  const now = Date.now();
  if (now >= existing.expiresAt) {
    realtimeTokenIdempotencyCache.delete(cacheKey);
    logInfo('Idempotency cache entry expired on read', { cacheKey, correlationId });
    return null;
  }

  realtimeTokenMetrics.idempotencyReplay += 1;
  logInfo('Idempotency cache hit', { userId, idempotencyKey, correlationId });
  return existing.payload;
}

function cacheRealtimeTokenResponseForKey(userId, idempotencyKey, payload, correlationId = null) {
  maybeCleanupRealtimeTokenState(undefined, correlationId);

  const cacheKey = buildIdempotencyCacheKey(userId, idempotencyKey);
  realtimeTokenIdempotencyCache.set(cacheKey, {
    expiresAt: Date.now() + REALTIME_TOKEN_IDEMPOTENCY_TTL_MS,
    payload,
  });

  enforceIdempotencyCacheCapacity(correlationId);
  logInfo('Cached realtime token response', { userId, idempotencyKey, correlationId });
}

function consumeRealtimeTokenSlot(userId, correlationId = null) {
  const now = Date.now();
  maybeCleanupRealtimeTokenState(now, correlationId);

  const existing = realtimeTokenBuckets.get(userId);

  if (!existing || now - existing.windowStart >= REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS) {
    realtimeTokenBuckets.set(userId, {
      windowStart: now,
      count: 1,
    });

    logInfo('Started new rate limit window', { userId, correlationId });
    return {
      allowed: true,
      retryAfterSeconds: Math.ceil(REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS / 1000),
      remaining: Math.max(REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS - 1, 0),
    };
  }

  if (existing.count >= REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS) {
    realtimeTokenMetrics.rateLimitExceeded += 1;
    logWarn('Rate limit exceeded', { userId, errorCode: 'RATE_LIMIT_EXCEEDED', correlationId });

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
  const correlationId = req.correlationId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required', correlationId });
  }

  const decision = consumeRealtimeTokenSlot(userId, correlationId);
  res.set('X-RateLimit-Limit', String(REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS));
  res.set('X-RateLimit-Remaining', String(decision.remaining));

  if (!decision.allowed) {
    res.set('Retry-After', String(decision.retryAfterSeconds));
    logWarn('Realtime token request rate limited', { userId, errorCode: 'RATE_LIMIT_EXCEEDED', correlationId });
    return res.status(429).json({
      error: 'Too many realtime token requests. Please retry later.',
      retryAfterSeconds: decision.retryAfterSeconds,
      correlationId,
    });
  }

  return next();
}

function enforceRealtimeTokenIdempotency(req, res, next) {
  const userId = req.user?.sub;
  const correlationId = req.correlationId;

  if (!userId) {
    auditLogRealtimeTokenEvent({
      eventType: 'error',
      userId: null,
      idempotencyKey: null,
      correlationId,
      status: 401,
      error: 'Authentication required',
    });
    return res.status(401).json({ error: 'Authentication required', correlationId });
  }

  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!idempotencyKey) {
    req.realtimeTokenIdempotencyKey = null;
    return next();
  }

  if (!isValidIdempotencyKey(idempotencyKey)) {
    realtimeTokenMetrics.invalidIdempotencyKey += 1;
    logWarn('Invalid Idempotency-Key format', { userId, idempotencyKey, errorCode: 'INVALID_IDEMPOTENCY_KEY', correlationId });
    auditLogRealtimeTokenEvent({
      eventType: 'error',
      userId,
      idempotencyKey,
      correlationId,
      status: 400,
      error: 'Invalid Idempotency-Key format',
    });
    return res.status(400).json({
      error: `Idempotency-Key must be ${REALTIME_TOKEN_IDEMPOTENCY_KEY_MIN_LENGTH}-${REALTIME_TOKEN_IDEMPOTENCY_KEY_MAX_LENGTH} characters and use only letters, numbers, dot, underscore, colon, or hyphen.`,
      correlationId,
    });
  }

  const cachedResponse = readRealtimeTokenResponseFromCache(userId, idempotencyKey, correlationId);
  if (cachedResponse) {
    res.set('X-Idempotency-Replayed', 'true');
    logInfo('Replayed cached realtime token response', { userId, idempotencyKey, correlationId });
    auditLogRealtimeTokenEvent({
      eventType: 'replay',
      userId,
      idempotencyKey,
      correlationId,
      status: 200,
      details: { replay: true },
    });
    return res.json({ ...cachedResponse, correlationId });
  }

  req.realtimeTokenIdempotencyKey = idempotencyKey;
  res.set('X-Idempotency-Replayed', 'false');
  return next();
}

router.get('/realtime/health', (_req, res) => {
  res.json(realtimeGateway.getHealthSnapshot());
});

router.get('/realtime/metrics', (_req, res) => {
  res.json({ ...realtimeTokenMetrics });
});

router.post('/realtime/token', authenticate, canAccessOrganization, enforceRealtimeTokenIdempotency, enforceRealtimeTokenRateLimit, asyncHandler(async (req, res) => {
  const correlationId = req.correlationId;
  const userId = req.user?.sub;
  const idempotencyKey = req.realtimeTokenIdempotencyKey || null;

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
      correlationId,
    };

    if (idempotencyKey) {
      cacheRealtimeTokenResponseForKey(userId, idempotencyKey, responsePayload, correlationId);
    }

    res.json(responsePayload);
    logInfo('Issued new realtime socket token', { userId, idempotencyKey, expiresIn, correlationId });
    auditLogRealtimeTokenEvent({
      eventType: 'issue',
      userId,
      idempotencyKey,
      correlationId,
      status: 200,
      details: { expiresIn },
    });
  } catch (error) {
    logError('Error issuing realtime socket token', { userId, error, correlationId });
    auditLogRealtimeTokenEvent({
      eventType: 'error',
      userId,
      idempotencyKey,
      correlationId,
      status: 500,
      error,
    });
    res.status(500).json({ error: 'Internal server error', correlationId });
  }
}));

export const realtimeRoutesTesting = {
  resetRealtimeTokenRateLimitState() {
    realtimeTokenBuckets.clear();
    realtimeTokenIdempotencyCache.clear();
    realtimeTokenStateOperationCount = 0;
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
      REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS,
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

if (AUDIT_LOG_TEST_MODE) {
  router.get('/realtime/auditlog', (_req, res) => {
    const log = getInMemoryAuditLog();
    resetInMemoryAuditLog();
    res.json({ log });
  });
}

export default router;
