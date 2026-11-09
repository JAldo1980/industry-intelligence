import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Chart } from './Chart.jsx';
import { Toolbar, useScrollSpy } from './reportTools.jsx';
import { ukDate } from './format.js';

const NAV = [
  ['indicators', 'Key Indicators'], ['market', 'Market Size and Structure'], ['performance', 'Output, Employment and Trade'], ['financial', 'Investment and Business Churn'],
  ['international', 'International Comparison'], ['economy', 'Economy and Projections'], ['company', 'Company Record'], ['publications', 'Official Publications'], ['sources', 'Sources and Data Gaps'],
];

const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : v);

const Section = ({ id, n, title, children }) => (
  <section id={id} className="bg-surface border border-rule rounded-md px-5 sm:px-8 py-7 mb-5">
    <h2 className="font-serif text-[23px] font-semibold text-ink tracking-tight"><span className="text-faint font-normal tabular mr-2.5">{n}</span>{title}</h2>
    <div className="prose-report mt-4">{children}</div>
  </section>
);

const SourceLink = ({ n }) => <sup><a href={`#source-${n}`} className="no-underline px-px text-xs tabular font-medium" aria-label={`Source ${n}`}>[{n}]</a></sup>;

function Change({ c }) {
  if (!c) return <span className="text-faint">n/a</span>;
  const Icon = { up: ArrowUp, down: ArrowDown, flat: Minus }[c.direction];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={`From ${fmt(c.from)} in ${c.fromPeriod}`}>
      <Icon size={13} className="text-muted" aria-hidden="true" />
      <span className="sr-only">{c.direction} </span>
      {c.value > 0 ? '+' : ''}{fmt(c.value)}{c.unit === 'pts' ? ' pts' : '%'}
    </span>
  );
}

function Charts({ report, section }) {
  const charts = report.charts.filter((c) => c.section === section);
  if (!charts.length) return <p className="text-muted">No charted data was available for this industry.</p>;
  return charts.map((c) => <Chart key={c.id} chart={c} />);
}

