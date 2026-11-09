// Office for National Statistics: time series, the Annual Business Survey and Business Demography.
import ExcelJS from 'exceljs';
import { DAY, HOUR, fetchJson, fetchResource, fetchText } from '../lib/http.js';
import { parseHtml, selectRelevant } from '../lib/text.js';
import { sectionLetter } from './official.js';

const BASE = 'https://www.ons.gov.uk';
const ORG = 'Office for National Statistics';
const ABS_PATH = '/businessindustryandtrade/business/businessservices/datasets/uknonfinancialbusinesseconomyannualbusinesssurveysectionsas';
const DEMOG_PATH = '/businessindustryandtrade/business/activitysizeandlocation/datasets/businessdemographyreferencetable';

const BULLETINS = [
  ['/economy/grossdomesticproductgdp/bulletins/gdpmonthlyestimateuk/latest', ['macro']],
  ['/economy/economicoutputandproductivity/output/bulletins/indexofproduction/latest', ['output'], (d) => d <= 39],
  ['/economy/economicoutputandproductivity/output/bulletins/indexofservices/latest', ['output'], (d) => d >= 45],
  ['/businessindustryandtrade/constructionindustry/bulletins/constructionoutputingreatbritain/latest', ['output'], (d) => d >= 41 && d <= 43],
  ['/businessindustryandtrade/business/businessservices/bulletins/businessinsightsandimpactontheukeconomy/latest', ['demand', 'challenges']],
  ['/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/uklabourmarket/latest', ['labour']],
  ['/businessindustryandtrade/business/activitysizeandlocation/bulletins/businessdemography/latest', ['survival']],
  ['/businessindustryandtrade/business/businessservices/bulletins/nonfinancialbusinesseconomyannualbusinesssurvey/latest', ['market_size']],
];

const MACRO_SERIES = [
  { cdid: 'D7G7', label: 'CPI annual rate', topics: ['macro', 'inflation'] },
  { cdid: 'IHYQ', label: 'GDP quarterly growth', topics: ['macro'] },
  { cdid: 'MGSX', label: 'Unemployment rate', topics: ['macro', 'labour'] },
];

const cellValue = (v) => (v && typeof v === 'object' ? (v.result ?? v.text ?? v.richText?.map((x) => x.text).join('') ?? '') : (v ?? ''));
const toNumber = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return String(v).trim() === '' || !Number.isFinite(n) ? null : n;
};

async function searchTimeSeries(query) {
  const { text } = await fetchText(`${BASE}/search?q=${encodeURIComponent(query)}&filter=time_series`, { ttlMs: 7 * DAY });
  return [...text.matchAll(/href="(\/[^"]*timeseries\/[^"]+)"[^>]*>\s*([^<]+)/g)].map((m) => ({ uri: m[1], title: m[2].trim() }));
}

/** Download one ONS time series, preferring the highest frequency that is published. */
export async function fetchSeries(uri, defaultUnit = 'See source') {
  const { json, fetchedAt } = await fetchJson(`${BASE}${uri}/data`, { ttlMs: 6 * HOUR });
  const frequency = json.months?.length ? 'monthly' : json.quarters?.length ? 'quarterly' : 'annual';
  const rows = frequency === 'monthly' ? json.months : frequency === 'quarterly' ? json.quarters : json.years;
  const points = rows.map((r) => ({ period: r.date, value: toNumber(r.value) })).filter((p) => p.value !== null);
  const d = json.description || {};
  return {
    series: { key: d.cdid || uri, title: d.title, unit: d.unit || defaultUnit, frequency, points },
    meta: d, uri, fetchedAt, pageUrl: `${BASE}${uri}`,
  };
}

function addSeries(ctx, { series, meta, pageUrl, fetchedAt }, { topics, chart, title }) {
  const latest = series.points[series.points.length - 1];
  return ctx.ledger.add({
    org: ORG, tier: 1, kind: 'dataset', provider: 'ons', title: title || `${series.title} (${meta.cdid})`,
    url: pageUrl, publishedDate: meta.releaseDate?.slice(0, 10), period: `${series.points[0]?.period} to ${latest?.period}`,
    retrievedAt: fetchedAt, series: [series], topics,
    text: meta.nextRelease ? `Next release: ${meta.nextRelease}.` : '',
    charts: chart ? [{ ...chart, seriesKeys: [series.key] }] : [],
  });
}

