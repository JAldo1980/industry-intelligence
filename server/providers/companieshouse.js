// Companies House: identifies companies and links to their most recent filed accounts.
// Works from the public register. With COMPANIES_HOUSE_API_KEY it uses the official API for lookup.
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { DAY, fetchJson, fetchText } from '../lib/http.js';
import { clean } from '../lib/text.js';

const SITE = 'https://find-and-update.company-information.service.gov.uk';
const API = 'https://api.company-information.service.gov.uk';

const tokens = (s) => clean(s).toLowerCase()
  .replace(/\bp\.?\s*l\.?\s*c\.?(?=\s|$)/g, 'plc') // the register writes "P L C"
  .replace(/\b(limited|ltd|plc|llp|group|holdings|uk|the)\b/g, ' ')
  .split(/[^a-z0-9]+/).filter(Boolean);

/** 1 is an exact name match. A candidate with extra words scores lower, because it may be a different company. */
export function nameScore(wanted, candidate) {
  const a = new Set(tokens(wanted));
  const b = tokens(candidate);
  if (!a.size || !b.length) return 0;
  const hits = b.filter((t) => a.has(t)).length;
  return (hits / a.size) * (hits / b.length);
}

const apiHeaders = () => ({ Authorization: `Basic ${Buffer.from(`${config.keys.companiesHouse}:`).toString('base64')}` });

async function search(name) {
  if (config.keys.companiesHouse) {
    const { json } = await fetchJson(`${API}/search/companies?items_per_page=8&q=${encodeURIComponent(name)}`, { headers: apiHeaders(), ttlMs: 7 * DAY });
    return (json.items || []).map((i) => ({ number: i.company_number, title: i.title }));
  }
  const { text } = await fetchText(`${SITE}/search/companies?q=${encodeURIComponent(name)}`, { ttlMs: 7 * DAY });
  return [...text.matchAll(/href="\/company\/([A-Z0-9]+)"[^>]*>\s*([^<]+)/g)].map((m) => ({ number: m[1], title: clean(m[2]) }));
}

async function profile(number) {
  const { text } = await fetchText(`${SITE}/company/${number}`, { ttlMs: 7 * DAY });
  const $ = cheerio.load(text);
  return {
    name: clean($('.heading-xlarge, h1').first().text()),
    status: clean($('#company-status').text()),
    incorporated: clean($('#company-creation-date').text()),
    sic: $('[id^="sic"]').map((_, el) => clean($(el).text())).get().filter((s) => /^\d{4,5}\b/.test(s)),
  };
}

async function latestAccounts(number) {
  const page = `${SITE}/company/${number}/filing-history?category=accounts`;
  const { text } = await fetchText(page, { ttlMs: DAY });
  const $ = cheerio.load(text);
  const rows = $('table#fhTable tr, table tr').toArray();
  for (const row of rows) {
    const link = $(row).find('a[href*="/document"]').attr('href');
    if (!link) continue;
    const cells = $(row).find('td').map((_, c) => clean($(c).text())).get();
    return { filedOn: cells[0] || null, description: cells.find((c) => /accounts/i.test(c)) || 'Accounts', docUrl: new URL(link, SITE).href, page };
  }
  return null;
}

/** Free lookup used to suggest an industry: returns close name matches with their registered SIC codes. */
export async function lookupCompanies(name) {
  const matches = (await search(name)).map((c) => ({ ...c, score: nameScore(name, c.title) })).sort((a, b) => b.score - a.score).slice(0, 5);
  const out = [];
  for (const m of matches) {
    const p = await profile(m.number).catch(() => null);
    if (p) out.push({ number: m.number, name: p.name || m.title, status: p.status, sic: p.sic.map((s) => ({ code: s.split(' - ')[0].trim(), description: s.split(' - ').slice(1).join(' - ').trim() })) });
  }
  return out;
}

/** Adds each named company's public record to the report, with a link to its latest filed accounts. */
export async function collectCompanies(names, ctx) {
  const results = [];
  for (const { name, role, website } of names.slice(0, config.maxCompanies)) {
    try {
      const best = (await search(name)).map((c) => ({ ...c, score: nameScore(name, c.title) })).sort((a, b) => b.score - a.score)[0];
      if (!best || best.score < 0.7) { ctx.ledger.gap('Company financials', `${name}: no confident Companies House match, so it was excluded.`); continue; }
      const company = await profile(best.number);
      if (!company.name) company.name = best.title;
      const accounts = await latestAccounts(best.number);
      const url = `${SITE}/company/${best.number}/filing-history`;
      const entry = ctx.ledger.add({
        org: 'Companies House', tier: 4, kind: 'company', provider: 'companieshouse', title: `${company.name}: statutory filings (${best.number})`, url,
        publishedDate: accounts?.filedOn ? isoDate(accounts.filedOn) : null, topics: ['company'],
      });
      results.push({ evidenceId: entry.id, name: company.name, number: best.number, role, website: website || null, status: company.status, incorporated: company.incorporated, sic: company.sic, filedOn: accounts?.filedOn || null, accountsDescription: accounts?.description || null, accountsUrl: accounts?.docUrl || null, url });
    } catch (e) { ctx.ledger.gap('Company financials', `${name}: the register lookup failed (${e.reason || 'error'}).`); }
  }
  return results;
}

function isoDate(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
