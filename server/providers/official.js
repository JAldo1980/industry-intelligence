// Other official numeric sources: Nomis, Bank of England, HMRC trade data, World Bank, Eurostat, IMF.
import { config } from '../config.js';
import { DAY, HOUR, fetchJson, fetchText } from '../lib/http.js';
import { parseHtml, selectRelevant } from '../lib/text.js';

const year = () => new Date().getUTCFullYear();

// ---------------- Nomis (Business Register and Employment Survey) ----------------
const NOMIS = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_189_1';
const GREAT_BRITAIN = '2092957698';

export const nomis = {
  id: 'nomis',
  label: 'Nomis BRES employment',
  appliesTo: (ctx) => ctx.market.isUK && ctx.divisions.length > 0 && config.nomisApiAllowed,
  async collect(ctx) {
    try {
      const { json } = await fetchJson(`${NOMIS}/industry/def.sdmx.json`, { ttlMs: 30 * DAY, maxBytes: 20_000_000, timeoutMs: 60000, ignoreRobots: true });
      const codes = json.structure.codelists.codelist[0].code;
      for (const div of ctx.divisions.slice(0, 2)) {
        const code = codes.find((c) => new RegExp(`^${div} :`).test(c.description.value) && /2 digit/i.test(String(c.annotations.annotation[0].annotationtext)));
        if (!code) { ctx.ledger.gap('Employment', `BRES has no division code for SIC ${div}.`); continue; }
        const url = `${NOMIS}.data.csv?geography=${GREAT_BRITAIN}&date=latestMINUS5-latest&industry=${code.value}&employment_status=1&measure=1&measures=20100&select=date_name,obs_value`;
        const res = await fetchText(url, { ttlMs: 7 * DAY, ignoreRobots: true });
        const points = res.text.trim().split('\n').slice(1).map((l) => l.replace(/"/g, '').split(','))
          .map(([period, value]) => ({ period, value: Number(value) })).filter((p) => Number.isFinite(p.value) && p.value > 0);
        if (!points.length) { ctx.ledger.gap('Employment', `BRES returned no data for SIC ${div}.`); continue; }
        ctx.ledger.add({
          org: 'ONS via Nomis', tier: 1, kind: 'dataset', provider: 'nomis', title: `Business Register and Employment Survey: employment, ${code.description.value}`,
          url, period: `${points[0].period} to ${points.at(-1).period}`, retrievedAt: res.fetchedAt, topics: ['employment'],
          text: 'Coverage is Great Britain (Northern Ireland is excluded). Employment counts employees plus working owners. Rounded by Nomis for disclosure control.',
          series: [{ key: `bres-${div}`, title: `Employment, SIC ${div}, Great Britain`, unit: 'Persons', frequency: 'annual', points }],
          charts: [{ title: `Employment: SIC ${div}, Great Britain`, unit: 'Persons', section: 'performance', kind: 'bar', seriesKeys: [`bres-${div}`] }],
        });
      }
    } catch (e) { ctx.ledger.gap('Employment', `Nomis BRES data could not be retrieved (${e.reason || e.message}).`); }
  },
};

// ---------------- Bank of England ----------------
const BOE = 'https://www.bankofengland.co.uk';
const MONTHS = ['november', 'august', 'may', 'february'];
const MON_INDEX = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

export const boe = {
  id: 'boe',
  label: 'Bank of England',
  appliesTo: (ctx) => ctx.market.isUK,
  async collect(ctx) {
    try {
      const from = `01/Jan/${year() - ctx.years - 1}`;
      const res = await fetchText(`${BOE}/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=IUMABEDR&CSVF=TN&UsingCodes=Y`, { ttlMs: 6 * HOUR });
      const points = res.text.split(/\r?\n/).map((l) => l.match(/^(\d{2}) (\w{3}) (\d{4}),\s*([\d.]+)/)).filter(Boolean)
        .map((m) => ({ period: `${m[3]}-${MON_INDEX[m[2]]}`, value: Number(m[4]) }));
      if (points.length) {
        ctx.ledger.add({
          org: 'Bank of England', tier: 2, kind: 'dataset', provider: 'boe', title: 'Official Bank Rate, monthly average (IUMABEDR)',
          url: `${BOE}/boeapps/database/Bank-Rate.asp`, period: `${points[0].period} to ${points.at(-1).period}`, retrievedAt: res.fetchedAt, topics: ['macro', 'financing'],
          series: [{ key: 'boe-bank-rate', title: 'Official Bank Rate', unit: '% per annum', frequency: 'monthly', points }],
          charts: [{ title: 'Official Bank Rate', unit: '% per annum', section: 'forecast', kind: 'line', seriesKeys: ['boe-bank-rate'] }],
        });
      } else ctx.ledger.gap('Interest rates', 'The Bank of England database returned no usable Bank Rate rows.');
    } catch (e) { ctx.ledger.gap('Interest rates', `Bank Rate could not be retrieved (${e.reason || 'error'}).`); }

    let foundReport = false;
    for (let y = year(); y >= year() - 1 && !foundReport; y--) {
      for (const m of MONTHS) {
        try {
          const res = await fetchText(`${BOE}/monetary-policy-report/${y}/${m}-${y}`, { ttlMs: DAY, maxBytes: 8_000_000 });
          const doc = parseHtml(res.text, res.url);
          ctx.ledger.add({
            org: 'Bank of England', tier: 2, kind: 'page', provider: 'boe', title: doc.title || `Monetary Policy Report ${m} ${y}`, url: res.url,
            publishedDate: doc.publishedDate, period: `${m[0].toUpperCase()}${m.slice(1)} ${y} report`, retrievedAt: res.fetchedAt, topics: ['macro', 'forecast', 'financing'],
            text: selectRelevant(doc.text, ['forecast', 'projection', 'GDP', 'inflation', 'investment', 'credit', 'Bank Rate', 'business', ...ctx.keywords], 8000),
          });
          foundReport = true;
          break;
        } catch { /* this edition is not published yet */ }
      }
    }
    if (!foundReport) ctx.ledger.gap('Economic forecasts', 'The latest Bank of England Monetary Policy Report could not be retrieved.');
  },
};

// ---------------- HMRC UK Trade Info ----------------
const TRADE = 'https://api.uktradeinfo.com';

export const ukTrade = {
  id: 'uktrade',
  label: 'HMRC UK Trade Info',
  appliesTo: (ctx) => ctx.market.isUK,
  async collect(ctx) {
    if (!ctx.hsChapters.length) {
      ctx.ledger.gap('Exports', 'HMRC goods trade data does not cover service-based industries. Services trade by detailed sector is not available from a free API.', 'Use ONS and trade body commentary where available.');
      return;
    }
    for (const chapter of ctx.hsChapters.slice(0, 2)) {
      const c = String(chapter).padStart(2, '0');
      const range = `CommodityId ge ${c}000000 and CommodityId lt ${String(Number(c) + 1).padStart(2, '0')}000000`;
      try {
        const startYear = year() - ctx.years - 1;
        const query = (apply) => `${TRADE}/OTS?$apply=${encodeURIComponent(apply)}`;
        const res = await fetchJson(query(`filter(MonthId ge ${startYear}01 and ${range})/groupby((MonthId,FlowTypeId),aggregate(Value with sum as Sum))`), { ttlMs: 7 * DAY, timeoutMs: 90000, maxBytes: 4_000_000 });
        const rows = res.json.value;
        if (!rows.length) { ctx.ledger.gap('Exports', `HMRC returned no trade rows for HS chapter ${c}.`); continue; }
        const latestMonth = Math.max(...rows.map((r) => r.MonthId));
        const monthsInYear = new Map();
        const totals = new Map();
        for (const r of rows) {
          const y = String(r.MonthId).slice(0, 4);
          if (!monthsInYear.has(y)) monthsInYear.set(y, new Set());
          monthsInYear.get(y).add(r.MonthId);
          const flow = r.FlowTypeId % 2 === 0 ? 'exports' : 'imports';
          const k = `${y}-${flow}`;
          totals.set(k, (totals.get(k) || 0) + r.Sum);
        }
        const fullYears = [...monthsInYear.keys()].filter((y) => monthsInYear.get(y).size === 12).sort();
        const mk = (flow) => ({
          key: `trade-${c}-${flow}`, title: `UK goods ${flow}, HS chapter ${c}`, unit: '£ million', frequency: 'annual',
          points: fullYears.map((y) => ({ period: y, value: Math.round((totals.get(`${y}-${flow}`) || 0) / 1e6) })),
        });

        const end = latestMonth; const endY = Math.floor(end / 100); const endM = end % 100;
        const start = endM === 12 ? endY * 100 + 1 : (endY - 1) * 100 + endM + 1;
        let partnerText = 'The breakdown by trading partner could not be retrieved.';
        try {
          const partners = await fetchJson(query(`filter(MonthId ge ${start} and MonthId le ${end} and ${range})/groupby((CountryId,FlowTypeId),aggregate(Value with sum as Sum))`), { ttlMs: 7 * DAY, timeoutMs: 60000 });
          const countries = await fetchJson(`${TRADE}/Country?$select=CountryId,CountryName`, { ttlMs: 30 * DAY });
          const nameOf = new Map(countries.json.value.map((v) => [v.CountryId, v.CountryName.trim()]));
          const top = (even) => {
            const sum = new Map();
            partners.json.value.filter((r) => (r.FlowTypeId % 2 === 0) === even).forEach((r) => sum.set(r.CountryId, (sum.get(r.CountryId) || 0) + r.Sum));
            return [...sum].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => `${nameOf.get(id) || id} £${Math.round(v / 1e6)} million`).join('; ');
          };
          partnerText = `Top export destinations, 12 months to ${latestMonth}: ${top(true)}.\nTop import origins, 12 months to ${latestMonth}: ${top(false)}.`;
        } catch { ctx.ledger.gap('Exports', `The trading-partner breakdown for HS chapter ${c} could not be retrieved.`); }
        ctx.ledger.add({
          org: 'HMRC UK Trade Info', tier: 1, kind: 'dataset', provider: 'uktrade', seriesKey: `ots-${c}`, title: `Overseas Trade Statistics: HS chapter ${c}`,
          url: 'https://www.uktradeinfo.com/trade-data/', period: `${fullYears[0]} to ${fullYears.at(-1)}; latest month ${latestMonth}`, retrievedAt: res.fetchedAt, topics: ['exports'],
          series: [mk('exports'), mk('imports')],
          text: `An HS chapter is a broad product grouping and will include goods outside this industry. Goods only, current prices.\n${partnerText}`,
          charts: [{ title: `UK goods trade: HS chapter ${c}`, unit: '£ million, current prices', section: 'performance', kind: 'bar', seriesKeys: [`trade-${c}-exports`, `trade-${c}-imports`] }],
        });
      } catch (e) { ctx.ledger.gap('Exports', `HMRC trade data for HS chapter ${c} could not be retrieved (${e.reason || 'error'}).`); }
    }
  },
};

// ---------------- World Bank ----------------
export const worldBank = {
  id: 'worldbank',
  label: 'World Bank',
  appliesTo: () => true,
  async collect(ctx) {
    const firstDiv = Number(ctx.divisions[0] || 0);
    const goods = firstDiv >= 10 && firstDiv <= 33;
    const [code, label] = goods ? ['NV.IND.MANF.ZS', 'Manufacturing value added'] : ['NV.SRV.TOTL.ZS', 'Services value added'];
    const countries = [...new Set([ctx.market.iso3, 'GBR', 'DEU', 'FRA', 'USA'])].slice(0, 4);
    try {
      const res = await fetchJson(`https://api.worldbank.org/v2/country/${countries.join(';')}/indicator/${code}?format=json&per_page=200&date=${year() - 12}:${year()}`, { ttlMs: 7 * DAY });
      const rows = (res.json[1] || []).filter((r) => r.value !== null);
      if (!rows.length) throw new Error('empty');
      const series = countries.map((iso) => {
        const mine = rows.filter((r) => r.countryiso3code === iso).sort((a, b) => a.date.localeCompare(b.date));
        return { key: `wb-${iso}`, title: `${mine[0]?.country?.value || iso}`, unit: '% of GDP', frequency: 'annual', points: mine.map((r) => ({ period: r.date, value: Number(r.value.toFixed(1)) })) };
      }).filter((s) => s.points.length);
      ctx.ledger.add({
        org: 'World Bank', tier: 2, kind: 'dataset', provider: 'worldbank', seriesKey: code, title: `World Development Indicators: ${label} (% of GDP)`,
        url: `https://data.worldbank.org/indicator/${code}`, period: `${series[0].points[0].period} to ${series[0].points.at(-1).period}`, retrievedAt: res.fetchedAt, topics: ['international'], series,
        text: 'Economy-wide comparison. This describes the broad sector and is not specific to the subject industry.',
        charts: [{ title: `${label}: international comparison`, unit: '% of GDP', section: 'growth', kind: 'line', seriesKeys: series.map((s) => s.key) }],
      });
    } catch (e) { ctx.ledger.gap('International comparison', `World Bank data could not be retrieved (${e.reason || 'no data'}).`); }
  },
};

// ---------------- Eurostat ----------------
export function sectionLetter(div) {
  const ranges = [['A', 1, 3], ['B', 5, 9], ['C', 10, 33], ['D', 35, 35], ['E', 36, 39], ['F', 41, 43], ['G', 45, 47], ['H', 49, 53], ['I', 55, 56], ['J', 58, 63], ['K', 64, 66], ['L', 68, 68], ['M', 69, 75], ['N', 77, 82], ['O', 84, 84], ['P', 85, 85], ['Q', 86, 88], ['R', 90, 93], ['S', 94, 96]];
  return ranges.find(([, a, b]) => div >= a && div <= b)?.[0];
}

export const eurostat = {
  id: 'eurostat',
  label: 'Eurostat',
  appliesTo: (ctx) => ctx.divisions.length > 0,
  async collect(ctx) {
    const div = Number(ctx.divisions[0]);
    const letter = sectionLetter(div);
    const nace = `${letter}${String(div).padStart(2, '0')}`;
    const dataset = div >= 5 && div <= 39 ? 'sts_inpr_a' : 'sts_sepr_a';
    if (div >= 41 && div <= 47) { ctx.ledger.gap('International comparison', 'No Eurostat volume index is mapped for this division.'); return; }
    try {
      const res = await fetchJson(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?format=JSON&geo=EU27_2020&nace_r2=${nace}&s_adj=CA&unit=I21&sinceTimePeriod=${year() - 10}`, { ttlMs: 7 * DAY });
      const times = Object.entries(res.json.dimension.time.category.index).sort((a, b) => a[1] - b[1]);
      const points = times.map(([period, i]) => ({ period, value: res.json.value[i] })).filter((p) => Number.isFinite(p.value));
      if (!points.length) throw new Error('empty');
      const label = res.json.dimension.nace_r2.category.label[nace];
      ctx.ledger.add({
        org: 'Eurostat', tier: 1, kind: 'dataset', provider: 'eurostat', seriesKey: `${dataset}-${nace}`, title: `${res.json.label}: ${label}, EU27`,
        url: `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table`, publishedDate: res.json.updated?.slice(0, 10),
        period: `${points[0].period} to ${points.at(-1).period}`, retrievedAt: res.fetchedAt, topics: ['international'],
        series: [{ key: `eu-${nace}`, title: `EU27 volume index, ${label}`, unit: 'Index, 2021 = 100', frequency: 'annual', points }],
        charts: [{ title: `EU27 volume index: ${label}`, unit: 'Index, 2021 = 100', section: 'growth', kind: 'line', seriesKeys: [`eu-${nace}`] }],
      });
    } catch (e) { ctx.ledger.gap('International comparison', `Eurostat ${dataset} has no usable data for ${nace} (${e.reason || 'no data'}).`); }
  },
};

// ---------------- IMF World Economic Outlook ----------------
export const imf = {
  id: 'imf',
  label: 'IMF DataMapper',
  appliesTo: () => true,
  async collect(ctx) {
    const iso = ctx.market.iso3;
    const series = [];
    const now = year();
    for (const [code, title, unit] of [['NGDP_RPCH', 'Real GDP growth', '% change'], ['PCPIPCH', 'Inflation, average consumer prices', '% change']]) {
      try {
        const res = await fetchJson(`https://www.imf.org/external/datamapper/api/v1/${code}/${iso}`, { ttlMs: 7 * DAY });
        const values = res.json.values?.[code]?.[iso];
        if (!values) throw new Error('empty');
        const points = Object.entries(values).map(([y, v]) => ({ period: y, value: Number(v), forecast: Number(y) >= now }))
          .filter((p) => Number(p.period) >= now - ctx.years - 1 && Number(p.period) <= now + 4);
        series.push({ key: `imf-${code}`, title, unit, frequency: 'annual', points, fetchedAt: res.fetchedAt });
      } catch (e) { ctx.ledger.gap('Economic forecasts', `IMF ${code} could not be retrieved (${e.reason || 'no data'}).`); }
    }
    if (!series.length) return;
    ctx.ledger.add({
      org: 'IMF', tier: 2, kind: 'dataset', provider: 'imf', seriesKey: `imf-${iso}`, title: `World Economic Outlook projections, ${ctx.market.name}`,
      url: `https://www.imf.org/external/datamapper/NGDP_RPCH@WEO/${iso}`, period: `${series[0].points[0].period} to ${series[0].points.at(-1).period}`,
      retrievedAt: series[0].fetchedAt, topics: ['forecast', 'macro'], series,
      text: `Published third-party projections for the whole economy, not this industry. Values from ${now} onwards are treated as projections here; the IMF may also estimate the most recent past year.`,
      charts: [{ title: `Real GDP growth, ${ctx.market.name}: history and IMF projection`, unit: '% change on previous year', section: 'forecast', kind: 'bar', seriesKeys: ['imf-NGDP_RPCH'] }],
    });
  },
};
