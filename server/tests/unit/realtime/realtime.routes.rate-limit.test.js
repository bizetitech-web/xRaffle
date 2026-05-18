import test from 'node:test';
import assert from 'node:assert/strict';

import { realtimeRoutesTesting } from '../../../src/contexts/realtime/realtime.routes.js';

const { consumeRealtimeTokenSlot, resetRealtimeTokenRateLimitState } = realtimeRoutesTesting;

test.beforeEach(() => {
  resetRealtimeTokenRateLimitState();
});

test('realtime token rate limiter allows first request for a user', () => {
  const outcome = consumeRealtimeTokenSlot('user-a');

  assert.equal(outcome.allowed, true);
  assert.equal(typeof outcome.remaining, 'number');
  assert.ok(outcome.remaining >= 0);
  assert.ok(outcome.retryAfterSeconds >= 1);
});

test('realtime token rate limiter tracks users independently', () => {
  const userA = consumeRealtimeTokenSlot('user-a');
  const userB = consumeRealtimeTokenSlot('user-b');

  assert.equal(userA.allowed, true);
  assert.equal(userB.allowed, true);
  assert.equal(typeof userA.remaining, 'number');
  assert.equal(typeof userB.remaining, 'number');
});

test('realtime token rate limiter blocks after max requests in active window', () => {
  const userId = 'user-cap';
  let blocked = null;

  for (let i = 0; i < 25; i += 1) {
    const outcome = consumeRealtimeTokenSlot(userId);
    if (!outcome.allowed) {
      blocked = outcome;
      break;
    }
  }

  assert.ok(blocked, 'Expected limiter to block repeated requests in same window');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1);
});
