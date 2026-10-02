// Turns the flat { nodes, pages } from the API into a navigable tree with counts and progress.
const byOrder = (a, b) => a.order - b.order || String(a.createdAt).localeCompare(String(b.createdAt));

export function buildTree(data) {
  const nodes = data?.nodes || [];
  const pages = data?.pages || [];
  const byId = new Map(nodes.map((n) => [n._id, { ...n, children: [], pages: [] }]));
  const roots = [];
  for (const n of byId.values()) {
    const parent = n.parent ? byId.get(n.parent) : null;
    (parent ? parent.children : roots).push(n);
  }
  for (const p of pages) byId.get(p.section)?.pages.push(p);
  for (const n of byId.values()) { n.children.sort(byOrder); n.pages.sort(byOrder); }
  roots.sort(byOrder);

  // totals for each node's whole subtree (post-order)
  const visit = (n, depth, path) => {
    n.depth = depth;
    n.path = [...path, n];
    const s = { total: n.pages.length, new: 0, learning: 0, revise: 0, confident: 0, must: 0 };
    for (const p of n.pages) { s[p.status] += 1; if (p.priority === 3) s.must += 1; }
    for (const c of n.children) {
      const cs = visit(c, depth + 1, n.path);
      for (const k of Object.keys(s)) s[k] += cs[k];
    }
    n.stats = s;
    return s;
  };
  roots.forEach((r) => visit(r, 0, []));

  // pages in sidebar (depth-first) order: used for "previous / next"
  const ordered = [];
  const walk = (n) => { ordered.push(...n.pages); n.children.forEach(walk); };
  roots.forEach(walk);

  return { roots, byId, pages: ordered, pageById: new Map(pages.map((p) => [p._id, p])) };
}

/** Flat list of nodes in display order with depth, for <select> pickers. */
export function flatNodes(roots, { exclude } = {}) {
  const out = [];
  const walk = (n) => {
    if (exclude && n._id === exclude) return;           // also skips its subtree (can't move into itself)
    out.push(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

export const pct = (s) => (s?.total ? Math.round((s.confident / s.total) * 100) : 0);
