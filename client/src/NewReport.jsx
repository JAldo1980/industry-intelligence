import { useEffect, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';

const field = 'w-full h-11 px-3 bg-surface border border-rule-strong rounded text-[15px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent';
const label = 'block text-[13px] font-medium text-ink mb-1.5';
const friendly = (err) => (err.message === 'Failed to fetch' ? 'The server could not be reached. Is it running?' : err.message);

export function NewReport() {
  const [divisions, setDivisions] = useState([]);
  const [offline, setOffline] = useState(false);
  const [form, setForm] = useState({ sic: '', detail: '', companyName: '', hs: '', researchYears: 5 });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  useEffect(() => { fetch('/api/sic-divisions').then((r) => r.json()).then(setDivisions).catch(() => setOffline(true)); }, []);

  async function lookup(e) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setLooking(true); setError(null); setResults(null);
    try {
      const res = await fetch(`/api/company-lookup?q=${encodeURIComponent(query.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setResults(body);
    } catch (err) { setError(friendly(err)); }
    setLooking(false);
  }
  const choose = (company, sic) => {
    setForm((f) => ({ ...f, sic: sic.code.slice(0, 2), detail: sic.code, companyName: company.name }));
    setResults(null); setQuery(company.name);
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sic: form.detail || form.sic, hs: form.hs, companyName: form.companyName, researchYears: form.researchYears }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'The report could not be started.');
      window.location.hash = `#/report/${out.id}`;
    } catch (err) { setError(friendly(err)); setBusy(false); }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-[38px] leading-tight font-semibold text-ink tracking-tight">Understand the market behind any UK business</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-muted">Official statistics, charts and projections for any UK industry, with every figure linked to its source.</p>
      {offline && (
        <div role="status" className="mt-6 flex gap-2.5 items-start bg-warn-soft text-warn rounded px-4 py-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><div>The server could not be reached. Refresh the page to try again.</div>
        </div>
      )}

      <div className="mt-8 bg-surface border border-rule rounded-md p-5 sm:p-7">
        <form onSubmit={lookup}>
          <label className={label} htmlFor="lookup">Find the industry from a UK company <span className="font-normal text-muted">(optional)</span></label>
          <div className="flex gap-2">
            <input id="lookup" className={field} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company name" />
            <button className="h-11 px-4 shrink-0 inline-flex items-center gap-1.5 rounded border border-rule-strong text-sm font-medium text-ink hover:bg-canvas" disabled={looking}><Search size={15} aria-hidden="true" />{looking ? 'Searching…' : 'Find'}</button>
          </div>
        </form>
        {results && (
          <ul className="mt-3 border border-rule rounded divide-y divide-rule text-sm">
            {results.length === 0 && <li className="px-3 py-2.5 text-muted">No companies found.</li>}
            {results.map((c) => (
              <li key={c.number} className="px-3 py-2.5">
                <div className="font-medium text-ink">{c.name} <span className="font-normal text-muted">{c.number} · {c.status}</span></div>
                {c.sic.length === 0 && <div className="text-muted mt-1">No SIC code registered.</div>}
                <div className="flex flex-col items-start gap-1 mt-1">{c.sic.map((s) => <button key={s.code} type="button" onClick={() => choose(c, s)} className="text-left text-accent hover:underline py-2 lg:py-0.5">Use {s.code}: {s.description}</button>)}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[13px] text-muted mt-2">Companies register their own SIC codes, so check that the one you choose fits what they do.</p>

        <form onSubmit={submit} className="mt-5 pt-5 border-t border-rule">
          <label className={label} htmlFor="sic">Industry</label>
          <select id="sic" required className={field} value={form.sic} onChange={(e) => setForm((f) => ({ ...f, sic: e.target.value, detail: '' }))}>
            <option value="">Choose an industry</option>
            {divisions.map((d) => <option key={d.code} value={d.code}>{d.code}: {d.name}</option>)}
          </select>
          <div className="grid sm:grid-cols-2 gap-5 mt-5">
            <div>
              <label className={label} htmlFor="detail">Detailed SIC code <span className="font-normal text-muted">(optional)</span></label>
              <input id="detail" className={field} value={form.detail} onChange={set('detail')} placeholder="For example 28410" inputMode="numeric" pattern="[0-9]{2,5}" />
            </div>
            <div>
              <label className={label} htmlFor="years">Chart period</label>
              <select id="years" className={field} value={form.researchYears} onChange={set('researchYears')}>{[3, 4, 5].map((y) => <option key={y} value={y}>Last {y} years</option>)}</select>
            </div>
          </div>
          {form.companyName && <p className="text-sm mt-4">Company record included: <span className="font-medium text-ink">{form.companyName}</span> <button type="button" className="text-accent hover:underline ml-1 py-2.5 lg:py-0" onClick={() => setForm((f) => ({ ...f, companyName: '' }))}>Remove</button></p>}
          {error && <p role="alert" className="mt-5 text-sm text-bad">{error}</p>}
          <button disabled={busy} className="mt-6 w-full h-12 rounded bg-brand text-ink border border-ink font-semibold text-[15px] hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed">{busy ? 'Starting…' : 'Generate Report'}</button>
          <p className="mt-3 text-[13px] text-muted text-center">Takes about a minute. UK only.</p>
        </form>
      </div>
    </main>
  );
}
