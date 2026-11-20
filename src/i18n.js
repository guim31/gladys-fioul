// -----------------------------------------------------------------------------
// Every text the integration shows, in the four languages of the Gladys
// interface (en, fr, de, es). German says "du", Spanish says "usted", like the
// rest of guim31's integrations.
//
//   - NAMES    : device and feature names, written once in the language of
//                the configuration (Gladys freezes them when a device is added);
//   - TEXT     : the fixed texts (widget, configuration screen, actions);
//   - MESSAGES : the texts built from a value, numbers in the local format.
//
// test/i18n.test.js checks that every entry carries exactly the four
// languages, with no empty text and no polite German.
// -----------------------------------------------------------------------------

import { PRODUCTS } from './fuels.js';
import { LANGUAGES } from './config.js';

export { LANGUAGES };

/** Device and feature names, by language then key. */
export const NAMES = {
  en: {
    heating_device: 'Heating oil price',
    road_device: 'Fuel prices – France average',
    price: 'Price incl. taxes (€/l)',
    week_change: '1-week change (%)',
    month_average: 'Previous month average (€/l)',
    fill_cost: 'Estimated cost of a fill (€)',
    week_date: 'Week of the survey',
    fuel_price: (fuel) => `${fuel} (€/l)`,
    fuel_change: (fuel) => `${fuel}, 1-week change (%)`,
  },
  fr: {
    heating_device: 'Prix du fioul domestique',
    road_device: 'Prix des carburants – moyenne France',
    price: 'Prix TTC (€/l)',
    week_change: 'Variation sur 1 semaine (%)',
    month_average: 'Moyenne du mois précédent (€/l)',
    fill_cost: 'Coût estimé du plein (€)',
    week_date: 'Semaine du relevé',
    fuel_price: (fuel) => `${fuel} (€/l)`,
    fuel_change: (fuel) => `${fuel}, variation 1 sem. (%)`,
  },
  de: {
    heating_device: 'Heizölpreis',
    road_device: 'Kraftstoffpreise – Mittel Frankreich',
    price: 'Preis inkl. Steuern (€/l)',
    week_change: 'Änderung in 1 Woche (%)',
    month_average: 'Mittel des Vormonats (€/l)',
    fill_cost: 'Geschätzte Kosten einer Füllung (€)',
    week_date: 'Woche der Erhebung',
    fuel_price: (fuel) => `${fuel} (€/l)`,
    fuel_change: (fuel) => `${fuel}, Änderung 1 Wo. (%)`,
  },
  es: {
    heating_device: 'Precio del gasóleo de calefacción',
    road_device: 'Precios de carburantes – media de Francia',
    price: 'Precio con impuestos (€/l)',
    week_change: 'Variación en 1 semana (%)',
    month_average: 'Media del mes anterior (€/l)',
    fill_cost: 'Coste estimado del llenado (€)',
    week_date: 'Semana del registro',
    fuel_price: (fuel) => `${fuel} (€/l)`,
    fuel_change: (fuel) => `${fuel}, variación 1 sem. (%)`,
  },
};

/** Fixed texts. */
export const TEXT = {
  waiting: {
    en: 'Waiting for the first weekly prices…',
    fr: 'En attente des premiers prix hebdomadaires…',
    de: 'Warte auf die ersten Wochenpreise …',
    es: 'Esperando los primeros precios semanales…',
  },
  unreachable: {
    en: 'The ministry’s prices cannot be downloaded right now.',
    fr: 'Les prix du ministère ne peuvent pas être téléchargés pour le moment.',
    de: 'Die Preise des Ministeriums können gerade nicht geladen werden.',
    es: 'No se pueden descargar los precios del ministerio en este momento.',
  },
  badFile: {
    en: 'The ministry’s price file cannot be read: its layout may have changed.',
    fr: 'Le fichier de prix du ministère est illisible : sa présentation a peut-être changé.',
    de: 'Die Preisdatei des Ministeriums ist nicht lesbar: ihr Aufbau hat sich vielleicht geändert.',
    es: 'El archivo de precios del ministerio no se puede leer: quizá cambió su formato.',
  },
  stale: {
    en: 'The ministry has published no price for more than a month.',
    fr: 'Le ministère n’a publié aucun prix depuis plus d’un mois.',
    de: 'Das Ministerium hat seit über einem Monat keinen Preis veröffentlicht.',
    es: 'El ministerio no ha publicado ningún precio desde hace más de un mes.',
  },
  initFailed: {
    en: 'The integration could not start: see its logs.',
    fr: 'L’intégration n’a pas pu démarrer : voir ses journaux.',
    de: 'Die Integration konnte nicht starten: siehe ihre Protokolle.',
    es: 'La integración no pudo iniciarse: consulte sus registros.',
  },
  week: { en: '1 week', fr: '1 semaine', de: '1 Woche', es: '1 semana' },
  trend: { en: 'Last weeks', fr: 'Dernières semaines', de: 'Letzte Wochen', es: 'Últimas semanas' },
};

