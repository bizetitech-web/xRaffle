import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

import pool from '../../../config/database.js';
import { playgroundService } from '../../../src/contexts/playground/playground.service.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

const TOKEN_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const SESSION_ID = '9d1b8f5c-7e34-4b92-9f13-92aaab6c3d10';

const makeToken = (sub = 'user-1') => jwt.sign({ sub }, TOKEN_SECRET, { expiresIn: '1h' });

async function loadPlaygroundRoutesFresh() {
  const moduleUrl = new URL('../../../src/contexts/playground/playground.routes.js', import.meta.url);
  moduleUrl.searchParams.set('v', `${Date.now()}-${Math.random()}`);
  const mod = await import(moduleUrl.href);
  return mod.default;
}

function makeApp(playgroundRoutes) {
  const app = express();
  app.use(express.json());
  app.use(playgroundRoutes);
  app.use(errorHandler);
  return app;
}

const installQueryMock = (grantedPermissions = []) => {
  const originalQuery = pool.query;

  pool.query = async (sql) => {
    if (sql.includes('FROM users WHERE id = ?')) {
      return [[{ id: 'user-1', hotel_company_id: 'co-1', is_active: 1 }]];
    }

    if (sql.includes('FROM users u') && sql.includes('JOIN user_roles')) {
      return [[{ hotel_company_id: 'co-1', role_name: 'COMPANY_ADMIN', role_level: 2 }]];
    }

    if (sql.includes('FROM permissions p')) {
      return [grantedPermissions.map((name) => ({ name }))];
    }

    return [[]];
  };

  return () => {
    pool.query = originalQuery;
  };
};

test('playground draw-next limiter returns 429 and standard headers after threshold', async () => {
  const prevMax = process.env.DRAW_RATE_LIMIT_MAX;
  const prevWindow = process.env.DRAW_RATE_LIMIT_WINDOW_MS;
  const restoreQuery = installQueryMock(['RUN_DRAWS']);

  const originalDrawNext = playgroundService.drawNext;
  playgroundService.drawNext = async () => ({ drawId: 'd-1', drawPosition: 1, calledNumber: 7 });

  process.env.DRAW_RATE_LIMIT_MAX = '2';
  process.env.DRAW_RATE_LIMIT_WINDOW_MS = '60000';

  try {
    const playgroundRoutes = await loadPlaygroundRoutesFresh();
    const app = makeApp(playgroundRoutes);
    const server = app.listen(0);

    try {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/playground/draw/next`;
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${makeToken()}`,
      };

      const first = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: 4 }),
      });
      assert.equal(first.status, 201);

      const second = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: 4 }),
      });
      assert.equal(second.status, 201);

      const blocked = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: 4 }),
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
    playgroundService.drawNext = originalDrawNext;
    restoreQuery();

    if (prevMax === undefined) {
      delete process.env.DRAW_RATE_LIMIT_MAX;
    } else {
      process.env.DRAW_RATE_LIMIT_MAX = prevMax;
    }

    if (prevWindow === undefined) {
      delete process.env.DRAW_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.DRAW_RATE_LIMIT_WINDOW_MS = prevWindow;
    }
  }
});
