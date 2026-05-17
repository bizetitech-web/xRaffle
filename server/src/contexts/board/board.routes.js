import express from 'express';
import { validationResult } from 'express-validator';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../core/policy/permissionPolicy.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { AppError } from '../../core/errors/AppError.js';
import { boardService } from './board.service.js';
import {
  bulkActionValidator,
  listCardsValidator,
  resetBoardValidator,
  sellCardValidator,
  unsellCardValidator,
} from './board.validators.js';

const router = express.Router();

router.use(authenticate);
router.use(canAccessOrganization);

const assertValid = (req) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    throw AppError.validation('Invalid request payload', result.array());
  }
};

router.get('/game-sessions/:sessionId/board/cards', requirePermissions(['VIEW_GAMES']), listCardsValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await boardService.listCards(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/board/sell', requirePermissions(['SELL_CARDS']), sellCardValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await boardService.sellCard(req);
  res.status(201).json(data);
}));

router.post('/game-sessions/:sessionId/board/unsell', requirePermissions(['SELL_CARDS']), unsellCardValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await boardService.unsellCard(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/board/bulk', requirePermissions(['SELL_CARDS']), bulkActionValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await boardService.bulkAction(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/board/reset', requirePermissions(['MANAGE_GAMES']), resetBoardValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await boardService.resetBoard(req);
  res.json(data);
}));

export default router;
