// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTION_KEY, NEW_PRICE, TRENDS, TRIGGER_KEYS } from '../src/app.js';
import { DEFAULT_CONFIG, LANGUAGES, MAX_TANK_LITRES } from '../src/config.js';
import { PRODUCTS, ROAD_FUELS } from '../src/fuels.js';
import { WIDGET_KEY } from '../src/widgets.js';
import { NEXT_RELEASE, WORKBOOK_URL, createWorld, nextWeekWorkbook } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const field = (key) => manifest.config_schema.find((f) => f.key === key);

test('identity: name, image, cover, cloud transport, categories, France', () => {
  assert.equal(manifest.name, 'Prix du fioul');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-fioul:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-fioul/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['energy', 'climate']);
  assert.deepEqual(manifest.countries, ['FR']);
  // `countries` needs Gladys 5.3.0 (and covers the trigger, the widget and its chart).
  assert.equal(manifest.gladys_version, '>=5.3.0');
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('a trigger, a widget, an action, no scene action', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), TRIGGER_KEYS);
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(keysOf(manifest.actions), [ACTION_KEY]);
  // An action applies no `default` and cannot fill a secret (Gladys#3154, #3155).
  assert.equal(manifest.actions[0].fields, undefined);
  assert.equal(manifest.scene_actions, undefined);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const valued = manifest.config_schema.filter((f) => f.type !== 'section');
  assert.deepEqual(keysOf(valued).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const f of valued) {
    assert.deepEqual(DEFAULT_CONFIG[f.key], f.default, f.key);
  }
  assert.deepEqual(
    field('language').options.map((o) => o.value),
    LANGUAGES,
  );
  // A number field is rendered without `step`: whole min and default only.
  assert.equal(field('tank_volume').type, 'number');
  assert.equal(field('tank_volume').min, 0);
  assert.equal(field('tank_volume').max, MAX_TANK_LITRES);
  assert.deepEqual(
    field('road_fuels').options.map((o) => o.value),
    ROAD_FUELS,
  );
  for (const option of field('road_fuels').options) {
    assert.deepEqual(option.label, PRODUCTS[option.value].name, option.value);
  }
});

test('the widget settings hide each optional block, all shown by default', () => {
  const settings = manifest.widgets[0].settings;
  assert.deepEqual(keysOf(settings), ['show_change', 'show_fill_cost', 'show_chart', 'show_month']);
  for (const setting of settings) {
    assert.equal(setting.type, 'boolean');
    assert.equal(setting.default, true);
  }
});

test('the configuration says national averages, no account, and not affiliated', () => {
  const intro = field('intro');
  assert.match(intro.description.en, /Not your supplier's price/);
  assert.match(intro.description.en, /Not affiliated with the ministry/);
  assert.match(intro.description.fr, /Sans lien avec le ministère/);
  assert.deepEqual(
    intro.links.map((l) => l.url),
    ['https://www.ecologie.gouv.fr/politiques-publiques/prix-produits-petroliers'],
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('the trigger sends exactly its declared variables, with their types', async (t) => {
  for (const config of [{ tank_volume: 1200 }, {}]) {
    const world = await createWorld({ config });
    t.after(() => world.app.stop());
    world.site.files.set(WORKBOOK_URL, nextWeekWorkbook(0.02));
    world.clock.time = NEXT_RELEASE;
    await world.app.tick({ force: true });
    const events = world.fake.sceneEvents.filter((e) => e.key === NEW_PRICE);
    assert.equal(events.length, 1);
    const [trigger] = manifest.scene_triggers;
    for (const { data } of events) {
      assert.deepEqual(Object.keys(data).sort(), keysOf(trigger.variables).sort());
      for (const variable of trigger.variables) {
        assert.equal(typeof data[variable.key], variable.type, variable.key);
      }
      // The filters compare with the event value of the same key.
      for (const filter of trigger.fields) {
        assert.ok(filter.options.some((o) => o.value === data[filter.key]));
      }
    }
  }
  assert.deepEqual(
    manifest.scene_triggers[0].fields[0].options.map((o) => o.value),
    TRENDS,
  );
});
