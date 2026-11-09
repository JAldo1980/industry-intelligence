import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileText, Printer } from 'lucide-react';

export function Toolbar({ report }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(report.sources.map((s) => `[${s.n}] ${s.organisation}: ${s.title} ${s.url}`).join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  const btn = 'inline-flex items-center gap-1.5 h-11 lg:h-9 px-3 rounded border border-rule-strong bg-surface text-[13px] font-medium text-ink no-underline hover:bg-canvas';
  return (
    <div className="no-print flex flex-wrap gap-2">
      <a className={btn} href={`/api/reports/${report.id}/export.pdf`}><Download size={15} aria-hidden="true" />Download PDF</a>
      <a className={btn} href={`/api/reports/${report.id}/key-findings.md`}><FileText size={15} aria-hidden="true" />Key findings</a>
      <button className={btn} onClick={copy}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? 'Copied' : 'Copy source links'}</button>
      <button className={btn} onClick={() => window.print()}><Printer size={15} aria-hidden="true" />Print</button>
    </div>
  );
}

export function useScrollSpy(items) {
  const [active, setActive] = useState(items[0][0]);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-10% 0px -75% 0px' });
    items.forEach(([id]) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [items]);
  return active;
}