function sectorSeriesQuery(div) {
  if (div >= 5 && div <= 39) return { q: `IOP ${div}`, match: new RegExp(`^IOP:\\s*${div}\\s*:.*CVMSA`, 'i'), name: 'Index of Production' };
  if (div >= 45) return { q: `IoS ${div}`, match: new RegExp(`^IoS:\\s*${div}\\s*:.*Index`, 'i'), name: 'Index of Services' };
  return null;
}

async function collectSectorOutput(ctx) {
  for (const div of ctx.divisions.slice(0, 2)) {
    const spec = sectorSeriesQuery(Number(div));
    if (!spec) { ctx.ledger.gap('Industry output', `No monthly ONS output index is mapped for SIC division ${div}.`, 'Construction and agriculture rely on published bulletins and web evidence.'); continue; }
    try {
      const hit = (await searchTimeSeries(spec.q)).find((r) => spec.match.test(r.title) && !/weight/i.test(r.title));
      if (!hit) { ctx.ledger.gap('Industry output', `ONS has no ${spec.name} series discoverable for SIC division ${div}.`); continue; }
      const data = await fetchSeries(hit.uri, 'Index, ONS reference year = 100');
      addSeries(ctx, data, {
        topics: ['output', 'performance'],
        chart: { title: `${spec.name}: SIC ${div}`, unit: data.series.unit, section: 'performance', kind: 'line' },
      });
    } catch (e) { ctx.ledger.gap('Industry output', `ONS series for SIC ${div} could not be retrieved (${e.reason || 'error'}).`); }
  }
}

const SECTION_NAMES = { A: 'Agriculture', B: 'Mining', C: 'Manufacturing', D: 'Electricity', E: 'Water', F: 'Construction', G: 'Wholesale', H: 'Transport', I: 'Accommodation', J: 'Information communication', K: 'Finance', L: 'Real estate', M: 'Professional scientific technical', N: 'Administrative', P: 'Education', Q: 'Health', R: 'Arts', S: 'Other service' };

/** Workforce jobs are published by SIC section, so they are broader than the subject industry. */
async function collectWorkforce(ctx) {
  const letter = sectionLetter(Number(ctx.divisions[0]));
  if (!letter || !SECTION_NAMES[letter]) return;
  try {
    const hit = (await searchTimeSeries(`UK workforce jobs ${SECTION_NAMES[letter]}`)).find((r) => new RegExp(`^UK Workforce Jobs SA\\s*:\\s*${letter}\\b`, 'i').test(r.title));
    if (!hit) { ctx.ledger.gap('Employment', `No ONS workforce jobs series found for SIC section ${letter}.`); return; }
    const data = await fetchSeries(hit.uri, 'Thousands of jobs');
    const entry = addSeries(ctx, data, {
      topics: ['employment', 'labour'],
      chart: { title: `Workforce jobs: SIC section ${letter} (${SECTION_NAMES[letter]})`, unit: 'Thousands of jobs', section: 'performance', kind: 'line' },
    });
    entry.text = `Published for the whole of SIC section ${letter}, which is broader than the subject industry.\n${entry.text}`;
  } catch (e) { ctx.ledger.gap('Employment', `ONS workforce jobs could not be retrieved (${e.reason || 'error'}).`); }
}

async function collectMacro(ctx) {
  for (const m of MACRO_SERIES) {
    try {
      const uri = (await searchTimeSeries(m.cdid)).find((r) => r.uri.toLowerCase().includes(`/timeseries/${m.cdid.toLowerCase()}/`))?.uri;
      if (uri) addSeries(ctx, await fetchSeries(uri, '%'), { topics: m.topics, title: `${m.label} (ONS ${m.cdid})` });
      else ctx.ledger.gap('Macroeconomic data', `ONS series ${m.cdid} was not found.`);
    } catch (e) { ctx.ledger.gap('Macroeconomic data', `ONS series ${m.cdid} could not be retrieved (${e.reason || 'error'}).`); }
  }
}

async function collectBulletins(ctx) {
  const firstDiv = Number(ctx.divisions[0] || 0);
  for (const [path, topics, applies] of BULLETINS) {
    if (applies && !applies(firstDiv)) continue;
    try {
      const page = await fetchText(`${BASE}${path}`, { ttlMs: DAY, maxBytes: 6_000_000 });
      const doc = parseHtml(page.text, page.url);
      ctx.ledger.add({
        org: ORG, tier: 1, kind: 'page', provider: 'ons', title: doc.title, url: page.url,
        publishedDate: doc.publishedDate, retrievedAt: page.fetchedAt, topics,
        text: selectRelevant(doc.text, ctx.keywords, 6000),
      });
    } catch (e) { ctx.ledger.gap('ONS bulletins', `${path.split('/').slice(-2, -1)[0]} could not be retrieved (${e.reason || 'error'}).`); }
  }
}