export function DataReport({ report: r }) {
  const active = useScrollSpy(NAV);
  const o = r.overview; const q = r.quality;
  const meta = [['Industry', o.identifiedIndustry], ['UK SIC code', o.sic], ['Geographic market', o.market], ['HS trade chapters', o.hsChapters.join(', ') || 'Not applicable'], ['Date of research', ukDate(o.researchDate)], ['Sources', r.sources.length]];
  return (
    <div className="report-shell max-w-7xl mx-auto lg:flex lg:gap-8 px-4 sm:px-6 py-6">
      <aside className="no-print hidden lg:block w-64 shrink-0">
        <nav className="sticky top-5 text-[13.5px]" aria-label="Report sections">
          <ol>{NAV.map(([id, label], i) => (
            <li key={id}><a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView(); }} aria-current={active === id ? 'true' : undefined} className={`flex gap-2 py-1.5 px-2 rounded no-underline leading-snug ${active === id ? 'bg-accent-soft text-accent font-semibold' : 'text-muted hover:text-ink'}`}><span className="tabular w-5 shrink-0 text-right">{i + 1}</span><span>{label}</span></a></li>
          ))}</ol>
        </nav>
      </aside>

      <main className="report-main min-w-0 flex-1 max-w-4xl">
        <div className="no-print lg:hidden sticky top-0 z-10 bg-canvas py-2 mb-2">
          <label className="sr-only" htmlFor="jump">Jump to section</label>
          <select id="jump" value={active} onChange={(e) => document.getElementById(e.target.value)?.scrollIntoView()} className="w-full h-11 px-2 border border-rule-strong rounded bg-surface text-sm">{NAV.map(([id, label], i) => <option key={id} value={id}>{i + 1}. {label}</option>)}</select>
        </div>

        <header className="bg-surface border border-rule rounded-md px-5 sm:px-8 py-7 mb-5">
          <div className="flex flex-wrap justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-accent uppercase tracking-wide">Official data report</div>
              <h1 className="font-serif text-[32px] leading-tight font-semibold text-ink mt-1 tracking-tight">{o.title}</h1>
            </div>
            <Toolbar report={r} />
          </div>
          <dl className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 mt-6 pt-5 border-t border-rule">
            {meta.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="text-[15px] font-medium text-ink mt-0.5">{v}</dd></div>)}
          </dl>
          <p className="mt-5 pt-5 border-t border-rule text-[14px] text-muted leading-relaxed">Every figure is retrieved directly from an official source or calculated by simple arithmetic from those figures. It contains official statistics only, with no commentary or competitor research. Official data follows SIC categories, which may be broader or narrower than a specific niche.</p>
        </header>

        <Section id="indicators" n="1" title="Key Indicators">
          {r.indicators.map((g) => (
            <div key={g.name} className="mb-6 last:mb-0">
              <h3 className="text-[16px] font-semibold text-ink mb-1.5">{g.name}</h3>
              <div className="overflow-x-auto">
                <table className="stack-table w-full text-[14px] min-w-[620px] tabular">
                  <thead><tr className="text-left text-muted border-b border-rule-strong text-[13px]">{['Indicator', 'Latest', 'Period', '1-year change', '5-year change'].map((h) => <th key={h} className="font-medium px-1 py-2">{h}</th>)}</tr></thead>
                  <tbody>{g.rows.map((x) => (
                    <tr key={x.key} className="border-b border-rule last:border-0 align-top">
                      <td className="px-1 py-2.5 text-ink pr-3">{x.label}<SourceLink n={x.source} /></td>
                      <td data-label="Latest" className="px-1 py-2.5 whitespace-nowrap"><span className="font-semibold text-ink">{fmt(x.latest)}</span> <span className="text-muted text-[13px]">{x.unit}</span></td>
                      <td data-label="Period" className="px-1 py-2.5 whitespace-nowrap text-muted">{x.period}</td>
                      <td data-label="1-year change" className="px-1 py-2.5"><Change c={x.change1y} /></td>
                      <td data-label="5-year change" className="px-1 py-2.5"><Change c={x.change5y} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="text-[13px] text-muted mt-3">Arrows show direction only, and do not say whether a change is good or bad. Rates such as inflation show the change in percentage points. Turnover and investment are in current prices, so they include the effect of inflation.</p>
        </Section>

        <Section id="market" n="2" title="Market Size and Structure">
          <p className="mb-2 text-[14px] text-muted">Total turnover from the ONS Annual Business Survey is an official proxy for market size. It is not a published market-size estimate.</p>
          <Charts report={r} section="market" />
        </Section>
        <Section id="performance" n="3" title="Output, Employment and Trade"><Charts report={r} section="performance" /></Section>
        <Section id="financial" n="4" title="Investment and Business Churn"><Charts report={r} section="financial" /></Section>
        <Section id="international" n="5" title="International Comparison"><Charts report={r} section="growth" /></Section>

        <Section id="economy" n="6" title="Economy and Projections">
          <Charts report={r} section="forecast" />
          {r.projections && (
            <div className="mt-2">
              <h3 className="text-[16px] font-semibold text-ink">IMF projections<SourceLink n={r.projections.source} /></h3>
              <p className="text-[13px] text-muted mb-2">Published third-party projections for the whole UK economy, not this industry.</p>
              <div className="overflow-x-auto"><table className="stack-table w-full text-[14px] min-w-[420px] tabular">
                <thead><tr className="text-left text-muted border-b border-rule-strong text-[13px]"><th className="font-medium px-1 py-2">Measure</th>{r.projections.series[0].points.map((p) => <th key={p.period} className="font-medium px-1 py-2">{p.period}</th>)}</tr></thead>
                <tbody>{r.projections.series.map((s) => <tr key={s.name} className="border-b border-rule last:border-0"><td className="px-1 py-2.5 text-ink">{s.name}, {s.unit}</td>{s.points.map((p) => <td key={p.period} data-label={p.period} className="px-1 py-2.5">{p.value}</td>)}</tr>)}</tbody>
              </table></div>
            </div>
          )}
        </Section>

        <Section id="company" n="7" title="Company Record">
          {r.companies.length ? r.companies.map((c) => (
            <div key={c.number} className="text-[15px]">
              <div className="font-semibold text-ink">{c.name}<SourceLink n={c.source} /></div>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-2 text-[14px]">
                <div><dt className="text-xs text-muted">Company number</dt><dd>{c.number}</dd></div>
                <div><dt className="text-xs text-muted">Status</dt><dd>{c.status}</dd></div>
                <div><dt className="text-xs text-muted">Incorporated</dt><dd>{c.incorporated}</dd></div>
                <div><dt className="text-xs text-muted">Latest accounts filing</dt><dd>{c.accountsDescription || 'None found'}{c.filedOn ? `, filed ${c.filedOn}` : ''}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-muted">Registered activities</dt><dd>{c.sic.join('; ')}</dd></div>
              </dl>
              <p className="mt-3 text-[14px]">{c.accountsUrl && <><a href={c.accountsUrl} target="_blank" rel="noreferrer">Open latest filed accounts</a> · </>}<a href={c.url} target="_blank" rel="noreferrer">Full filing history</a></p>
              <p className="text-[13px] text-muted mt-2">One company does not represent the industry. Open the filed accounts above for its figures.</p>
            </div>
          )) : <p className="text-muted">{q.dataGaps.find((g) => g.area === 'Company financials')?.detail || 'No company was included in this report.'}</p>}
        </Section>

        <Section id="publications" n="8" title="Official Publications">
          {r.publications.length ? <ul className="text-[14.5px]">{r.publications.map((s) => <li key={s.n} className="py-2.5 border-b border-rule last:border-0"><a href={s.url} target="_blank" rel="noreferrer" className="font-medium">{s.title}</a><div className="text-[13px] text-muted mt-0.5">{s.organisation} · Published {ukDate(s.publishedDate) || 'date not stated'}</div></li>)}</ul> : <p className="text-muted">No publications were retrieved.</p>}
        </Section>

        <Section id="sources" n="9" title="Sources and Data Gaps">
          <p className="text-[14px]">{q.linksChecked - q.linksFailed - q.linksRestricted} of {q.linksChecked} source links opened during checking{q.linksRestricted ? `; ${q.linksRestricted} restrict automated access` : ''}{q.linksFailed ? `; ${q.linksFailed} failed` : ''}.</p>
          {q.dataGaps.length > 0 && <><h3 className="text-[16px] font-semibold text-ink mt-5 mb-1.5">Data gaps</h3><ul className="list-disc pl-5 text-[14px]">{q.dataGaps.map((g, i) => <li key={i}><span className="font-medium text-ink">{g.area}.</span> {g.detail} {g.fallback}</li>)}</ul></>}
          <h3 className="text-[16px] font-semibold text-ink mt-5 mb-1.5">Sources</h3>
          <ol className="text-[14px]">{r.sources.map((s) => (
            <li key={s.n} id={`source-${s.n}`} className="py-3 border-b border-rule last:border-0 flex gap-3 target:bg-accent-soft scroll-mt-16">
              <span className="tabular text-muted w-7 shrink-0 text-right">{s.n}.</span>
              <div className="min-w-0">
                <div className="text-ink"><span className="font-semibold">{s.organisation}.</span> {s.title}</div>
                <a href={s.url} target="_blank" rel="noreferrer" className="break-all text-[13px]">{s.url}</a>
                <div className="text-[13px] text-muted mt-1">Published {ukDate(s.publishedDate) || 'not stated'} · Period {s.period || 'not stated'} · Accessed {ukDate(s.retrievedAt)}{s.age === 'old' ? ' · Old data' : s.age === 'dated' ? ' · Dated' : ''}{s.linkStatus === 'failed' ? ' · Link failed at check' : ''}</div>
              </div>
            </li>
          ))}</ol>
        </Section>
      </main>
    </div>
  );
}
