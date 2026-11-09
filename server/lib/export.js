// PDF and key-findings exports, built from the stored report.
import PDFDocument from 'pdfkit';

const COLOR = { ink: '#14181D', muted: '#4A5260', rule: '#D9D4C8', accent: '#1C5B8E', forecast: '#B5820B', series: ['#1C5B8E', '#B5820B', '#0E9474', '#8A63B8'] };
const PAGE = { margin: 54 };

const UK_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const ukDate = (value) => (/^\d{4}-\d{2}-\d{2}/.test(String(value)) ? UK_DATE.format(new Date(value)) : value);

const num = (v) => (typeof v === 'number' ? v.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : v);
const changeText = (c) => (c ? `${c.value > 0 ? '+' : ''}${num(c.value)}${c.unit === 'pts' ? ' pts' : '%'}` : 'n/a');

export function keyFindingsMarkdown(r) {
  const o = r.overview;
  return [
    `# Official data summary: ${o.identifiedIndustry} (SIC ${o.sic}), ${o.market}`, '',
    `Research date: ${ukDate(o.researchDate)}. Figures are retrieved from official sources.`, '',
    ...r.indicators.flatMap((g) => [`## ${g.name}`, '', '| Indicator | Latest | Period | 1-year change | 5-year change | Source |', '|---|---|---|---|---|---|',
      ...g.rows.map((x) => `| ${x.label} | ${num(x.latest)} ${x.unit} | ${x.period} | ${changeText(x.change1y)} | ${changeText(x.change5y)} | [${x.source}] |`), '']),
    '## Sources', '', ...r.sources.map((s) => `[${s.n}] ${s.organisation}, ${s.title}. ${s.url} (retrieved ${ukDate(s.retrievedAt)})`),
  ].join('\n');
}

export function reportPdf(r, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true, info: { Title: `Official data report: ${r.overview.identifiedIndustry}`, Author: 'Industry Intelligence Platform' } });
  doc.pipe(stream);
  const width = doc.page.width - PAGE.margin * 2;
  const bottom = () => doc.page.height - PAGE.margin - 18;
  const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
  const o = r.overview;
  const H1 = (t) => { doc.addPage(); doc.font('Helvetica-Bold').fontSize(17).fillColor(COLOR.ink).text(t); doc.moveDown(0.3); doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.margin + width, doc.y).lineWidth(0.8).strokeColor(COLOR.accent).stroke(); doc.moveDown(0.6); };
  const H2 = (t) => { ensure(50); doc.moveDown(0.4); doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.accent).text(t); doc.moveDown(0.2); };
  const P = (t) => { doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.ink).text(t, { lineGap: 2 }); doc.moveDown(0.4); };
  const charts = (section) => r.charts.filter((c) => c.section === section).forEach((c) => {
    ensure(205);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.ink).text(c.title);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.muted).text(`${c.unit}. ${c.period}.${c.hasForecast ? ' Paler bars are published projections.' : ''}${c.series.length > 1 ? ` Series: ${c.series.map((s, i) => `${['blue', 'gold', 'green', 'purple'][i % 4]} = ${s.name}`).join('; ')}.` : ''}`);
    const y = doc.y + 4;
    chart(doc, c, PAGE.margin, y, width, 150);
    doc.y = y + 153; doc.x = PAGE.margin;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.muted).text(`Source: [${c.source.n}] ${c.source.organisation}. ${c.url}`, { link: c.url });
    doc.moveDown(0.8);
  });

  doc.moveDown(6);
  doc.font('Helvetica').fontSize(11).fillColor(COLOR.accent).text('OFFICIAL DATA REPORT', { characterSpacing: 1.2 });
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(26).fillColor(COLOR.ink).text(o.identifiedIndustry);
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(13).fillColor(COLOR.muted).text(`UK SIC ${o.sic} · ${o.market} · ${ukDate(o.researchDate)}`);
  doc.moveDown(2);
  P('Every figure in this report is retrieved directly from an official source or calculated by simple arithmetic from those figures. It contains no AI analysis, commentary or forecasts of its own.');

  H1('Key indicators');
  const cols = [190, 90, 70, 68, 69]; // label, latest, period, 1y, 5y
  r.indicators.forEach((g) => {
    H2(g.name);
    const row = (vals, bold) => {
      ensure(26);
      const y = doc.y; let x = PAGE.margin; let h = 0;
      vals.forEach((v, i) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(bold ? COLOR.muted : COLOR.ink);
        const opts = { width: cols[i] - 6 };
        h = Math.max(h, doc.heightOfString(String(v), opts));
        doc.text(String(v), x, y, opts);
        x += cols[i];
      });
      doc.x = PAGE.margin; doc.y = y + h + 4;
      doc.moveTo(PAGE.margin, doc.y - 2).lineTo(PAGE.margin + width, doc.y - 2).lineWidth(0.3).strokeColor(COLOR.rule).stroke();
    };
    row(['Indicator', 'Latest', 'Period', '1-year', '5-year'], true);
    g.rows.forEach((x) => row([`${x.label} [${x.source}]`, `${num(x.latest)} ${x.unit}`, x.period, changeText(x.change1y), changeText(x.change5y)]));
  });
  [['Market size and structure', 'market'], ['Output and employment', 'performance'], ['International comparison', 'growth'], ['Investment and business churn', 'financial'], ['Economy and published projections', 'forecast']].forEach(([title, section]) => {
    if (r.charts.some((c) => c.section === section)) { H1(title); charts(section); }
  });
  if (r.projections) {
    H2('IMF projections (whole economy, not this industry)');
    r.projections.series.forEach((s) => P(`${s.name} (${s.unit}): ${s.points.map((p) => `${p.period}: ${p.value}`).join('; ')} [${r.projections.source}]`));
  }
  if (r.companies.length) {
    H1('Company record');
    P('One company is not representative of the industry.');
    r.companies.forEach((c) => P(`${c.name} (${c.number}). Status: ${c.status}. Incorporated: ${c.incorporated}. SIC: ${c.sic.join('; ')}. Latest accounts filing: ${c.accountsDescription || 'none found'}${c.filedOn ? `, filed ${c.filedOn}` : ''}. [${c.source}]`));
  }
  H1('Sources and data gaps');
  if (r.quality.dataGaps.length) { H2('Data gaps'); r.quality.dataGaps.forEach((g) => P(`${g.area}: ${g.detail}${g.fallback ? ` ${g.fallback}` : ''}`)); }
  H2('Sources');
  r.sources.forEach((s) => {
    ensure(46);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.ink).text(`[${s.n}] ${s.organisation}: `, { continued: true }).font('Helvetica').text(s.title);
    doc.fontSize(8).fillColor(COLOR.accent).text(s.url, { link: s.url });
    doc.fillColor(COLOR.muted).text(`Published ${ukDate(s.publishedDate) || 'not stated'}. Period ${s.period || 'not stated'}. Retrieved ${ukDate(s.retrievedAt)}.`);
    doc.moveDown(0.5);
  });
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.muted).text(`${o.identifiedIndustry} · ${ukDate(o.researchDate)} · Page ${i + 1} of ${range.count}`, PAGE.margin, doc.page.height - 36, { width, align: 'center', lineBreak: false });
  }
  doc.end();
}

