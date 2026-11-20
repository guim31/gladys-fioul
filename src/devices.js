// -----------------------------------------------------------------------------
// The devices and their states.
//
// "Heating oil price" (always):
//   currency/decimal + euro     price           national average, incl. taxes, €/l
//                                               (deliveries of 2,000 to 4,999 l)
//   currency/decimal + percent  week_change     change over one week, %
//   currency/decimal + euro     month_average   average of the previous month, €/l
//   currency/decimal + euro     fill_cost       price × tank volume, € (with a volume)
//   text/text                   week_date       the week of the survey
//
// "Fuel prices – France average" (with road fuels chosen), for each fuel:
//   currency/decimal + euro     <fuel>_price
//   currency/decimal + percent  <fuel>_week_change
//   text/text                   week_date
//
// Gladys has no €/l unit: the names say it. The changes are signed, their
// bounds symmetric. "Price under a threshold" and "a drop of N %" are plain
// Gladys scenes on these features.
//
// The data is weekly: no core polling (should_poll false, the container
// refreshes on its own timer, src/app.js). Ids never change.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { HEATING_OIL, PRODUCTS } from './fuels.js';
import { MESSAGES, NAMES, pick } from './i18n.js';
import { summarize } from './source.js';

export const HEATING_DEVICE = 'heating-oil';
export const ROAD_DEVICE = 'road-fuels';

/** Display bounds: the record is about 2.2 €/l (2022). */
export const PRICE_MAX = 5;
export const CHANGE_BOUND = 50;

/** Older than this, the ministry stopped: better no value. */
export const MAX_WEEK_AGE_MS = 35 * 24 * 60 * 60 * 1000;

export const deviceIds = (gladys, device) => gladys.externalIds('price', device);

const base = { read_only: true, has_feedback: false, keep_history: true };

function feature(ids, key, name, definition) {
  return { ...base, ...definition, name, external_id: ids.feature(key) };
}

const euros = (max) => ({
  category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
  type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
  unit: DEVICE_FEATURE_UNITS.EURO,
  min: 0,
  max,
});

const percent = () => ({
  category: DEVICE_FEATURE_CATEGORIES.CURRENCY,
  type: DEVICE_FEATURE_TYPES.CURRENCY.DECIMAL,
  unit: DEVICE_FEATURE_UNITS.PERCENT,
  min: -CHANGE_BOUND,
  max: CHANGE_BOUND,
});

// A date: no history.
const text = () => ({
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  keep_history: false,
  min: 0,
  max: 0,
});

/**
 * The discovery payload.
 * @param {object} gladys
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 */
export function buildDevices(gladys, config) {
  const devices = [buildHeatingDevice(gladys, config)];
  if (config.road_fuels.length > 0) {
    devices.push(buildRoadDevice(gladys, config));
  }
  return devices;
}

export function buildHeatingDevice(gladys, config) {
  const ids = deviceIds(gladys, HEATING_DEVICE);
  const names = NAMES[config.language];
  return {
    name: names.heating_device,
    external_id: ids.device,
    model: 'DGEC',
    should_poll: false,
    features: [
      feature(ids, 'price', names.price, euros(PRICE_MAX)),
      feature(ids, 'week_change', names.week_change, percent()),
      feature(ids, 'month_average', names.month_average, euros(PRICE_MAX)),
      ...(config.tank_volume > 0
        ? [
            feature(
              ids,
              'fill_cost',
              names.fill_cost,
              euros(Math.ceil(config.tank_volume * PRICE_MAX)),
            ),
          ]
        : []),
      feature(ids, 'week_date', names.week_date, text()),
    ],
  };
}

export function buildRoadDevice(gladys, config) {
  const ids = deviceIds(gladys, ROAD_DEVICE);
  const names = NAMES[config.language];
  return {
    name: names.road_device,
    external_id: ids.device,
    model: 'DGEC',
    should_poll: false,
    features: [
      ...config.road_fuels.flatMap((fuel) => {
        const label = pick(PRODUCTS[fuel].name, config.language);
        return [
          feature(ids, `${fuel}_price`, names.fuel_price(label), euros(PRICE_MAX)),
          feature(ids, `${fuel}_week_change`, names.fuel_change(label), percent()),
        ];
      }),
      feature(ids, 'week_date', names.week_date, text()),
    ],
  };
}

/** A product's summary if its last week is recent enough, else null. */
export function freshSummary(weeks, product, now) {
  const summary = weeks ? summarize(weeks, product) : null;
  if (!summary || now - Date.parse(`${summary.date}T00:00:00Z`) > MAX_WEEK_AGE_MS) {
    return null;
  }
  return summary;
}

/** The estimated cost of a fill, whole euros. */
export const fillCost = (price, litres) => Math.round(price * litres);

/**
 * The states of every device; nothing from a stale workbook.
 * @param {object} gladys
 * @param {object[] | null} weeks as parsed by src/source.js
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 * @param {number} now
 * @param {(externalId: string) => boolean} isCreated
 */
export function deviceStates(gladys, weeks, config, now, isCreated = () => true) {
  const states = [];
  const heating = deviceIds(gladys, HEATING_DEVICE);
  const oil = freshSummary(weeks, HEATING_OIL, now);
  if (oil && isCreated(heating.device)) {
    const state = (key, value) =>
      states.push({ device_feature_external_id: heating.feature(key), state: value });
    state('price', oil.price);
    if (oil.change !== undefined) {
      state('week_change', oil.change);
    }
    if (oil.monthAverage !== undefined) {
      state('month_average', oil.monthAverage);
    }
    if (config.tank_volume > 0) {
      state('fill_cost', fillCost(oil.price, config.tank_volume));
    }
    states.push({
      device_feature_external_id: heating.feature('week_date'),
      text: pick(MESSAGES.week(oil.date), config.language),
    });
  }
  const road = deviceIds(gladys, ROAD_DEVICE);
  if (config.road_fuels.length > 0 && isCreated(road.device)) {
    let latest = null;
    for (const fuel of config.road_fuels) {
      const data = freshSummary(weeks, fuel, now);
      if (!data) {
        continue;
      }
      states.push({ device_feature_external_id: road.feature(`${fuel}_price`), state: data.price });
      if (data.change !== undefined) {
        states.push({
          device_feature_external_id: road.feature(`${fuel}_week_change`),
          state: data.change,
        });
      }
      latest = latest && latest > data.date ? latest : data.date;
    }
    if (latest) {
      states.push({
        device_feature_external_id: road.feature('week_date'),
        text: pick(MESSAGES.week(latest), config.language),
      });
    }
  }
  return states;
}
