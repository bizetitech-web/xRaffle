import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRange, toLocalDateInputValue } from '../../src/utils/reportsDate.js';

test('toLocalDateInputValue returns yyyy-mm-dd', () => {
  const date = new Date('2026-05-16T10:30:00.000Z');
  const value = toLocalDateInputValue(date);

  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
});

test('defaultRange returns inclusive range boundaries', () => {
  const now = new Date('2026-05-16T12:00:00.000Z');
  const range = defaultRange(7, now);

  assert.equal(range.to, '2026-05-16');
  assert.equal(range.from, '2026-05-10');
});
