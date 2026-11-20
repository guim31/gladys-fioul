// -----------------------------------------------------------------------------
// The integration, wired on a Gladys client (the real one in index.js, the
// SDK's fake Gladys in the tests).
//
// Refresh: the ministry publishes once a week (the prices of the week ending
// on Friday, usually on the Monday after, early afternoon), so the devices are
// not polled by the core (should_poll false) and the container ticks every 15
// minutes on its own timer. A tick reads the source only when it is due:
//   - once a day in the normal case;
//   - every 2 hours from Monday 10:00 UTC until the new week is out (four days
//     at most: a holiday delays it);
//   - an hour after a failure.
// The workbook is downloaded with its ETag: an unchanged file costs a 304.
// Every tick publishes the states that changed, each value sent again at
// least every 12 hours (heartbeat). A new week fires the "New heating oil
// price" trigger.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import {
  HEATING_DEVICE,
  ROAD_DEVICE,
  buildDevices,
  deviceIds,
  deviceStates,
  fillCost,
  freshSummary,
} from './devices.js';
import { HEATING_OIL } from './fuels.js';
import { MESSAGES, TEXT, pick } from './i18n.js';
import { createIssueLog } from './issues.js';
import { SourceError, fetchPrices } from './source.js';
import { Store } from './store.js';
import { STABLE_PERCENT, WIDGET_KEY, buildWidgetContent, normalizeSettings } from './widgets.js';

const logger = createLogger({ name: 'fioul' });

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const TICK_MS = 15 * 60 * 1000;
export const REFRESH_MS = DAY_MS;
export const RELEASE_RETRY_MS = 2 * HOUR_MS;
export const FAILURE_RETRY_MS = HOUR_MS;
export const HEARTBEAT_MS = 12 * HOUR_MS;
/** The core waits 15 s for a widget content. */
export const WIDGET_WAIT_MS = 10 * 1000;
/** The next week is expected from the Monday 10:00 UTC after the next Friday. */
const RELEASE_OFFSET_MS = 10 * DAY_MS + 10 * HOUR_MS;
const RELEASE_WINDOW_MS = 4 * DAY_MS;

export const ACTION_KEY = 'test_connection';
export const NEW_PRICE = 'new_price';
export const TRIGGER_KEYS = [NEW_PRICE];
export const TRENDS = ['down', 'stable', 'up'];

/**
 * A failed action: Gladys shows the thrown message in red, the multi-language
 * object as is.
 */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

export const trendOf = (change) =>
  change === undefined || Math.abs(change) < STABLE_PERCENT ? 'stable' : change < 0 ? 'down' : 'up';

/**
 * @param {object} gladys GladysIntegration, or the SDK's fake Gladys
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {Store} [options.store]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers] run the timer
 */
