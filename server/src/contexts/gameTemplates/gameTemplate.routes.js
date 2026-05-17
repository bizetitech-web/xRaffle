import express from 'express';
import { validationResult } from 'express-validator';
import { authenticate } from '../../../middleware/auth.js';
import { canAccessOrganization } from '../../../middleware/rbac.js';
import { requirePermissions } from '../../core/policy/permissionPolicy.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { AppError } from '../../core/errors/AppError.js';
import { gameTemplateService } from './gameTemplate.service.js';
import {
  createTemplateValidator,
  listTemplatesValidator,
  previewCardsValidator,
  templateIdValidator,
  updateTemplateValidator,
} from './gameTemplate.validators.js';

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
  '/game-templates',
  requirePermissions(['MANAGE_GAMES']),
  createTemplateValidator,
  asyncHandler(async (req, res) => {
    assertValid(req);
    const data = await gameTemplateService.createTemplate(req);
    res.status(201).json(data);
  })
);

router.get(
  '/game-templates',
  requirePermissions(['VIEW_GAMES']),
  listTemplatesValidator,
  asyncHandler(async (req, res) => {
    assertValid(req);
    const data = await gameTemplateService.listTemplates(req);
    res.json(data);
  })
);

router.get(
  '/game-templates/:templateId',
  requirePermissions(['VIEW_GAMES']),
  templateIdValidator,
  asyncHandler(async (req, res) => {
    assertValid(req);
    const data = await gameTemplateService.getTemplate(req);
    res.json(data);
  })
);

router.put(
  '/game-templates/:templateId',
  requirePermissions(['MANAGE_GAMES']),
  updateTemplateValidator,
  asyncHandler(async (req, res) => {
    assertValid(req);
    const data = await gameTemplateService.updateTemplate(req);
    res.json(data);
  })
);

router.patch(
  '/game-templates/:templateId/archive',
  requirePermissions(['MANAGE_GAMES']),
  templateIdValidator,
  asyncHandler(async (req, res) => {
    assertValid(req);
    const data = await gameTemplateService.archiveTemplate(req);
    res.json(data);
  })
);

router.post(
  '/game-templates/:templateId/cards/preview',
  requirePermissions(['MANAGE_GAMES']),
  previewCardsValidator,
  asyncHandler(async (req, res) => {
    assertValid(req);
    const data = await gameTemplateService.previewCards(req);
    res.json(data);
  })
);

export default router;
