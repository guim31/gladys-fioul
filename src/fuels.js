// -----------------------------------------------------------------------------
// The products of the ministry's workbook, with the column header that finds
// each one (taxes included, the T.T.C. block) and its names.
//
// Keys are stored by users (feature external ids, the `road_fuels` setting):
// they never change. The heating oil is the integration's purpose; the road
// fuels are an option.
// -----------------------------------------------------------------------------

export const HEATING_OIL = 'heating_oil';

/**
 * @type {Record<string, { header: RegExp, name: Record<string, string> }>}
 * `name`: short, for feature names and widget labels.
 */
export const PRODUCTS = {
  heating_oil: {
    // "Fioul domestique (livraisons de 2 000 à 4 999 l.) en euro par litre"
    header: /fioul\s+domestique.*\b2\s?000\b/i,
    name: { en: 'Heating oil', fr: 'Fioul domestique', de: 'Heizöl', es: 'Gasóleo C' },
  },
  diesel: {
    header: /^\s*gazole\s*$/i,
    name: { en: 'Diesel', fr: 'Gazole', de: 'Diesel', es: 'Diésel' },
  },
  sp95: {
    header: /sp\s?95[-\s]?e5(?!\d)/i,
    name: { en: 'SP95-E5', fr: 'SP95-E5', de: 'Super E5', es: 'SP95-E5' },
  },
  sp95_e10: {
    header: /sp\s?95[-\s]?e10/i,
    name: { en: 'SP95-E10', fr: 'SP95-E10', de: 'Super E10', es: 'SP95-E10' },
  },
  sp98: {
    header: /sp\s?98/i,
    name: { en: 'SP98', fr: 'SP98', de: 'Super Plus 98', es: 'SP98' },
  },
  e85: {
    header: /e85/i,
    name: { en: 'E85', fr: 'E85', de: 'E85', es: 'E85' },
  },
  lpg: {
    header: /gpl/i,
    name: { en: 'LPG', fr: 'GPLc', de: 'Autogas', es: 'GLP' },
  },
  off_road_diesel: {
    // "Gazole non routier (livraisons inférieures à 5 000 litres)"
    header: /gazole\s+non\s+routier/i,
    name: { en: 'Off-road diesel', fr: 'Gazole non routier', de: 'Agrardiesel', es: 'Gasóleo B' },
  },
};

/** The road fuels, in the order of the setting. */
export const ROAD_FUELS = ['diesel', 'sp95_e10', 'sp95', 'sp98', 'e85', 'lpg', 'off_road_diesel'];

export const PRODUCT_KEYS = [HEATING_OIL, ...ROAD_FUELS];

/** The product a column header is, or undefined (first match wins: "Gazole non routier" before "Gazole"). */
export function productOf(header) {
  const text = String(header).replace(/\s+/g, ' ');
  if (PRODUCTS.off_road_diesel.header.test(text)) {
    return 'off_road_diesel';
  }
  return PRODUCT_KEYS.find((key) => PRODUCTS[key].header.test(text));
}
