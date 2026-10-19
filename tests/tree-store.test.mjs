import test from 'node:test';
import assert from 'node:assert/strict';
import { TreeStore, nodeIdFor } from '../extension/src/core/tree-store.js';
import { createMemoryStorage } from '../extension/src/core/storage.js';
import { searchTree, highlightSegments } from '../extension/src/core/search.js';

async function setup() {
  let t = 1000;
  const storage = createMemoryStorage();
  const store = new TreeStore({ storage, providerId: 'chatgpt', now: () => t });
  await store.load();
  return { store, storage, tick: (ms = 1) => (t += ms) };
}

test('touchConversation creates once, then updates visit time and auto title', async () => {
  const { store, tick } = await setup();
  const a = await store.touchConversation({ conversationId: 'A', path: '/c/A', title: 'First' });
  assert.equal(a.created, true);
  tick();
  const b = await store.touchConversation({ conversationId: 'A', title: 'Renamed by site' });
  assert.equal(b.created, false);
  assert.equal(b.node.title, 'Renamed by site');
  assert.equal(b.node.path, '/c/A');
  assert.equal(b.node.lastVisitedAt, 1001);
});

test('manual rename survives later auto titles', async () => {
  const { store } = await setup();
  await store.touchConversation({ conversationId: 'A', title: 'Auto' });
  await store.rename(nodeIdFor('A'), 'Mine');
  await store.touchConversation({ conversationId: 'A', title: 'Auto 2' });
  await store.setAutoTitle(nodeIdFor('A'), 'Auto 3');
  assert.equal(store.get(nodeIdFor('A')).title, 'Mine');
});

test('pending branch links the next brand-new conversation', async () => {
  const { store } = await setup();
  await store.touchConversation({ conversationId: 'A' });
  await store.setPendingBranch({ parentId: nodeIdFor('A'), messageId: 'm1', excerpt: 'hello', method: 'native' });

  // Staying on the parent does not consume it.
  const a = await store.touchConversation({ conversationId: 'A' });
  assert.equal(await store.consumePendingBranch(a.node.id, a), null);
  assert.ok(store.pendingBranch);

  const b = await store.touchConversation({ conversationId: 'B' });
  const linked = await store.consumePendingBranch(b.node.id, b);
  assert.equal(linked.node.parentId, nodeIdFor('A'));
  assert.deepEqual(linked.node.branchFrom, { messageId: 'm1', excerpt: 'hello' });
  assert.equal(store.pendingBranch, null);
  assert.deepEqual(store.children(nodeIdFor('A')).map((n) => n.id), [nodeIdFor('B')]);
});

test('an existing conversation seen for the first time is never linked (regression)', async () => {
  // Real-world case: branch clicked, then the user opened an older chat that
  // TreeChat had never recorded. It used to be linked as the branch.
  const { store } = await setup();
  await store.touchConversation({ conversationId: 'A' });
  await store.setPendingBranch({
    parentId: nodeIdFor('A'),
    messageId: 'm1',
    method: 'native',
    knownConversationIds: ['A', 'OLD'],
  });
  const old = await store.touchConversation({ conversationId: 'OLD' });
  assert.equal(old.created, true, 'new to the tree');
  assert.equal(await store.consumePendingBranch(old.node.id, old), null);
  assert.equal(store.get(nodeIdFor('OLD')).parentId, null);
  // One-shot: the detour dropped the pending branch.
  assert.equal(store.pendingBranch, null);
  const b = await store.touchConversation({ conversationId: 'B' });
  assert.equal(await store.consumePendingBranch(b.node.id, b), null);
});

test('pending branch expires', async () => {
  const { store, tick } = await setup();
  await store.touchConversation({ conversationId: 'A' });
  await store.setPendingBranch({ parentId: nodeIdFor('A'), messageId: 'm1', method: 'native' });
  tick(61 * 1000);
  const b = await store.touchConversation({ conversationId: 'B' });
  assert.equal(await store.consumePendingBranch(b.node.id, b), null);
  assert.equal(store.get(nodeIdFor('B')).parentId, null);
  assert.equal(store.pendingBranch, null);
});

