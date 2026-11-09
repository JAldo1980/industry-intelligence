import { DAY } from '../lib/http.js';

export function ageFlag(entry) {
  let date = entry.publishedDate ? new Date(entry.publishedDate) : null;
  if (entry.series.length) {
    const last = entry.series.flatMap((s) => s.points.filter((p) => !p.forecast).slice(-1).map((p) => p.period)).sort().at(-1);
    const year = String(last || '').match(/(19|20)\d{2}/)?.[0];
    if (year) date = new Date(`${Number(year)}-12-31`);
  }
  if (!date || Number.isNaN(date.getTime())) return 'undated';
  const months = (Date.now() - date.getTime()) / (30.44 * DAY);
  return months <= 24 ? 'current' : months <= 48 ? 'dated' : 'old';
}

export function buildCharts(ledger, years) {
  const charts = [];
  for (const entry of ledger.active()) {
    for (const spec of entry.charts) {
      const series = spec.seriesKeys.map((k) => entry.series.find((s) => s.key === k)).filter(Boolean);
      if (!series.length) continue;
      const steps = series[0].frequency === 'monthly' ? 12 : series[0].frequency === 'quarterly' ? 4 : 1;
      const windowLen = Math.max(years, 4) * steps + 1;
      const periods = [...new Set(series.flatMap((s) => s.points.map((p) => p.period)))];
      const order = new Map(series[0].points.map((p, i) => [p.period, i]));
      if (series.length > 1) periods.sort((a, b) => a.localeCompare(b)); else periods.sort((a, b) => order.get(a) - order.get(b));
      const hasForecast = series.some((s) => s.points.some((p) => p.forecast));
      const shown = periods.slice(hasForecast ? -(windowLen + 5) : -windowLen);
      const data = shown.map((period) => {
        const row = { period };
        series.forEach((s) => {
          const p = s.points.find((x) => x.period === period);
          if (p) { row[s.key] = p.value; if (p.forecast) row.forecast = true; }
        });
        return row;
      });
      charts.push({
        id: `${entry.id}-${spec.seriesKeys[0]}`, evidenceId: entry.id, title: spec.title, unit: spec.unit, section: spec.section, kind: spec.kind,
        series: series.map((s) => ({ key: s.key, name: s.title })), data, hasForecast,
        source: entry.org, sourceTitle: entry.title, url: entry.url, period: `${shown[0]} to ${shown.at(-1)}`,
      });
    }
  }
  return charts;
}
