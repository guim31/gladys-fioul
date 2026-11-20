# Prix du fioul — heating oil price in France for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration that brings the **weekly
national average price of heating oil in France** into Gladys, from the open data of the French
ministry of ecological transition (DGEC), to know when to fill your tank.

These are national averages, taxes included, for deliveries of 2,000 to 4,999 litres: **not your
supplier's price**, but the trend and the level to expect. The service is French; the
documentation exists in English, French, German and Spanish ([`docs/`](docs)).

Not affiliated with the French ministry. **Developed without the hardware** (no tank, no supplier
account), from the public data: feedback welcome.

## Features

- A **Heating oil price** device: price in €/l, change over one week in %, average of the
  previous month, estimated cost of a fill (with the litres you usually order), week of the
  survey.
- Optionally, a second device with the national averages of the **road fuels** of the same file:
  diesel, SP95-E10, SP95-E5, SP98, E85, LPG, off-road diesel.
- "Price under a threshold" and "a drop of N %" are plain Gladys scenes on these features.
- A scene trigger **New heating oil price**, once a week, filtered by trend (down, stable, up),
  with a ready-made summary for a message.
- A dashboard widget: the price colored by its trend, the weekly change, the cost of a fill, the
  curve of the last 26 weeks and the previous month's average — each block can be hidden.
- A **Test the download** action.

The store's fuel price integrations read station prices (the French government's station feed has
no heating oil); a tank level sensor such as OilFox tells when to order. This one tells at what
price.

## Requirements

- Gladys 5.3.0 or later, with Internet access (`www.ecologie.gouv.fr`).
- No account, no key.

## Installation

In Gladys: **Integrations → Install from GitHub**, then enter `https://github.com/guim31/gladys-fioul`.
Optionally set the litres of a fill and the road fuels, then add the devices from the
**Discovery** tab.

## How it works

The ministry publishes its weekly prices on the page
[Prix des produits pétroliers](https://www.ecologie.gouv.fr/politiques-publiques/prix-produits-petroliers)
as an `.xlsx` workbook, "Prix HTT et TTC depuis janvier 2020" (three sheets: road fuels, non-road
fuels, heating fuels; one row per week dated on its Friday, then the monthly and yearly averages).
Its file name changes from time to time (`…_0.xlsx`, `…_1.xlsx`), so each read finds the link in
the page, falling back on the last link that worked.

The workbook is read by a small built-in reader (`src/xlsx.js`: the zip directory, `inflateRaw`
from `node:zlib` and a few regular expressions), with size limits against a malformed file: the
maintained xlsx libraries weigh several megabytes for a 130 KB file. Only the weekly rows of the
"T.T.C." (taxes included) block are used; the previous month's average is computed from the weeks,
which gives the ministry's own monthly figure.

The container reads once a day, every 2 hours from Monday 10:00 UTC until the new week is out, and
an hour after a failure; the workbook is downloaded with its ETag, so an unchanged file costs a 304. The devices are not polled by the core: the container publishes the changed states itself,
and every value again every 12 hours.

## Limitations

- Weekly national averages only: no regional price, no supplier price.
- A week older than 35 days is not published.
- If the ministry changes the layout of its workbook, the integration says so in Gladys
  ("The ministry's price file cannot be read") until it is updated.
- Developed without a tank or a supplier account. Tested against the real page and workbook of
  2026-11-20 (live, in the locked-down container) and against extracts of them in
  [`test/fixtures/`](test/fixtures).

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake ministry site, never the network. See
[`CLAUDE.md`](CLAUDE.md) for the project rules. Versions, images and releases belong to the
Release workflow (Actions → Release).

## Credits

- French ministry of ecological transition, Direction générale de l'énergie et du climat (DGEC):
  the weekly prices of petroleum products, public data.
- The architecture, the conformity and language tests follow
  [gladys-us-fuel-prices](https://github.com/guim31/gladys-us-fuel-prices) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## License

[Apache 2.0](LICENSE).
