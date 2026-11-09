import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorised } from '../server/lib/auth.js';

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

test('accepts the right password with any username', () => {
  assert.equal(isAuthorised(basic('james', 'correct:horse'), 'correct:horse'), true);
  assert.equal(isAuthorised(basic('', 'correct:horse'), 'correct:horse'), true);
});

test('rejects a wrong or missing password', () => {
  assert.equal(isAuthorised(basic('james', 'wrong'), 'correct:horse'), false);
  assert.equal(isAuthorised(undefined, 'correct:horse'), false);
  assert.equal(isAuthorised('Bearer abc', 'correct:horse'), false);
});
