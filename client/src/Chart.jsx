import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Fixed categorical order, led by the portfolio blue and a chart-legible gold. Validated for colour-vision deficiency against the cream surface.
const SERIES_COLORS = ['#1C5B8E', '#B5820B', '#0E9474', '#8A63B8'];
const fmt = (v) => (typeof v !== 'number' ? v : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : Number(v.toFixed(1)).toString());
const axis = { fontSize: 12, fill: '#4A5260' };

function ChartTooltip({ active, payload, label, unit, series }) {
  if (!active || !payload?.length) return null;
  const forecast = payload[0]?.payload?.forecast;
  return (
    <div className="bg-surface border border-rule-strong rounded px-3 py-2 text-[13px] shadow-sm">
      <div className="font-medium text-ink">{label}{forecast ? ' (published projection)' : ''}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-body mt-0.5">
          {series.length > 1 && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />}
          {series.length > 1 && <span>{series.find((s) => s.key === p.dataKey)?.name}:</span>}
          <span className="tabular font-medium">{fmt(p.value)}</span>
        </div>
      ))}
      <div className="text-muted text-xs mt-1">{unit}</div>
    </div>
  );
}

export function Chart({ chart }) {
  const [table, setTable] = useState(false);
  const { data, series, kind, unit, title, hasForecast, period } = chart;
  const interval = Math.max(0, Math.ceil(data.length / 7) - 1);
  const margin = { top: 8, right: 24, bottom: 0, left: 4 };
  const common = [
    <CartesianGrid key="g" vertical={false} stroke="#E7E2D6" />,
    <XAxis key="x" dataKey="period" tick={axis} tickLine={false} axisLine={{ stroke: '#BEBBB4' }} interval={interval} minTickGap={12} />,
    <YAxis key="y" tick={axis} tickLine={false} axisLine={false} tickFormatter={fmt} width={54} domain={kind === 'bar' ? [(m) => Math.min(0, m), 'auto'] : ['auto', 'auto']} />,
    <Tooltip key="t" content={<ChartTooltip unit={unit} series={series} />} cursor={kind === 'bar' ? { fill: '#EAE4D6' } : { stroke: '#666D79' }} />,
  ];
  return (
    <figure className="avoid-break border border-rule rounded-md p-4 my-5">
      <div className="flex justify-between gap-3 items-start">
        <div>
          <figcaption className="font-semibold text-ink text-[15px]">{title}</figcaption>
          <div className="text-[13px] text-muted">{unit}. {period}.</div>
        </div>
        <button onClick={() => setTable((t) => !t)} className="no-print min-h-11 lg:min-h-0 -mt-3 lg:mt-0 px-1 text-[13px] text-accent whitespace-nowrap hover:underline">{table ? 'Show chart' : 'Show data'}</button>
      </div>

      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[13px] text-body">
          {series.map((s, i) => <li key={s.key} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES_COLORS[i % 4] }} aria-hidden="true" />{s.name}</li>)}
        </ul>
      )}
      {hasForecast && (
        <div className="flex items-center gap-4 mt-2 text-[13px] text-body">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES_COLORS[0] }} aria-hidden="true" />Historical</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-dashed" style={{ background: `${SERIES_COLORS[0]}33`, borderColor: SERIES_COLORS[0] }} aria-hidden="true" />Published projection</span>
        </div>
      )}

      {table ? (
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-[13px] tabular">
            <thead><tr className="text-left text-muted border-b border-rule"><th className="py-1 pr-4 font-medium">Period</th>{series.map((s) => <th key={s.key} className="py-1 pr-4 font-medium">{s.name}</th>)}</tr></thead>
            <tbody>{data.map((d) => <tr key={d.period} className="border-b border-rule last:border-0"><td className="py-1 pr-4">{d.period}{d.forecast ? ' (projection)' : ''}</td>{series.map((s) => <td key={s.key} className="py-1 pr-4">{d[s.key] === undefined ? 'n/a' : fmt(d[s.key])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="h-60 mt-3" role="img" aria-label={`${title}. ${unit}. ${period}.`}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === 'bar' ? (
              <BarChart data={data} margin={margin} barCategoryGap="25%" barGap={2}>
                {common}
                {series.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} fill={SERIES_COLORS[i % 4]} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={40}>
                    {data.map((d) => <Cell key={d.period} fill={d.forecast ? `${SERIES_COLORS[i % 4]}33` : SERIES_COLORS[i % 4]} stroke={d.forecast ? SERIES_COLORS[i % 4] : 'none'} strokeDasharray={d.forecast ? '3 2' : undefined} />)}
                  </Bar>
                ))}
              </BarChart>
            ) : (
              <LineChart data={data} margin={margin}>
                {common}
                {series.map((s, i) => <Line key={s.key} dataKey={s.key} stroke={SERIES_COLORS[i % 4]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls activeDot={{ r: 4 }} />)}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-2 text-xs text-muted">
        Source: <a href={`#source-${chart.source.n}`} className="tabular">[{chart.source.n}]</a> {chart.source.organisation}, retrieved data. Plotted directly from the published figures.
      </div>
    </figure>
  );
}