export function registerHandlers(
  gladys,
  {
    fetch: fetchImpl = globalThis.fetch,
    store = new Store(),
    now = () => Date.now(),
    timers = true,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  /** What /data keeps: the last week announced, the last workbook link that worked. */
  let persisted = { announced: null, url: null };
  /** The last workbook read: `{ url, etag, weeks }`. */
  let workbook = null;
  let attemptAt = -Infinity;
  /** The last failure: `{ kind: 'unreachable' | 'badFile', retryAt }`. */
  let failure = null;
  /** Trigger events of the last read, sent once its states are published. */
  let pendingEvents = [];
  let lastStatus = null;
  let firstRead = true;
  let timer = null;
  let stopped = false;
  let ticking = null;

  const readIssues = createIssueLog(logger);
  const gladysIssues = createIssueLog(logger);

  const ready = store.load().then((data) => {
    persisted = {
      announced: typeof data.announced === 'string' ? data.announced : null,
      url: typeof data.url === 'string' ? data.url : null,
    };
  });

  const createdIds = () => new Set((gladys.devices ?? []).map((device) => device.external_id));
  const weeks = () => workbook?.weeks ?? null;

  /** When the next read is due. */
  function nextReadAt() {
    if (failure) {
      return failure.retryAt;
    }
    const last = weeks()?.at(-1)?.date;
    if (!last) {
      return attemptAt === -Infinity ? now() : attemptAt + FAILURE_RETRY_MS;
    }
    const expected = Date.parse(`${last}T00:00:00Z`) + RELEASE_OFFSET_MS;
    const t = now();
    if (t >= expected && t < expected + RELEASE_WINDOW_MS) {
      return attemptAt + RELEASE_RETRY_MS;
    }
    return attemptAt + REFRESH_MS;
  }

  // --- Reading the source -----------------------------------------------------

  async function refresh() {
    attemptAt = now();
    try {
      const result = await fetchPrices(fetchImpl, { knownUrl: persisted.url, previous: workbook });
      const before = weeks()?.at(-1)?.date;
      workbook = { url: result.url, etag: result.etag, weeks: result.weeks };
      failure = null;
      readIssues.ok('read', 'The ministry’s workbook is read again');
      if (result.linkFound) {
        readIssues.ok('link', 'The workbook link is in the ministry’s page again');
      } else {
        readIssues.fail('link', `Using the last known workbook link (${result.pageError})`);
      }
      if (result.url !== persisted.url) {
        persisted.url = result.url;
        store.save(persisted);
      }
      const last = weeks().at(-1)?.date;
      if (firstRead) {
        firstRead = false;
        logger.info(`Ministry’s workbook read: week of ${last}`);
      } else if (last !== before) {
        logger.debug(`New week in the workbook: ${last}`);
      }
      pendingEvents.push(...announce());
    } catch (err) {
      const error = err instanceof SourceError ? err : new SourceError(err.message);
      failure = {
        kind: error.kind,
        retryAt: attemptAt + FAILURE_RETRY_MS,
        count: (failure?.count ?? 0) + 1,
      };
      readIssues.fail('read', `The ministry’s workbook cannot be read: ${error.message}`);
    }
  }

  // --- The trigger ------------------------------------------------------------

  /**
   * A new week of heating oil: an event, returned to be sent once the states
   * are published (a scene reading the features sees the new price). The
   * week seen first (a fresh install) is only remembered: it is not news.
   */
  function announce() {
    const oil = freshSummary(weeks(), HEATING_OIL, now());
    if (!oil) {
      return [];
    }
    const events = [];
    if (persisted.announced !== null && oil.date > persisted.announced) {
      const litres = config.tank_volume;
      const cost = litres > 0 ? fillCost(oil.price, litres) : undefined;
      events.push({
        price: oil.price,
        change: oil.change ?? 0,
        trend: trendOf(oil.change),
        fill_cost: cost ?? 0,
        week_date: oil.date,
        summary: pick(
          MESSAGES.summary({
            date: oil.date,
            price: oil.price,
            change: oil.change,
            fillCost: cost,
            litres,
          }),
          config.language,
        ),
      });
    }
    if (persisted.announced === null || oil.date > persisted.announced) {
      persisted.announced = oil.date;
      store.save(persisted);
    }
    return events;
  }

  /** Remembered even when Gladys refuses the event: never fired in a loop. */
  async function sendEvents() {
    const events = pendingEvents;
    pendingEvents = [];
    for (const event of events) {
      try {
        await gladys.publishSceneEvent(NEW_PRICE, event);
        logger.debug(`Trigger ${NEW_PRICE}: ${JSON.stringify(event)}`);
      } catch (err) {
        gladysIssues.fail('scene-event', `Trigger ${NEW_PRICE} not sent to Gladys: ${err.message}`);
      }
    }
  }

  // --- States -----------------------------------------------------------------

  async function publishStates() {
    const created = createdIds();
    const states = deviceStates(gladys, weeks(), config, now(), (id) => created.has(id));
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (count > 0) {
        logger.debug(`${count} state(s) published`);
      }
      gladysIssues.ok('states', 'States accepted by Gladys again');
    } catch (err) {
      gladysIssues.fail('states', `States not accepted by Gladys: ${err.message}`);
    }
  }

  const failureText = () => (failure?.kind === 'badFile' ? TEXT.badFile : TEXT.unreachable);

  /** The application status of the Configuration screen, sent on change only. */
  async function reportStatus() {
    let status = { connected: true };
    const fresh = freshSummary(weeks(), HEATING_OIL, now());
    // One failed read while fresh prices are held is a blip: said from the second.
    if (failure && (!fresh || failure.count >= 2 || failure.kind === 'badFile')) {
      status = { connected: false, message: failureText() };
    } else if (weeks() && !fresh) {
      status = { connected: false, message: TEXT.stale };
    }
    const key = JSON.stringify(status);
    if (key === lastStatus) {
      return;
    }
    try {
      // The four languages: the core 5.2+ refuses a plain string.
      await gladys.setConnectionStatus(status.connected, status.message);
      lastStatus = key;
    } catch (err) {
      logger.debug(`Connection status not sent: ${err.message}`);
    }
  }

  // --- The tick ---------------------------------------------------------------

  /**
   * Read the source when due, publish what changed. One tick at a time: a
   * second caller waits for the one in progress.
   * @param {object} [options]
   * @param {boolean} [options.force] read now
   */
  async function tick({ force = false } = {}) {
    // A forced tick (new configuration, action) must not reuse a tick started
    // before: it waits for it, then runs.
    while (force && ticking) {
      await ticking.catch(() => {});
    }
    if (ticking) {
      return ticking;
    }
    ticking = (async () => {
      if (gladys.connected === false) {
        logger.debug('Gladys unreachable: tick skipped');
        return;
      }
      let changed = false;
      if (force || now() >= nextReadAt()) {
        const before = workbook;
        await refresh();
        changed = workbook !== before && workbook?.weeks !== before?.weeks;
      }
      await publishStates();
      await sendEvents();
      await reportStatus();
      if (changed) {
        gladys.requestWidgetRefresh(WIDGET_KEY);
      }
    })().finally(() => {
      ticking = null;
    });
    return ticking;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await tick();
      } catch (err) {
        logger.error(`Refresh failed (${err.message})`);
      } finally {
        schedule();
      }
    }, TICK_MS);
  }

  /** (Re)start: publish the devices, read the source, then tick on the timer. */
  async function start() {
    await ready;
    stopped = false;
    lastStatus = null;
    failure = null;
    try {
      await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
    } catch (err) {
      logger.error(`Publishing the devices failed: ${err.message}`);
    }
    schedule();
    // A new configuration needs no new download: the workbook is the same.
    await tick({ force: !workbook });
  }

  // --- Handlers ---------------------------------------------------------------

  gladys.onScanRequest(async () => {
    await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
  });

  // A device just added: its states again now (the core dropped the ones it
  // received before the feature existed).
  const onDeviceAdded = async () => {
    await tick({ force: !workbook && !failure });
    // The tick may have been in flight, past its publication, when it came.
    await publishStates();
    gladys.requestWidgetRefresh(WIDGET_KEY);
  };
  gladys.onDeviceCreated(onDeviceAdded);
  gladys.onDeviceUpdated(onDeviceAdded);
  gladys.onDeviceDeleted(() => gladys.requestWidgetRefresh(WIDGET_KEY));

  gladys.onAction(ACTION_KEY, async () => {
    logger.info('Action: test the download of the ministry’s workbook');
    failure = null;
    await tick({ force: true });
    if (failure) {
      throw new ActionFailure(failureText());
    }
    const oil = freshSummary(weeks(), HEATING_OIL, now());
    if (!oil) {
      throw new ActionFailure(TEXT.stale);
    }
    return pick(MESSAGES.testOk({ date: oil.date, price: oil.price }), config.language);
  });

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings, language }) => {
    if (!workbook && now() >= (failure?.retryAt ?? 0)) {
      // Not longer than the core waits for a widget: the tick goes on, and
      // asks for a refresh once the prices are read.
      let timeout;
      await Promise.race([
        tick({ force: true }),
        new Promise((resolve) => {
          timeout = setTimeout(resolve, WIDGET_WAIT_MS);
        }),
      ]);
      clearTimeout(timeout);
    }
    return buildWidgetContent({
      weeks: weeks(),
      settings: normalizeSettings(settings),
      tankVolume: config.tank_volume,
      status: failure?.kind ?? 'ok',
      language,
      now: now(),
    });
  });

  gladys.onConfigUpdated(async (raw) => {
    config = normalizeConfig(raw);
    logger.info('New configuration received');
    await start();
  });

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await start();
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  return {
    ready,
    tick,
    nextReadAt,
    /** For the tests: what the integration holds. */
    get weeks() {
      return weeks();
    },
    get persisted() {
      return persisted;
    },
    ids: {
      heating: deviceIds(gladys, HEATING_DEVICE),
      road: deviceIds(gladys, ROAD_DEVICE),
    },
    /** Stop the timer and wait for the last write under /data. */
    async stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      await ticking?.catch(() => {});
      await store.flush();
    },
  };
}
