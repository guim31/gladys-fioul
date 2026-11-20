// -----------------------------------------------------------------------------
// A minimal .xlsx reader, without dependency: just enough to read the cells of
// the ministry's workbook (numbers, shared strings, inline strings and the
// cached values of formulas). No styles, no dates as such (Excel serials stay
// numbers), no Zip64, no encryption.
//
// Why not a library: the maintained ones (SheetJS, ExcelJS) weigh several MB,
// pull a tree of dependencies, or are no longer published on npm; the
// workbook is 130 KB and needs a zip directory, `inflateRaw` (node:zlib) and
// a few regular expressions. Every limit below guards the 256 MB sandbox
// against a malformed or hostile file (zip bomb).
// -----------------------------------------------------------------------------

import { inflateRawSync } from 'node:zlib';

/** No part of the workbook is bigger once inflated (the largest sheet: 330 KB). */
export const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
/** Above, the file is not the ministry's workbook. */
export const MAX_ENTRIES = 200;

export class XlsxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'XlsxError';
  }
}

// --- Zip ----------------------------------------------------------------------

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/**
 * The entries of a zip archive, inflated on demand.
 * @param {Uint8Array} bytes
 * @returns {Map<string, () => Buffer>}
 */
export function readZip(bytes) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 22) {
    throw new XlsxError('not a zip file (too short)');
  }
  // The end-of-central-directory record, within the last 64 KB (comment).
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new XlsxError('not a zip file (no central directory)');
  }
  const count = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) {
    throw new XlsxError(`too many entries in the zip file (${count})`);
  }
  if (count === 0xffff || directoryOffset === 0xffffffff) {
    throw new XlsxError('Zip64 is not supported');
  }
  const entries = new Map();
  let at = directoryOffset;
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== CENTRAL) {
      throw new XlsxError('corrupted zip directory');
    }
    const flags = buffer.readUInt16LE(at + 8);
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    entries.set(name, () => {
      if (flags & 0x1) {
        throw new XlsxError(`${name}: encrypted entry`);
      }
      if (size > MAX_ENTRY_BYTES) {
        throw new XlsxError(`${name}: entry too large (${size} bytes)`);
      }
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL) {
        throw new XlsxError(`${name}: corrupted local header`);
      }
      const start =
        localOffset +
        30 +
        buffer.readUInt16LE(localOffset + 26) +
        buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(start, start + compressedSize);
      if (data.length !== compressedSize) {
        throw new XlsxError(`${name}: truncated entry`);
      }
      if (method === 0) {
        return Buffer.from(data);
      }
      if (method !== 8) {
        throw new XlsxError(`${name}: compression method ${method} not supported`);
      }
      try {
        return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
      } catch (err) {
        throw new XlsxError(`${name}: cannot inflate (${err.message})`);
      }
    });
  }
  return entries;
}

// --- XML ------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode the XML entities of a text or attribute value. */
export function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

/** The attributes of a start tag, by name (namespace prefix kept). */
function attributes(tag) {
  const found = {};
  for (const [, name, , value] of tag.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)) {
    found[name] = decodeXml(value);
  }
  return found;
}

/** The text of every `<t>` in an element, joined (rich text runs). */
const textOf = (xml) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');

// --- Workbook ---------------------------------------------------------------------

/** "AB12" → 27 (A = 0). */
export function columnIndex(reference) {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? '';
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * Read a workbook: its sheets in order, each a map of rows (by row number) of
 * cells (by column index). A cell is a number or a string; booleans and
 * errors are dropped.
 * @param {Uint8Array} bytes
 * @returns {{ name: string, rows: Map<number, Map<number, number | string>> }[]}
 */
export function readWorkbook(bytes) {
  const zip = readZip(bytes);
  const part = (name) => {
    const entry = zip.get(name);
    return entry ? entry().toString('utf8') : null;
  };
  const workbook = part('xl/workbook.xml');
  if (!workbook) {
    throw new XlsxError('not a workbook (no xl/workbook.xml)');
  }
  const targets = new Map();
  for (const [tag] of (part('xl/_rels/workbook.xml.rels') ?? '').matchAll(
    /<Relationship\s[^>]*>/g,
  )) {
    const { Id, Target } = attributes(tag);
    if (Id && Target) {
      // Relative to xl/, or absolute from the package root.
      targets.set(Id, Target.startsWith('/') ? Target.slice(1) : `xl/${Target}`);
    }
  }
  // `<si/>` is an empty string: skipping it would shift every later index.
  const strings = [
    ...(part('xl/sharedStrings.xml') ?? '').matchAll(/<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g),
  ].map((m) => textOf(m[1] ?? ''));
  const sheets = [];
  for (const [tag] of workbook.matchAll(/<sheet\s[^>]*>/g)) {
    const attrs = attributes(tag);
    const target = targets.get(attrs['r:id']);
    const xml = target ? part(target) : null;
    if (xml) {
      sheets.push({ name: attrs.name ?? '', rows: readSheet(xml, strings) });
    }
  }
  if (sheets.length === 0) {
    throw new XlsxError('no readable sheet in the workbook');
  }
  return sheets;
}

function readSheet(xml, strings) {
  const rows = new Map();
  const data = /<sheetData[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? '';
  for (const [, rowTag, rowBody = ''] of data.matchAll(
    /<row(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/row>)/g,
  )) {
    const number = Number(attributes(rowTag ?? '').r);
    if (!Number.isInteger(number)) {
      continue;
    }
    const cells = new Map();
    for (const [, cellTag, cellBody = ''] of rowBody.matchAll(
      /<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const { r, t } = attributes(cellTag ?? '');
      if (!r) {
        continue;
      }
      const value = cellValue(t, cellBody, strings);
      if (value !== undefined) {
        cells.set(columnIndex(r), value);
      }
    }
    rows.set(number, cells);
  }
  return rows;
}

function cellValue(type, body, strings) {
  if (type === 'inlineStr') {
    const is = /<is>([\s\S]*?)<\/is>/.exec(body);
    return is ? textOf(is[1]) : undefined;
  }
  const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
  if (raw === undefined) {
    return undefined;
  }
  if (type === 's') {
    return strings[Number(raw)];
  }
  if (type === 'str') {
    return decodeXml(raw);
  }
  if (type === 'b' || type === 'e') {
    return undefined;
  }
  const number = Number(raw);
  return Number.isFinite(number) ? number : undefined;
}
