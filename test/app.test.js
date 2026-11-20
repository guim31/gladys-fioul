// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake ministry site:
// devices, states, the container's own timer, the read cadence, the trigger,
// the action, the widget and the failures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  ACTION_KEY,
  FAILURE_RETRY_MS,
  HEARTBEAT_MS,
  NEW_PRICE,
  REFRESH_MS,
  TICK_MS,
  trendOf,
} from '../src/app.js';
import { TEXT } from '../src/i18n.js';
import { PAGE_URL } from '../src/source.js';
import { WIDGET_KEY } from '../src/widgets.js';
import {
  DAY,
  HOUR,
  NEXT_RELEASE,
  START,
  WORKBOOK_URL,
  createAll,
  createWorld,
  networkError,
  nextWeekWorkbook,
} from './helpers/world.js';

/** The widget content, as the core receives it. */
const widget = async (world, settings = {}, language = 'fr') => {
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });
  assert.equal(ack.success, true);
  return ack.data.content;
};

/** Intl separates thousands and units with no-break spaces: plain spaces to compare. */
const plain = (text) => text.replace(/[\u00a0\u202f]/g, ' ');

/** A clock on node:test's mocked Date (the SDK's heartbeat reads Date.now()). */
function mockedClock(t, apis = ['Date']) {
  t.mock.timers.enable({ apis, now: START });
  return { now: () => Date.now(), advance: (ms) => t.mock.timers.tick(ms) };
}

test('discovery: the heating oil device, the road fuels as an option', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const [device] = world.fake.discoveredDevices;
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.equal(device.name, 'Prix du fioul domestique');
  assert.equal(device.should_poll, false);
  assert.deepEqual(
    device.features.map((f) => f.external_id),
    ['price', 'week_change', 'month_average', 'fill_cost', 'week_date'].map((key) =>
      world.app.ids.heating.feature(key),
    ),
  );
  // Without a tank volume, no fill cost.
  await world.fake.configUpdated({ language: 'en', road_fuels: ['diesel', 'sp95_e10'] });
  const devices = world.fake.discoveredDevices;
  assert.equal(devices.length, 2);
  assert.ok(!devices[0].features.some((f) => f.external_id.endsWith('fill_cost')));
  assert.equal(devices[1].name, 'Fuel prices – France average');
  assert.deepEqual(
    devices[1].features.map((f) => f.name),
    [
      'Diesel (€/l)',
      'Diesel, 1-week change (%)',
      'SP95-E10 (€/l)',
      'SP95-E10, 1-week change (%)',
      'Week of the survey',
    ],
  );
});

test('states: published once the devices exist, then only what changed, with a heartbeat', async (t) => {
  const clock = mockedClock(t);
  const world = await createWorld({ clock });
  t.after(() => world.app.stop());
  // Nothing published before the devices exist.
  assert.equal(world.fake.states.length, 0);
  await createAll(world);
  const ids = world.app.ids.heating;
  assert.equal(world.fake.lastState(ids.feature('price')), 1.703);
  assert.equal(world.fake.lastState(ids.feature('week_change')), -1.7);
  assert.equal(world.fake.lastState(ids.feature('month_average')), 1.9253);
  // 1,500 litres at 1.703 €/l.
  assert.equal(world.fake.lastState(ids.feature('fill_cost')), 2555);
  assert.equal(world.fake.lastState(ids.feature('week_date')), 'Semaine du 13 nov. 2026');

  const count = world.fake.states.length;
  world.clock.advance(TICK_MS);
  await world.app.tick();
  assert.equal(world.fake.states.length, count, 'nothing changed, nothing sent');
  world.clock.advance(HEARTBEAT_MS);
  await world.app.tick();
  assert.ok(world.fake.states.length > count);
});

test('the road fuels device: each fuel chosen, and its week', async (t) => {
  const world = await createWorld({
    config: { language: 'fr', road_fuels: ['off_road_diesel', 'diesel'] },
  });
  t.after(() => world.app.stop());
  await createAll(world);
  const ids = world.app.ids.road;
  assert.equal(world.fake.lastState(ids.feature('diesel_price')), 2.1229);
  assert.equal(world.fake.lastState(ids.feature('diesel_week_change')), -2.5);
  assert.equal(world.fake.lastState(ids.feature('off_road_diesel_price')), 1.7902);
  assert.equal(world.fake.lastState(ids.feature('week_date')), 'Semaine du 13 nov. 2026');
  assert.equal(world.fake.lastState(ids.feature('sp98_price')), undefined);
});

