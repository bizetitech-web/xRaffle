import express from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../core/policy/permissionPolicy.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { gameChargesService } from './gameCharges.service.js';
import { AppError } from '../../core/errors/AppError.js';

const router = express.Router();

router.use(authenticate);
router.use(canAccessOrganization);

const validate = [param('gameId').isUUID()];

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

router.post('/games/:gameId/charge', requirePermissions(['MANAGE_GAMES']), parseOptionalIdempotencyKey, validate, asyncHandler(async (req, res) => {
  // Accept either `chargeAmount` or legacy `feeAmount` in the request body
  if (req.body && req.body.feeAmount && !req.body.chargeAmount) {
    req.body.chargeAmount = req.body.feeAmount;
  }
  const result = await gameChargesService.upsertCharge(req);

  if (req.idempotencyKey) {
    const idemStatus = String(result?.idempotencyStatus || 'new').toLowerCase() === 'replay' ? 'replay' : 'new';
    res.set('X-Idempotency-Status', idemStatus);
    res.set('X-Idempotency-Replayed', idemStatus === 'replay' ? 'true' : 'false');
    res.set('X-Idempotency-Key', req.idempotencyKey);
  }

  res.json(result);
}));

export default router;
