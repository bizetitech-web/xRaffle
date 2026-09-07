import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const identityKey = (req) => String(req.user?.sub || ipKeyGenerator(req.ip || 'anonymous'));

const createLimiter = ({
  windowMs,
  max,
  message,
}) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: identityKey,
  handler: (req, res) => {
    res.status(429).json({
      error: message,
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

export const authLoginRateLimiter = createLimiter({
  windowMs: toInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: toInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 20),
  message: 'Too many login attempts. Please try again later.',
});

export const salesWriteRateLimiter = createLimiter({
  windowMs: toInt(process.env.SALES_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  max: toInt(process.env.SALES_RATE_LIMIT_MAX, 120),
  message: 'Too many sale requests. Please slow down and retry shortly.',
});

export const drawWriteRateLimiter = createLimiter({
  windowMs: toInt(process.env.DRAW_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  max: toInt(process.env.DRAW_RATE_LIMIT_MAX, 120),
  message: 'Too many draw requests. Please slow down and retry shortly.',
});