test('the container refreshes on its own timer: a new week reaches the device without any poll', async (t) => {
  const clock = mockedClock(t, ['setTimeout', 'Date']);
  const world = await createWorld({ clock, timers: true });
  t.after(() => world.app.stop());
  await createAll(world);
  world.site.files.set(WORKBOOK_URL, nextWeekWorkbook(-0.03));
  const ids = world.app.ids.heating;
  const steps = (NEXT_RELEASE + 3 * HOUR - START) / TICK_MS;
  for (let i = 0; i < steps; i += 1) {
    t.mock.timers.tick(TICK_MS);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(world.fake.lastState(ids.feature('price')), 1.6519);
  assert.equal(world.fake.lastState(ids.feature('week_change')), -3);
  assert.equal(world.fake.lastState(ids.feature('week_date')), 'Semaine du 20 nov. 2026');
});

test('cadence: once a day, every 2 hours while the new week is due, an hour after a failure', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const reads = () => world.site.workbookCalls().length;
  assert.equal(reads(), 1);
  // Friday afternoon: the next read tomorrow.
  world.clock.advance(23 * HOUR);
  await world.app.tick();
  assert.equal(reads(), 1);
  world.clock.advance(HOUR);
  await world.app.tick();
  assert.equal(reads(), 2);
  // The same file: a 304, nothing parsed again.
  assert.ok(world.site.calls.at(-1).headers['if-none-match']);
  // Monday 10:00 UTC: the new week is due, a read every 2 hours.
  world.clock.time = Date.UTC(2026, 10, 23, 10, 0, 0);
  await world.app.tick();
  assert.equal(reads(), 3);
  world.clock.advance(HOUR);
  await world.app.tick();
  assert.equal(reads(), 3);
  world.clock.advance(HOUR);
  await world.app.tick();
  assert.equal(reads(), 4);
  // Out: back to once a day.
  world.site.files.set(WORKBOOK_URL, nextWeekWorkbook());
  world.clock.advance(2 * HOUR);
  await world.app.tick();
  assert.equal(world.app.weeks.at(-1).date, '2026-11-20');
  assert.equal(world.app.nextReadAt(), world.clock.now() + REFRESH_MS);
  // A failure: retried an hour later.
  world.site.fail = networkError;
  world.clock.advance(REFRESH_MS);
  await world.app.tick();
  assert.equal(world.app.nextReadAt(), world.clock.now() + FAILURE_RETRY_MS);
});

test('the trigger: a new week fires once, with the summary; never the first week seen', async (t) => {
  const world = await createWorld();
  await createAll(world);
  // A fresh install: the week of 2026-11-13 is not news.
  assert.deepEqual(world.fake.sceneEvents, []);
  world.site.files.set(WORKBOOK_URL, nextWeekWorkbook(-0.03));
  world.clock.time = NEXT_RELEASE;
  await world.app.tick({ force: true });
  const events = world.fake.sceneEvents.filter((e) => e.key === NEW_PRICE);
  const normalized = events.map((e) => ({
    ...e,
    data: { ...e.data, summary: plain(e.data.summary) },
  }));
  assert.deepEqual(normalized, [
    {
      key: NEW_PRICE,
      data: {
        price: 1.6519,
        change: -3,
        trend: 'down',
        fill_cost: 2478,
        week_date: '2026-11-20',
        summary:
          'Fioul domestique 1,6519 €/l (−3,0 %), Plein de 1 500 l : 2 478 €, Semaine du 20 nov. 2026',
      },
    },
  ]);
  // The new price is published before the event: a scene reading it sees it.
  assert.equal(world.fake.lastState(world.app.ids.heating.feature('price')), 1.6519);
  await world.app.tick({ force: true });
  assert.equal(world.fake.sceneEvents.length, 1);
  await world.app.stop();

  // A restart does not announce the same week again.
  const again = await createWorld({ dataDir: world.dataDir, site: world.site, clock: world.clock });
  t.after(() => again.app.stop());
  await again.app.tick({ force: true });
  assert.deepEqual(again.fake.sceneEvents, []);
  assert.equal(again.app.persisted.url, WORKBOOK_URL);
});

test('the trend of the trigger', () => {
  assert.equal(trendOf(-0.1), 'down');
  assert.equal(trendOf(0), 'stable');
  assert.equal(trendOf(0.04), 'stable');
  assert.equal(trendOf(undefined), 'stable');
  assert.equal(trendOf(2.3), 'up');
});

test('failures: the status says it in four languages, and recovers', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  world.site.fail = networkError;
  world.clock.advance(REFRESH_MS);
  await world.app.tick();
  assert.deepEqual(world.fake.connectionStatus, { connected: false, message: TEXT.unreachable });
  // The states already read stay published: nothing is erased.
  world.site.fail = null;
  world.site.files.set(WORKBOOK_URL, Buffer.from('<html>Erreur 500</html>'));
  world.clock.advance(FAILURE_RETRY_MS);
  await world.app.tick();
  assert.deepEqual(world.fake.connectionStatus, { connected: false, message: TEXT.badFile });
  world.site.files.set(WORKBOOK_URL, nextWeekWorkbook());
  world.clock.advance(FAILURE_RETRY_MS);
  await world.app.tick();
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
});

