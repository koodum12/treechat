// Tree ordering the user picks in the panel. Applied to every level.

export const SORT_KEYS = ['lastVisited', 'created', 'title'];

// Sensible direction when a key is first chosen.
export const DEFAULT_DIRECTION = { lastVisited: 'desc', created: 'desc', title: 'asc' };

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/** Returns a new array sorted by { key, dir }. Untitled nodes always go last in title order. */
export function sortNodes(nodes, { key = 'lastVisited', dir = DEFAULT_DIRECTION[key] } = {}) {
  const sign = dir === 'asc' ? 1 : -1;
  const byCreated = (a, b) => a.createdAt - b.createdAt;
  return [...nodes].sort((a, b) => {
    let diff = 0;
    if (key === 'title') {
      const ta = a.title?.trim() ?? '';
      const tb = b.title?.trim() ?? '';
      if (!ta !== !tb) return ta ? -1 : 1;
      diff = collator.compare(ta, tb);
    } else if (key === 'created') {
      diff = a.createdAt - b.createdAt;
    } else {
      diff = a.lastVisitedAt - b.lastVisitedAt;
    }
    return diff ? diff * sign : byCreated(a, b);
  });
}
