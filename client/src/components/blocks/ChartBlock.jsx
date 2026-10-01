import { ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

const SERIES_COLORS = ['#6366f1', '#f97316', '#10b981', '#ec4899', '#0ea5e9', '#eab308'];

// CSV: first row = headers. First column = X axis label, remaining columns = numeric series.
export function parseCsv(text) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { keys: [], rows: [], x: '' };
  const headers = lines[0].split(',').map((h) => h.trim());
  const [x, ...keys] = headers;
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = { [x]: cells[0] };
    keys.forEach((k, i) => { row[k] = Number(cells[i + 1]) || 0; });
    return row;
  });
  return { keys, rows, x };
}

export function ChartView({ block }) {
  const { keys, rows, x } = parseCsv(block.content);
  if (!rows.length) return <div className="muted">No data — edit the block and add CSV data.</div>;
  const type = block.chartType || 'bar';
  const common = { data: rows, margin: { top: 10, right: 20, left: 0, bottom: 5 } };
  const axes = [
    <CartesianGrid key="g" strokeDasharray="3 3" stroke="#94a3b855" />,
    <XAxis key="x" dataKey={x} tick={{ fill: "#94a3b8", fontSize: 12 }} />,
    <YAxis key="y" tick={{ fill: "#94a3b8", fontSize: 12 }} />,
    <Tooltip key="t" contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />,
    <Legend key="l" />,
  ];
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={280}>
        {type === 'line' ? (
          <LineChart {...common}>
            {axes}
            {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={SERIES_COLORS[i % 6]} strokeWidth={2.5} dot={{ r: 3 }} />)}
          </LineChart>
        ) : type === 'area' ? (
          <AreaChart {...common}>
            {axes}
            {keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stroke={SERIES_COLORS[i % 6]} fill={SERIES_COLORS[i % 6]} fillOpacity={0.2} />)}
          </AreaChart>
        ) : (
          <BarChart {...common}>
            {axes}
            {keys.map((k, i) => <Bar key={k} dataKey={k} fill={SERIES_COLORS[i % 6]} radius={[4, 4, 0, 0]} />)}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartEdit({ block, onChange }) {
  return (
    <div className="split-edit">
      <div>
        <div className="edit-row">
          <label>
            Chart type{' '}
            <select value={block.chartType || 'bar'} onChange={(e) => onChange({ chartType: e.target.value })}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="area">Area</option>
            </select>
          </label>
        </div>
        <textarea
          className="mono-area"
          rows={8}
          value={block.content}
          placeholder={'label,Series A,Series B\nJan,10,20\nFeb,15,25'}
          onChange={(e) => onChange({ content: e.target.value })}
        />
        <div className="muted small">CSV: first row = headers, first column = X-axis labels, other columns = numbers.</div>
      </div>
      <div className="preview-pane">
        <div className="muted small">Live preview</div>
        <ChartView block={block} />
      </div>
    </div>
  );
}
