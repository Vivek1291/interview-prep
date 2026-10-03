// Turns the flat { nodes, pages } from the API into a navigable tree with counts and progress.
const byOrder = (a, b) => a.order - b.order || String(a.createdAt).localeCompare(String(b.createdAt));

export function buildTree(data) {
  const nodes = data?.nodes || [];
  const pages = data?.pages || [];
  const byId = new Map(nodes.map((n) => [n._id, { ...n, children: [], pages: [], allPages: [] }]));
  const roots = [];
  for (const n of byId.values()) {
    const parent = n.parent ? byId.get(n.parent) : null;
    (parent ? parent.children : roots).push(n);
  }
  // pages: top-level pages of a category in node.pages, sub-pages in page.children (any depth)
  const pageById = new Map(pages.map((p) => [p._id, { ...p, children: [] }]));
  for (const p of pageById.values()) {
    const node = byId.get(p.section);
    if (!node) continue;
    node.allPages.push(p);
    const parent = p.parent ? pageById.get(p.parent) : null;
    (parent && parent.section === p.section ? parent.children : node.pages).push(p);
  }
  for (const p of pageById.values()) p.children.sort(byOrder);
  const visitPage = (p, depth, path) => { p.depth = depth; p.path = path; p.children.forEach((c) => visitPage(c, depth + 1, [...path, p])); };
  for (const n of byId.values()) { n.children.sort(byOrder); n.pages.sort(byOrder); n.pages.forEach((p) => visitPage(p, 0, [])); }
  roots.sort(byOrder);

  // totals for each node's whole subtree (post-order)
  const visit = (n, depth, path) => {
    n.depth = depth;
    n.path = [...path, n];
    const s = { total: n.allPages.length, new: 0, learning: 0, revise: 0, confident: 0, must: 0 };
    for (const p of n.allPages) { s[p.status] += 1; if (p.priority === 3) s.must += 1; }
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
  const walkPage = (p) => { ordered.push(p); p.children.forEach(walkPage); };   // a page, then its sub-pages
  const walk = (n) => { n.pages.forEach(walkPage); n.children.forEach(walk); };
  roots.forEach(walk);

  return { roots, byId, pages: ordered, pageById };
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
