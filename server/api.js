// Every API route, written against web-standard Request and Response so the same code runs on a PC and on Netlify.
import { PassThrough } from 'node:stream';
import { config } from './config.js';
import { cancelJob, createJob, failJob, getJob, listReports, loadReport, withinHourlyLimit } from './lib/store.js';
import { keyFindingsMarkdown, reportPdf } from './lib/export.js';
import { lookupCompanies } from './providers/companieshouse.js';
import { SIC_DIVISIONS, divisionName } from './lib/sic.js';
import { isAuthorised } from './lib/auth.js';

const json = (body, status = 200) => Response.json(body, { status });
const short = (v, max) => String(v ?? '').trim().slice(0, max);
const fileName = (r, ext) => `${r.overview.identifiedIndustry.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60)}-${r.overview.researchDate}.${ext}`;

function pdfBuffer(report) {
  return new Promise((resolve, reject) => {
    const out = new PassThrough();
    const chunks = [];
    out.on('data', (c) => chunks.push(c));
    out.on('end', () => resolve(Buffer.concat(chunks)));
    out.on('error', reject);
    reportPdf(report, out);
  });
}

async function startReport(request, startJob) {
  const body = await request.json().catch(() => ({}));
  const sic = short(body.sic, 8).replace(/\D/g, '');
  const hs = short(body.hs, 2).replace(/\D/g, '');
  const years = Number(body.researchYears) || 5;
  if (sic.length < 2 || sic.length > 5 || !divisionName(sic.slice(0, 2))) return json({ error: 'Choose an industry, or enter a valid UK SIC code.' }, 400);
  if (![3, 4, 5].includes(years)) return json({ error: 'Invalid chart period.' }, 400);
  if (!(await withinHourlyLimit('reports', config.reportsPerHour))) return json({ error: 'Report limit reached for this hour. Try again later.' }, 429);
  const job = await createJob({ sic, hs: hs || null, companyName: short(body.companyName, 120) || null, researchYears: years });
  try {
    await startJob(job.id, request);
  } catch (e) {
    console.error(`[report ${job.id}] could not start:`, e?.message);
    await failJob(job.id, 'The report could not be started. Please try again.');
  }
  return json({ id: job.id }, 202);
}

async function route(request, startJob) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const method = request.method;

  if (path === '/api/health') return json({ ok: true });
  if (config.password && !isAuthorised(request.headers.get('authorization'), config.password)) {
    return new Response('Password required.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Industry Intelligence", charset="UTF-8"' } });
  }

  if (method === 'GET' && path === '/api/sic-divisions') return json(SIC_DIVISIONS.map(([code, name]) => ({ code, name })));

  if (method === 'GET' && path === '/api/company-lookup') {
    const q = short(url.searchParams.get('q'), 120);
    if (q.length < 2) return json({ error: 'Enter a company name.' }, 400);
    if (!(await withinHourlyLimit('lookups', 60))) return json({ error: 'Too many lookups this hour. Try again later.' }, 429);
    try { return json(await lookupCompanies(q)); } catch { return json({ error: 'Companies House could not be reached. Choose an industry from the list instead.' }, 502); }
  }

  if (path === '/api/reports') {
    if (method === 'POST') return startReport(request, startJob);
    if (method === 'GET') return json(await listReports());
  }

  const match = path.match(/^\/api\/reports\/([^/]+)(?:\/(cancel|export\.pdf|key-findings\.md))?$/);
  if (match) {
    const [, id, action] = match;
    if (method === 'POST' && action === 'cancel') return (await cancelJob(id)) ? json({ cancelled: true }) : json({ error: 'This report is not running.' }, 409);
    if (method === 'GET' && !action) {
      const job = await getJob(id);
      if (job && job.status !== 'complete') return json({ state: 'job', job });
      const report = await loadReport(id);
      return report ? json({ state: 'report', report }) : json({ error: 'Report not found.' }, 404);
    }
    if (method === 'GET') {
      const report = await loadReport(id);
      if (!report) return json({ error: 'Report not found.' }, 404);
      if (action === 'export.pdf') return new Response(await pdfBuffer(report), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName(report, 'pdf')}"` } });
      return new Response(keyFindingsMarkdown(report), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="key-findings-${fileName(report, 'md')}"` } });
    }
  }
  return json({ error: 'Not found.' }, 404);
}

/** @param {{startJob: (id: string, request: Request) => Promise<void>}} host how this host begins a queued report */
export function createApi({ startJob }) {
  return async (request) => {
    try {
      return await route(request, startJob);
    } catch (e) {
      console.error(e);
      return json({ error: 'Something went wrong on the server.' }, 500);
    }
  };
}
