import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { cancelReport, canStart, getJob, listReports, loadReport, publicJob, startReport, validId } from './lib/store.js';
import { keyFindingsMarkdown, reportPdf } from './lib/export.js';
import { lookupCompanies } from './providers/companieshouse.js';
import { SIC_DIVISIONS, divisionName } from './lib/sic.js';
import { requirePassword } from './lib/auth.js';

if (config.hosted && !config.password) {
  console.error('APP_PASSWORD must be set when the app is hosted. Add it in the host\'s environment settings.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (config.hosted) app.set('trust proxy', 1); // so rate limits see each visitor, not the host's proxy
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https://james-alderman-developer-portfolio.netlify.app'], upgradeInsecureRequests: null } } }));
if (config.password) {
  // Only failed sign-ins count, which slows password guessing without affecting normal use.
  app.use(rateLimit({ windowMs: 900_000, limit: 50, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: 'Too many failed sign-ins. Try again later.' }));
  app.use(requirePassword(config.password));
}
app.use(express.json({ limit: '32kb' }));

const createLimiter = rateLimit({
  windowMs: 3_600_000, limit: config.reportsPerHour, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Report limit reached for this hour. Try again later.' },
});

const lookupLimiter = rateLimit({
  windowMs: 3_600_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many lookups this hour. Try again later.' },
});

const short = (v, max) => String(v ?? '').trim().slice(0, max);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/sic-divisions', (_req, res) => res.json(SIC_DIVISIONS.map(([code, name]) => ({ code, name }))));

app.get('/api/company-lookup', lookupLimiter, async (req, res) => {
  const q = short(req.query.q, 120);
  if (q.length < 2) return res.status(400).json({ error: 'Enter a company name.' });
  try {
    return res.json(await lookupCompanies(q));
  } catch {
    return res.status(502).json({ error: 'Companies House could not be reached. Choose an industry from the list instead.' });
  }
});

app.post('/api/reports', createLimiter, (req, res) => {
  if (!canStart()) return res.status(429).json({ error: 'Reports are already running at capacity. Try again when one finishes.' });
  const sic = short(req.body?.sic, 8).replace(/\D/g, '');
  const hs = short(req.body?.hs, 2).replace(/\D/g, '');
  const years = Number(req.body?.researchYears) || 5;
  if (sic.length < 2 || sic.length > 5 || !divisionName(sic.slice(0, 2))) return res.status(400).json({ error: 'Choose an industry, or enter a valid UK SIC code.' });
  if (![3, 4, 5].includes(years)) return res.status(400).json({ error: 'Invalid chart period.' });
  const job = startReport({ sic, hs: hs || null, companyName: short(req.body?.companyName, 120) || null, researchYears: years });
  return res.status(202).json({ id: job.id });
});

app.get('/api/reports', async (_req, res) => res.json(await listReports()));

app.get('/api/reports/:id', async (req, res) => {
  const job = getJob(req.params.id);
  if (job && job.status !== 'complete') return res.json({ state: 'job', job: publicJob(job) });
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  return res.json({ state: 'report', report });
});

app.get('/api/reports/:id/events', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (state) => res.write(`data: ${JSON.stringify(state)}\n\n`);
  send(publicJob(job));
  if (job.status !== 'running') return res.end();
  const onUpdate = (state) => { send(state); if (state.status !== 'running') res.end(); };
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  job.events.on('update', onUpdate);
  req.on('close', () => { clearInterval(ping); job.events.off('update', onUpdate); });
  return undefined;
});

app.post('/api/reports/:id/cancel', (req, res) => (cancelReport(req.params.id) ? res.json({ cancelled: true }) : res.status(409).json({ error: 'This report is not running.' })));

const fileName = (r, ext) => `${r.overview.identifiedIndustry.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60)}-${r.overview.researchDate}.${ext}`;

app.get('/api/reports/:id/export.pdf', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).end();
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName(report, 'pdf')}"` });
  reportPdf(report, res);
  return undefined;
});

app.get('/api/reports/:id/key-findings.md', async (req, res) => {
  const report = await loadReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  res.set({ 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="key-findings-${fileName(report, 'md')}"` });
  return res.send(keyFindingsMarkdown(report));
});

const dist = path.join(config.root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'Something went wrong on the server.' });
});

app.listen(config.port, config.host, () => {
  console.log(`Industry Intelligence on http://${config.host}:${config.port}`);
});
