# Prix du fioul

The weekly national average price of **heating oil in France** in Gladys,
from the French ministry of ecological transition (DGEC, _Direction générale
de l'énergie et du climat_), to know when to fill your tank.

The service is French: the prices are French national averages, in euros per
litre, taxes included, for deliveries of 2,000 to 4,999 litres. They are
**not your supplier's price**: they show the trend and the level to expect.

Not affiliated with the French ministry. Developed without a tank or a
supplier account, from the public data: feedback welcome.

## What you get

- A **Heating oil price** device: the price in €/l, its change over one
  week in %, the average of the previous month, the estimated cost of a fill
  (with the litres you usually order) and the week of the survey.
- Optionally, a second device with the **road fuels** of the same file
  (diesel, SP95-E10, SP95-E5, SP98, E85, LPG, off-road diesel): price and
  weekly change of each.
- A scene trigger **New heating oil price**, once a week, filtered by trend
  (down, stable, up), with a ready-made summary for a message.
- A dashboard widget: the price, its trend, the cost of a fill, the curve of
  the last six months and the previous month's average.

## Requirements

- Gladys 5.3.0 or later.
- Internet access from Gladys (`www.ecologie.gouv.fr`).
- No account and no key.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter the address
of the repository: `https://github.com/guim31/gladys-fioul`.

## Configuration

| Field                       | What it does                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Litres of a fill (optional) | The volume you usually order, for the estimated cost of a fill (price × litres, whole euros). 0: no cost feature.                         |
| Road fuels too (optional)   | National averages of the road fuels from the same file, on a second device. None by default.                                              |
| Language of the names       | Language of the device and feature names (frozen when a device is added), of the week date and of the trigger summary. French by default. |

Then open the **Discovery** tab of the integration and add the devices.
Changing the litres or the road fuels changes the devices: Gladys then offers
to **Update** them in the Discovery tab.

## Devices

### Heating oil price

| Feature                      | Type              | Example (week of 2026-11-13) |
| ---------------------------- | ----------------- | ---------------------------- |
| Price incl. taxes (€/l)      | Currency, euros   | 1.703                        |
| 1-week change (%)            | Currency, percent | −1.7                         |
| Previous month average (€/l) | Currency, euros   | 1.9253 (October)             |
| Estimated cost of a fill (€) | Currency, euros   | 2555 (1,500 litres)          |
| Week of the survey           | Text              | Week of Nov 13, 2026         |

Gladys has no €/l unit: the price features show a euro sign, and their names
say per litre.

### Fuel prices – France average

For each road fuel chosen: its price in €/l and its weekly change in %, then
the week of the survey.

## Scenes

### Price under a threshold

No special trigger is needed: in a scene, choose **Device value** on the
price feature, for example "Price incl. taxes (€/l) lower than 1.20".

### A drop of N %

Same thing on the weekly change: "1-week change (%) lower than −3" starts the
scene when the price fell by more than 3 % over the week.

### New heating oil price

Fires once a week, when the ministry publishes a new week (never for the week
already known when the integration starts). Filter: the trend over the week
(down, stable, up; empty for any). Variables: `price` (€/l), `change` (%),
`trend` (`down`, `stable` or `up`), `fill_cost` (€, 0 without litres),
`week_date` (`YYYY-MM-DD`, the Friday of the week) and `summary`, e.g.
"Heating oil 1.652 €/l (−3.0 %), Fill of 1,500 l: €2,478, Week of Nov 20,
2026", ready for a message.

## Dashboard

### Heating oil price widget

The national average price, green when it fell over the week, orange when it
rose; the weekly change; the cost of a fill (with litres set in the
configuration); the curve of the last 26 weeks; the previous month's average;
the week of the survey. A setting hides each block but the price. The widget
needs no device.

## Actions

**Test the download** (Configuration tab) downloads the ministry's file at
once and answers with the last heating oil price.

## Data and limits

- The source is the page
  https://www.ecologie.gouv.fr/politiques-publiques/prix-produits-petroliers
  and its workbook "Prix HTT et TTC depuis janvier 2020" (DGEC). The weeks are
  dated on their Friday; the ministry usually publishes on the Monday after.
- The integration reads the page and the workbook once a day, and every 2
  hours from Monday 10:00 UTC until the new week is out. An unchanged file is
  not downloaded again (ETag). That is a few small requests a day.
- The file name changes from time to time: the integration finds the link in
  the page at each read, and falls back on the last link that worked.
- A week older than 35 days is not shown: better no value than an old one.
- The previous month's average is the mean of the weeks of that month, as
  in the ministry's own monthly table.
- Station prices of road fuels: the "fuel prices" integrations of the store
  read them station by station, but they have no heating oil. A tank level
  sensor (OilFox…) tells when to order; this integration tells at what price.

## Troubleshooting

- **"The ministry's prices cannot be downloaded"**: Gladys has no Internet
  access, or the ministry's site is down; the integration tries again every
  hour.
- **"The ministry's price file cannot be read"**: the ministry changed the
  layout of its workbook; please open an issue on the repository.
- **"No price for more than a month"**: the ministry stopped publishing.
- **No value**: add the devices in the Discovery tab first; the values
  arrive within a minute.
- More details in the logs of the integration (`LOG_LEVEL=debug`).

## Credits

Data: French ministry of ecological transition, DGEC, weekly prices of
petroleum products, public data. Integration by guim31 under the Apache 2.0
licence.
