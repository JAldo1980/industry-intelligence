import { useEffect, useState } from 'react';
import { ukDate } from './format.js';

export function History() {
  const [reports, setReports] = useState(null);
  useEffect(() => { fetch('/api/reports').then((r) => r.json()).then(setReports).catch(() => setReports([])); }, []);
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-serif text-2xl font-semibold text-ink">Previous reports</h1>
      {reports && !reports.length && <p className="mt-4 text-muted">No reports yet. <a href="#/">Generate your first one.</a></p>}
      {reports?.length > 0 && (
        <div className="mt-6 bg-surface border border-rule rounded-md overflow-x-auto">
          <table className="stack-table w-full text-sm min-w-[640px]">
            <thead><tr className="text-left text-muted border-b border-rule">
              {['Report', 'Industry', 'Sources', 'Date'].map((h) => <th key={h} className="font-medium px-4 py-2.5">{h}</th>)}
            </tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-rule last:border-0 hover:bg-canvas">
                  <td className="px-4 py-3"><a className="font-medium inline-block py-2 sm:py-0" href={`#/report/${r.id}`}>{r.businessName}</a></td>
                  <td data-label="Industry" className="px-4 py-3">{r.industry}</td>
                  <td data-label="Sources" className="px-4 py-3 tabular">{r.sources}</td>
                  <td data-label="Date" className="px-4 py-3 tabular whitespace-nowrap">{ukDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
