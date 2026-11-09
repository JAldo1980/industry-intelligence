# Industry Intelligence

A free web app that builds a sourced report on any UK industry from official statistics. Pick an industry, or look up a UK company to use its registered SIC code, and get key indicators, changes over time, charts, IMF projections and the company's public record.

Every figure comes directly from an official source or from simple arithmetic on those figures. The app uses no AI and no paid service.

## Installation

You need Node.js 20.11 or newer from <https://nodejs.org/>.

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Open <http://127.0.0.1:8787>. For development with hot reload, run `npm run dev` and open <http://localhost:5173>.

## Settings

The app needs no settings. These are optional, and go in a `.env` file or the host's environment:

| Variable | Purpose |
|---|---|
| `APP_PASSWORD` | Asks for this password, with any username, before showing any data |
| `COMPANIES_HOUSE_API_KEY` | Uses the official API for company lookup instead of the public register. Free from <https://developer.company-information.service.gov.uk/> |
| `NOMIS_API_ALLOWED` | Set to `true` to add BRES employment by SIC division (see Known limitations) |
| `PORT`, `HOST`, `DATA_DIR`, `REPORTS_PER_HOUR`, `MAX_COMPANIES` | Tuning; defaults are in `.env.example` |

## Hosting

The app runs on Render's free plan using `render.yaml`, and each push to `main` redeploys it.

On the free plan the app sleeps when idle, so the first visit can take about a minute. Saved reports are lost when it restarts or redeploys, so download PDFs you want to keep.

Anyone with the address can use the site and see saved reports. Set `APP_PASSWORD` in the host's environment variables, then redeploy, to require a password for all data.

`netlify.toml` and the `netlify` folder run the same app on Netlify, saving reports in Netlify Blobs. This needs a credit-based Netlify plan, because legacy plans do not include background functions.

## Data sources

| Source | Access | Used for |
|---|---|---|
| ONS time series, Annual Business Survey, Business Demography, bulletins | Public JSON and workbooks | Output, turnover, GVA, enterprises, capex, births, deaths, survival, workforce jobs, CPI, GDP |
| HMRC UK Trade Info | Open OData API | Goods imports, exports and partners by HS chapter |
| Bank of England | Public database and pages | Bank Rate, Monetary Policy Report |
| GOV.UK | Public search API | Business population, insolvency, sector policy |
| Companies House | Public register or API | Company status, SIC codes, filed accounts |
| World Bank, Eurostat, IMF | Open APIs | International comparison, GDP and inflation projections |

## Exports

Each report offers PDF download, key findings (Markdown), copy source links, and print. Past reports are listed under Reports and stored in `data/reports/`.

## Tests

```bash
npm test
```

```bash
npm run check:sources
```

`npm test` covers the calculations and URL safety. `npm run check:sources` calls the live official data feeds.

## Known limitations

- **UK only:** reports cover UK industries.
- **No interpretation:** reports contain official figures, not commentary, competitor research or recommendations.
- **SIC granularity:** official data is organised by SIC code and may be broader than a niche. Output indices are at division level, workforce jobs at section level.
- **Self-registered codes:** companies choose their own SIC codes, so check that a code fits what a company does.
- **Financial sector:** the Annual Business Survey excludes most financial services, so these reports have thinner official data.
- **Services trade:** HMRC data covers goods only. HS trade chapters are matched to SIC divisions by an approximate built-in table.
- **Company accounts:** the app links to filed accounts but does not read the figures inside them.
- **Nomis:** its robots.txt disallows the dataset API, so it is off by default and ONS workforce jobs are used instead.
- **Security:** there are no user accounts. On a PC the server binds to 127.0.0.1 by default. A hosted copy is open unless `APP_PASSWORD` is set.
