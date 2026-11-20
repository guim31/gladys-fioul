// -----------------------------------------------------------------------------
// Quiet logs: a normal cycle writes nothing at the info level, and a failure
// that lasts writes one line when it starts and one when it ends.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, createAll, createWorld, networkError } from './helpers/world.js';

/** Capture what the loggers write, at a given LOG_LEVEL. */
function captureLogs(t, level) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  for (const stream of ['log', 'error']) {
    t.mock.method(console, stream, (...args) => lines.push(args.map(String).join(' ')));
  }
  return lines;
}

test('a normal cycle writes nothing at the info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 16; i += 1) {
    world.clock.advance(6 * HOUR);
    await world.app.tick();
    await world.fake.widgetGet('heating_oil', { settings: {}, language: 'fr', units: 'metric' });
  }
  assert.ok(world.site.count() >= 8);
  assert.deepEqual(lines, []);
});

test('a lasting failure: one line when it starts, one when it ends', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const lines = captureLogs(t, 'info');
  world.site.fail = networkError;
  world.clock.advance(24 * HOUR);
  for (let i = 0; i < 5; i += 1) {
    world.clock.advance(HOUR);
    await world.app.tick();
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[WARN\].*workbook cannot be read: www\.ecologie\.gouv\.fr unreachable/);
  world.site.fail = null;
  world.clock.advance(HOUR);
  await world.app.tick();
  assert.equal(lines.length, 2);
  assert.match(lines[1], /\[INFO\].*workbook is read again/);
});