test('move refuses cycles; remove lifts children one level', async () => {
  const { store } = await setup();
  for (const id of ['A', 'B', 'C']) await store.touchConversation({ conversationId: id });
  const [A, B, C] = ['A', 'B', 'C'].map(nodeIdFor);
  assert.equal(await store.move(B, A), true);
  assert.equal(await store.move(C, B), true);
  assert.equal(await store.move(A, C), false, 'A under its own grandchild');
  assert.equal(await store.move(A, A), false);
  await store.remove(B);
  assert.equal(store.get(C).parentId, A);
  assert.equal(store.get(B), null);
});

test('state persists and other-tab changes are adopted', async () => {
  const { store, storage } = await setup();
  await store.touchConversation({ conversationId: 'A', title: 'x' });
  const again = new TreeStore({ storage, providerId: 'chatgpt' });
  await again.load();
  assert.equal(again.get(nodeIdFor('A')).title, 'x');

  let notified = 0;
  again.subscribe(() => notified++);
  storage.emitExternal('treechat:v1:chatgpt', { version: 1, nodes: {}, pendingBranch: null });
  assert.equal(again.all().length, 0);
  assert.equal(notified, 1);
});

test('clearAll wipes storage', async () => {
  const { store, storage } = await setup();
  await store.touchConversation({ conversationId: 'A' });
  await store.clearAll();
  assert.equal(store.all().length, 0);
  assert.equal(await storage.get('treechat:v1:chatgpt'), undefined);
});

test('search keeps ancestors of hits visible and highlights', async () => {
  const { store } = await setup();
  await store.touchConversation({ conversationId: 'A', title: 'Parent topic' });
  await store.touchConversation({ conversationId: 'B', title: 'Deep dive' });
  await store.move(nodeIdFor('B'), nodeIdFor('A'));
  const r = searchTree(store, 'deep');
  assert.deepEqual([...r.matches], [nodeIdFor('B')]);
  assert.ok(r.visible.has(nodeIdFor('A')));
  assert.equal(searchTree(store, '   '), null);
  assert.deepEqual(highlightSegments('Deep dive', 'DIVE'), [
    { text: 'Deep ', hit: false },
    { text: 'dive', hit: true },
  ]);
});

test('provisional branch is promoted to the saved id, keeping parent and branch point', async () => {
  const { store } = await setup();
  await store.touchConversation({ conversationId: 'A' });
  await store.setPendingBranch({ parentId: nodeIdFor('A'), messageId: 'm1', excerpt: 'x', method: 'native', knownConversationIds: ['A'] });
  const local = await store.touchConversation({ conversationId: 'local-chatgpt:1', title: 'Branch · A', provisional: true });
  await store.consumePendingBranch(local.node.id, local);

  const promoted = await store.promote(local.node.id, { conversationId: 'REAL', path: '/c/REAL', title: null });
  assert.equal(promoted.id, nodeIdFor('REAL'));
  assert.equal(promoted.parentId, nodeIdFor('A'));
  assert.equal(promoted.title, 'Branch · A');
  assert.equal(promoted.provisional, false);
  assert.equal(store.get(local.node.id), null);
});

test('pruneProvisional drops unsaved nodes but keeps the current one and lifts children', async () => {
  const { store } = await setup();
  await store.touchConversation({ conversationId: 'A' });
  await store.touchConversation({ conversationId: 'local-chatgpt:1', provisional: true });
  await store.touchConversation({ conversationId: 'local-chatgpt:2', provisional: true });
  await store.touchConversation({ conversationId: 'C' });
  await store.move(nodeIdFor('C'), nodeIdFor('local-chatgpt:1'));
  await store.pruneProvisional(nodeIdFor('local-chatgpt:2'));
  assert.equal(store.get(nodeIdFor('local-chatgpt:1')), null);
  assert.ok(store.get(nodeIdFor('local-chatgpt:2')));
  assert.equal(store.get(nodeIdFor('C')).parentId, null);
});
