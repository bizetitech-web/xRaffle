import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

import pool from '../../../config/database.js';
import gameSessionRoutes from '../../../src/contexts/gameSessions/gameSession.routes.js';
import { gameSessionService } from '../../../src/contexts/gameSessions/gameSession.service.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

const TOKEN_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const SESSION_ID = '9d1b8f5c-7e34-4b92-9f13-92aaab6c3d10';
const TEMPLATE_ID = 'b2475ea7-a8be-4cfb-b619-0524bd4be9aa';

const makeToken = (sub = 'user-1') => jwt.sign({ sub }, TOKEN_SECRET, { expiresIn: '1h' });

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(gameSessionRoutes);
  app.use(errorHandler);
  return app;
};

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

const withServiceMocks = async (run, overrides = {}) => {
  const original = {
    listSessions: gameSessionService.listSessions,
    getSession: gameSessionService.getSession,
    createSession: gameSessionService.createSession,
    startSession: gameSessionService.startSession,
  };

  gameSessionService.listSessions = overrides.listSessions || (async () => []);
  gameSessionService.getSession = overrides.getSession || (async () => ({ sessionId: SESSION_ID, status: 'PENDING', version: 1 }));
  gameSessionService.createSession = overrides.createSession || (async () => ({ sessionId: SESSION_ID, sessionCode: 'GAME-1', status: 'PENDING', version: 1 }));
  gameSessionService.startSession = overrides.startSession || (async () => ({ sessionId: SESSION_ID, status: 'ACTIVE', version: 2, idempotencyStatus: 'new' }));

  try {
    await run();
  } finally {
    gameSessionService.listSessions = original.listSessions;
    gameSessionService.getSession = original.getSession;
    gameSessionService.createSession = original.createSession;
    gameSessionService.startSession = original.startSession;
  }
};

test('game session list route returns sessions payload', async () => {
  const restoreQuery = installQueryMock(['VIEW_GAMES']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions`, {
          headers: {
            Authorization: `Bearer ${makeToken()}`,
          },
        });

        const body = await response.json();
        assert.equal(response.status, 200);
        assert.ok(Array.isArray(body));
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      listSessions: async () => ([
        { sessionId: SESSION_ID, sessionCode: 'GAME-1', templateId: TEMPLATE_ID, status: 'PENDING', totalCards: 25 },
      ]),
    });
  } finally {
    restoreQuery();
  }
});

test('game session list route includes templateId in payload', async () => {
  const restoreQuery = installQueryMock(['VIEW_GAMES']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions`, {
          headers: {
            Authorization: `Bearer ${makeToken()}`,
          },
        });

        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body[0].templateId, TEMPLATE_ID);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      listSessions: async () => ([
        { sessionId: SESSION_ID, sessionCode: 'GAME-1', templateId: TEMPLATE_ID, status: 'PENDING', totalCards: 25 },
      ]),
    });
  } finally {
    restoreQuery();
  }
});

test('game session create route validates payload', async () => {
  const restoreQuery = installQueryMock(['MANAGE_GAMES']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ templateId: 'not-a-uuid' }),
        });

        const body = await response.json();
        assert.equal(response.status, 400);
        assert.equal(body.code, 'VALIDATION_ERROR');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  } finally {
    restoreQuery();
  }
});

test('game session create route returns created session', async () => {
  const restoreQuery = installQueryMock(['MANAGE_GAMES']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ templateId: TEMPLATE_ID }),
        });

        const body = await response.json();
        assert.equal(response.status, 201);
        assert.equal(body.sessionId, SESSION_ID);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      createSession: async () => ({
        sessionId: SESSION_ID,
        sessionCode: 'GAME-55',
        status: 'PENDING',
        version: 1,
      }),
    });
  } finally {
    restoreQuery();
  }
});

test('game session detail route returns session', async () => {
  const restoreQuery = installQueryMock(['VIEW_GAMES']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}`, {
          headers: {
            Authorization: `Bearer ${makeToken()}`,
          },
        });

        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.sessionId, SESSION_ID);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      getSession: async () => ({
        sessionId: SESSION_ID,
        sessionCode: 'GAME-3',
        templateId: TEMPLATE_ID,
        status: 'ACTIVE',
        version: 3,
      }),
    });
  } finally {
    restoreQuery();
  }
});

test('game session detail route includes templateId in payload', async () => {
  const restoreQuery = installQueryMock(['VIEW_GAMES']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}`, {
          headers: {
            Authorization: `Bearer ${makeToken()}`,
          },
        });

        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.templateId, TEMPLATE_ID);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      getSession: async () => ({
        sessionId: SESSION_ID,
        sessionCode: 'GAME-3',
        templateId: TEMPLATE_ID,
        status: 'ACTIVE',
        version: 3,
      }),
    });
  } finally {
    restoreQuery();
  }
});

test('game session start route auto-generates Idempotency-Key when header is missing', async () => {
  const restoreQuery = installQueryMock(['RUN_DRAWS']);

  try {
    let receivedKey = null;

    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ expectedVersion: 1 }),
        });

        const body = await response.json();
        const echoedKey = response.headers.get('x-idempotency-key');

        assert.equal(response.status, 200);
        assert.equal(body.idempotencyStatus, 'new');
        assert.ok(echoedKey);
        assert.match(echoedKey, /^[A-Za-z0-9._:-]{8,128}$/);
        assert.equal(receivedKey, echoedKey);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      startSession: async (req) => {
        receivedKey = req.idempotencyKey;
        return {
          sessionId: SESSION_ID,
          status: 'ACTIVE',
          version: 2,
          idempotencyStatus: 'new',
        };
      },
    });
  } finally {
    restoreQuery();
  }
});

test('game session start route rejects malformed Idempotency-Key when provided', async () => {
  const restoreQuery = installQueryMock(['RUN_DRAWS']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
            'Idempotency-Key': 'bad key with spaces',
          },
          body: JSON.stringify({ expectedVersion: 1 }),
        });

        const body = await response.json();
        assert.equal(response.status, 400);
        assert.equal(body.code, 'VALIDATION_ERROR');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  } finally {
    restoreQuery();
  }
});
