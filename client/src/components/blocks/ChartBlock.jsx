import { ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Zoomable } from '../ZoomViewer';

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

// Natural size of a chart in the zoom view; zooming re-draws it bigger (fonts and lines scale too).
const ZOOM_SIZE = { w: 900, h: 480 };

// One chart at an exact size. `scale` grows fonts, lines and margins with the zoom level.
function ChartSvg({ block, width, height, scale = 1, animate = true }) {
  const { keys, rows, x } = parseCsv(block.content);
  const type = block.chartType || 'bar';
  const k = (n) => n * scale;
  const tick = { fill: '#94a3b8', fontSize: k(12) };
  const common = { width, height, data: rows, margin: { top: k(10), right: k(20), left: 0, bottom: k(5) } };
  const axes = [
    <CartesianGrid key="g" strokeDasharray={`${k(3)} ${k(3)}`} stroke="#94a3b855" />,
    <XAxis key="x" dataKey={x} tick={tick} tickMargin={k(4)} height={k(30)} />,
    <YAxis key="y" tick={tick} width={k(60)} />,
    <Tooltip key="t" contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: Math.max(13, k(13)) }} />,
    <Legend key="l" iconSize={k(14)} wrapperStyle={{ fontSize: k(14) }} />,
  ];
  if (type === 'line') {
    return (
      <LineChart {...common}>
        {axes}
        {keys.map((key, i) => <Line key={key} type="monotone" dataKey={key} stroke={SERIES_COLORS[i % 6]} strokeWidth={k(2.5)} dot={{ r: k(3) }} activeDot={{ r: k(5) }} isAnimationActive={animate} />)}
      </LineChart>
    );
  }
  if (type === 'area') {
    return (
      <AreaChart {...common}>
        {axes}
        {keys.map((key, i) => <Area key={key} type="monotone" dataKey={key} stroke={SERIES_COLORS[i % 6]} strokeWidth={k(1.5)} fill={SERIES_COLORS[i % 6]} fillOpacity={0.2} isAnimationActive={animate} />)}
      </AreaChart>
    );
  }
  return (
    <BarChart {...common}>
      {axes}
      {keys.map((key, i) => <Bar key={key} dataKey={key} fill={SERIES_COLORS[i % 6]} radius={[k(4), k(4), 0, 0]} isAnimationActive={animate} />)}
    </BarChart>
  );
}

export function ChartView({ block }) {
  const { rows } = parseCsv(block.content);
  if (!rows.length) return <div className="muted">No data. Edit the block and add CSV data.</div>;
  const items = [{
    key: 'chart',
    title: block.title || 'Chart',
    size: ZOOM_SIZE,
    render: ({ width, height, scale }) => <ChartSvg block={block} width={width} height={height} scale={scale} animate={false} />,
  }];
  // no click-to-zoom on charts: clicking/hovering is for the tooltips
  return (
    <Zoomable items={items} clickToZoom={false} label="Zoom chart">
      <div className="chart">
        <ResponsiveContainer width="100%" height={280}>
          <ChartSvg block={block} />
        </ResponsiveContainer>
      </div>
    </Zoomable>
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
