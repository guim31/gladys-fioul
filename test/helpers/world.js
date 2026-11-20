// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake ministry site (its page
// and its workbook) behind one fake `fetch`, a temporary /data and a manual
// clock, with the integration wired on top through registerHandlers. No timer
// runs unless `timers: true`: the tests call `app.tick()`. No test touches
// the network.
//
// The fixtures are real: an extract of the ministry's page (its download
// blocks) and of its workbook (the weeks of 2026-09-04 to 2026-11-13 and two
// monthly averages), both downloaded on 2026-11-20. Public data, nothing to
// anonymize.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { PAGE_URL, parseWorkbook } from '../../src/source.js';
import { Store } from '../../src/store.js';
import { writeWorkbook } from './xlsx-writer.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const fixtureBytes = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url));

export const PAGE = fixtureBytes('prix-produits-petroliers.html').toString('utf8');
export const WORKBOOK = fixtureBytes('prix-htt-ttc-extract.xlsx');
export const WORKBOOK_URL =
  'https://www.ecologie.gouv.fr/sites/default/files/documents/Prix%20HTT%20et%20TTC%20depuis%20janvier%202020_0.xlsx';
export const WEEKS = parseWorkbook(WORKBOOK);

/** Friday 2026-11-20, 15:00 UTC: the week of 2026-11-13 is the last one out. */
export const START = Date.UTC(2026, 10, 20, 15, 0, 0);
export const LAST_WEEK = '2026-11-13';
export const NEXT_WEEK = '2026-11-20';
/** Monday 2026-11-23, 14:30 UTC: the next week is out. */
export const NEXT_RELEASE = Date.UTC(2026, 10, 23, 14, 30, 0);
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/** The workbook with one more week, every price moved by `ratio`. */
export function nextWeekWorkbook(ratio = -0.03, date = NEXT_WEEK) {
  const last = WEEKS.at(-1);
  const prices = Object.fromEntries(
    Object.entries(last.prices).map(([key, value]) => [
      key,
      Math.round(value * (1 + ratio) * 10000) / 10000,
    ]),
  );
  return writeWorkbook([...WEEKS, { date, prices }]);
}

export const networkError = () => {
  throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
};

/**
 * A fake ministry site: the page, and the files by address, with ETags.
 * `fail` replaces every answer when set; `page` null makes the page fail.
 */
export function createFakeSite() {
  const site = {
    calls: [],
    page: PAGE,
    files: new Map([[WORKBOOK_URL, WORKBOOK]]),
    /** @type {null | ((url: string) => Response)} */
    fail: null,
    /** @type {typeof fetch} */
    fetch: async (url, init = {}) => {
      const request = { url: String(url), headers: init.headers ?? {} };
      site.calls.push(request);
      if (site.fail) {
        return site.fail(request.url);
      }
      if (request.url === PAGE_URL) {
        if (site.page === null) {
          return new Response('Service Unavailable', { status: 503 });
        }
        return new Response(site.page, { headers: { 'content-type': 'text/html' } });
      }
      const bytes = site.files.get(request.url);
      if (!bytes) {
        return new Response('Not Found', { status: 404 });
      }
      const etag = `"${createHash('sha1').update(bytes).digest('hex').slice(0, 12)}"`;
      if (request.headers['if-none-match'] === etag) {
        return new Response(null, { status: 304, headers: { etag } });
      }
      return new Response(bytes, {
        headers: { etag, 'content-length': String(bytes.length) },
      });
    },
    count: () => site.calls.length,
    workbookCalls: () => site.calls.filter((call) => call.url !== PAGE_URL),
  };
  return site;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  clock = createClock(),
  site = createFakeSite(),
  config = { language: 'fr', tank_volume: 1500, road_fuels: [] },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-fioul-')),
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: site.fetch,
    store: new Store(dataDir),
    now: clock.now,
    timers,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, fake: gladys.fake, site, app, clock, dataDir };
}

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

/** The discovered devices of a configuration. */
export async function discoveredDevices(config) {
  const world = await createWorld({ config, connect: true });
  const devices = world.fake.discoveredDevices;
  await world.app.stop();
  return devices;
}
