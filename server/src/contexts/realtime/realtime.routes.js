import express from 'express';
import { realtimeGateway } from './realtime.gateway.js';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { realtimeGatewayTesting } from './realtime.gateway.js';

const router = express.Router();
const realtimeTokenBuckets = new Map();

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS = parsePositiveInt(process.env.REALTIME_TOKEN_RATE_LIMIT_MAX_REQUESTS, 20);
const REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.REALTIME_TOKEN_RATE_LIMIT_WINDOW_MS, 60_000);

function consumeRealtimeTokenSlot(userId) {
  const now = Date.now();
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

// Phase 2 smoke endpoint for websocket readiness and contracts visibility.
router.get('/realtime/health', (_req, res) => {
  res.json(realtimeGateway.getHealthSnapshot());
});

router.post('/realtime/token', authenticate, canAccessOrganization, enforceRealtimeTokenRateLimit, asyncHandler(async (req, res) => {
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

  res.json({
    socketToken,
    expiresIn,
  });
}));

export const realtimeRoutesTesting = {
  resetRealtimeTokenRateLimitState() {
    realtimeTokenBuckets.clear();
  },
  consumeRealtimeTokenSlot,
};

export default router;
