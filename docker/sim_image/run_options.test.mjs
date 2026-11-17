import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveActions, resolveRunMs, MAX_ACTION_BYTES } from './run_options.mjs';

const b64 = (text) => Buffer.from(text).toString('base64');

test('an action script arrives as base64 UTF-8 text', () => {
  assert.equal(resolveActions(undefined), null);
  assert.equal(resolveActions(b64('500 set DHT1.temperature = 28 °C\n')), '500 set DHT1.temperature = 28 °C\n');
  assert.equal(resolveActions(b64('x'.repeat(MAX_ACTION_BYTES))).length, MAX_ACTION_BYTES);
});

test('malformed or oversized action scripts fail before a simulation starts', () => {
  for (const raw of ['', 'not base64!', 'abc', b64('x'.repeat(MAX_ACTION_BYTES + 1)),
    Buffer.from([0xff, 0xfe]).toString('base64'), ['YQ==', 'YQ==']]) {
    assert.throws(() => resolveActions(raw), { status: 400 });
  }
});

test('serial duration defaults to five seconds and permits longer runs', () => {
  assert.equal(resolveRunMs(undefined), 5000);
  for (const ms of [1, 5000, 15000, 60000]) {
    assert.equal(resolveRunMs(String(ms)), ms);
  }
});

test('invalid or excessive durations fail before a simulation starts', () => {
  for (const raw of ['', '0', '-1', '1.5', '1e3', '05', '60001', '9'.repeat(100), ['5000', '10000']]) {
    assert.throws(() => resolveRunMs(raw), { status: 400 });
  }
});