async function loadWorkbook(datasetPath) {
  const { json } = await fetchJson(`${BASE}${datasetPath}/current/data`, { ttlMs: DAY });
  const file = json.downloads?.find((d) => /\.xlsx$/i.test(d.file))?.file;
  if (!file) throw new Error('no xlsx download listed');
  const { json: landing } = await fetchJson(`${BASE}${datasetPath}/data`, { ttlMs: DAY });
  const res = await fetchResource(`${BASE}/file?uri=${datasetPath}/current/${file}`, { ttlMs: DAY, maxBytes: 30_000_000 });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  return { wb, releaseDate: landing.description?.releaseDate?.slice(0, 10), title: landing.description?.title, fetchedAt: res.fetchedAt };
}

/** Convert SIC codes such as 28410 or 28.41 to the codes the ABS workbook uses. */
export function absCode(code) {
  const digits = String(code).replace(/\D/g, '');
  if (digits.length <= 2) return digits.padStart(2, '0');
  if (digits.length === 3) return `${digits.slice(0, 2)}.${digits[2]}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}`;
}

const ABS_COLUMNS = [
  ['enterprises', 3, 'Number of enterprises', 'Enterprises'],
  ['turnover', 4, 'Total turnover', '£ million'],
  ['gva', 5, 'Approximate gross value added', '£ million'],
  ['employmentCosts', 7, 'Total employment costs', '£ million'],
  ['capex', 8, 'Capital expenditure (acquisitions)', '£ million'],
];

export async function collectAbs(ctx) {
  let book;
  try { book = await loadWorkbook(ABS_PATH); } catch (e) {
    ctx.ledger.gap('Annual Business Survey', `The ABS workbook could not be retrieved or read (${e.reason || e.message}).`);
    return;
  }
  const codes = [...new Set([...ctx.divisions.slice(0, 2), ...ctx.sicCodes.slice(0, 3).map(absCode)])];
  const rowsByCode = new Map(codes.map((c) => [c, []]));
  for (const sheet of book.wb.worksheets) {
    if (!/^(Section|Division)/.test(sheet.name) || sheet.name === 'Sections A to S') continue;
    sheet.eachRow((row) => {
      const code = String(cellValue(row.values[1])).trim();
      if (rowsByCode.has(code)) rowsByCode.get(code).push(row.values.slice(1).map(cellValue));
    });
  }
  let found = 0;
  for (const [code, rows] of rowsByCode) {
    if (!rows.length) continue;
    found++;
    const description = String(rows[0][1]).trim().replace(/\.$/, '');
    const series = ABS_COLUMNS.map(([key, col, title, unit]) => ({
      key: `abs-${code}-${key}`, title: `${title}, SIC ${code}`, unit, frequency: 'annual',
      points: rows.map((r) => ({ period: String(r[2]), value: toNumber(r[col]) })).filter((p) => p.value !== null),
    })).filter((s) => s.points.length);
    const g = (k) => new Map(series.find((s) => s.key === `abs-${code}-${k}`)?.points.map((p) => [p.period, p.value]) || []);
    const [t, v, e] = [g('turnover'), g('gva'), g('employmentCosts')];
    const marginPoints = [...t.keys()].filter((y) => v.has(y) && e.has(y) && t.get(y) > 0)
      .map((y) => ({ period: y, value: Number((((v.get(y) - e.get(y)) / t.get(y)) * 100).toFixed(1)) }));
    if (marginPoints.length) {
      series.push({ key: `abs-${code}-margin`, title: `Derived margin proxy, SIC ${code}: (aGVA minus employment costs) as % of turnover`, unit: '% (derived)', frequency: 'annual', points: marginPoints });
    }
    const years = rows.map((r) => r[2]);
    const isDivision = code.length === 2;
    ctx.ledger.add({
      org: ORG, tier: 1, kind: 'dataset', provider: 'ons', seriesKey: `abs-${code}`,
      title: `${book.title}: SIC ${code} ${description}`, url: `${BASE}${ABS_PATH}`, publishedDate: book.releaseDate,
      period: `${years[0]} to ${years[years.length - 1]}`, retrievedAt: book.fetchedAt, topics: ['market_size', 'population', 'profitability', 'investment'], series,
      text: 'Annual Business Survey. Covers the UK non-financial business economy only and excludes most of the financial sector. Figures are in current prices, so turnover changes include inflation. The margin series is derived by this application and is a proxy, not a published profit measure.',
      charts: isDivision ? [
        { title: `Turnover: SIC ${code}`, unit: '£ million, current prices', section: 'market', kind: 'bar', seriesKeys: [`abs-${code}-turnover`] },
        { title: `Number of enterprises: SIC ${code}`, unit: 'Enterprises', section: 'market', kind: 'line', seriesKeys: [`abs-${code}-enterprises`] },
        { title: `Capital expenditure: SIC ${code}`, unit: '£ million, current prices', section: 'financial', kind: 'bar', seriesKeys: [`abs-${code}-capex`] },
      ] : [],
    });
  }
  if (!found) ctx.ledger.gap('Annual Business Survey', `ABS has no rows for SIC ${codes.join(', ')}. It excludes financial services, public administration and some other sections.`);
}

