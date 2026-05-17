import express from 'express';
import { validationResult } from 'express-validator';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../core/policy/permissionPolicy.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { AppError } from '../../core/errors/AppError.js';
import { gameSessionService } from './gameSession.service.js';
import {
  commandWithVersionValidator,
  createSessionValidator,
  listSessionsValidator,
  sessionIdValidator,
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

router.post(
  '/game-sessions',
  requirePermissions(['MANAGE_GAMES']),
  createSessionValidator,
  asyncHandler(async (req, res) => {
    assertValid(req);
    const data = await gameSessionService.createSession(req);
    res.status(201).json(data);
  })
);

router.get(
  '/game-sessions',
  requirePermissions(['VIEW_GAMES']),
  listSessionsValidator,
  asyncHandler(async (req, res) => {
    assertValid(req);
    const data = await gameSessionService.listSessions(req);
    res.json(data);
  })
);

router.get(
  '/game-sessions/:sessionId',
  requirePermissions(['VIEW_GAMES']),
  sessionIdValidator,
  asyncHandler(async (req, res) => {
    assertValid(req);
    const data = await gameSessionService.getSessionSnapshot(req);
    res.json(data);
  })
);

router.post('/game-sessions/:sessionId/start', requirePermissions(['RUN_DRAWS']), commandWithVersionValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.startSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/pause', requirePermissions(['RUN_DRAWS']), commandWithVersionValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.pauseSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/resume', requirePermissions(['RUN_DRAWS']), commandWithVersionValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.resumeSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/end', requirePermissions(['RUN_DRAWS']), commandWithVersionValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.endSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/reset', requirePermissions(['MANAGE_GAMES']), commandWithVersionValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.resetSession(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/complete', requirePermissions(['MANAGE_GAMES']), commandWithVersionValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await gameSessionService.completeSession(req);
  res.json(data);
}));

export default router;
