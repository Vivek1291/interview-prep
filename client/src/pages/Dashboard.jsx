import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { useTree } from '../api/hooks';
import { useAuth } from '../auth/AuthProvider';
import { storage } from '../utils/storage';
import { pct } from '../utils/tree';

export default function Dashboard() {
  const { data: tree } = useTree();
  const { user, isAdmin } = useAuth();
  const last = storage.get(`lastVisited:${user?._id}`, null);
  const roots = tree?.roots || [];

  const total = roots.reduce((s, r) => ({
    total: s.total + r.stats.total, confident: s.confident + r.stats.confident,
    revise: s.revise + r.stats.revise, learning: s.learning + r.stats.learning, new: s.new + r.stats.new,
  }), { total: 0, confident: 0, revise: 0, learning: 0, new: 0 });

  const mustKnow = (tree?.pages || [])
    .filter((p) => p.priority === 3 && p.status !== 'confident')
    .slice(0, 12)
    .map((p) => ({ ...p, node: tree.byId.get(p.section) }));

  const chartData = roots.filter((r) => r.stats.total).map((r) => ({
    name: r.title, Confident: r.stats.confident, 'Needs revision': r.stats.revise, Learning: r.stats.learning, 'Not started': r.stats.new,
  }));

  return (
    <div className="page dashboard">
      <div className="hero">
        <div>
          <h1>👋 Hi {user?.name?.split(' ')[0]}</h1>
          <p className="muted">
            Learn Frontend, Backend, System Design, DevOps, Testing and DSA. Track your own progress on every page,
            add private notes, and create your own categories and pages anywhere in the tree.
          </p>
          {last && tree?.pageById.has(last.id) && <Link className="btn btn-primary" to={`/q/${last.id}`}>▶ Continue: {last.title}</Link>}
        </div>
        <div className="ring" style={{ '--pct': pct(total) }}>
          <div className="ring-inner"><strong>{pct(total)}%</strong><span>confident</span></div>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat"><span className="stat-n">{total.total}</span><span>Pages</span></div>
        <div className="stat s-confident"><span className="stat-n">{total.confident}</span><span>● Confident</span></div>
        <div className="stat s-revise"><span className="stat-n">{total.revise}</span><span>↻ Revise</span></div>
        <div className="stat s-learning"><span className="stat-n">{total.learning}</span><span>◐ Learning</span></div>
        <div className="stat s-new"><span className="stat-n">{total.new}</span><span>○ Not started</span></div>
      </div>

      <h2 className="list-title">Areas</h2>
      <div className="topic-grid">
        {roots.map((r) => (
          <Link key={r._id} to={`/c/${r._id}`} className="topic-card" style={{ '--sec': r.color }}>
            <div className="topic-head"><span className="topic-icon">{r.icon}</span><strong>{r.title}</strong>{r.owner && <span title="Private">🔒</span>}</div>
            <p className="muted small">{r.children.map((c) => c.title).slice(0, 5).join(' · ') || r.description}</p>
            <div className="topic-foot">
              <span className="muted small">{r.stats.total} pages</span>
              {r.stats.total > 0 && <span className="small">{pct(r.stats)}%</span>}
            </div>
            {r.stats.total > 0 && <div className="topic-bar"><div style={{ width: `${pct(r.stats)}%`, background: r.color }} /></div>}
          </Link>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>📊 My progress by area</h3>
          <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 40)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="Confident" stackId="a" fill="#10b981" />
              <Bar dataKey="Needs revision" stackId="a" fill="#f97316" />
              <Bar dataKey="Learning" stackId="a" fill="#6366f1" />
              <Bar dataKey="Not started" stackId="a" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>🔥 Must-know, not yet confident</h3>
          <div className="must-list">
            {mustKnow.map((p) => (
              <Link key={p._id} to={`/q/${p._id}`} className="must-item" style={{ borderLeftColor: p.node?.color }}>
                <span>{p.node?.icon}</span> {p.title}
              </Link>
            ))}
            {!mustKnow.length && <div className="muted">🎉 All must-know pages are marked confident!</div>}
          </div>
        </div>
      </div>

      <div className="card tips">
        <h3>✨ How to use the Learning Hub</h3>
        <ul>
          <li>Browse the tree on the left: <b>areas → technologies → topics → pages</b>, any depth. Click a category to see its overview.</li>
          <li>Hover a category and press <b>＋</b> to add a sub-category or a page. {isAdmin ? <>As an <b>admin</b>, what you add is <b>shared with everyone</b>.</> : <>What you add is <b>🔒 private</b>: only you see and edit it.</>}</li>
          <li>Set your <b>status</b> and <b>★ star</b> on any page; they're yours alone. Select text → <b>📌 Add to Quick Revise</b> for personal notes.</li>
          <li>Turn on <b>🏋️ Practice mode</b> to hide solutions until you've tried. JS snippets have a <b>▶ Run</b> button.</li>
          <li>Change your name, password and avatar in <Link to="/settings">⚙️ Settings</Link>.</li>
        </ul>
      </div>
    </div>
  );
}
