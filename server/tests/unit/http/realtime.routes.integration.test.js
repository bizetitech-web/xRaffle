import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import phaseContextRouter from '../../../src/contexts/index.js';
import { errorHandler } from '../../../middleware/errorHandler.js';
import { RealtimeEventContracts } from '../../../src/contexts/realtime/realtime.events.js';

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(phaseContextRouter);
  app.use(errorHandler);
  return app;
};

test('realtime health route returns gateway status and contracts', async () => {
  const app = makeApp();
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/realtime/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.enabled, false);
    assert.equal(body.transport, 'socket.io');
    assert.equal(body.connectedClients, 0);
    assert.equal(body.contracts.draw.next, RealtimeEventContracts.draw.next);
    assert.equal(body.contracts.session.statusChanged, RealtimeEventContracts.session.statusChanged);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
