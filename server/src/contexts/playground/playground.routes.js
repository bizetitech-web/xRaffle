import express from 'express';
import { validationResult } from 'express-validator';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../core/policy/permissionPolicy.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { AppError } from '../../core/errors/AppError.js';
import { playgroundService } from './playground.service.js';
import {
  autoDrawValidator,
  claimWinnerValidator,
  drawHistoryValidator,
  drawNextValidator,
  sessionIdValidator,
  winnersFilterValidator,
} from './playground.validators.js';

const router = express.Router();

router.use(authenticate);
router.use(canAccessOrganization);

const assertValid = (req) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    throw AppError.validation('Invalid request payload', result.array());
  }
};

router.get('/game-sessions/:sessionId/playground/pool', requirePermissions(['VIEW_GAMES']), sessionIdValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await playgroundService.getPoolState(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/playground/draw/next', requirePermissions(['RUN_DRAWS']), drawNextValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await playgroundService.drawNext(req);
  res.status(201).json(data);
}));

router.post('/game-sessions/:sessionId/playground/auto-draw', requirePermissions(['RUN_DRAWS']), autoDrawValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await playgroundService.setAutoDraw(req);
  res.json(data);
}));

router.get('/game-sessions/:sessionId/playground/history', requirePermissions(['VIEW_GAMES']), drawHistoryValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await playgroundService.drawHistory(req);
  res.json(data);
}));

router.get('/game-sessions/:sessionId/playground/winners', requirePermissions(['VIEW_WINNERS']), winnersFilterValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await playgroundService.listWinners(req);
  res.json(data);
}));

router.post('/game-winners/:winnerId/claim', requirePermissions(['CLAIM_PRIZES']), claimWinnerValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await playgroundService.claimWinner(req);
  res.json(data);
}));

export default router;
