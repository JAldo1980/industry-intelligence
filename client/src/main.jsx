import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { NewReport } from './NewReport.jsx';
import { History } from './History.jsx';
import { ReportPage } from './ReportPage.jsx';

const AVATAR_URL = 'https://james-alderman-developer-portfolio.netlify.app/james.webp';

function Avatar() {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="w-9 h-9 rounded-full bg-brand text-ink text-xs font-semibold flex items-center justify-center" aria-hidden="true">JA</span>;
  return <img src={AVATAR_URL} alt="James Alderman" width="36" height="36" onError={() => setFailed(true)} className="w-9 h-9 rounded-full object-cover ring-2 ring-brand" />;
}

function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function Header({ route }) {
  const link = (href, label, active) => (
    <a href={href} aria-current={active ? 'page' : undefined} className={`inline-flex items-center min-h-11 lg:min-h-8 text-sm no-underline px-1 ${active ? 'text-ink font-semibold' : 'text-muted hover:text-ink'}`}>{label}</a>
  );
  return (
    <header className="no-print bg-surface border-b border-rule">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-14 pt-2 sm:pt-0 flex flex-wrap items-center justify-between">
        <a href="#/" className="no-underline flex items-center gap-2.5 min-w-0 min-h-11">
          <Avatar />
          <span className="font-serif text-lg font-semibold text-ink tracking-tight leading-tight">Industry Intelligence</span>
        </a>
        <nav className="flex gap-5 w-full sm:w-auto">
          {link('#/', 'New report', route === '' || route === '#/')}
          {link('#/reports', 'Reports', route.startsWith('#/report'))}
        </nav>
      </div>
    </header>
  );
}

function App() {
  const route = useRoute();
  const match = route.match(/^#\/report\/([0-9a-f-]{36})/);
  return (
    <div className="min-h-dvh flex flex-col">
      <Header route={route} />
      <div className="flex-1 min-w-0">
        {match ? <ReportPage key={match[1]} id={match[1]} /> : route.startsWith('#/reports') ? <History /> : <NewReport />}
      </div>
      <footer className="border-t border-rule py-5 px-4 text-center text-[13px] text-muted">Designed by James Alderman 2026</footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
