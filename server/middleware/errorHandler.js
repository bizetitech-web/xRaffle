import { logError } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  logError('Unhandled API error', {
    error: err,
    request: {
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
      userId: req.user?.sub,
    },
  });
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
};