export async function collectDemography(ctx) {
  let book;
  try { book = await loadWorkbook(DEMOG_PATH); } catch (e) {
    ctx.ledger.gap('Business demography', `The Business Demography workbook could not be retrieved or read (${e.reason || e.message}).`);
    return;
  }
  const rowFor = (sheetName, div) => {
    const sheet = book.wb.getWorksheet(sheetName);
    if (!sheet) return null;
    let header = null; let result = null;
    sheet.eachRow((row) => {
      const values = row.values.slice(1).map(cellValue);
      if (!header && values.some((v) => /^\d{4}/.test(String(v).trim()))) header = values;
      if (!result && new RegExp(`^${div}\\s*:`).test(String(values[0]).trim())) result = values;
    });
    return result && header ? { header, values: result } : null;
  };
  let found = 0;
  for (const div of ctx.divisions.slice(0, 2)) {
    const tables = [['births', 'Table 1.2', 'Enterprise births'], ['deaths', 'Table 2.2', 'Enterprise deaths'], ['active', 'Table 3.2', 'Active enterprises']];
    const series = [];
    let label = '';
    for (const [key, name, title] of tables) {
      const row = rowFor(name, div);
      if (!row) continue;
      label = String(row.values[0]).trim();
      const points = row.header.map((h, i) => ({ period: String(h).trim(), value: toNumber(row.values[i]) }))
        .filter((p) => /^\d{4}$/.test(p.period) && p.value !== null);
      if (points.length) series.push({ key: `demog-${div}-${key}`, title: `${title}, SIC ${div}`, unit: 'Enterprises', frequency: 'annual', points });
    }
    if (!series.length) continue;
    found++;
    const survival = [];
    for (const [suffix, cohort] of [['a', 2019], ['b', 2020], ['c', 2021], ['d', 2022], ['e', 2023]]) {
      const row = rowFor(`Table 5.2${suffix}`, div);
      if (!row) continue;
      const parts = [];
      row.header.forEach((h, i) => {
        const v = toNumber(row.values[i]);
        if (/per\s*cent/i.test(String(h)) && v !== null) parts.push(`${String(h).replace(/\s+/g, ' ').replace('per cent', 'survival').trim()}: ${v.toFixed(1)}%`);
      });
      if (parts.length) survival.push(`${cohort} births cohort: ${parts.join(', ')}`);
    }
    ctx.ledger.add({
      org: ORG, tier: 1, kind: 'dataset', provider: 'ons', seriesKey: `demog-${div}`,
      title: `Business demography reference table: ${label}`, url: `${BASE}${DEMOG_PATH}`, publishedDate: book.releaseDate,
      period: `${series[0].points[0].period} to ${series[0].points.at(-1).period}`, retrievedAt: book.fetchedAt, series, topics: ['survival', 'population'],
      text: `${survival.length ? `Survival of newly born enterprises, SIC ${div}:\n${survival.join('\n')}\n` : ''}ONS counts are rounded to the nearest 5.`,
      charts: series.some((s) => s.key.endsWith('births')) ? [{ title: `Enterprise births and deaths: SIC ${div}`, unit: 'Enterprises', section: 'financial', kind: 'line', seriesKeys: [`demog-${div}-births`, `demog-${div}-deaths`] }] : [],
    });
  }
  if (!found) ctx.ledger.gap('Business demography', `No industry rows found for SIC ${ctx.divisions.slice(0, 2).join(', ')}.`);
}

export default {
  id: 'ons',
  label: 'Office for National Statistics',
  appliesTo: (ctx) => ctx.market.isUK,
  async collect(ctx) {
    await collectSectorOutput(ctx);
    await collectWorkforce(ctx);
    await collectMacro(ctx);
    await collectAbs(ctx);
    await collectDemography(ctx);
    await collectBulletins(ctx);
  },
};
