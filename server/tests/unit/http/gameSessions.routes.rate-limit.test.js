import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

import pool from '../../../config/database.js';
import { gameSessionService } from '../../../src/contexts/gameSessions/gameSession.service.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

const TOKEN_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const SESSION_ID = '9d1b8f5c-7e34-4b92-9f13-92aaab6c3d10';

const makeToken = (sub = 'user-1') => jwt.sign({ sub }, TOKEN_SECRET, { expiresIn: '1h' });

async function loadGameSessionRoutesFresh() {
  const moduleUrl = new URL('../../../src/contexts/gameSessions/gameSession.routes.js', import.meta.url);
  moduleUrl.searchParams.set('v', `${Date.now()}-${Math.random()}`);
  const mod = await import(moduleUrl.href);
  return mod.default;
}

function makeApp(gameSessionRoutes) {
  const app = express();
  app.use(express.json());
  app.use(gameSessionRoutes);
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

test('game sessions /start limiter returns 429 and standard headers after threshold', async () => {
  const prevMax = process.env.DRAW_RATE_LIMIT_MAX;
  const prevWindow = process.env.DRAW_RATE_LIMIT_WINDOW_MS;
  const restoreQuery = installQueryMock(['RUN_DRAWS']);

  const originalStartSession = gameSessionService.startSession;
  gameSessionService.startSession = async () => ({
    sessionId: SESSION_ID,
    status: 'ACTIVE',
    version: 2,
    idempotencyStatus: 'new',
  });

  process.env.DRAW_RATE_LIMIT_MAX = '2';
  process.env.DRAW_RATE_LIMIT_WINDOW_MS = '60000';

  try {
    const gameSessionRoutes = await loadGameSessionRoutesFresh();
    const app = makeApp(gameSessionRoutes);
    const server = app.listen(0);

    try {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/start`;
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${makeToken('start-limiter-user')}`,
      };

      const first = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Idempotency-Key': 'start-rate-limit-001',
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      });
      assert.equal(first.status, 200);

      const second = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Idempotency-Key': 'start-rate-limit-002',
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      });
      assert.equal(second.status, 200);

      const blocked = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Idempotency-Key': 'start-rate-limit-003',
        },
        body: JSON.stringify({ expectedVersion: 1 }),
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
    gameSessionService.startSession = originalStartSession;
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

test('game sessions /begin-draw limiter returns 429 and standard headers after threshold', async () => {
  const prevMax = process.env.DRAW_RATE_LIMIT_MAX;
  const prevWindow = process.env.DRAW_RATE_LIMIT_WINDOW_MS;
  const restoreQuery = installQueryMock(['RUN_DRAWS']);

  const originalBeginDrawSession = gameSessionService.beginDrawSession;
  gameSessionService.beginDrawSession = async () => ({
    sessionId: SESSION_ID,
    status: 'DRAWING',
    version: 3,
  });

  process.env.DRAW_RATE_LIMIT_MAX = '2';
  process.env.DRAW_RATE_LIMIT_WINDOW_MS = '60000';

  try {
    const gameSessionRoutes = await loadGameSessionRoutesFresh();
    const app = makeApp(gameSessionRoutes);
    const server = app.listen(0);

    try {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/begin-draw`;
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${makeToken('begin-draw-limiter-user')}`,
      };

      const first = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: 1 }),
      });
      assert.equal(first.status, 200);

      const second = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: 1 }),
      });
      assert.equal(second.status, 200);

      const blocked = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ expectedVersion: 1 }),
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
    gameSessionService.beginDrawSession = originalBeginDrawSession;
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
