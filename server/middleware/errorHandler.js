import { logError } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  const status = err?.status || 500;
  const code = err?.code;

  logError('Unhandled API error', {
    error: err,
    request: {
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
      userId: req.user?.sub,
    },
  });
  const payload = {
    error: err?.message || 'Server error',
  };

  if (code) {
    payload.code = code;
  }

  if (err?.details) {
    payload.details = err.details;
  }

  res.status(status).json(payload);
};
