// -----------------------------------------------------------------------------
// The source: the weekly prices of petroleum products published by the French
// ministry of ecological transition (DGEC), on the page "Prix des produits
// pétroliers", as an .xlsx workbook "Prix HTT et TTC depuis janvier 2020".
//
// The file name changes when the ministry replaces it ("…_0.xlsx", "…_1.xlsx"),
// so each read finds the link in the page first; when the page cannot be read
// or no longer holds the link, the last link that worked is used, then the
// one known when this was written. The workbook is downloaded with its ETag:
// an unchanged file answers 304 and is not parsed again.
//
// The workbook: three sheets (road fuels, non-road fuels, heating fuels), each
// with a header block (row 1: "PRIX DE VENTE H.T.T." / "T.T.C." over merged
// columns, row 2: the products), then one row per week (an Excel date, the
// Friday of the week), then the monthly and yearly averages. Only the weekly
// rows of the T.T.C. block are read; the monthly average is computed from the
// weeks (the same AVERAGE the workbook holds).
// -----------------------------------------------------------------------------

import { productOf } from './fuels.js';
import { readWorkbook } from './xlsx.js';

export const PAGE_URL =
  'https://www.ecologie.gouv.fr/politiques-publiques/prix-produits-petroliers';
/** The link of 2026-11-20, a last resort. */
export const DEFAULT_WORKBOOK_URL =
  'https://www.ecologie.gouv.fr/sites/default/files/documents/Prix%20HTT%20et%20TTC%20depuis%20janvier%202020_0.xlsx';

export const USER_AGENT = 'gladys-fioul (Gladys Assistant integration)';
export const TIMEOUT_MS = 30 * 1000;
/** The page weighs about 90 KB, the workbook 130 KB. */
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const MAX_WORKBOOK_BYTES = 5 * 1024 * 1024;

const DAY_MS = 24 * 60 * 60 * 1000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export class SourceError extends Error {
  /**
   * @param {string} message
   * @param {'unreachable' | 'badFile'} kind
   */
  constructor(message, kind = 'unreachable') {
    super(message);
    this.name = 'SourceError';
    this.kind = kind;
  }
}

// --- HTTP -----------------------------------------------------------------------

async function download(fetchImpl, url, { maxBytes, headers = {} }) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, ...headers },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const cause = err.cause?.code ? ` (${err.cause.code})` : '';
    throw new SourceError(`${hostOf(url)} unreachable: ${err.message}${cause}`);
  }
  if (response.status === 304) {
    return { status: 304, headers: response.headers };
  }
  if (!response.ok) {
    throw new SourceError(`${hostOf(url)} answered HTTP ${response.status}`);
  }
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) {
    throw new SourceError(`${hostOf(url)} sent ${declared} bytes, more than expected`, 'badFile');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new SourceError(
      `${hostOf(url)} sent ${bytes.length} bytes, more than expected`,
      'badFile',
    );
  }
  return { status: response.status, headers: response.headers, bytes };
}

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return 'the source';
  }
};

// --- The link -------------------------------------------------------------------

/**
 * The workbook link of the page, or null. Only an .xlsx on a gouv.fr site,
 * named "Prix HTT et TTC" (in its address or its text).
 * @param {string} html
 */