function chart(doc, c, x, y, w, h) {
  const pad = { l: 46, r: 8, t: 8, b: 24 };
  const iw = w - pad.l - pad.r; const ih = h - pad.t - pad.b;
  const values = c.data.flatMap((d) => c.series.map((s) => d[s.key])).filter(Number.isFinite);
  if (!values.length) return;
  let min = Math.min(...values); let max = Math.max(...values);
  if (c.kind === 'bar') { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= c.kind === 'bar' ? 0 : span * 0.08; max += span * 0.08;
  const px = (i) => x + pad.l + (c.data.length === 1 ? iw / 2 : (i / (c.data.length - 1)) * iw);
  const barX = (i, k) => { const band = iw / c.data.length; const bw = (band * 0.75) / c.series.length; return x + pad.l + band * i + band * 0.125 + bw * k; };
  const py = (v) => y + pad.t + ih - ((v - min) / (max - min)) * ih;

  doc.font('Helvetica').fontSize(7).fillColor(COLOR.muted);
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4; const yy = py(v);
    doc.moveTo(x + pad.l, yy).lineTo(x + w - pad.r, yy).lineWidth(0.4).strokeColor(COLOR.rule).stroke();
    doc.text(fmt(v), x, yy - 3, { width: pad.l - 5, align: 'right', lineBreak: false });
  }
  const every = Math.max(1, Math.ceil(c.data.length / 7));
  c.data.forEach((d, i) => {
    if (i % every === 0) {
      const cx = c.kind === 'bar' ? barX(i, c.series.length / 2) : px(i);
      doc.fillColor(COLOR.muted).text(String(d.period), cx - 26, y + h - pad.b + 5, { width: 52, align: 'center', lineBreak: false });
    }
  });
  c.series.forEach((s, k) => {
    const col = COLOR.series[k % COLOR.series.length];
    if (c.kind === 'bar') {
      const bw = (iw / c.data.length * 0.75) / c.series.length;
      const zero = py(0);
      c.data.forEach((d, i) => {
        const v = d[s.key];
        if (!Number.isFinite(v)) return;
        const top = Math.min(py(v), zero);
        doc.rect(barX(i, k), top, bw, Math.abs(py(v) - zero)).fillOpacity(d.forecast ? 0.45 : 1).fill(d.forecast ? COLOR.forecast : col).fillOpacity(1);
      });
    } else {
      let started = false;
      c.data.forEach((d, i) => {
        const v = d[s.key];
        if (!Number.isFinite(v)) return;
        if (started) doc.lineTo(px(i), py(v)); else { doc.moveTo(px(i), py(v)); started = true; }
      });
      doc.lineWidth(1.4).strokeColor(col).stroke();
    }
  });
}

const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : Number(v.toFixed(1)).toString());
