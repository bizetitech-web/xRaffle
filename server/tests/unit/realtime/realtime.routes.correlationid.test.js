import test from 'node:test';
import assert from 'node:assert/strict';
import { logInfo, logWarn, logError } from '../../../utils/logger.js';
import { realtimeRoutesTesting } from '../../../src/contexts/realtime/realtime.routes.js';

test('logs include correlationId when provided', () => {
  let lastLog = null;
  const origLog = console.log;
  console.log = (msg) => { lastLog = msg; };
  try {
    const correlationId = 'test-corrid-123';
    realtimeRoutesTesting.cacheRealtimeTokenResponseForKey('user-x', 'key-x', { socketToken: 'tok', expiresIn: 1 }, correlationId);
    assert.ok(lastLog && lastLog.includes('correlationId'), 'Expected correlationId in log');
    assert.ok(lastLog.includes(correlationId), 'Expected correct correlationId in log');
  } finally {
    console.log = origLog;
  }
});

test('logs include correlationId for error', () => {
  let lastError = null;
  const origError = console.error;
  console.error = (msg) => { lastError = msg; };
  try {
    const correlationId = 'test-corrid-err';
    logError('Test error', { error: new Error('fail'), correlationId });
    assert.ok(lastError && lastError.includes('correlationId'), 'Expected correlationId in error log');
    assert.ok(lastError.includes(correlationId), 'Expected correct correlationId in error log');
  } finally {
    console.error = origError;
  }
});
