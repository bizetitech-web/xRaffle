import { body, query } from 'express-validator';

export const createTemplateValidator = [
  body('templateCode').isString().notEmpty(),
  body('title').isString().notEmpty(),
  body('companyId').optional().isString().notEmpty(),
  body('cardPrice').isNumeric(),
  body('totalCards').isInt({ min: 1 }),
  body('totalNumbersPool').isInt({ min: 1 }),
  body('numbersPerCard').isInt({ min: 1 }),
  body('secondsPerCall').optional().isInt({ min: 1 }),
  body('generationMode').optional().isIn(['SEQUENTIAL', 'RANDOM']),
  body('isDefault').optional().isBoolean(),
];

export const listTemplatesValidator = [
  query('companyId').optional().isString(),
  query('branchId').optional().isString(),
  query('isActive').optional().isBoolean(),
  query('isDefault').optional().isBoolean(),
];

export const generatePreviewValidator = [
  body('totalCards').optional().isInt({ min: 1 }),
  body('numbersPerCard').optional().isInt({ min: 1 }),
  body('totalNumbersPool').optional().isInt({ min: 1 }),
  body('generationMode').optional().isIn(['SEQUENTIAL', 'RANDOM']),
];
