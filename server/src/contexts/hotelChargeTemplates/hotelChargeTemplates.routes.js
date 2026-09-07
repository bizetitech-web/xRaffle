import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../core/policy/permissionPolicy.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { hotelChargeTemplatesService } from './hotelChargeTemplates.service.js';

const router = express.Router();

router.use(authenticate);
router.use(canAccessOrganization);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array(),
    });
  }

  return next();
};

router.post(
  '/hotel-charge-templates',
  requirePermissions(['MANAGE_FEE_TEMPLATES']),
  [
    body('branchId').optional({ nullable: true }).isUUID(),
    body('companyId').optional({ nullable: true }).isUUID(),
    body('chargeAmount').optional({ nullable: true }).isFloat({ min: 0 }),
    body('chargePercentage').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const result = await hotelChargeTemplatesService.upsertTemplate(req);
    res.json({
      success: true,
      message: 'Hotel charge template saved',
      data: result,
    });
  })
);

// GET latest template for branch or company
router.get(
  '/hotel-charge-templates',
  requirePermissions(['MANAGE_FEE_TEMPLATES']),
  [
    query('branchId').optional().isUUID(),
    query('companyId').optional().isUUID(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { branchId, companyId } = req.query || {};
    const result = await hotelChargeTemplatesService.getLatestFor({ branchId, companyId, req });
    res.json({
      success: true,
      data: result || null,
    });
  })
);

export default router;
