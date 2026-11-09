// GOV.UK official statistics and sector publications, found through its public search API.
import { DAY, fetchJson, fetchResource } from '../lib/http.js';
import { parseHtml, parsePdf, selectRelevant } from '../lib/text.js';

/** Fetch and parse a page or PDF. Returns null when the source has little text. */
async function readDocument(url, keywords, maxChars) {
  const res = await fetchResource(url, { ttlMs: DAY, maxBytes: 15_000_000 });
  const isPdf = /pdf/i.test(res.contentType) || /\.pdf($|\?)/i.test(res.url);
  if (isPdf) {
    const pdf = await parsePdf(res.body);
    if (pdf.text.length < 400) return null;
    return { url: res.url, text: selectRelevant(pdf.text, keywords, maxChars), fetchedAt: res.fetchedAt };
  }
  if (!/html|xml|text\/plain/i.test(res.contentType)) return null;
  const doc = parseHtml(res.body.toString('utf8'), res.url);
  if (doc.text.length < 400) return null;
  return { url: res.url, text: selectRelevant(doc.text, keywords, maxChars), fetchedAt: res.fetchedAt };
}

export const govUk = {
  id: 'govuk',
  label: 'GOV.UK publications',
  appliesTo: (ctx) => ctx.market.isUK,
  async collect(ctx) {
    const industry = ctx.classification.primaryIndustry;
    const queries = [
      ['business population estimates', ['population']],
      ['company insolvency statistics', ['survival']],
      [`${ctx.classification.primarySector} sector`, ['policy', 'challenges']],
      [`${industry} regulation`, ['policy', 'challenges']],
    ];
    for (const [q, topics] of queries) {
      try {
        const url = `https://www.gov.uk/api/search.json?q=${encodeURIComponent(q)}&count=4&order=-public_timestamp&fields=title,link,public_timestamp,description,format&filter_content_store_document_type=${encodeURIComponent('official_statistics')}`;
        const fallback = `https://www.gov.uk/api/search.json?q=${encodeURIComponent(q)}&count=4&fields=title,link,public_timestamp,description,format`;
        const useStats = topics.includes('population') || topics.includes('survival');
        const { json } = await fetchJson(useStats ? url : fallback, { ttlMs: DAY });
        for (const r of (json.results || []).slice(0, 2)) {
          const doc = await readDocument(`https://www.gov.uk${r.link}`, ctx.keywords, 4500).catch(() => null);
          if (doc) {
            ctx.ledger.add({ org: 'UK Government', tier: 1, kind: 'page', provider: 'govuk', title: r.title, url: doc.url, publishedDate: r.public_timestamp?.slice(0, 10), retrievedAt: doc.fetchedAt, topics, text: doc.text });
          }
        }
      } catch (e) { ctx.ledger.gap('GOV.UK', `Search for "${q}" failed (${e.reason || 'error'}).`); }
    }
  },
};
