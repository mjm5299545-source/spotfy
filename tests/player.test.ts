import test from 'node:test';
import assert from 'node:assert/strict';
import { nextQueueIndex, normalizePreferences, formatTime } from '../src/player/queue.ts';

test('linear queue terminates without repeat and wraps with repeat all', () => {
  assert.equal(nextQueueIndex(3, 0, 'off', false), 1);
  assert.equal(nextQueueIndex(3, 2, 'off', false), null);
  assert.equal(nextQueueIndex(3, 2, 'all', false), 0);
  assert.equal(nextQueueIndex(1, 0, 'all', false), 0);
  assert.equal(nextQueueIndex(0, -1, 'all', false), null);
});
test('manual next is independent from repeat one; repeat one belongs to ended event', () => {
  assert.equal(nextQueueIndex(3, 1, 'one', false), 2);
  assert.equal(nextQueueIndex(3, 2, 'one', false), null);
});
test('shuffle includes final queue entry and never selects current entry when alternatives exist', () => {
  assert.equal(nextQueueIndex(4, 0, 'all', true, () => .999), 3);
  assert.equal(nextQueueIndex(4, 2, 'all', true, () => .5), 1);
  for (let current = 0; current < 4; current++) for (const random of [0, .2, .5, .999]) {
    const choice = nextQueueIndex(4, current, 'off', true, () => random);
    assert.notEqual(choice, current);
    assert.ok(choice !== null && choice >= 0 && choice < 4);
  }
});
test('shuffle exhausts its finite queue without repeat and starts a new cycle with repeat all', () => {
  const visited = new Set([0, 1, 2]);
  assert.equal(nextQueueIndex(4, 2, 'off', true, () => 0, visited), 3);
  visited.add(3);
  assert.equal(nextQueueIndex(4, 3, 'off', true, () => 0, visited), null);
  assert.equal(nextQueueIndex(4, 3, 'all', true, () => 0, visited), 0);
  assert.equal(nextQueueIndex(1, 0, 'off', true), null);
  assert.equal(nextQueueIndex(1, 0, 'all', true), 0);
});
test('stored preferences are bounded and reject invalid types and non-finite volume', () => {
  assert.deepEqual(normalizePreferences(null), {volume:.7,shuffle:false,repeat:'off'});
  assert.deepEqual(normalizePreferences({volume: 8,shuffle:true,repeat:'one'}), {volume:1,shuffle:true,repeat:'one'});
  assert.deepEqual(normalizePreferences({volume: -1,shuffle:'yes',repeat:'invalid'}), {volume:0,shuffle:false,repeat:'off'});
  assert.equal(normalizePreferences({volume:Number.NaN}).volume,.7);
});
test('timeline uses finite audio time with minute boundaries', () => {
  assert.equal(formatTime(65.9),'1:05');
  assert.equal(formatTime(0),'0:00');
  assert.equal(formatTime(Infinity),'0:00');
  assert.equal(formatTime(-3),'0:00');
});
