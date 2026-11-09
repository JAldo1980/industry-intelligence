// The report pipeline: official statistics only, with no paid service.
// Every number is either retrieved directly or is simple arithmetic on retrieved data.
import { EvidenceLedger, TIER_LABELS, seriesStats } from '../lib/evidence.js';
import { divisionName, hsChaptersFor } from '../lib/sic.js';
import { collectCompanies } from '../providers/companieshouse.js';
import ons from '../providers/ons.js';
import { boe, eurostat, imf, ukTrade, worldBank } from '../providers/official.js';
import { govUk } from '../providers/govuk.js';
import { checkLinks } from './links.js';
import { ageFlag, buildCharts } from './charts.js';

export const DATA_STAGES = [
  { id: 'collection', label: 'Retrieving official statistics' },
  { id: 'company', label: 'Checking Companies House' },
  { id: 'indicators', label: 'Calculating indicators' },
  { id: 'links', label: 'Checking source links' },
];

const GROUPS = ['Market size and structure', 'Output and employment', 'Business births and deaths', 'Trade', 'International comparison', 'Economy and interest rates'];

function describe(entry, series) {
  const k = series.key;
  if (k.startsWith('abs-')) return { group: GROUPS[0], label: series.title.replace(/, SIC/, ': SIC') };
  if (k.startsWith('demog-')) return { group: GROUPS[2], label: series.title };
  if (k.startsWith('trade-')) return { group: GROUPS[3], label: series.title };
  if (k.startsWith('wb-')) return { group: GROUPS[4], label: `${series.title}: ${entry.title.split(': ')[1]}` };
  if (k.startsWith('eu-')) return { group: GROUPS[4], label: series.title };
  if (k.startsWith('imf-') || k.startsWith('boe-')) return { group: GROUPS[5], label: series.title };
  if (entry.topics.includes('output')) return { group: GROUPS[1], label: `Output index: ${series.title.split(':').slice(1, -1).join(':').trim()}` };
  if (entry.topics.includes('employment')) return { group: GROUPS[1], label: series.title.replace(' (thousands)', '').replace('UK Workforce Jobs SA :', 'Workforce jobs: section') };
  return { group: GROUPS[5], label: entry.title.replace(/ \(ONS \w+\)$/, '') };
}

function change(stats, years, isRate) {
  const c = stats[`change${years}y`];
  if (!c) return null;
  const delta = Number((stats.latest - c.from).toFixed(2));
  const value = isRate ? delta : c.pct;
  return { value, unit: isRate ? 'pts' : '%', from: c.from, fromPeriod: c.fromPeriod, direction: value > 0 ? 'up' : value < 0 ? 'down' : 'flat' };
}

function buildIndicators(ledger) {
  const rows = [];
  for (const entry of ledger.items) {
    for (const series of entry.series) {
      const stats = seriesStats(series);
      if (!stats) continue;
      const isRate = /%/.test(series.unit);
      // Comparing one year's growth rate with another's says little, and pandemic years distort it.
      const growthRate = ['imf-NGDP_RPCH', 'imf-PCPIPCH', 'IHYQ'].includes(series.key);
      rows.push({
        ...describe(entry, series), key: series.key, unit: series.unit, latest: stats.latest, period: stats.latestPeriod,
        change1y: growthRate ? null : change(stats, 1, isRate), change5y: growthRate ? null : change(stats, 5, isRate), evidenceId: entry.id,
      });
    }
  }
  return GROUPS.map((name) => ({ name, rows: rows.filter((r) => r.group === name) })).filter((g) => g.rows.length);
}

function buildProjections(ledger) {
  const entry = ledger.items.find((e) => e.provider === 'imf');
  if (!entry) return null;
  const series = entry.series.map((s) => ({ name: s.title, unit: s.unit, points: s.points.filter((p) => p.forecast) })).filter((s) => s.points.length);
  return series.length ? { evidenceId: entry.id, series } : null;
}

