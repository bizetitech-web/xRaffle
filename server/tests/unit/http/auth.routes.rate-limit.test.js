import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { errorHandler } from '../../../middleware/errorHandler.js';

async function loadAuthRoutesFresh() {
  const moduleUrl = new URL('../../../routes/authRoutes.js', import.meta.url);
  moduleUrl.searchParams.set('v', `${Date.now()}-${Math.random()}`);
  const mod = await import(moduleUrl.href);
  return mod.default;
}

function makeApp(authRoutes) {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

test('auth login rate limiter returns 429 and standard headers after threshold', async () => {
  const prevMax = process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
  const prevWindow = process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS;

  process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '2';
  process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS = '60000';

  try {
    const authRoutes = await loadAuthRoutesFresh();
    const app = makeApp(authRoutes);
    const server = app.listen(0);

    try {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/auth/login`;

      const first = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(first.status, 400);

      const second = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(second.status, 400);

      const blocked = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const blockedJson = await blocked.json();
      assert.equal(blocked.status, 429);
      assert.equal(blockedJson?.code, 'RATE_LIMIT_EXCEEDED');
      assert.ok(blocked.headers.get('ratelimit-limit'));
      assert.ok(blocked.headers.get('ratelimit-remaining'));
      assert.ok(blocked.headers.get('ratelimit-reset'));
      assert.equal(blocked.headers.get('ratelimit-remaining'), '0');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    if (prevMax === undefined) {
      delete process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
    } else {
      process.env.AUTH_LOGIN_RATE_LIMIT_MAX = prevMax;
    }

    if (prevWindow === undefined) {
      delete process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS = prevWindow;
    }
  }
});