export function findWorkbookUrl(html) {
  for (const [, attrs, text] of html.matchAll(/<a\s([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(attrs)?.[2];
    if (!href) {
      continue;
    }
    let url;
    try {
      url = new URL(href.replace(/&amp;/g, '&'), PAGE_URL);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || !/(^|\.)gouv\.fr$/.test(url.hostname)) {
      continue;
    }
    if (!/\.xlsx$/i.test(url.pathname)) {
      continue;
    }
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      path = url.pathname;
    }
    const label = `${path} ${text.replace(/<[^>]*>/g, ' ')}`;
    if (/prix\s+htt\s+et\s+ttc/i.test(label)) {
      return url.href;
    }
  }
  return null;
}

// --- The workbook ---------------------------------------------------------------

/** An Excel serial date → "YYYY-MM-DD". */
export const excelDate = (serial) =>
  new Date(EXCEL_EPOCH + Math.round(serial) * DAY_MS).toISOString().slice(0, 10);

/** A plausible week: 2000 to 2100. */
const isWeekSerial = (value) => typeof value === 'number' && value > 36500 && value < 73000;

/**
 * The weekly prices, taxes included, of every product the workbook holds.
 * @param {Uint8Array} bytes
 * @returns {{ date: string, prices: Record<string, number> }[]} oldest first
 */
export function parseWorkbook(bytes) {
  let sheets;
  try {
    sheets = readWorkbook(bytes);
  } catch (err) {
    throw new SourceError(`the workbook cannot be read: ${err.message}`, 'badFile');
  }
  const weeks = new Map();
  for (const { rows } of sheets) {
    const numbers = [...rows.keys()].sort((a, b) => a - b);
    const headerRow = numbers.find((n) => /^\s*date\s*$/i.test(String(rows.get(n).get(0) ?? '')));
    if (headerRow === undefined) {
      continue;
    }
    // The block of each column: the last block title at or left of it.
    const titles = rows.get(headerRow - 1) ?? new Map();
    const columns = new Map();
    for (const [column, header] of rows.get(headerRow)) {
      if (column === 0) {
        continue;
      }
      let block = '';
      for (let c = column; c >= 0 && !block; c -= 1) {
        block = String(titles.get(c) ?? '');
      }
      const product = productOf(header);
      // T.T.C. only (taxes included); the first column of a product wins.
      if (product && /t\.?\s*t\.?\s*c/i.test(block) && ![...columns.values()].includes(product)) {
        columns.set(column, product);
      }
    }
    for (const n of numbers.filter((row) => row > headerRow)) {
      const cells = rows.get(n);
      const first = cells.get(0);
      if (typeof first === 'string' && first.trim() !== '') {
        // "MOYENNES MENSUELLES": the weeks are over.
        break;
      }
      if (!isWeekSerial(first)) {
        continue;
      }
      const date = excelDate(first);
      const week = weeks.get(date) ?? {};
      for (const [column, product] of columns) {
        const price = cells.get(column);
        // Euros per litre: anything else is a typo of the sheet.
        if (typeof price === 'number' && price > 0 && price < 10) {
          week[product] = price;
        }
      }
      weeks.set(date, week);
    }
  }
  const list = [...weeks]
    .filter(([, prices]) => Object.keys(prices).length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, prices]) => ({ date, prices }));
  if (!list.some((week) => week.prices.heating_oil !== undefined)) {
    throw new SourceError('no heating oil price in the workbook', 'badFile');
  }
  return list;
}

/** Rounded as the ministry publishes: 4 decimals. */
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * What a product shows: its last week, the change from the week before, the
 * average of the month before the last week's.
 * @param {{ date: string, prices: Record<string, number> }[]} weeks
 * @param {string} product
 */
export function summarize(weeks, product) {
  const known = weeks.filter((week) => week.prices[product] !== undefined);
  const last = known.at(-1);
  if (!last) {
    return null;
  }
  const price = last.prices[product];
  const before = known.at(-2);
  const [year, month] = last.date.split('-').map(Number);
  const previousMonth =
    month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  const inMonth = known.filter((week) => week.date.startsWith(`${previousMonth}-`));
  return {
    date: last.date,
    price: round(price, 4),
    // A gap of more than two weeks is not "the week before".
    change:
      before && Date.parse(last.date) - Date.parse(before.date) <= 15 * DAY_MS
        ? round(((price - before.prices[product]) / before.prices[product]) * 100, 1)
        : undefined,
    month: previousMonth,
    monthAverage:
      inMonth.length > 0
        ? round(inMonth.reduce((sum, week) => sum + week.prices[product], 0) / inMonth.length, 4)
        : undefined,
  };
}

// --- A read ---------------------------------------------------------------------

/**
 * Read the source.
 * @param {typeof fetch} fetchImpl
 * @param {object} options
 * @param {string | null} [options.knownUrl] the last link that worked
 * @param {{ url: string, etag: string, weeks: object[] } | null} [options.previous]
 *        the last workbook read, reused on a 304
 * @returns {Promise<{ url: string, etag: string | null, weeks: object[], linkFound: boolean, pageError: string | null, unchanged: boolean }>}
 */
export async function fetchPrices(fetchImpl, { knownUrl = null, previous = null } = {}) {
  let url = null;
  let pageError = null;
  try {
    const page = await download(fetchImpl, PAGE_URL, { maxBytes: MAX_PAGE_BYTES });
    url = findWorkbookUrl(Buffer.from(page.bytes ?? []).toString('utf8'));
    if (!url) {
      pageError = 'no workbook link in the page';
    }
  } catch (err) {
    pageError = err.message;
  }
  const linkFound = url !== null;
  url ??= knownUrl ?? DEFAULT_WORKBOOK_URL;

  const headers =
    previous?.etag && previous.url === url ? { 'if-none-match': previous.etag } : undefined;
  const file = await download(fetchImpl, url, { maxBytes: MAX_WORKBOOK_BYTES, headers });
  if (file.status === 304) {
    return {
      url,
      etag: previous.etag,
      weeks: previous.weeks,
      linkFound,
      pageError,
      unchanged: true,
    };
  }
  return {
    url,
    etag: file.headers.get('etag'),
    weeks: parseWorkbook(file.bytes),
    linkFound,
    pageError,
    unchanged: false,
  };
}
