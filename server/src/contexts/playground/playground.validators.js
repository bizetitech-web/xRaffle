import { body, param, query } from 'express-validator';

export const sessionIdValidator = [param('sessionId').isUUID()];
export const winnerIdValidator = [param('winnerId').isUUID()];

export const drawNextValidator = [
  ...sessionIdValidator,
  body('forceNumber').optional().isInt({ gt: 0 }),
  body('expectedVersion').optional().isInt({ gt: 0 }),
];

export const autoDrawValidator = [
  ...sessionIdValidator,
  body('enabled').isBoolean(),
  body('secondsPerCall').optional().isInt({ gt: 0 }),
  body('expectedVersion').optional().isInt({ gt: 0 }),
];

export const drawHistoryValidator = [
  ...sessionIdValidator,
  query('page').optional().isInt({ gt: 0 }),
  query('pageSize').optional().isInt({ gt: 0, lt: 501 }),
];

export const winnersFilterValidator = [
  ...sessionIdValidator,
  query('claimed').optional().isIn(['true', 'false']),
];

export const claimWinnerValidator = [
  ...winnerIdValidator,
  body('expectedVersion').optional().isInt({ gt: 0 }),
];
