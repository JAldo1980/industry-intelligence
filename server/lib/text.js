import * as cheerio from 'cheerio';
import { extractText as pdfExtract, getDocumentProxy } from 'unpdf';

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 1990 || d.getTime() > Date.now() + 86400000 * 2) return null;
  return d.toISOString().slice(0, 10);
}

function findPublishedDate($, text) {
  const metas = ['article:published_time', 'datePublished', 'date', 'DC.date.issued', 'dcterms.created', 'publication_date', 'pubdate', 'citation_publication_date'];
  for (const m of metas) {
    const v = $(`meta[property="${m}"],meta[name="${m}"],meta[itemprop="${m}"]`).attr('content');
    const iso = toIsoDate(v);
    if (iso) return iso;
  }
  let found = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    const m = ($(el).html() || '').match(/"datePublished"\s*:\s*"([^"]+)"/);
    if (m) found = toIsoDate(m[1]);
  });
  if (found) return found;
  const timeAttr = toIsoDate($('time[datetime]').first().attr('datetime'));
  if (timeAttr) return timeAttr;
  const labelled = text.slice(0, 3000).match(new RegExp(`(?:release date|published|updated|last updated)\\s*:?\\s*(\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\s+\\d{4})`, 'i'));
  return labelled ? toIsoDate(labelled[1]) : null;
}

export function parseHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || $('h1').first().text() || '').replace(/\s+/g, ' ').trim();
  const description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim();

  const links = [];
  $('a[href]').each((_, el) => {
    try {
      const href = new URL($(el).attr('href'), baseUrl);
      if (['http:', 'https:'].includes(href.protocol)) {
        href.hash = '';
        links.push({ url: href.href, text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 120) });
      }
    } catch { /* malformed href */ }
  });

  $('script,style,noscript,svg,iframe,form,template,nav,footer,header,aside,[role=navigation],[role=banner],[role=contentinfo],.cookie,.cookies,#cookie-banner,[aria-hidden=true]').remove();
  const root = $('main').first().length ? $('main').first() : ($('article').first().length ? $('article').first() : $('body'));
  root.find('h1,h2,h3,h4,h5,h6,p,li,tr,div,section,br,td,th').each((_, el) => { $(el).append('\n'); });
  root.find('td,th').each((_, el) => { $(el).append(' | '); });
  const text = root.text().replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
  return { title, description, text, links, publishedDate: findPublishedDate($, text) };
}

export async function parsePdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await pdfExtract(pdf, { mergePages: true });
  const info = await pdf.getMetadata().catch(() => null);
  const clean = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  return { totalPages, text: clean, title: info?.info?.Title || '', publishedDate: pdfDate(info?.info?.CreationDate) };
}

function pdfDate(raw) {
  const m = String(raw || '').match(/D:(\d{4})(\d{2})(\d{2})/);
  return m ? toIsoDate(`${m[1]}-${m[2]}-${m[3]}`) : null;
}

/** Keep the paragraphs most useful for the topic, in original order, always keeping the opening. */
export function selectRelevant(text, keywords, maxChars = 5000) {
  if (text.length <= maxChars) return text;
  const paras = text.split('\n').map((p) => p.trim()).filter((p) => p.length > 25);
  const terms = [...new Set(keywords.flatMap((k) => String(k).toLowerCase().split(/[^a-z0-9]+/)).filter((t) => t.length > 3))];
  const scored = paras.map((p, i) => {
    const low = p.toLowerCase();
    let score = terms.reduce((s, t) => s + (low.includes(t) ? 1 : 0), 0);
    if (/\d/.test(p)) score += 1;
    if (/[£$€%]|per cent|billion|million/.test(low)) score += 2;
    if (i < 3) score += 3;
    return { p, i, score };
  });
  const picked = [];
  let used = 0;
  for (const item of [...scored].sort((a, b) => b.score - a.score)) {
    if (used + item.p.length > maxChars) continue;
    picked.push(item);
    used += item.p.length + 1;
  }
  return picked.sort((a, b) => a.i - b.i).map((x) => x.p).join('\n');
}

export const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
