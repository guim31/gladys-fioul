// -----------------------------------------------------------------------------
// The source: the link in the ministry's page, the workbook (real extract),
// and every way a read can fail (page without the link, page down, network
// cut, malformed workbook, unchanged file).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKBOOK_URL,
  PAGE_URL,
  SourceError,
  excelDate,
  fetchPrices,
  findWorkbookUrl,
  parseWorkbook,
  summarize,
} from '../src/source.js';
import { XlsxError, readWorkbook, readZip } from '../src/xlsx.js';
import { PRODUCT_KEYS, productOf } from '../src/fuels.js';
import {
  PAGE,
  WEEKS,
  WORKBOOK,
  WORKBOOK_URL,
  createFakeSite,
  networkError,
  nextWeekWorkbook,
} from './helpers/world.js';
import { writeWorkbook, zip } from './helpers/xlsx-writer.js';

test('the page: the "Prix HTT et TTC" workbook, not the Brent ones', () => {
  assert.equal(findWorkbookUrl(PAGE), WORKBOOK_URL);
  // The fixture holds three .xlsx links.
  assert.equal(PAGE.match(/\.xlsx"/g).length, 3);
});

test('the page: a renamed file is followed, a relative link resolved, others refused', () => {
  const link = (href, text = 'Télécharger') => `<a class="fr-link" href="${href}">${text}</a>`;
  assert.equal(
    findWorkbookUrl(
      link('/sites/default/files/documents/Prix%20HTT%20et%20TTC%20depuis%20janvier%202020_3.xlsx'),
    ),
    'https://www.ecologie.gouv.fr/sites/default/files/documents/Prix%20HTT%20et%20TTC%20depuis%20janvier%202020_3.xlsx',
  );
  // Named by its text only.
  assert.equal(
    findWorkbookUrl(
      link('https://www.ecologie.gouv.fr/files/a1b2.xlsx', 'Prix HTT et TTC depuis 2020'),
    ),
    'https://www.ecologie.gouv.fr/files/a1b2.xlsx',
  );
  // Not a gouv.fr site, not https, not an xlsx, not the right one.
  assert.equal(findWorkbookUrl(link('https://example.com/Prix%20HTT%20et%20TTC.xlsx')), null);
  assert.equal(
    findWorkbookUrl(link('http://www.ecologie.gouv.fr/Prix%20HTT%20et%20TTC.xlsx')),
    null,
  );
  assert.equal(
    findWorkbookUrl(link('https://www.ecologie.gouv.fr/Prix%20HTT%20et%20TTC.pdf')),
    null,
  );
  assert.equal(findWorkbookUrl(link('https://www.ecologie.gouv.fr/Brent.xlsx')), null);
  assert.equal(findWorkbookUrl('<html><body>Maintenance</body></html>'), null);
});

test('the real workbook: the weeks of the T.T.C. block, every product', () => {
  assert.equal(WEEKS.length, 11);
  assert.equal(WEEKS[0].date, '2026-09-04');
  assert.equal(WEEKS.at(-1).date, '2026-11-13');
  assert.deepEqual(Object.keys(WEEKS.at(-1).prices).sort(), [...PRODUCT_KEYS].sort());
  // The prices of the week of 2026-11-13, taxes included (not the H.T.T. block).
  assert.deepEqual(WEEKS.at(-1).prices, {
    diesel: 2.1229,
    sp95: 2.0481,
    sp95_e10: 1.9919,
    sp98: 2.0789,
    e85: 0.8873,
    lpg: 1.0538,
    off_road_diesel: 1.7902,
    heating_oil: 1.703,
  });
  // The monthly averages below the weeks are not weeks.
  // The monthly averages below the weeks (dated the 1st) are not weeks: every week is a Friday.
  assert.ok(WEEKS.every((week) => new Date(`${week.date}T00:00:00Z`).getUTCDay() === 5));
});

test('the summary: price, weekly change, and the average the workbook gives for October', () => {
  assert.deepEqual(summarize(WEEKS, 'heating_oil'), {
    date: '2026-11-13',
    price: 1.703,
    change: -1.7,
    month: '2026-10',
    // The workbook's own "MOYENNES MENSUELLES" row of October 2026: 1.92526.
    monthAverage: 1.9253,
  });
  assert.equal(summarize(WEEKS, 'lpg').change, 0.5);
  assert.equal(summarize([], 'heating_oil'), null);
  // January: the average of December.
  const january = [
    { date: '2026-12-25', prices: { heating_oil: 1.5 } },
    { date: '2027-01-01', prices: { heating_oil: 1.6 } },
  ];
  assert.equal(summarize(january, 'heating_oil').month, '2026-12');
  assert.equal(summarize(january, 'heating_oil').monthAverage, 1.5);
  // A gap of a month: no weekly change.
  const gap = [
    { date: '2026-10-02', prices: { heating_oil: 1.5 } },
    { date: '2026-11-06', prices: { heating_oil: 1.6 } },
  ];
  assert.equal(summarize(gap, 'heating_oil').change, undefined);
});

test('the headers: each product once, "Gazole non routier" is not "Gazole"', () => {
  assert.equal(productOf('Gazole'), 'diesel');
  assert.equal(
    productOf('Gazole non routier (livraisons inférieures à 5 000 litres)'),
    'off_road_diesel',
  );
  assert.equal(productOf('Super SP95-E5'), 'sp95');
  assert.equal(productOf('Super SP95-E10'), 'sp95_e10');
  assert.equal(
    productOf('Fioul domestique (livraisons de 2 000 à 4 999 l.)        en euro par litre'),
    'heating_oil',
  );
  assert.equal(productOf('Fioul domestique (livraisons de plus de 27 000 l.)'), undefined);
  assert.equal(productOf('Fioul lourd (teneur en soufre <= 1%) en euro par tonne'), undefined);
  assert.equal(excelDate(46339), '2026-11-13');
});

test('the written workbook reads back like the real one (the tests rely on it)', () => {
  const weeks = parseWorkbook(writeWorkbook(WEEKS));
  assert.deepEqual(weeks, WEEKS);
  assert.equal(parseWorkbook(nextWeekWorkbook(-0.03)).at(-1).prices.heating_oil, 1.6519);
});

test('a malformed workbook: a clear "badFile" error, never a crash', () => {
  const bad = (bytes) => {
    assert.throws(
      () => parseWorkbook(bytes),
      (err) => err instanceof SourceError && err.kind === 'badFile',
    );
  };
  bad(Buffer.from('<html>Erreur</html>'));
  bad(Buffer.alloc(0));
  // Truncated in the middle.
  bad(WORKBOOK.subarray(0, WORKBOOK.length / 2));
  // A zip, not a workbook.
  bad(zip({ 'readme.txt': 'hello' }));
  // A workbook without heating oil.
  bad(writeWorkbook([{ date: '2026-11-13', prices: { diesel: 2 } }]));
  // Corrupted deflate data.
  const corrupted = Buffer.from(WORKBOOK);
  corrupted.fill(0x55, 200, 4000);
  bad(corrupted);
});

test('a zip bomb is refused before it is inflated', () => {
  const huge = zip({ 'xl/workbook.xml': Buffer.alloc(20 * 1024 * 1024) });
  const entries = readZip(huge);
  assert.throws(() => entries.get('xl/workbook.xml')(), XlsxError);
  assert.throws(() => readWorkbook(huge), /too large/);
});

test('a read: the page, then the workbook it links', async () => {
  const site = createFakeSite();
  const result = await fetchPrices(site.fetch);
  assert.deepEqual(
    site.calls.map((call) => call.url),
    [PAGE_URL, WORKBOOK_URL],
  );
  assert.equal(result.url, WORKBOOK_URL);
  assert.equal(result.linkFound, true);
  assert.equal(result.weeks.at(-1).prices.heating_oil, 1.703);
  assert.match(site.calls[0].headers['user-agent'], /^gladys-fioul/);
});

test('an unchanged workbook: a 304 and the weeks already read', async () => {
  const site = createFakeSite();
  const first = await fetchPrices(site.fetch);
  const second = await fetchPrices(site.fetch, { previous: first });
  assert.equal(second.unchanged, true);
  assert.equal(second.weeks, first.weeks);
  assert.equal(site.calls.at(-1).headers['if-none-match'], first.etag);
});

test('a page without the link: the last link that worked, then the default one', async () => {
  const site = createFakeSite();
  site.page = '<html><body><p>Page en travaux</p></body></html>';
  const renamed = 'https://www.ecologie.gouv.fr/sites/default/files/documents/renamed.xlsx';
  site.files.set(renamed, WORKBOOK);
  const known = await fetchPrices(site.fetch, { knownUrl: renamed });
  assert.equal(known.url, renamed);
  assert.equal(known.linkFound, false);
  assert.equal(known.pageError, 'no workbook link in the page');
  const fallback = await fetchPrices(site.fetch);
  assert.equal(fallback.url, DEFAULT_WORKBOOK_URL);
  assert.equal(fallback.weeks.length, WEEKS.length);
});

test('the page down: the last known link still works', async () => {
  const site = createFakeSite();
  site.page = null;
  const result = await fetchPrices(site.fetch, { knownUrl: WORKBOOK_URL });
  assert.equal(result.linkFound, false);
  assert.match(result.pageError, /HTTP 503/);
  assert.equal(result.weeks.length, WEEKS.length);
});

test('a network cut or an error page: an "unreachable" error', async () => {
  const site = createFakeSite();
  site.fail = networkError;
  await assert.rejects(fetchPrices(site.fetch), (err) => {
    assert.ok(err instanceof SourceError);
    assert.equal(err.kind, 'unreachable');
    assert.match(err.message, /www\.ecologie\.gouv\.fr unreachable: fetch failed \(ENOTFOUND\)/);
    return true;
  });
  site.fail = null;
  site.files.clear();
  await assert.rejects(fetchPrices(site.fetch), /answered HTTP 404/);
});

test('a file far too large is refused without being read', async () => {
  const site = createFakeSite();
  site.fail = (url) =>
    url === PAGE_URL
      ? new Response(PAGE)
      : new Response('x', { headers: { 'content-length': String(50 * 1024 * 1024) } });
  await assert.rejects(fetchPrices(site.fetch), (err) => err.kind === 'badFile');
});

test('a new link whose file is not served yet: the last link that worked', async () => {
  const site = createFakeSite();
  site.page = site.page.replaceAll('2020_0.xlsx', '2020_1.xlsx');
  const result = await fetchPrices(site.fetch, { knownUrl: WORKBOOK_URL });
  assert.equal(result.url, WORKBOOK_URL);
  assert.equal(result.weeks.length, WEEKS.length);
});

test('a body without content-length is cut at the limit; a redirect off gouv.fr is refused', async () => {
  const site = createFakeSite();
  site.fail = (url) => {
    if (url === PAGE_URL) {
      return new Response(PAGE);
    }
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
        if (sent > 100) {
          controller.close();
        }
      },
    });
    return new Response(body);
  };
  await assert.rejects(fetchPrices(site.fetch), /more than 5242880/);
  site.fail = (url) => {
    const response = new Response(url === PAGE_URL ? PAGE : WORKBOOK);
    Object.defineProperty(response, 'url', { value: 'https://evil.example.com/x.xlsx' });
    return response;
  };
  await assert.rejects(fetchPrices(site.fetch), /redirected to evil\.example\.com/);
});

test('an empty shared string (<si/>) keeps the indexes of the next ones', () => {
  const book = zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si/><si><t>Date</t></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c></row></sheetData></worksheet>',
  });
  assert.equal(readWorkbook(book)[0].rows.get(1).get(0), 'Date');
});