/** @param {object} input { sic, hs, companyName, researchYears } */
export async function runDataPipeline(input, emit) {
  const ledger = new EvidenceLedger();
  const stage = async (id, detail, fn) => {
    emit({ type: 'stage', id, status: 'running', detail });
    const out = await fn();
    emit({ type: 'stage', id, status: 'done' });
    return out;
  };
  const division = input.sic.slice(0, 2);
  const label = divisionName(division);
  const years = Number(input.researchYears) || 5;
  const hsChapters = input.hs ? [input.hs.padStart(2, '0')] : hsChaptersFor(division);
  const ctx = {
    ledger, years, divisions: [division], sicCodes: input.sic.length > 2 ? [input.sic] : [], hsChapters, keywords: [label, 'output', 'turnover', 'businesses'],
    market: { name: 'United Kingdom', iso2: 'GB', iso3: 'GBR', isUK: true },
    classification: { primaryIndustry: label, primarySector: label, subSector: label },
    plan: { webQueries: [], trendsTerms: [] },
    track: null,
  };

  await stage('collection', 'ONS, HMRC, Bank of England, World Bank, Eurostat, IMF and GOV.UK', async () => {
    const sources = [ons, boe, ukTrade, govUk, worldBank, eurostat, imf];
    await Promise.all(sources.map(async (p) => {
      try { await p.collect(ctx); } catch (e) { ledger.gap(p.label, `This source failed (${e.reason || 'unexpected error'}).`); }
    }));
    if (!ledger.items.some((e) => e.series.length)) throw new Error('No official data could be retrieved. Check your internet connection and try again.');
  });

  const companies = await stage('company', input.companyName ? `Looking up ${input.companyName}` : 'No company entered', () => (
    input.companyName ? collectCompanies([{ name: input.companyName, role: 'subject' }], ctx) : []
  ));

  const built = await stage('indicators', 'Calculating changes over time', async () => {
    ledger.items.forEach((e) => { e.ageFlag = ageFlag(e); });
    return { indicators: buildIndicators(ledger), projections: buildProjections(ledger), charts: buildCharts(ledger, years) };
  });

  return stage('links', 'Confirming each source opens', async () => {
    const ordered = [...ledger.items].sort((a, b) => a.tier - b.tier || Number(a.id.slice(1)) - Number(b.id.slice(1)));
    const number = new Map(ordered.map((e, i) => [e.id, i + 1]));
    const sources = ordered.map((e) => ({
      n: number.get(e.id), organisation: e.org, title: e.title, url: e.url, publishedDate: e.publishedDate, period: e.period, retrievedAt: e.retrievedAt,
      tier: e.tier, tierLabel: TIER_LABELS[e.tier], kind: e.kind, age: e.ageFlag,
    }));
    await checkLinks(sources);

    const researchDate = new Date().toISOString().slice(0, 10);
    return {
      mode: 'data',
      overview: { title: input.companyName || label, companyName: input.companyName || null, identifiedIndustry: label, sic: input.sic, division, hsChapters, market: 'United Kingdom', researchDate, researchYears: years },
      indicators: built.indicators.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, source: number.get(r.evidenceId) })) })),
      projections: built.projections && { ...built.projections, source: number.get(built.projections.evidenceId) },
      charts: built.charts.map((c) => ({ ...c, source: { n: number.get(c.evidenceId), organisation: c.source, title: c.sourceTitle, url: c.url } })),
      companies: companies.map((c) => ({ ...c, source: number.get(c.evidenceId) })),
      publications: sources.filter((s) => s.kind === 'page'),
      sources,
      quality: {
        dataGaps: ledger.gaps, sourcesRetrieved: sources.length, linksChecked: sources.length,
        linksFailed: sources.filter((s) => s.linkStatus === 'failed').length, linksRestricted: sources.filter((s) => s.linkStatus === 'restricted').length,
      },
    };
  });
}
