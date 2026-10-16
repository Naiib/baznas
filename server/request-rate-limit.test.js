import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedWindowLimiter } from './request-rate-limit.js';

test('rejects the request after its per-key limit is reached', () => {
  const limiter = createFixedWindowLimiter({ limit: 2, windowMs: 60_000, now: () => 1_000 });

  assert.equal(limiter.check('192.0.2.1').allowed, true);
  assert.equal(limiter.check('192.0.2.1').allowed, true);
  const blocked = limiter.check('192.0.2.1');

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
});

test('keeps rate limits separate for different request keys', () => {
  const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 60_000, now: () => 1_000 });
  limiter.check('192.0.2.1');
  assert.equal(limiter.check('198.51.100.1').allowed, true);
});
