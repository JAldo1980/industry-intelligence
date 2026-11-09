// Live check of the keyless data providers. Needs no API key.
// Usage: npm run check:sources -- [SIC code] [HS chapter]
import { EvidenceLedger } from '../server/lib/evidence.js';
import { boe, eurostat, imf, nomis, ukTrade, worldBank } from '../server/providers/official.js';
import ons from '../server/providers/ons.js';
import { collectCompanies } from '../server/providers/companieshouse.js';

const sic = process.argv[2] || '28410';
const hs = process.argv[3] ?? '84';
const ctx = {
  ledger: new EvidenceLedger(),
  divisions: [sic.slice(0, 2)],
  sicCodes: [sic],
  hsChapters: hs ? [hs] : [],
  keywords: ['manufacturing', 'machinery', 'output'],
  years: 5,
  market: { name: 'United Kingdom', iso2: 'GB', iso3: 'GBR', isUK: true },
  plan: { webQueries: [], trendsTerms: [] },
  classification: { primaryIndustry: 'Machinery', primarySector: 'Manufacturing' },
};

for (const p of [ons, nomis, boe, ukTrade, worldBank, eurostat, imf]) {
  const t = Date.now();
  const before = ctx.ledger.items.length;
  await p.collect(ctx);
  console.log(`${p.id.padEnd(10)} +${ctx.ledger.items.length - before} items in ${((Date.now() - t) / 1000).toFixed(1)}s`);
}
if (process.argv.includes('--companies')) {
  ctx.track = null;
  console.log(await collectCompanies([{ name: 'Renishaw PLC', role: 'large' }], ctx));
}

console.log('\n--- Evidence ---');
for (const e of ctx.ledger.items) {
  const s = e.series.map((x) => `${x.points.length}pts latest ${x.points.filter((p) => !p.forecast).at(-1)?.period}=${x.points.filter((p) => !p.forecast).at(-1)?.value}`).join(' | ');
  console.log(`${e.id} [T${e.tier}] ${e.org}: ${e.title.slice(0, 80)} (${e.publishedDate || 'no date'}) text=${e.text.length} ${s}`);
}
console.log('\n--- Gaps ---');
ctx.ledger.gaps.forEach((g) => console.log(`${g.area}: ${g.detail}`));
