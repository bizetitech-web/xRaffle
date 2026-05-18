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

test('realtime gateway emits envelope to session and company rooms', () => {
  const gateway = createRealtimeGateway();
  const emitted = [];

  gateway.io = {
    to: (room) => ({
      emit: (event, envelope) => {
        emitted.push({ room, event, envelope });
      },
    }),
  };

  const ok = gateway.emitSessionEvent({
    event: RealtimeEventContracts.session.statusChanged,
    sessionId: 'session-1',
    companyId: 'co-1',
    payload: {
      action: 'start',
      status: 'ACTIVE',
      version: 4,
    },
  });

  assert.equal(ok, true);
  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].room, 'session:session-1');
  assert.equal(emitted[1].room, 'company:co-1');
  assert.equal(emitted[0].event, RealtimeEventContracts.session.statusChanged);
  assert.equal(emitted[0].envelope.payload.action, 'start');
  assert.equal(emitted[0].envelope.meta.sessionId, 'session-1');
  assert.equal(emitted[0].envelope.meta.companyId, 'co-1');
  assert.match(emitted[0].envelope.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('realtime gateway emitBoardEvent targets expected rooms with board contract event', () => {
  const gateway = createRealtimeGateway();
  const emitted = [];

  gateway.io = {
    to: (room) => ({
      emit: (event, envelope) => {
        emitted.push({ room, event, envelope });
      },
    }),
  };

  const ok = gateway.emitBoardEvent({
    event: RealtimeEventContracts.board.cardSold,
    sessionId: 'session-b1',
    companyId: 'co-b1',
    payload: {
      action: 'SELL',
      cardNumber: 7,
      version: 12,
    },
  });

  assert.equal(ok, true);
  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].room, 'session:session-b1');
  assert.equal(emitted[1].room, 'company:co-b1');
  assert.equal(emitted[0].event, RealtimeEventContracts.board.cardSold);
  assert.equal(emitted[0].envelope.payload.action, 'SELL');
  assert.equal(emitted[0].envelope.payload.cardNumber, 7);
  assert.equal(emitted[0].envelope.meta.sessionId, 'session-b1');
  assert.equal(emitted[0].envelope.meta.companyId, 'co-b1');
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

test('realtime token issuer creates decodable socket token with expected claims', () => {
  const token = realtimeGatewayTesting.issueRealtimeToken(
    {
      sub: 'user-2',
      email: 'token@example.com',
      role: 'org_admin',
      roleLevel: 2,
      hotelCompanyId: 'co-2',
    },
    { expiresInSeconds: 300 }
  );

  const decoded = realtimeGatewayTesting.decodeRealtimeToken(token);
  assert.equal(decoded.sub, 'user-2');
  assert.equal(decoded.role, 'org_admin');
  assert.equal(decoded.roleLevel, 2);
  assert.equal(decoded.hotelCompanyId, 'co-2');
});
