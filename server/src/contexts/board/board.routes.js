import express from 'express';
import { validationResult } from 'express-validator';
import { param } from 'express-validator';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../core/policy/permissionPolicy.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { salesWriteRateLimiter } from '../../core/http/rateLimiters.js';
import { AppError } from '../../core/errors/AppError.js';
import { ErrorCodes } from '../../core/errors/errorCodes.js';
import { boardService } from './board.service.js';
import {
  bulkActionValidator,
  listCardsValidator,
  listPrizesValidator,
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

const IDEMPOTENCY_KEY_ALLOWED_PATTERN = /^[A-Za-z0-9._:-]+$/;
const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

const parseOptionalIdempotencyKey = (req, _res, next) => {
  const raw = String(req.get('Idempotency-Key') || '').trim();
  if (!raw) {
    req.idempotencyKey = null;
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
  return next();
};

const aliasLegacyGameIdToSessionId = (req, _res, next) => {
  req.params.sessionId = req.params.gameId;
  next();
};

router.get('/game-sessions/:sessionId/board/cards', requirePermissions(['VIEW_GAMES']), listCardsValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await boardService.listCards(req);
  res.json(data);
}));

router.get('/game-sessions/:sessionId/board/prizes', requirePermissions(['VIEW_GAMES']), listPrizesValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await boardService.listPrizes(req);
  res.json(data);
}));

router.post('/game-sessions/:sessionId/board/sell', requirePermissions(['SELL_CARDS']), salesWriteRateLimiter, parseOptionalIdempotencyKey, sellCardValidator, asyncHandler(async (req, res) => {
  assertValid(req);
  const data = await boardService.sellCard(req);
  if (req.idempotencyKey) {
    const idemStatus = String(data?.idempotencyStatus || 'new').toLowerCase() === 'replay' ? 'replay' : 'new';
    res.set('X-Idempotency-Status', idemStatus);
    res.set('X-Idempotency-Replayed', idemStatus === 'replay' ? 'true' : 'false');
    res.set('X-Idempotency-Key', req.idempotencyKey);
  }
  res.status(201).json(data);
}));

// Legacy compatibility adapter for older clients that call /games/:gameId/sales.
router.post('/games/:gameId/sales', requirePermissions(['SELL_CARDS']), salesWriteRateLimiter, parseOptionalIdempotencyKey, aliasLegacyGameIdToSessionId, [param('gameId').isUUID(), ...sellCardValidator], asyncHandler(async (req, res) => {
  assertValid(req);
  req.idempotencyEndpoint = `POST:/api/games/:gameId/sales:${req.params.sessionId}:${req.user?.sub || 'anonymous'}`;

  try {
    const data = await boardService.sellCard(req);

    if (req.idempotencyKey) {
      const idemStatus = String(data?.idempotencyStatus || 'new').toLowerCase() === 'replay' ? 'replay' : 'new';
      res.set('X-Idempotency-Status', idemStatus);
      res.set('X-Idempotency-Replayed', idemStatus === 'replay' ? 'true' : 'false');
      res.set('X-Idempotency-Key', req.idempotencyKey);
    }

    res.status(201).json({
      saleId: data.saleId,
      cardId: data.cardId,
      cardNumber: data.cardNumber,
      cardStatus: 'SOLD',
      paymentMethod: data.paymentMethod,
      idempotencyStatus: data.idempotencyStatus,
    });
  } catch (error) {
    if (error?.code === ErrorCodes.SESSION_INVALID_STATE) {
      throw new AppError('Game is not ACTIVE', {
        status: 400,
        code: ErrorCodes.GAME_NOT_ACTIVE,
        details: error?.details || null,
      });
    }
    throw error;
  }
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
