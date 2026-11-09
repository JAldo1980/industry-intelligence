// Saved reports and job progress. On a PC these are files; on Netlify they are Netlify Blobs,
// because each function run starts with an empty disk.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

let blobStore;
async function blobs() {
  if (!blobStore) {
    const { getStore } = await import('@netlify/blobs');
    blobStore = getStore({ name: 'industry-intelligence', consistency: 'strong' }); // progress must be readable straight after it is written
  }
  return blobStore;
}

const filePath = (key) => path.join(config.dataDir, key);

export async function readJson(key) {
  if (config.onNetlify) return (await blobs()).get(key, { type: 'json' });
  try { return JSON.parse(await fs.readFile(filePath(key), 'utf8')); } catch { return null; }
}

export async function writeJson(key, value) {
  if (config.onNetlify) { await (await blobs()).setJSON(key, value); return; }
  const file = filePath(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file);
}

/** Every key inside a folder-like prefix such as "reports/". */
export async function listKeys(prefix) {
  if (config.onNetlify) return (await (await blobs()).list({ prefix })).blobs.map((b) => b.key);
  try { return (await fs.readdir(filePath(prefix))).map((name) => `${prefix}${name}`); } catch { return []; }
}
