import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  createRealtimeGateway,
  realtimeGatewayTesting,
} from '../../../src/contexts/realtime/realtime.gateway.js';
import { RealtimeEventContracts } from '../../../src/contexts/realtime/realtime.events.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

test('realtime gateway exposes disabled health before attachment', () => {
  const gateway = createRealtimeGateway();
  const health = gateway.getHealthSnapshot();

  assert.equal(health.enabled, false);
  assert.equal(health.transport, 'socket.io');
  assert.equal(health.connectedClients, 0);
  assert.equal(health.contracts.session.statusChanged, RealtimeEventContracts.session.statusChanged);
});

test('realtime gateway emit methods return false when io is unattached', () => {
  const gateway = createRealtimeGateway();

  assert.equal(
    gateway.emitSessionEvent({ event: RealtimeEventContracts.session.statusChanged, payload: {} }),
    false
  );
  assert.equal(
    gateway.emitBoardEvent({ event: RealtimeEventContracts.board.cardSold, payload: {} }),
    false
  );
});

test('realtime auth resolves bearer token from handshake auth block', () => {
  const token = 'abc123';
  const socket = {
    handshake: {
      auth: {
        token: `Bearer ${token}`,
      },
      headers: {},
    },
  };

  assert.equal(realtimeGatewayTesting.resolveTokenFromSocket(socket), token);
});

test('realtime auth decodes valid JWT payload', () => {
  const signed = jwt.sign(
    {
      sub: 'user-1',
      email: 'u@example.com',
      role: 'org_admin',
      roleLevel: 2,
      hotelCompanyId: 'co-1',
    },
    JWT_SECRET,
    { expiresIn: '5m' }
  );

  const decoded = realtimeGatewayTesting.decodeRealtimeToken(signed);

  assert.equal(decoded.sub, 'user-1');
  assert.equal(decoded.hotelCompanyId, 'co-1');
});
