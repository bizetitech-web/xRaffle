import { logError, logWarn } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  const status = err?.status || 500;
  const code = err?.code;
  const requestMeta = {
    error: err,
    request: {
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
      userId: req.user?.sub,
    },
  };

  if (status >= 500) {
    logError('Unhandled API error', requestMeta);
  } else {
    logWarn('API client error', requestMeta);
  }

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
