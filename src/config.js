// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with a value typed by hand with stray spaces.
// -----------------------------------------------------------------------------

import { ROAD_FUELS } from './fuels.js';

/** The languages of the Gladys interface, every text exists in all four. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** The largest domestic tank worth a number: beyond, a typo. */
export const MAX_TANK_LITRES = 100000;

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Litres of a full delivery: the estimated cost of filling the tank. 0: none.
  tank_volume: 0,
  // Road fuels followed too (national averages): a second device. None by default.
  road_fuels: [],
  // Language of the feature names (frozen when a device is added) and of the
  // texts the container produces where Gladys does not say the user's
  // language (week date, scene events, action messages).
  language: 'fr',
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULT_CONFIG.language);
  return {
    tank_volume: normalizeVolume(raw.tank_volume),
    road_fuels: normalizeList(raw.road_fuels, (id) => ROAD_FUELS.includes(id)),
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
  };
}

/** Whole litres, 0 when empty or out of range ("1 500" and "1500,5" accepted). */
export function normalizeVolume(raw) {
  const value = Number(
    String(raw ?? '')
      .replace(/\s/g, '')
      .replace(',', '.'),
  );
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TANK_LITRES) {
    return 0;
  }
  return Math.round(value);
}

/**
 * A multi_select value: an array (a comma-separated string is accepted too),
 * unknown values dropped, without duplicates, in the setting's order.
 * @param {unknown} raw
 * @param {(id: string) => boolean} known
 * @returns {string[]}
 */
function normalizeList(raw, known) {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const picked = new Set(list.map((id) => String(id).trim()).filter(known));
  return ROAD_FUELS.filter((id) => picked.has(id));
}