/** Pick a language in a multi-language object, English as a fallback. */
export const pick = (texts, language) => texts[language] ?? texts.en;

const each = (build) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));

/** A price per litre: "1.703 €/l", "1,703 €/l". */
export const formatPrice = (value, language) =>
  `${new Intl.NumberFormat(language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  }).format(value)} €/l`;

/** An amount in whole euros: "€1,703", "1 703 €". */
export const formatEuros = (value, language) =>
  new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);

/** A signed percentage: "−1.7 %", "+0.5 %". */
export function formatChange(value, language) {
  const text = new Intl.NumberFormat(language, {
    signDisplay: 'exceptZero',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
  // A true minus sign in every language (some locales print a hyphen).
  return `${text.replace('-', '−')} %`;
}

/** "Nov 13, 2026" / "13 nov. 2026". */
export const formatDay = (day, language) =>
  new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );

/** "October 2026" / "octobre 2026". */
export const formatMonth = (month, language) =>
  new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/** Texts built from values, in the four languages. */
export const MESSAGES = {
  /** The week feature and the widget caption. */
  week: (day) =>
    each((l) =>
      pick(
        {
          en: `Week of ${formatDay(day, l)}`,
          fr: `Semaine du ${formatDay(day, l)}`,
          de: `Woche vom ${formatDay(day, l)}`,
          es: `Semana del ${formatDay(day, l)}`,
        },
        l,
      ),
    ),

  /** The widget row of the monthly average. */
  monthAverage: (month) =>
    each((l) =>
      pick(
        {
          en: `Average of ${formatMonth(month, l)}`,
          // "d’octobre", "de novembre".
          fr: `Moyenne ${/^[aeiouâéèh]/i.test(formatMonth(month, l)) ? 'd’' : 'de '}${formatMonth(month, l)}`,
          de: `Mittelwert ${formatMonth(month, l)}`,
          es: `Media de ${formatMonth(month, l)}`,
        },
        l,
      ),
    ),

  /** The widget tile of the fill cost. */
  fill: (litres) =>
    each((l) => {
      const volume = new Intl.NumberFormat(l).format(litres);
      return pick(
        {
          en: `Fill of ${volume} l`,
          fr: `Plein de ${volume} l`,
          de: `Füllung ${volume} l`,
          es: `Llenado de ${volume} l`,
        },
        l,
      );
    }),

  /**
   * The summary of a new week, for the scene event.
   * @param {{ date: string, price: number, change?: number, fillCost?: number, litres?: number }} week
   */
  summary: ({ date, price, change, fillCost, litres }) =>
    each((l) => {
      const parts = [`${pick(PRODUCTS.heating_oil.name, l)} ${formatPrice(price, l)}`];
      if (change !== undefined) {
        parts[0] += ` (${formatChange(change, l)})`;
      }
      if (fillCost !== undefined) {
        // French puts a space before the colon.
        const colon = l === 'fr' ? ' : ' : ': ';
        parts.push(`${pick(MESSAGES.fill(litres), l)}${colon}${formatEuros(fillCost, l)}`);
      }
      parts.push(pick(MESSAGES.week(date), l));
      return parts.join(', ');
    }),

  /** The answer of the "Test the connection" action. */
  testOk: ({ date, price }) =>
    each((l) =>
      pick(
        {
          en: `The ministry’s file is read. ${pick(MESSAGES.week(date), l)}: heating oil ${formatPrice(price, l)}.`,
          fr: `Le fichier du ministère est lu. ${pick(MESSAGES.week(date), l)} : fioul domestique ${formatPrice(price, l)}.`,
          de: `Die Datei des Ministeriums ist gelesen. ${pick(MESSAGES.week(date), l)}: Heizöl ${formatPrice(price, l)}.`,
          es: `El archivo del ministerio se ha leído. ${pick(MESSAGES.week(date), l)}: gasóleo C ${formatPrice(price, l)}.`,
        },
        l,
      ),
    ),
};
