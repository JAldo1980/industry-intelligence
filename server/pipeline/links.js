import { fetchResource, mapLimit } from '../lib/http.js';

/** Confirm links still resolve. A source that fails is kept and flagged, so a reader can judge it. */
export async function checkLinks(sources) {
  await mapLimit(sources, 6, async (s) => {
    try {
      await fetchResource(s.url, { ttlMs: 3_600_000, maxBytes: 30_000_000, timeoutMs: 15000 });
      s.linkStatus = 'ok';
    } catch (e) { s.linkStatus = e.reason === 'paywall' ? 'restricted' : e.reason === 'too_large' ? 'ok' : 'failed'; }
  });
}
