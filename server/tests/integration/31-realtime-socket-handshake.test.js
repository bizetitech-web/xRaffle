import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';

import {
  createRealtimeGateway,
  realtimeGatewayTesting,
} from '../../src/contexts/realtime/realtime.gateway.js';
import { RealtimeEventContracts } from '../../src/contexts/realtime/realtime.events.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

const startHarness = async () => {
  const app = express();
  const server = http.createServer(app);
  const gateway = createRealtimeGateway();
  gateway.attachServer(server);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    gateway,
    close: async () => {
      if (gateway.io) {
        await new Promise((resolve) => gateway.io.close(() => resolve()));
      }
      await new Promise((resolve) => server.close(resolve));
    },
  };
};

const connectExpectingError = ({ baseUrl, token }) => {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      auth: token ? { token } : {},
      reconnection: false,
      timeout: 1500,
      transports: ['websocket'],
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for connect_error'));
    }, 3000);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error('Unexpected successful connection'));
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      resolve(error?.message || String(error));
    });
  });
};

const connectExpectingSuccess = ({ baseUrl, token }) => {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      auth: { token },
      reconnection: false,
      timeout: 1500,
      transports: ['websocket'],
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for realtime connected event'));
    }, 3000);

    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });

    socket.on(RealtimeEventContracts.system.connected, (envelope) => {
      clearTimeout(timer);
      resolve({ socket, envelope });
    });
  });
};

test('unauthorized websocket handshake returns UNAUTHORIZED consistently', async () => {
  const harness = await startHarness();

  try {
    const missingTokenError = await connectExpectingError({ baseUrl: harness.baseUrl });
    assert.equal(missingTokenError, 'UNAUTHORIZED');

    const malformedTokenError = await connectExpectingError({
      baseUrl: harness.baseUrl,
      token: 'not-a-jwt',
    });
    assert.equal(malformedTokenError, 'UNAUTHORIZED');
  } finally {
    await harness.close();
  }
});

test('websocket handshake rejects non-realtime access token', async () => {
  const harness = await startHarness();

  try {
    const accessToken = jwt.sign(
      {
        sub: 'user-access-1',
        email: 'access@example.com',
        role: 'org_admin',
        roleLevel: 2,
        hotelCompanyId: 'co-access-1',
        tokenType: 'access',
      },
      JWT_SECRET,
      { expiresIn: '5m' }
    );

    const errorMessage = await connectExpectingError({
      baseUrl: harness.baseUrl,
      token: accessToken,
    });

    assert.equal(errorMessage, 'UNAUTHORIZED');
  } finally {
    await harness.close();
  }
});

test('websocket handshake accepts realtime token and joins expected base rooms', async () => {
  const harness = await startHarness();

  try {
    const userId = 'user-rt-1';
    const companyId = 'co-rt-1';
    const realtimeToken = realtimeGatewayTesting.issueRealtimeToken({
      sub: userId,
      email: 'rt@example.com',
      role: 'org_admin',
      roleLevel: 2,
      hotelCompanyId: companyId,
    });

    const { socket, envelope } = await connectExpectingSuccess({
      baseUrl: harness.baseUrl,
      token: realtimeToken,
    });

    try {
      assert.equal(envelope.event, RealtimeEventContracts.system.connected);
      assert.equal(envelope.payload.userId, userId);
      assert.equal(envelope.payload.hotelCompanyId, companyId);

      const socketId = envelope.payload.socketId;
      const userRoom = `user:${userId}`;
      const companyRoom = `company:${companyId}`;

      assert.equal(
        harness.gateway.io.sockets.adapter.rooms.get(userRoom)?.has(socketId),
        true,
        'Expected socket to join user room'
      );
      assert.equal(
        harness.gateway.io.sockets.adapter.rooms.get(companyRoom)?.has(socketId),
        true,
        'Expected socket to join company room'
      );
    } finally {
      socket.close();
    }
  } finally {
    await harness.close();
  }
});
