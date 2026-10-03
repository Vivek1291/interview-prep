import { useEffect, useMemo } from 'react';
import { useTerms } from '../api/hooks';
import { useApp } from '../AppContext';

// Turns glossary terms ("libuv", "Hydration"…) inside rendered page text into clickable links that open
// the term panel. Only the FIRST mention of each term per page is linked, so pages stay readable.
// Code, links, buttons, headings and diagrams are never touched.

const SKIP = 'code, pre, a, button, h1, h2, h3, h4, svg, .term-link, .diagram, .chart, .code-block, textarea, input';
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** { regex, byName } for the given terms, or null. Longest names first so "React Server Components" wins over "React". */
export function buildMatcher(terms, { exclude } = {}) {
  const byName = new Map();
  for (const t of terms || []) {
    if (exclude && t._id === exclude) continue;
    for (const name of [t.term, ...(t.aliases || [])]) {
      const n = name.trim();
      if (n.length >= 2 && !byName.has(n.toLowerCase())) byName.set(n.toLowerCase(), t);
    }
  }
  if (!byName.size) return null;
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRx);
  // not inside a longer word: "V8" must not match "V80", "JSX" must not match "TSX"
  return { regex: new RegExp(`(?<![\\w-])(${names.join('|')})(?![\\w-])`, 'gi'), byName };
}

/** Wraps first mentions in `root` with <button class="term-link">. Returns the number of links made. */
export function linkTerms(root, matcher) {
  if (!root || !matcher) return 0;
  // terms already linked (e.g. before a collapsed block was opened) stay linked only once
  const linked = new Set([...root.querySelectorAll('.term-link')].map((b) => b.dataset.termId));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (!n.nodeValue.trim() || n.parentElement?.closest(SKIP) || !n.parentElement?.closest('.rich') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let count = 0;
  for (const node of nodes) {
    const text = node.nodeValue;
    matcher.regex.lastIndex = 0;
    let m;
    let last = 0;
    const frag = document.createDocumentFragment();
    while ((m = matcher.regex.exec(text))) {
      const term = matcher.byName.get(m[1].toLowerCase());
      if (!term || linked.has(term._id)) continue;
      linked.add(term._id);
      frag.append(text.slice(last, m.index));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'term-link';
      btn.dataset.termId = term._id;
      btn.title = `${term.term}${term.summary ? `: ${term.summary.replace(/\*\*|`/g, '')}` : ''}`;
      btn.textContent = m[1];
      frag.append(btn);
      last = m.index + m[1].length;
      count += 1;
    }
    if (last) {
      frag.append(text.slice(last));
      node.replaceWith(frag);
    }
  }
  return count;
}

/** Hook: link terms inside `ref` whenever the content changes, and open the panel on click. */
export function useTermLinks(ref, { active = true, content, exclude } = {}) {
  const { termLinks, openTerm } = useApp();
  const { data: terms } = useTerms();
  const matcher = useMemo(() => (termLinks && active ? buildMatcher(terms, { exclude }) : null), [terms, termLinks, active, exclude]);

  useEffect(() => {
    const root = ref.current;
    if (!root || !matcher) return undefined;
    // wait a frame so blocks (and their rich text) are in the DOM; re-run when blocks are expanded
    let frame = requestAnimationFrame(() => linkTerms(root, matcher));
    let busy = false;
    const observer = new MutationObserver(() => {
      if (busy) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { busy = true; linkTerms(root, matcher); observer.takeRecords(); busy = false; });
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [ref, matcher, content]);

  // Listen on the document: the content area may not exist yet when this hook first runs (page still loading)
  useEffect(() => {
    const onClick = (e) => {
      const btn = e.target.closest?.('.term-link');
      if (btn && ref.current?.contains(btn)) { e.preventDefault(); openTerm(btn.dataset.termId); }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [ref, openTerm]);
}
