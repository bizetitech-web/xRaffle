import { body, param, query } from 'express-validator';

const allowedStatuses = ['PENDING', 'ACTIVE', 'DRAWING', 'ENDED', 'COMPLETED', 'CANCELLED'];

export const sessionIdParamValidator = [
  param('sessionId').isUUID(),
];

export const listSessionsValidator = [
  query('companyId').optional().isUUID(),
  query('branchId').optional().isUUID(),
  query('templateId').optional().isUUID(),
  query('status').optional().isIn(allowedStatuses),
];

export const createSessionValidator = [
  body('templateId').isUUID(),
];

export const expectedVersionValidator = [
  body('expectedVersion').optional().isInt({ min: 1 }),
];
