import { useEffect, useState } from 'react';
import { Check, CircleAlert, Loader2 } from 'lucide-react';
import { DataReport } from './DataReport.jsx';

export function ReportPage({ id }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let source; let stop = false;
    async function load() {
      const res = await fetch(`/api/reports/${id}`);
      if (stop) return;
      if (!res.ok) { setState({ notFound: true }); return; }
      const body = await res.json();
      if (body.state === 'report') { setState({ report: body.report }); return; }
      setState({ job: body.job });
      if (body.job.status === 'running') {
        source = new EventSource(`/api/reports/${id}/events`);
        source.onmessage = (e) => {
          const job = JSON.parse(e.data);
          setState({ job });
          if (job.status === 'complete') { source.close(); load(); }
          if (job.status === 'failed' || job.status === 'cancelled') source.close();
        };
      } else if (body.job.status === 'complete') setTimeout(load, 500);
    }
    load().catch(() => setState({ notFound: true }));
    return () => { stop = true; source?.close(); };
  }, [id]);

  if (state.report) return <DataReport report={state.report} />;
  if (state.notFound) return <Centered><p className="text-muted">This report could not be found. <a href="#/reports">See all reports</a>.</p></Centered>;
  if (state.job) return <Progress job={state.job} />;
  return <Centered><Loader2 className="animate-spin text-muted" aria-label="Loading" /></Centered>;
}

const Centered = ({ children }) => <main className="max-w-2xl mx-auto px-4 py-20 text-center">{children}</main>;

function Progress({ job }) {
  const done = job.stages.filter((s) => s.status === 'done').length;
  const [cancelling, setCancelling] = useState(false);
  async function cancel() {
    setCancelling(true);
    const res = await fetch(`/api/reports/${job.id}/cancel`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) setCancelling(false);
  }
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-serif text-2xl font-semibold text-ink">{{ failed: 'The report could not be completed', cancelled: 'Report cancelled' }[job.status] || 'Retrieving official data'}</h1>
      <p className="mt-1 text-muted break-all">UK SIC {job.input.sic}{job.input.companyName ? `, ${job.input.companyName}` : ''}</p>
      {job.status === 'failed' && (
        <div role="alert" className="mt-5 bg-bad-soft text-bad rounded px-4 py-3 text-sm">
          {job.error} <a href="#/" className="underline font-medium">Start again</a>.
        </div>
      )}
      {job.status === 'cancelled' && <p role="status" className="mt-5 text-sm text-muted"><a href="#/" className="underline font-medium">Start a new report</a>.</p>}
      <ol className="mt-7 bg-surface border border-rule rounded-md divide-y divide-rule" aria-live="polite">
        {job.stages.map((s, i) => (
          <li key={s.id} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 w-5 flex justify-center" aria-hidden="true">
              {s.status === 'done' ? <Check size={17} className="text-good" /> : s.status === 'running' ? <Loader2 size={17} className="animate-spin text-accent" /> : s.status === 'failed' ? <CircleAlert size={17} className="text-bad" /> : <span className="text-[13px] text-faint tabular">{i + 1}</span>}
            </span>
            <div className="min-w-0">
              <div className={`text-[15px] ${s.status === 'pending' ? 'text-faint' : 'text-ink font-medium'}`}>{s.label}</div>
              {s.status === 'running' && s.detail && <div className="text-[13px] text-muted mt-0.5">{s.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
      {job.status === 'running' && <p className="mt-4 text-[13px] text-muted">Stage {Math.min(done + 1, job.stages.length)} of {job.stages.length}. You can leave this page and find the finished report under Reports.</p>}
      {job.status === 'running' && <button type="button" onClick={cancel} disabled={cancelling} className="mt-4 w-full sm:w-auto h-11 px-4 rounded border border-rule-strong bg-surface text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50">{cancelling ? 'Cancelling…' : 'Cancel report'}</button>}
    </main>
  );
}
