import crypto from 'node:crypto';
import { listKeys, readJson, writeJson } from './storage.js';
import { DATA_STAGES, runDataPipeline } from '../pipeline/dataOnly.js';

const ID = /^[0-9a-f-]{36}$/;
export const validId = (id) => ID.test(String(id));

const jobKey = (id) => `jobs/${id}.json`;
// Kept apart from the job record, which the running report keeps rewriting.
const cancelKey = (id) => `jobs/${id}.cancel.json`;
const ACTIVE = ['queued', 'running'];
const STALE_MS = 16 * 60_000; // longer than the 15-minute limit on a Netlify background function

export async function listReports() {
  const keys = (await listKeys('reports/')).filter((k) => k.endsWith('.meta.json'));
  const metas = await Promise.all(keys.map(readJson));
  return metas.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadReport(id) {
  return validId(id) ? readJson(`reports/${id}.json`) : null;
}

export async function getJob(id) {
  if (!validId(id)) return null;
  const job = await readJson(jobKey(id));
  if (!job || !ACTIVE.includes(job.status)) return job;
  if (await readJson(cancelKey(id))) {
    return { ...job, status: 'cancelled', stages: job.stages.map((s) => (s.status === 'running' ? { ...s, status: 'failed' } : s)) };
  }
  if (Date.now() - Date.parse(job.createdAt) > STALE_MS) {
    return { ...job, status: 'failed', error: 'The report took too long and was stopped. Please try again.' };
  }
  return job;
}

export async function createJob(input) {
  const job = {
    id: crypto.randomUUID(), status: 'queued', input, error: null, createdAt: new Date().toISOString(),
    stages: DATA_STAGES.map((s) => ({ ...s, status: 'pending', detail: null })),
  };
  await writeJson(jobKey(job.id), job);
  return job;
}

export async function failJob(id, error) {
  const job = await readJson(jobKey(id));
  if (job) await writeJson(jobKey(id), { ...job, status: 'failed', error });
}

/** Marks a report as cancelled. The run notices at its next stage and discards its result. */
export async function cancelJob(id) {
  const job = await getJob(id);
  if (!job || !ACTIVE.includes(job.status)) return false;
  await writeJson(cancelKey(id), { at: new Date().toISOString() });
  return true;
}

/** Runs a queued report through to a saved result. It never throws, so a host will not retry a finished run. */
export async function runJob(id) {
  const job = await getJob(id);
  if (!job || job.status !== 'queued') return;
  job.status = 'running';
  await writeJson(jobKey(id), job);

  let cancelled = false;
  let saves = Promise.resolve();
  const emit = (event) => {
    if (event.type !== 'stage') return;
    const stage = job.stages.find((s) => s.id === event.id);
    if (stage) { stage.status = event.status; if (event.detail) stage.detail = event.detail; }
    saves = saves.then(async () => {
      cancelled = cancelled || Boolean(await readJson(cancelKey(id)));
      if (!cancelled) await writeJson(jobKey(id), job);
    }).catch((e) => console.error(`[report ${id}] progress not saved:`, e?.message));
  };

  try {
    const report = await runDataPipeline(job.input, emit);
    await saves;
    if (cancelled || await readJson(cancelKey(id))) return;
    await writeJson(`reports/${id}.json`, { id, createdAt: job.createdAt, input: job.input, ...report });
    await writeJson(`reports/${id}.meta.json`, {
      id, createdAt: job.createdAt, businessName: report.overview.title, industry: report.overview.identifiedIndustry, market: report.overview.market, sources: report.sources.length,
    });
    job.status = 'complete';
    await writeJson(jobKey(id), job);
  } catch (error) {
    console.error(`[report ${id}]`, error?.message);
    await saves;
    if (cancelled) return;
    job.status = 'failed';
    job.error = error?.message || 'The report could not be completed.';
    const active = job.stages.find((s) => s.status === 'running');
    if (active) active.status = 'failed';
    await writeJson(jobKey(id), job).catch(() => {});
  }
}

/** A shared hourly allowance. Memory is not shared between function runs, so the count is stored. */
export async function withinHourlyLimit(name, limit) {
  const key = `limits/${name}-${new Date().toISOString().slice(0, 13)}.json`;
  const used = (await readJson(key))?.used || 0;
  if (used >= limit) return false;
  await writeJson(key, { used: used + 1 });
  return true;
}
