import test from 'node:test';
import assert from 'node:assert/strict';

import { realtimeRoutesTesting } from '../../../src/contexts/realtime/realtime.routes.js';

const {
  resetRealtimeTokenRateLimitState,
  cacheRealtimeTokenResponseForKey,
  readRealtimeTokenResponseFromCache,
  cleanupRealtimeTokenState,
  consumeRealtimeTokenSlot,
  getStateSizeSnapshot,
  getConfigSnapshot,
} = realtimeRoutesTesting;

test.beforeEach(() => {
  resetRealtimeTokenRateLimitState();
});

test('realtime token idempotency cache returns stored payload for matching user and key', () => {
  const payload = { socketToken: 'token-a', expiresIn: 3600 };

  cacheRealtimeTokenResponseForKey('user-a', 'key-a', payload);
  const cached = readRealtimeTokenResponseFromCache('user-a', 'key-a');

  assert.deepEqual(cached, payload);
});

test('realtime token idempotency cache is scoped by user and idempotency key', () => {
  const payload = { socketToken: 'token-a', expiresIn: 3600 };

  cacheRealtimeTokenResponseForKey('user-a', 'key-a', payload);

  assert.equal(readRealtimeTokenResponseFromCache('user-a', 'key-b'), null);
  assert.equal(readRealtimeTokenResponseFromCache('user-b', 'key-a'), null);
});

test('realtime token idempotency cache expires entries after ttl window', () => {
  const realNow = Date.now;
  const start = 1_000_000;

  try {
    Date.now = () => start;
    cacheRealtimeTokenResponseForKey('user-a', 'key-a', { socketToken: 'token-a', expiresIn: 3600 });

    Date.now = () => start + 20_000;
    const cached = readRealtimeTokenResponseFromCache('user-a', 'key-a');

    assert.equal(cached, null);
  } finally {
    Date.now = realNow;
  }
});

test('realtime token state cleanup removes stale idempotency and bucket entries', () => {
  const realNow = Date.now;
  const start = 1_000_000;

  try {
    Date.now = () => start;
    consumeRealtimeTokenSlot('user-cleanup');
    cacheRealtimeTokenResponseForKey('user-cleanup', 'key-cleanup', { socketToken: 'token-a', expiresIn: 3600 });

    let sizes = getStateSizeSnapshot();
    assert.equal(sizes.buckets, 1);
    assert.equal(sizes.idempotencyEntries, 1);

    Date.now = () => start + 70_000;
    cleanupRealtimeTokenState();

    sizes = getStateSizeSnapshot();
    assert.equal(sizes.buckets, 0);
    assert.equal(sizes.idempotencyEntries, 0);
  } finally {
    Date.now = realNow;
  }
});

test('realtime token idempotency cache stays bounded by configured max entries', () => {
  const { idempotencyMaxEntries } = getConfigSnapshot();

  for (let i = 0; i < idempotencyMaxEntries + 5; i += 1) {
    cacheRealtimeTokenResponseForKey(`user-${i}`, `key-${i}`, {
      socketToken: `token-${i}`,
      expiresIn: 3600,
    });
  }

  const sizes = getStateSizeSnapshot();
  assert.equal(sizes.idempotencyEntries, idempotencyMaxEntries);
});

test('realtime token idempotency cache evicts oldest entries when max size is exceeded', () => {
  const { idempotencyMaxEntries } = getConfigSnapshot();

  for (let i = 0; i < idempotencyMaxEntries + 1; i += 1) {
    cacheRealtimeTokenResponseForKey('user-eviction', `key-${i}`, {
      socketToken: `token-${i}`,
      expiresIn: 3600,
    });
  }

  const oldest = readRealtimeTokenResponseFromCache('user-eviction', 'key-0');
  const newest = readRealtimeTokenResponseFromCache('user-eviction', `key-${idempotencyMaxEntries}`);

  assert.equal(oldest, null);
  assert.ok(newest && typeof newest === 'object');
  assert.equal(newest.socketToken, `token-${idempotencyMaxEntries}`);
});