test('a page without the link: the last link that worked, remembered under /data', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const renamed =
    'https://www.ecologie.gouv.fr/sites/default/files/documents/Prix%20HTT%20et%20TTC%20depuis%20janvier%202020_1.xlsx';
  world.site.page = world.site.page.replaceAll('2020_0.xlsx', '2020_1.xlsx');
  world.site.files.set(renamed, nextWeekWorkbook());
  world.clock.advance(REFRESH_MS);
  await world.app.tick();
  assert.equal(world.app.persisted.url, renamed);
  // The page breaks: the renamed file is still read.
  world.site.page = '<html><body>Maintenance</body></html>';
  world.clock.advance(REFRESH_MS);
  await world.app.tick();
  assert.equal(world.site.calls.at(-1).url, renamed);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.site.calls.at(-2).url, PAGE_URL);
});

test('a workbook stopped for over a month: no stale value, the status says it', async (t) => {
  const world = await createWorld({ connect: false });
  world.clock.advance(40 * DAY);
  await world.gladys.connect();
  t.after(() => world.app.stop());
  await createAll(world);
  assert.equal(world.fake.states.length, 0);
  assert.deepEqual(world.fake.connectionStatus, { connected: false, message: TEXT.stale });
  const ack = await world.fake.action(ACTION_KEY);
  assert.equal(ack.success, false);
  assert.equal(ack.error.fr, TEXT.stale.fr);
});

test('the action: green with the price, red with the reason', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ok = await world.fake.action(ACTION_KEY);
  assert.equal(ok.success, true);
  assert.equal(
    plain(ok.data.message),
    'Le fichier du ministère est lu. Semaine du 13 nov. 2026 : fioul domestique 1,703 €/l.',
  );
  world.site.fail = networkError;
  const failed = await world.fake.action(ACTION_KEY);
  assert.equal(failed.success, false);
  assert.equal(failed.error.fr, TEXT.unreachable.fr);
  assert.equal(failed.error.de, TEXT.unreachable.de);
});

test('the widget: price, change, fill, curve, monthly average, week — each hideable', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const content = await widget(world);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(
    content.components.map((c) => c.type),
    ['value', 'value', 'value', 'chart', 'status', 'text'],
  );
  const [price, change, fill, chart, status, caption] = content.components;
  assert.deepEqual(
    [price.label, price.value, price.unit, price.color],
    ['Fioul domestique', 1.703, '€/l', 'success'],
  );
  assert.deepEqual([change.value, change.unit, change.icon], [-1.7, '%', 'trending-down']);
  assert.deepEqual([plain(fill.label), fill.value, fill.unit], ['Plein de 1 500 l', 2555, '€']);
  assert.equal(chart.series[0].points.length, 11);
  assert.deepEqual(chart.series[0].points.at(-1), { t: '2026-11-13T00:00:00.000Z', v: 1.703 });
  assert.deepEqual(
    status.items.map((item) => ({ ...item, value: plain(item.value) })),
    [{ label: 'Moyenne d’octobre 2026', value: '1,9253 €/l', color: 'success' }],
  );
  assert.equal(caption.text, 'DGEC · Semaine du 13 nov. 2026');

  const bare = await widget(world, {
    show_change: false,
    show_fill_cost: false,
    show_chart: false,
    show_month: false,
  });
  assert.deepEqual(
    bare.components.map((c) => c.type),
    ['value', 'text'],
  );
  const english = await widget(world, {}, 'en');
  assert.equal(english.components[0].label, 'Heating oil');
  assert.deepEqual(validateWidgetContent(english), []);
});

test('the widget before any price and when the ministry is unreachable', async (t) => {
  const world = await createWorld({ connect: false });
  t.after(() => world.app.stop());
  world.site.fail = networkError;
  await world.gladys.connect();
  const down = await widget(world);
  assert.deepEqual(down.components, [{ type: 'text', variant: 'body', text: TEXT.unreachable.fr }]);
  // No new download for each display while it fails.
  const calls = world.site.count();
  await widget(world);
  assert.equal(world.site.count(), calls);
  // Recovered, the widget reads at once.
  world.site.fail = null;
  world.clock.advance(FAILURE_RETRY_MS);
  const up = await widget(world);
  assert.equal(up.components[0].value, 1.703);
});

test('a device added later gets its states at once, and the widget is refreshed', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const refreshes = world.fake.widgetRefreshes.length;
  await createAll(world);
  assert.equal(world.fake.lastState(world.app.ids.heating.feature('price')), 1.703);
  assert.ok(world.fake.widgetRefreshes.length > refreshes);
});
