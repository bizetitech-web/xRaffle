import { body, param, query } from 'express-validator';

export const createSessionValidator = [
  body('templateId').isUUID(),
  body('branchId').optional().isUUID(),
  body('seed').optional().isString(),
];

export const listSessionsValidator = [
  query('branchId').optional().isUUID(),
  query('status').optional().isIn(['PENDING', 'ACTIVE', 'DRAWING', 'COMPLETED', 'CANCELLED']),
  query('from').optional().isISO8601({ strict: true, strictSeparator: true }),
  query('to').optional().isISO8601({ strict: true, strictSeparator: true }),
];

export const sessionIdValidator = [param('sessionId').isUUID()];

export const commandWithVersionValidator = [
  ...sessionIdValidator,
  body('expectedVersion').optional().isInt({ gt: 0 }),
];
