import { body, param, query } from 'express-validator';

export const createTemplateValidator = [
  body('companyId').optional().isUUID(),
  body('branchId').optional().isUUID(),
  body('templateCode').isString().trim().notEmpty(),
  body('title').isString().trim().notEmpty(),
  body('cardPrice').isFloat({ gt: 0 }),
  body('totalCards').isInt({ gt: 0 }),
  body('totalNumbersPool').isInt({ gt: 0 }),
  body('numbersPerCard').isInt({ gt: 0 }),
  body('totalPrizeBeers').isInt({ gt: 0 }),
  body('secondsPerCall').isInt({ gt: 0 }),
  body('generationMode').isIn(['SEQUENTIAL', 'RANDOM']),
  body('prizes').isArray({ min: 1 }),
  body('prizes.*.drawPosition').isInt({ gt: 0 }),
  body('prizes.*.beerQuantity').isInt({ gt: 0 }),
];

export const listTemplatesValidator = [
  query('companyId').optional().isUUID(),
  query('branchId').optional().isUUID(),
  query('active').optional().isIn(['true', 'false']),
];

export const templateIdValidator = [param('templateId').isUUID()];

export const updateTemplateValidator = [
  ...templateIdValidator,
  body('expectedVersion').optional().isInt({ gt: 0 }),
  body('branchId').optional().isUUID(),
  body('title').optional().isString().trim().notEmpty(),
  body('cardPrice').optional().isFloat({ gt: 0 }),
  body('totalCards').optional().isInt({ gt: 0 }),
  body('totalNumbersPool').optional().isInt({ gt: 0 }),
  body('numbersPerCard').optional().isInt({ gt: 0 }),
  body('totalPrizeBeers').optional().isInt({ gt: 0 }),
  body('secondsPerCall').optional().isInt({ gt: 0 }),
  body('generationMode').optional().isIn(['SEQUENTIAL', 'RANDOM']),
  body('prizes').optional().isArray({ min: 1 }),
  body('prizes.*.drawPosition').optional().isInt({ gt: 0 }),
  body('prizes.*.beerQuantity').optional().isInt({ gt: 0 }),
];

export const previewCardsValidator = [
  ...templateIdValidator,
  body('mode').optional().isIn(['SEQUENTIAL', 'RANDOM']),
  body('totalCards').optional().isInt({ gt: 0 }),
  body('seed').optional().isString(),
];
