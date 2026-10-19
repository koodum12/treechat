import test from 'node:test';
import assert from 'node:assert/strict';
import { sortNodes } from '../extension/src/core/sort.js';
import { loadSettings, saveSettings, clampPanelWidth, DEFAULT_SETTINGS } from '../extension/src/core/settings.js';
import { createMemoryStorage } from '../extension/src/core/storage.js';

const n = (title, createdAt, lastVisitedAt) => ({ id: title ?? `x${createdAt}`, title, createdAt, lastVisitedAt });
const nodes = [n('다람쥐', 1, 30), n('가나', 3, 10), n('Item 10', 2, 20), n('Item 2', 4, 40), n(null, 5, 50)];
const titles = (list) => list.map((x) => x.title);

test('sort by last visited, newest first by default', () => {
  assert.deepEqual(titles(sortNodes(nodes, { key: 'lastVisited' })), [null, 'Item 2', '다람쥐', 'Item 10', '가나']);
});

test('sort by created, both directions', () => {
  assert.deepEqual(titles(sortNodes(nodes, { key: 'created', dir: 'asc' })), ['다람쥐', 'Item 10', '가나', 'Item 2', null]);
  assert.deepEqual(titles(sortNodes(nodes, { key: 'created', dir: 'desc' })), [null, 'Item 2', '가나', 'Item 10', '다람쥐']);
});

test('sort by title: Korean collation (Hangul before Latin), natural numbers, untitled last', () => {
  const asc = titles(sortNodes(nodes, { key: 'title', dir: 'asc' }));
  assert.deepEqual(asc, ['가나', '다람쥐', 'Item 2', 'Item 10', null]);
  const desc = titles(sortNodes(nodes, { key: 'title', dir: 'desc' }));
  assert.deepEqual(desc, ['Item 10', 'Item 2', '다람쥐', '가나', null]);
});

test('sortNodes does not mutate its input', () => {
  const copy = [...nodes];
  sortNodes(nodes, { key: 'title' });
  assert.deepEqual(nodes, copy);
});

test('settings load defaults, persist, and merge partial saves', async () => {
  const storage = createMemoryStorage();
  assert.deepEqual(await loadSettings(storage), DEFAULT_SETTINGS);
  await saveSettings(storage, { panelWidth: 400, sort: { key: 'title' } });
  const s = await loadSettings(storage);
  assert.equal(s.panelWidth, 400);
  assert.deepEqual(s.sort, { key: 'title', dir: 'desc' });
});

test('panel width is clamped and leaves room for the page', () => {
  assert.equal(clampPanelWidth(100, 1400), 260);
  assert.equal(clampPanelWidth(5000, 1400), 720);
  assert.equal(clampPanelWidth(5000, 700), 500);
  assert.equal(clampPanelWidth(333.6, 1400), 334);
});
