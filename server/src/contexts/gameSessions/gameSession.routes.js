import express from 'express';
import crypto from 'node:crypto';
import { validationResult } from 'express-validator';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../core/policy/permissionPolicy.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { drawWriteRateLimiter } from '../../core/http/rateLimiters.js';
import { AppError } from '../../core/errors/AppError.js';
import { gameSessionService } from './gameSession.service.js';
import {
  createSessionValidator,
  expectedVersionValidator,
  listSessionsValidator,
  sessionIdParamValidator,
} from './gameSession.validators.js';

const router = express.Router();

router.use(authenticate);
router.use(canAccessOrganization);

const assertValid = (req) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    throw AppError.validation('Invalid request payload', result.array());
  }
};

const IDEMPOTENCY_KEY_ALLOWED_PATTERN = /^[A-Za-z0-9._:-]+$/;
const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

const resolveOptionalIdempotencyKey = (req, _res, next) => {
  const raw = String(req.get('Idempotency-Key') || '').trim();
  if (!raw) {
    req.idempotencyKey = crypto.randomUUID();
    return next();
  }

  if (raw.length < IDEMPOTENCY_KEY_MIN_LENGTH || raw.length > IDEMPOTENCY_KEY_MAX_LENGTH || !IDEMPOTENCY_KEY_ALLOWED_PATTERN.test(raw)) {
    throw AppError.validation('Invalid Idempotency-Key format', [{
      field: 'Idempotency-Key',
      code: 'invalid_format',
      constraints: {
        minLength: IDEMPOTENCY_KEY_MIN_LENGTH,
        maxLength: IDEMPOTENCY_KEY_MAX_LENGTH,
        allowedPattern: IDEMPOTENCY_KEY_ALLOWED_PATTERN.source,
      },
    }]);
  }

  req.idempotencyKey = raw;
  next();
};

router.get('/game-sessions', requirePermissions(['VIEW_GAMES']), listSessionsValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.listSessions(req);
  res.json(data);
}));

router.get('/game-sessions/:sessionId', requirePermissions(['VIEW_GAMES']), sessionIdParamValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.getSession(req);
  res.json(data);
}));

router.post('/game-sessions', requirePermissions(['MANAGE_GAMES']), createSessionValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.createSession(req);
  res.status(201).json(data);
}));

router.post('/game-sessions/:sessionId/start', requirePermissions(['RUN_DRAWS']), drawWriteRateLimiter, resolveOptionalIdempotencyKey, [...sessionIdParamValidator, ...expectedVersionValidator], asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.startSession(req);
  const idemStatus = String(data?.idempotencyStatus || 'new').toLowerCase() === 'replay' ? 'replay' : 'new';
  res.set('X-Idempotency-Status', idemStatus);
  res.set('X-Idempotency-Replayed', idemStatus === 'replay' ? 'true' : 'false');
  if (req.idempotencyKey) {
    res.set('X-Idempotency-Key', req.idempotencyKey);
  }
  res.json(data);
}));

router.post('/game-sessions/:sessionId/begin-draw', requirePermissions(['RUN_DRAWS']), drawWriteRateLimiter, [...sessionIdParamValidator, ...expectedVersionValidator], asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.beginDrawSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/pause', requirePermissions(['RUN_DRAWS']), [...sessionIdParamValidator, ...expectedVersionValidator], asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.pauseSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/resume', requirePermissions(['RUN_DRAWS']), drawWriteRateLimiter, [...sessionIdParamValidator, ...expectedVersionValidator], asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.resumeSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/end', requirePermissions(['RUN_DRAWS']), [...sessionIdParamValidator, ...expectedVersionValidator], asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.endSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/reset', requirePermissions(['MANAGE_GAMES']), [...sessionIdParamValidator, ...expectedVersionValidator], asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.resetSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/complete', requirePermissions(['RUN_DRAWS']), [...sessionIdParamValidator, ...expectedVersionValidator], asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.completeSession(req);
  res.json(data);
}));

export default router;
