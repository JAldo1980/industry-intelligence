// All outbound research traffic goes through this module. It enforces:
//  - no requests to private/loopback addresses (the URL comes from the user or from crawled pages)
//  - robots.txt, per-host politeness, timeouts and size limits
//  - a file cache so repeat runs do not re-request the same resource
// It deliberately does NOT retry with a different identity when a site refuses access.
import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import robotsParser from 'robots-parser';
import { config } from '../config.js';

const cacheDir = () => path.join(config.dataDir, 'cache', 'http');
export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export class FetchError extends Error {
  constructor(message, { status = 0, reason = 'network', url } = {}) {
    super(message);
    this.status = status;
    this.reason = reason;
    this.url = url;
  }
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') ||
    v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

export function normaliseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new FetchError('A website URL is required', { reason: 'invalid' });
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new FetchError(`"${raw}" is not a valid URL`, { reason: 'invalid' });
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new FetchError('Only http and https URLs are supported', { reason: 'invalid' });
  if (url.username || url.password) throw new FetchError('URLs containing credentials are not accepted', { reason: 'invalid' });
  if (!url.hostname.includes('.')) throw new FetchError(`"${url.hostname}" is not a public website address`, { reason: 'invalid' });
  url.hash = '';
  return url;
}

export async function assertPublicUrl(url) {
  const u = typeof url === 'string' ? normaliseUrl(url) : url;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new FetchError(`Refusing to fetch internal host ${host}`, { reason: 'blocked', url: u.href });
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => {
    throw new FetchError(`Could not resolve ${host}`, { reason: 'dns', url: u.href });
  });
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new FetchError(`Refusing to fetch private address for ${host}`, { reason: 'blocked', url: u.href });
  }
  return u;
}

// --- politeness: one request at a time per host, with a small gap ---
const hostQueues = new Map();
function politely(host, fn, gapMs = 350) {
  const prev = hostQueues.get(host) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  hostQueues.set(host, run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, gapMs))));
  return run;
}

// --- robots.txt ---
const robotsCache = new Map();
async function robotsAllows(url) {
  const origin = url.origin;
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      try {
        const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const body = await res.text();
        return /^\s*(user-agent|disallow|allow)\s*:/im.test(body) ? robotsParser(`${origin}/robots.txt`, body) : null;
      } catch { return null; }
    })());
  }
  const robots = await robotsCache.get(origin);
  return !robots || robots.isAllowed(url.href, config.userAgent) !== false;
}

function cacheKey(url, extra) {
  return crypto.createHash('sha256').update(`${url}|${extra || ''}`).digest('hex');
}

async function readCache(key, ttlMs) {
  try {
    const meta = JSON.parse(await fs.readFile(path.join(cacheDir(), `${key}.json`), 'utf8'));
    if (Date.now() - meta.fetchedAt > ttlMs) return null;
    const body = await fs.readFile(path.join(cacheDir(), `${key}.bin`));
    return { ...meta, body, fromCache: true };
  } catch { return null; }
}

async function writeCache(key, result) {
  await fs.mkdir(cacheDir(), { recursive: true });
  const { body, ...meta } = result;
  await fs.writeFile(path.join(cacheDir(), `${key}.bin`), body);
  await fs.writeFile(path.join(cacheDir(), `${key}.json`), JSON.stringify(meta));
}

/**
 * Fetch a public resource. Returns { url, status, contentType, body: Buffer, fetchedAt, fromCache }.
 * Throws FetchError with `reason` of: invalid | blocked | robots | dns | network | timeout | paywall | http | too_large.
 */
export async function fetchResource(input, {
  ttlMs = DAY, timeoutMs = 25000, maxBytes = 12_000_000, accept = '*/*', headers = {}, noCacheKey = '', ignoreRobots = false,
} = {}) {
  const start = normaliseUrl(input);
  const key = cacheKey(start.href, noCacheKey);
  const cached = await readCache(key, ttlMs);
  if (cached) return cached;

  let current = start;
  let rateLimitRetries = 0;
  for (let hop = 0; hop < 8; hop++) {
    await assertPublicUrl(current);
    if (!ignoreRobots && !(await robotsAllows(current))) {
      throw new FetchError(`robots.txt disallows ${current.href}`, { reason: 'robots', url: current.href });
    }
    const gap = /(^|\.)ons\.gov\.uk$/.test(current.hostname) ? 900 : 350;
    const res = await politely(current.host, () => fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': config.userAgent, Accept: accept, 'Accept-Language': 'en-GB,en;q=0.8', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    }), gap).catch((e) => {
      const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
      throw new FetchError(`${timeout ? 'Timed out' : 'Network error'} fetching ${current.href}`, { reason: timeout ? 'timeout' : 'network', url: current.href });
    });

    // Back off when a server asks us to slow down.
    if ([429, 500, 502, 503, 504].includes(res.status) && rateLimitRetries < 3) {
      await res.body?.cancel();
      rateLimitRetries++;
      const asked = Number(res.headers.get('retry-after'));
      const waitMs = Math.min(Number.isFinite(asked) && asked > 0 ? asked * 1000 : 3000 * 2 ** rateLimitRetries, 30000);
      await new Promise((r) => setTimeout(r, waitMs));
      hop--;
      continue;
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel();
      current = new URL(res.headers.get('location'), current);
      continue;
    }
    if ([401, 402, 403, 407, 451].includes(res.status)) {
      await res.body?.cancel();
      throw new FetchError(`Access restricted (${res.status}) at ${current.href}`, { status: res.status, reason: 'paywall', url: current.href });
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchError(`HTTP ${res.status} at ${current.href}`, { status: res.status, reason: 'http', url: current.href });
    }
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new FetchError(`Resource too large at ${current.href}`, { reason: 'too_large', url: current.href });
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) throw new FetchError(`Resource too large at ${current.href}`, { reason: 'too_large', url: current.href });
      chunks.push(chunk);
    }
    const result = {
      url: current.href,
      requestedUrl: start.href,
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      lastModified: res.headers.get('last-modified') || null,
      fetchedAt: Date.now(),
      body: Buffer.concat(chunks),
    };
    await writeCache(key, result).catch(() => {});
    return result;
  }
  throw new FetchError(`Too many redirects from ${start.href}`, { reason: 'http', url: start.href });
}

export async function fetchText(url, opts) {
  const r = await fetchResource(url, opts);
  return { ...r, text: r.body.toString('utf8') };
}

export async function fetchJson(url, opts) {
  const r = await fetchText(url, { accept: 'application/json', ...opts });
  try {
    return { ...r, json: JSON.parse(r.text.replace(/^﻿/, '')) };
  } catch {
    throw new FetchError(`Invalid JSON from ${url}`, { reason: 'http', url });
  }
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}
