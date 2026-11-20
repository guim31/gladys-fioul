// -----------------------------------------------------------------------------
// A tiny .xlsx writer for the tests: the ministry's layout (a T.T.C. block of
// product columns, one row per week as an Excel date, then the monthly
// averages), built from a list of weeks. The real workbook extract
// (test/fixtures/prix-htt-ttc-extract.xlsx) covers the real file; this one
// lets a test publish "next week".
// -----------------------------------------------------------------------------

import { crc32, deflateRawSync } from 'node:zlib';

const HEADERS = {
  heating_oil: 'Fioul domestique (livraisons de 2 000 à 4 999 l.)        en euro par litre',
  diesel: 'Gazole',
  sp95: 'Super SP95-E5',
  sp95_e10: 'Super SP95-E10',
  sp98: 'Super SP98',
  e85: 'Superéthanol E85',
  lpg: 'GPLc',
  off_road_diesel: 'Gazole non routier (livraisons inférieures à 5 000 litres)',
};

const escape = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const column = (index) => String.fromCharCode(65 + index);

const serial = (date) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000);

function cell(ref, value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'number') {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
}

function sheetXml(rows) {
  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row.map((value, c) => cell(`${column(c)}${r + 1}`, value)).join('')}</row>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** A zip archive of deflated entries. */
export function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const packed = deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/**
 * A workbook of one sheet in the ministry's layout.
 * @param {{ date: string, prices: Record<string, number> }[]} weeks
 */
export function writeWorkbook(weeks) {
  const products = Object.keys(HEADERS).filter((key) =>
    weeks.some((week) => week.prices[key] !== undefined),
  );
  const rows = [
    // A H.T.T. block first, with other prices: it must be ignored.
    [null, 'PRIX DE VENTE H.T.T.', null, 'PRIX DE VENTE T.T.C.'],
    ['Date', HEADERS.heating_oil, null, ...products.map((key) => HEADERS[key])],
    ...weeks.map((week) => [
      serial(week.date),
      0.5,
      null,
      ...products.map((key) => week.prices[key] ?? null),
    ]),
    [],
    ['MOYENNES MENSUELLES'],
    [serial('2020-01-01'), 0.5, null, ...products.map(() => 9.99)],
  ];
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Combustibles" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheetXml(rows),
  });
}
