import { body, param, query } from 'express-validator';

const sessionIdValidator = [param('sessionId').isUUID()];

export const listCardsValidator = [
  ...sessionIdValidator,
  query('status').optional().isIn(['AVAILABLE', 'SOLD', 'WINNER', 'CLAIMED']),
  query('search').optional().isString(),
  query('page').optional().isInt({ gt: 0 }),
  query('pageSize').optional().isInt({ gt: 0, lt: 501 }),
];

export const sellCardValidator = [
  ...sessionIdValidator,
  body('cardId').optional().isUUID(),
  body('cardNumber').optional().isInt({ gt: 0 }),
  body('amount').optional().isFloat({ gt: 0 }),
  body('paymentMethod').optional().isIn(['CASH', 'TELEBIRR', 'CBEBIRR', 'BANK', 'OTHER']),
  body('customerName').optional().isString().trim(),
  body('customerPhone').optional().isString().trim(),
  body('note').optional().isString(),
  body('expectedVersion').optional().isInt({ gt: 0 }),
];

export const unsellCardValidator = [
  ...sessionIdValidator,
  body('cardId').optional().isUUID(),
  body('cardNumber').optional().isInt({ gt: 0 }),
  body('expectedVersion').optional().isInt({ gt: 0 }),
];

export const bulkActionValidator = [
  ...sessionIdValidator,
  body('action').isIn(['SELL', 'UNSELL']),
  body('cardIds').optional().isArray({ min: 1 }),
  body('cardIds.*').optional().isUUID(),
  body('cardNumbers').optional().isArray({ min: 1 }),
  body('cardNumbers.*').optional().isInt({ gt: 0 }),
  body('amount').optional().isFloat({ gt: 0 }),
  body('paymentMethod').optional().isIn(['CASH', 'TELEBIRR', 'CBEBIRR', 'BANK', 'OTHER']),
  body('expectedVersion').optional().isInt({ gt: 0 }),
];

export const resetBoardValidator = [
  ...sessionIdValidator,
  body('expectedVersion').optional().isInt({ gt: 0 }),
];
