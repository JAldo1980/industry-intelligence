import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { DATA_STAGES, runDataPipeline } from '../pipeline/dataOnly.js';

const dir = () => path.join(config.dataDir, 'reports');
const ID = /^[0-9a-f-]{36}$/;
export const validId = (id) => ID.test(String(id));

const jobs = new Map();
let running = 0;

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file);
}

export async function listReports() {
  try {
    const files = (await fs.readdir(dir())).filter((f) => f.endsWith('.meta.json'));
    const metas = await Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(path.join(dir(), f), 'utf8'))));
    return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}

export async function loadReport(id) {
  if (!validId(id)) return null;
  try { return JSON.parse(await fs.readFile(path.join(dir(), `${id}.json`), 'utf8')); } catch { return null; }
}

export function getJob(id) { return jobs.get(id); }

export function publicJob(job) {
  const { events, ...rest } = job;
  return rest;
}

export const canStart = () => running < config.maxConcurrentReports;

/** Stops showing a running report and discards its result. Retrieval already under way finishes quietly. */
export function cancelReport(id) {
  const job = jobs.get(id);
  if (!job || job.status !== 'running') return false;
  job.status = 'cancelled';
  job.stages.filter((s) => s.status === 'running').forEach((s) => { s.status = 'failed'; });
  job.events.emit('update', publicJob(job));
  return true;
}

export function startReport(input) {
  const id = crypto.randomUUID();
  const job = {
    id, status: 'running', input, error: null, createdAt: new Date().toISOString(),
    stages: DATA_STAGES.map((s) => ({ ...s, status: 'pending', detail: null })),
    events: new EventEmitter(),
  };
  job.events.setMaxListeners(50);
  jobs.set(id, job);
  running++;

  const emit = (event) => {
    if (job.status === 'cancelled') return;
    if (event.type === 'stage') {
      const s = job.stages.find((x) => x.id === event.id);
      if (s) { s.status = event.status; if (event.detail) s.detail = event.detail; }
    }
    job.events.emit('update', publicJob(job));
  };

  runDataPipeline(input, emit).then(async (report) => {
    if (job.status === 'cancelled') return;
    await writeJson(path.join(dir(), `${id}.json`), { id, createdAt: job.createdAt, input, ...report });
    await writeJson(path.join(dir(), `${id}.meta.json`), {
      id, createdAt: job.createdAt, businessName: report.overview.title, industry: report.overview.identifiedIndustry, market: report.overview.market, sources: report.sources.length,
    });
    job.status = 'complete';
  }).catch((error) => {
    if (job.status === 'cancelled') return;
    console.error(`[report ${id}]`, error?.message);
    job.status = 'failed';
    job.error = error?.message || 'The report could not be completed.';
    const active = job.stages.find((s) => s.status === 'running');
    if (active) active.status = 'failed';
  }).finally(() => {
    running--;
    job.events.emit('update', publicJob(job));
    setTimeout(() => jobs.delete(id), 3_600_000).unref();
  });
  return job;
}
