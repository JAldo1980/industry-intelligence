// The evidence ledger holds everything a report may cite. Each item was retrieved
// by code in this run and has a real URL and retrieval timestamp.

export const TIER_LABELS = {
  1: 'Government statistics and official datasets',
  2: 'Official economic institutions',
  3: 'Trade associations',
  4: 'Company financial reports',
  5: 'Established industry research organisations',
  6: 'Credible business and trade publications',
  7: 'General web sources',
};

const TIER_DOMAINS = [
  [1, /(^|\.)(ons\.gov\.uk|gov\.uk|uktradeinfo\.com|nomisweb\.co\.uk|parliament\.uk|europa\.eu|census\.gov|bls\.gov|bea\.gov|destatis\.de|insee\.fr|statcan\.gc\.ca|abs\.gov\.au)$/],
  [2, /(^|\.)(bankofengland\.co\.uk|obr\.uk|oecd\.org|worldbank\.org|imf\.org|ecb\.europa\.eu|unido\.org|federalreserve\.gov|wto\.org|un\.org|bis\.org)$/],
  [4, /(^|\.)(company-information\.service\.gov\.uk)$/],
  [5, /(^|\.)(ibisworld\.com|statista\.com|mintel\.com|gartner\.com|forrester\.com|mckinsey\.com|deloitte\.com|pwc\.co\.uk|pwc\.com|kpmg\.com|ey\.com|bain\.com|bcg\.com|oxfordeconomics\.com|cebr\.com|ifs\.org\.uk|niesr\.ac\.uk|resolutionfoundation\.org)$/],
  [6, /(^|\.)(ft\.com|reuters\.com|bbc\.co\.uk|bloomberg\.com|economist\.com|theguardian\.com|cityam\.com|themanufacturer\.com|theengineer\.co\.uk|constructionnews\.co\.uk|thebusinessdesk\.com|insidermedia\.com|computerweekly\.com)$/],
];

/** Classify a URL into the source hierarchy. Pass trade body domains for tier 3. */
export function classifyTier(url, tradeBodyDomains = []) {
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return 7; }
  if (/company-information\.service\.gov\.uk$/.test(host)) return 4;
  if (tradeBodyDomains.some((d) => host === d || host.endsWith(`.${d}`))) return 3;
  for (const [tier, re] of TIER_DOMAINS) if (re.test(host)) return tier;
  if (/\.(org\.uk|ac\.uk)$/.test(host)) return 6;
  return 7;
}

export function orgFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const known = {
      'ons.gov.uk': 'Office for National Statistics', 'bankofengland.co.uk': 'Bank of England', 'gov.uk': 'UK Government',
      'uktradeinfo.com': 'HMRC UK Trade Info', 'commonslibrary.parliament.uk': 'House of Commons Library', 'oecd.org': 'OECD',
      'worldbank.org': 'World Bank', 'imf.org': 'IMF', 'obr.uk': 'Office for Budget Responsibility', 'unido.org': 'UNIDO',
      'ec.europa.eu': 'European Commission', 'find-and-update.company-information.service.gov.uk': 'Companies House',
    };
    return known[host] || host;
  } catch { return 'Unknown'; }
}

const round = (v, dp = 1) => Number(v.toFixed(dp));

/** Headline statistics for a series. These are arithmetic on retrieved data and are labelled as derived. */
export function seriesStats(series) {
  const pts = series.points.filter((p) => !p.forecast && Number.isFinite(p.value));
  if (!pts.length) return null;
  const latest = pts[pts.length - 1];
  const stepsPerYear = series.frequency === 'monthly' ? 12 : series.frequency === 'quarterly' ? 4 : 1;
  const at = (years) => pts[pts.length - 1 - years * stepsPerYear];
  const stats = { latest: latest.value, latestPeriod: latest.period };
  const pct = (a, b) => (b ? round(((a - b) / Math.abs(b)) * 100) : null);
  for (const y of [1, 3, 5]) {
    const past = at(y);
    if (past) {
      stats[`change${y}y`] = { from: past.value, fromPeriod: past.period, pct: pct(latest.value, past.value) };
      if (y > 1 && past.value > 0 && latest.value > 0) stats[`cagr${y}y`] = round((((latest.value / past.value) ** (1 / y)) - 1) * 100);
    }
  }
  return stats;
}

function seriesToText(series, windowYears = 6) {
  const steps = series.frequency === 'monthly' ? 12 : series.frequency === 'quarterly' ? 4 : 1;
  const pts = series.points.slice(-(windowYears * steps + (series.points.some((p) => p.forecast) ? 6 : 0)));
  const shown = steps === 12 ? pts.filter((_, i) => (pts.length - 1 - i) % 3 === 0 || i >= pts.length - 3) : pts;
  const lines = [`Series: ${series.title} (${series.unit}; ${series.frequency}).`];
  lines.push(shown.map((p) => `${p.period}${p.forecast ? ' (projection)' : ''}: ${p.value}`).join('; '));
  const s = seriesStats(series);
  if (s) {
    const bits = [`Latest actual: ${s.latest} (${s.latestPeriod})`];
    for (const y of [1, 3, 5]) {
      if (s[`change${y}y`]) bits.push(`${y}-year change from ${s[`change${y}y`].fromPeriod} (${s[`change${y}y`].from}): ${s[`change${y}y`].pct}%`);
      if (s[`cagr${y}y`] != null) bits.push(`${y}-year compound annual growth: ${s[`cagr${y}y`]}%`);
    }
    lines.push(`Derived by arithmetic on the data above: ${bits.join('. ')}.`);
  }
  return lines.join('\n');
}

const GAP_REASONS = {
  http: 'the source returned an error', network: 'network error', timeout: 'the source did not respond in time',
  paywall: 'access is restricted', robots: 'automated access is disallowed', dns: 'the address could not be found', too_large: 'the file is too large',
};

export class EvidenceLedger {
  constructor() {
    this.items = [];
    this.byKey = new Map();
    this.gaps = [];
  }

  /**
   * @param {object} item org, title, url, tier, kind ('dataset'|'page'|'company'|'website'), publishedDate,
   *   period, text, series[], provider, topics[]
   */
  add(item) {
    const key = `${item.url}#${item.seriesKey || ''}`;
    if (this.byKey.has(key)) return this.byKey.get(key);
    const entry = {
      id: `E${this.items.length + 1}`,
      org: item.org || orgFromUrl(item.url),
      title: item.title || item.url,
      url: item.url,
      tier: item.tier ?? classifyTier(item.url),
      kind: item.kind || 'page',
      publishedDate: item.publishedDate || null,
      period: item.period || null,
      retrievedAt: item.retrievedAt ? new Date(item.retrievedAt).toISOString() : new Date().toISOString(),
      provider: item.provider,
      topics: item.topics || [],
      series: item.series || [],
      charts: item.charts || [],
      text: '',
    };
    const seriesText = entry.series.map((s) => seriesToText(s)).join('\n\n');
    entry.text = [item.text, seriesText].filter(Boolean).join('\n\n');
    this.items.push(entry);
    this.byKey.set(key, entry);
    return entry;
  }

  /** Record something that could not be retrieved, so the report can disclose it. */
  gap(area, detail, fallback) {
    const readable = String(detail).replace(/\((http|network|timeout|paywall|robots|dns|too_large)\)/, (_, reason) => `(${GAP_REASONS[reason]})`);
    this.gaps.push({ area, detail: readable, fallback: fallback || null });
  }

  get(id) { return this.items.find((e) => e.id === id); }

  active() { return this.items.filter((e) => !e.excluded); }
}
