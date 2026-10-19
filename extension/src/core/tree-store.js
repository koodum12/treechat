// Conversation tree, persisted per provider. Pure logic: the storage backend is
// injected (chrome.storage.local in the extension, memory in tests).
//
// What is stored, and why (agent.md §6):
//   - conversation id + path    → to reopen it
//   - title                     → what the site's sidebar already shows
//   - branch point: message id + excerpt (≤ 80 chars) → label for the branch
// No full message text. Stays on this device. "Clear data" in the panel wipes it.

export const SCHEMA_VERSION = 1;
const PENDING_TTL_MS = 60 * 1000;

const emptyState = () => ({ version: SCHEMA_VERSION, nodes: {}, pendingBranch: null });

export const nodeIdFor = (conversationId) => `conv:${conversationId}`;

export class TreeStore {
  #storage;
  #key;
  #state = emptyState();
  #listeners = new Set();
  #now;

  constructor({ storage, providerId, now = () => Date.now() }) {
    this.#storage = storage;
    this.#key = `treechat:v${SCHEMA_VERSION}:${providerId}`;
    this.#now = now;
  }

  async load() {
    const saved = await this.#storage.get(this.#key);
    if (saved && saved.version === SCHEMA_VERSION && saved.nodes) this.#state = saved;
    // Another tab changed the tree: adopt it.
    this.#storage.onChange(this.#key, (value) => {
      this.#state = value && value.nodes ? value : emptyState();
      this.#emit();
    });
    this.#emit();
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  // ---- reads -------------------------------------------------------------

  get(id) {
    return this.#state.nodes[id] ?? null;
  }

  all() {
    return Object.values(this.#state.nodes);
  }

  /** Children of `parentId` (null = roots). Roots: most recent first; branches: creation order. */
  children(parentId) {
    const list = this.all().filter((n) => (n.parentId ?? null) === parentId);
    if (parentId === null) return list.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt);
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }

  ancestors(id) {
    const out = [];
    let node = this.get(id);
    const seen = new Set();
    while (node?.parentId && !seen.has(node.parentId)) {
      seen.add(node.parentId);
      node = this.get(node.parentId);
      if (node) out.push(node);
    }
    return out;
  }

  get pendingBranch() {
    return this.#state.pendingBranch;
  }

  // ---- writes ------------------------------------------------------------

  /**
   * Record a visit. Returns { node, created }.
   * Auto titles never overwrite a title the user typed.
   */
  async touchConversation({ conversationId, path, title, provisional = false }) {
    const id = nodeIdFor(conversationId);
    const now = this.#now();
    const existing = this.get(id);
    if (existing) {
      const next = { ...existing, lastVisitedAt: now };
      if (path) next.path = path;
      if (title && !existing.titleIsManual) next.title = title;
      this.#state.nodes[id] = next;
      await this.#save();
      return { node: next, created: false };
    }
    const node = {
      id,
      conversationId,
      path: path || null,
      title: title || null,
      titleIsManual: false,
      provisional,
      parentId: null,
      branchFrom: null,
      collapsed: false,
      createdAt: now,
      lastVisitedAt: now,
    };
    this.#state.nodes[id] = node;
    await this.#save();
    return { node, created: true };
  }

  /**
   * `knownConversationIds`: conversations that already existed when the user
   * clicked "branch" (e.g. everything in the site's sidebar). They can never be
   * the new branch, even if TreeChat sees them for the first time.
   */
  async setPendingBranch({ parentId, messageId, excerpt, method, knownConversationIds = [] }) {
    if (!this.get(parentId)) throw new Error(`unknown parent ${parentId}`);
    this.#state.pendingBranch = {
      parentId,
      messageId,
      excerpt: excerpt || '',
      method,
      knownConversationIds: [...new Set(knownConversationIds)],
      createdAt: this.#now(),
    };
    await this.#save();
  }

  async clearPendingBranch() {
    if (!this.#state.pendingBranch) return;
    this.#state.pendingBranch = null;
    await this.#save();
  }

  /**
   * Called on every conversation change. The first change after "branch" is
   * the only candidate: it is linked if it's a conversation that didn't exist
   * before (not known to the tree, not in the snapshot); otherwise the user went
   * somewhere else and the pending branch is dropped.
   */
  async consumePendingBranch(nodeId, { created }) {
    const pending = this.#state.pendingBranch;
    if (!pending || nodeId === pending.parentId) return null;
    const node = this.get(nodeId);
    const expired = this.#now() - pending.createdAt > PENDING_TTL_MS;
    const known = (pending.knownConversationIds ?? []).includes(node?.conversationId);
    this.#state.pendingBranch = null;
    if (expired || !created || known || !node || !this.get(pending.parentId)) {
      await this.#save();
      return null;
    }
    this.#state.nodes[nodeId] = {
      ...node,
      parentId: pending.parentId,
      branchFrom: { messageId: pending.messageId, excerpt: pending.excerpt },
    };
    this.#state.nodes[pending.parentId] = { ...this.get(pending.parentId), collapsed: false };
    await this.#save();
    return { node: this.get(nodeId), method: pending.method };
  }

  /**
   * A provisional conversation was saved by the site under a real id: move the
   * node (title, parent, branch point, children) to the new id.
   */
  async promote(provisionalNodeId, { conversationId, path, title }) {
    const old = this.get(provisionalNodeId);
    const id = nodeIdFor(conversationId);
    if (!old || this.get(id)) return null;
    const node = {
      ...old,
      id,
      conversationId,
      path: path || old.path,
      title: old.titleIsManual ? old.title : title || old.title,
      provisional: false,
      lastVisitedAt: this.#now(),
    };
    delete this.#state.nodes[provisionalNodeId];
    this.#state.nodes[id] = node;
    for (const child of this.all()) {
      if (child.parentId === provisionalNodeId) this.#state.nodes[child.id] = { ...child, parentId: id };
    }
    if (this.#state.pendingBranch?.parentId === provisionalNodeId) this.#state.pendingBranch.parentId = id;
    await this.#save();
    return node;
  }

  /** Drop provisional nodes the site never saved (except `keepId`). */
  async pruneProvisional(keepId = null) {
    let changed = false;
    for (const node of this.all()) {
      if (!node.provisional || node.id === keepId) continue;
      for (const child of this.children(node.id)) {
        this.#state.nodes[child.id] = { ...child, parentId: node.parentId ?? null };
      }
      delete this.#state.nodes[node.id];
      changed = true;
    }
    if (changed) await this.#save();
  }

  /** Title from the site; ignored once the user has renamed the node. */
  async setAutoTitle(id, title) {
    const node = this.get(id);
    if (!node || node.titleIsManual || !title || node.title === title) return;
    this.#state.nodes[id] = { ...node, title };
    await this.#save();
  }

  async rename(id, title) {
    const node = this.get(id);
    if (!node) return;
    const clean = String(title ?? '').trim();
    this.#state.nodes[id] = { ...node, title: clean || node.title, titleIsManual: !!clean };
    await this.#save();
  }

  /** Move `id` under `parentId` (null = root). Refuses cycles. Returns success. */
  async move(id, parentId) {
    const node = this.get(id);
    if (!node) return false;
    if (parentId !== null) {
      if (parentId === id || !this.get(parentId)) return false;
      if (this.ancestors(parentId).some((a) => a.id === id)) return false;
    }
    this.#state.nodes[id] = { ...node, parentId };
    await this.#save();
    return true;
  }

  async setCollapsed(id, collapsed) {
    const node = this.get(id);
    if (!node || node.collapsed === collapsed) return;
    this.#state.nodes[id] = { ...node, collapsed };
    await this.#save();
  }

  /** Remove from the tree only (the conversation itself is untouched). Children move up a level. */
  async remove(id) {
    const node = this.get(id);
    if (!node) return;
    for (const child of this.children(id)) {
      this.#state.nodes[child.id] = { ...child, parentId: node.parentId ?? null };
    }
    delete this.#state.nodes[id];
    if (this.#state.pendingBranch?.parentId === id) this.#state.pendingBranch = null;
    await this.#save();
  }

  async clearAll() {
    this.#state = emptyState();
    await this.#storage.remove(this.#key);
    this.#emit();
  }

  async #save() {
    await this.#storage.set(this.#key, this.#state);
    this.#emit();
  }

  #emit() {
    for (const fn of this.#listeners) fn(this);
  }
}
