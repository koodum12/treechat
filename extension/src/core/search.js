import { normalizeText } from './dom.js';

/**
 * Filter the tree by title and branch-point excerpt.
 * Returns null for an empty query (show everything), otherwise
 * { matches: Set<id>, visible: Set<id> }: matches plus their ancestors, so
 * results stay in their tree context the way a file explorer search does.
 */
export function searchTree(store, query) {
  const q = normalizeText(query).toLowerCase();
  if (!q) return null;
  const matches = new Set();
  const visible = new Set();
  for (const node of store.all()) {
    const haystack = `${node.title ?? ''} ${node.branchFrom?.excerpt ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) continue;
    matches.add(node.id);
    visible.add(node.id);
    for (const a of store.ancestors(node.id)) visible.add(a.id);
  }
  return { matches, visible };
}

/** Split `text` into [{ text, hit }] segments for highlighting. */
export function highlightSegments(text, query) {
  const q = normalizeText(query).toLowerCase();
  if (!q || !text) return [{ text: text ?? '', hit: false }];
  const out = [];
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(q, i);
    if (j === -1) {
      out.push({ text: text.slice(i), hit: false });
      break;
    }
    if (j > i) out.push({ text: text.slice(i, j), hit: false });
    out.push({ text: text.slice(j, j + q.length), hit: true });
    i = j + q.length;
  }
  return out;
}
