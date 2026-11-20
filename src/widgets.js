// -----------------------------------------------------------------------------
// The "Heating oil price" dashboard widget: the national average price, its
// weekly change (green down, orange up), the estimated cost of a fill (with a
// tank volume), the curve of the last weeks, the average of the previous
// month and the week of the survey. Every block but the price has a setting
// to hide it. It needs no device.
//
// Budget (core): 8 components, 2 texts — at most 3 tiles, 1 chart, 1 status
// and 1 caption here.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { fillCost, freshSummary } from './devices.js';
import { HEATING_OIL, PRODUCTS } from './fuels.js';
import { MESSAGES, TEXT, formatPrice, pick } from './i18n.js';

export const WIDGET_KEY = 'heating_oil';

/** The content is cached by the core: the data is weekly, an hour is plenty. */
export const WIDGET_TTL_SECONDS = 3600;

/** Weeks on the curve: half a year. */
export const CHART_WEEKS = 26;

/** Under this change (in %), the price is stable: no color. */
export const STABLE_PERCENT = 0.05;

/** Green when the price fell over the week, orange when it rose. */
export function trendColor(change) {
  if (change === undefined || Math.abs(change) < STABLE_PERCENT) {
    return undefined;
  }
  return change < 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING;
}

/** The widget settings, normalized: every block shown unless switched off. */
export function normalizeSettings(settings = {}) {
  return {
    showChange: settings.show_change !== false,
    showFillCost: settings.show_fill_cost !== false,
    showChart: settings.show_chart !== false,
    showMonth: settings.show_month !== false,
  };
}

const withColor = (color) => (color ? { color } : {});

/**
 * Build the widget content.
 * @param {object} options
 * @param {object[] | null} options.weeks the parsed workbook
 * @param {ReturnType<typeof normalizeSettings>} options.settings
 * @param {number} options.tankVolume litres, 0 for none
 * @param {'ok' | 'unreachable' | 'badFile'} options.status
 * @param {string} options.language
 * @param {number} options.now
 */
export function buildWidgetContent({ weeks, settings, tankVolume, status, language, now }) {
  const oil = freshSummary(weeks, HEATING_OIL, now);
  if (!oil) {
    const message =
      status === 'ok' ? (weeks ? TEXT.stale : TEXT.waiting) : (TEXT[status] ?? TEXT.unreachable);
    return {
      ttl_seconds: WIDGET_TTL_SECONDS,
      components: [{ type: 'text', variant: 'body', text: pick(message, language) }],
    };
  }
  const color = trendColor(oil.change);
  const components = [
    {
      type: 'value',
      label: pick(PRODUCTS.heating_oil.name, language),
      value: oil.price,
      unit: '€/l',
      icon: 'droplet',
      ...withColor(color),
    },
  ];
  if (settings.showChange && oil.change !== undefined) {
    components.push({
      type: 'value',
      label: pick(TEXT.week, language),
      value: oil.change,
      unit: '%',
      icon: oil.change < 0 ? 'trending-down' : 'trending-up',
      ...withColor(color),
    });
  }
  if (settings.showFillCost && tankVolume > 0) {
    components.push({
      type: 'value',
      label: pick(MESSAGES.fill(tankVolume), language),
      value: fillCost(oil.price, tankVolume),
      unit: '€',
      icon: 'truck',
    });
  }
  if (settings.showChart) {
    const points = weeks
      .filter((week) => week.prices.heating_oil !== undefined)
      .slice(-CHART_WEEKS)
      .map((week) => ({ t: `${week.date}T00:00:00.000Z`, v: week.prices.heating_oil }));
    if (points.length >= 2) {
      components.push({
        type: 'chart',
        chart_type: 'line',
        title: pick(TEXT.trend, language),
        unit: '€/l',
        series: [{ name: pick(PRODUCTS.heating_oil.name, language), points }],
      });
    }
  }
  if (settings.showMonth && oil.monthAverage !== undefined) {
    components.push({
      type: 'status',
      items: [
        {
          label: pick(MESSAGES.monthAverage(oil.month), language),
          value: formatPrice(oil.monthAverage, language),
          // Below the average green, above orange, equal neutral.
          ...withColor(trendColor(((oil.price - oil.monthAverage) / oil.monthAverage) * 100)),
        },
      ],
    });
  }
  components.push({
    type: 'text',
    variant: 'caption',
    text: `DGEC · ${pick(MESSAGES.week(oil.date), language)}`,
  });
  return { ttl_seconds: WIDGET_TTL_SECONDS, components };
}
