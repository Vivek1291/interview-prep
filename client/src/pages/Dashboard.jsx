import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { useStats, useTree } from '../api/hooks';
import { storage } from '../utils/storage';

const PLAN = [
  { week: 'Week 1', items: ['Node.js core + Event loop', 'Express + REST', 'DSA: Arrays, Strings, HashMap, Two Pointer, Sliding Window'] },
  { week: 'Week 2', items: ['MongoDB + Mongoose + Indexing + Aggregation', 'Auth / JWT', 'DSA: Stack, Queue, Linked List, Binary Search'] },
  { week: 'Week 3', items: ['AWS: EC2, S3, IAM, Deployment', 'Full-Stack integration', 'DSA: Trees, Heap, Graphs'] },
  { week: 'Week 4', items: ['Frontend + Backend LLD', 'JS implementations (debounce, Promise.all…)', 'DSA: Recursion, Backtracking, basic DP'] },
];

const ANSWER_FLOW = ['Clarify the problem', 'Brute force', 'Find the bottleneck', 'Optimise', 'Write clean code', 'Test with examples', 'Time complexity', 'Space complexity'];

export default function Dashboard() {
  const { data: stats } = useStats();
  const { data: tree = [] } = useTree();
  const last = storage.get('lastVisited', null);

  const sections = stats?.sections || [];
  const total = stats?.total || 0;
  const sum = (k) => sections.reduce((n, s) => n + s[k], 0);
  const confident = sum('confident');
  const pct = total ? Math.round((confident / total) * 100) : 0;

  const mustKnow = tree
    .flatMap((s) => s.questions.map((q) => ({ ...q, sectionIcon: s.icon, sectionColor: s.color })))
    .filter((q) => q.priority === 3 && q.status !== 'confident')
    .slice(0, 14);

  const chartData = sections.map((s) => ({
    name: s.title.length > 16 ? `${s.title.slice(0, 15)}…` : s.title,
    Confident: s.confident, 'Needs revision': s.revise, Learning: s.learning, 'Not started': s.new,
  }));

  return (
    <div className="page dashboard">
      <div className="hero">
        <div>
          <h1>🎯 Full-Stack Interview Prep</h1>
          <p className="muted">
            Node.js · Express · MongoDB · AWS · Full-Stack · LLD · DSA. Questions are ordered by interview importance.
            🔥 marks the must-know ones. Edit anything and it's saved to MongoDB.
          </p>
          {last && (
            <Link className="btn btn-primary" to={`/q/${last.id}`}>▶ Continue: {last.title}</Link>
          )}
        </div>
        <div className="ring" style={{ '--pct': pct }}>
          <div className="ring-inner">
            <strong>{pct}%</strong>
            <span>confident</span>
          </div>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat"><span className="stat-n">{total}</span><span>Questions</span></div>
        <div className="stat s-confident"><span className="stat-n">{confident}</span><span>● Confident</span></div>
        <div className="stat s-revise"><span className="stat-n">{sum('revise')}</span><span>↻ Revise</span></div>
        <div className="stat s-learning"><span className="stat-n">{sum('learning')}</span><span>◐ Learning</span></div>
        <div className="stat s-new"><span className="stat-n">{sum('new')}</span><span>○ Not started</span></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>📊 Progress by section</h3>
          <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 30)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#94a3b8', fontSize: 12 }} />
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
            {mustKnow.map((q) => (
              <Link key={q._id} to={`/q/${q._id}`} className="must-item" style={{ borderLeftColor: q.sectionColor }}>
                <span>{q.sectionIcon}</span> {q.title}
              </Link>
            ))}
            {!mustKnow.length && <div className="muted">🎉 All must-know questions are marked confident!</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>🗓️ 4-week preparation plan</h3>
        <div className="plan">
          {PLAN.map((w) => (
            <div key={w.week} className="plan-col">
              <div className="plan-week">{w.week}</div>
              <ul>{w.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>🧠 How to answer ANY coding question</h3>
        <div className="flow">
          {ANSWER_FLOW.map((s, i) => (
            <div key={s} className="flow-step"><span className="flow-n">{i + 1}</span>{s}</div>
          ))}
        </div>
      </div>

      <div className="card tips">
        <h3>✨ How to use this app</h3>
        <ul>
          <li><b>✏️ Edit</b> any question to add, remove, recolour or drag-reorder blocks. You can use rich text, code, highlight boxes, diagrams, charts, images and links.</li>
          <li>Select text in the editor to <b>bold</b>, <mark>highlight</mark> or colour it. Each box has its own 🎨 colour picker.</li>
          <li>Select text while reading → <b>📌 Add to Quick Revise</b>. Open <Link to="/revise">⚡ Quick Revise</Link> before your interview.</li>
          <li>Turn on <b>🏋️ Practice mode</b> (top bar) to hide solutions until you've tried them. JS snippets have a <b>▶ Run</b> button.</li>
          <li>Drag <b>⋮⋮</b> in the sidebar to reorder sections and questions. Use ＋ / ✎ / 🗑 on a section header.</li>
          <li>Back up your content from <Link to="/settings">⚙️ Settings</Link> → Export.</li>
        </ul>
      </div>
    </div>
  );
}
