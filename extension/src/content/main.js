import { resolveAdapter } from '../providers/registry.js';
import { TreeStore, nodeIdFor } from '../core/tree-store.js';
import { createChromeStorage } from '../core/storage.js';
import { loadSettings, saveSettings } from '../core/settings.js';
import { observeDom, watchUrl, waitFor } from '../core/dom.js';
import { TreePanel } from '../ui/panel.js';
import { watchTheme } from '../ui/theme.js';
import { ensureToggleButton, ensureBranchButtons, flash } from '../ui/page-controls.js';

const RESUME_KEY = 'treechat:resume-branch';

const debug = (...args) => {
  if (localStorage.getItem('treechat:debug') === '1') console.debug('[TreeChat]', ...args);
};

export async function start() {
  const adapter = resolveAdapter();
  if (!adapter) return;
  if (document.documentElement.hasAttribute('data-treechat-started')) return;
  document.documentElement.setAttribute('data-treechat-started', '');

  const storage = createChromeStorage();
  const store = new TreeStore({ storage, providerId: adapter.id });
  await store.load();
  const settings = await loadSettings(storage);

  // ---- making room for the panel ----------------------------------------

  // Below this much remaining width the page is too cramped; overlay instead.
  const MIN_PAGE_WIDTH = 480;
  let pushStyle = null;
  function pushLayout({ open, width }) {
    const css = open && innerWidth - width >= MIN_PAGE_WIDTH ? adapter.getLayoutPushCss(width) : null;
    if (!css) {
      pushStyle?.remove();
      pushStyle = null;
      return;
    }
    if (!pushStyle) {
      pushStyle = document.createElement('style');
      pushStyle.setAttribute('data-treechat-owned', '');
    }
    if (pushStyle.textContent !== css) pushStyle.textContent = css;
    if (!pushStyle.isConnected) document.head.append(pushStyle);
  }

  const panel = new TreePanel({
    store,
    providerLabel: adapter.label,
    settings,
    callbacks: {
      onSettingsChange: (next) => saveSettings(storage, next),
      onLayoutChange: (layout) => pushLayout(layout),
      onOpenNode: (node) => openNode(node),
      onGoToBranchPoint: (node) => goToBranchPoint(node),
      onVisibilityChange: () => refreshControls(),
    },
  });
  const css = await (await fetch(chrome.runtime.getURL('src/ui/styles/panel.css'))).text();
  await panel.mount(css);
  watchTheme(() => adapter.getThemeElement(), (theme) => panel.setTheme(theme));

  // ---- syncing the current page into the tree --------------------------

  // Branch bookkeeping must be saved before the URL change is processed, or a
  // fast navigation could miss the pending branch.
  let pendingWrite = Promise.resolve();

  // Provisional (unsaved) conversation we are on, and what already existed
  // when we got there: a real id outside that set means "it just got saved".
  let provisional = null; // { nodeId, knownIds: Set }

  // URL changes can be reported more than once (Navigation API + polling);
  // run syncs one at a time so two of them never race on the pending branch.
  let syncQueue = Promise.resolve();
  function syncConversation() {
    syncQueue = syncQueue.then(syncConversationNow, syncConversationNow);
    return syncQueue;
  }

  async function syncConversationNow() {
    await pendingWrite;
    const conversationId = adapter.getConversationId();
    const isProvisional = !!conversationId && adapter.isProvisionalId(conversationId);

    if (provisional && conversationId !== store.get(provisional.nodeId)?.conversationId) {
      const left = provisional;
      provisional = null;
      const saved = conversationId && !isProvisional && !left.knownIds.has(conversationId) && !store.get(nodeIdFor(conversationId));
      if (saved) {
        const node = await store.promote(left.nodeId, {
          conversationId,
          path: adapter.getConversationPath(conversationId),
          title: adapter.getConversationTitle(conversationId),
        });
        if (node) {
          panel.setActive(node.id);
          return;
        }
      }
      // Not saved, but not gone either: ChatGPT keeps unsaved branches until
      // the page reloads (back button still reaches them). Startup prunes them.
    }

    if (!conversationId) {
      panel.setActive(null);
      return;
    }
    const { node, created } = await store.touchConversation({
      conversationId,
      path: adapter.getConversationPath(conversationId),
      title: adapter.getConversationTitle(conversationId),
      provisional: isProvisional,
    });
    if (isProvisional && !provisional) {
      provisional = {
        nodeId: node.id,
        knownIds: new Set([...adapter.getKnownConversationIds(), ...store.all().map((n) => n.conversationId)]),
      };
    }
    const hadPending = !!store.pendingBranch;
    const linked = await store.consumePendingBranch(node.id, { created });
    if (hadPending) debug('pending branch', linked ? 'linked' : 'dropped', { conversationId, created });
    panel.setActive(node.id);
    if (linked) {
      const parent = store.get(linked.node.parentId);
      panel.toast(`'${parent?.title || '이전 대화'}'의 분기로 트리에 추가했습니다.`, panel.isOpen ? null : { label: '트리 보기', run: () => panel.open() });
    }
  }

  // Titles appear in the sidebar a moment after a chat is created; refresh them lazily.
  let titleTimer = null;
  function scheduleTitleRefresh() {
    if (titleTimer) return;
    titleTimer = setTimeout(async () => {
      titleTimer = null;
      for (const node of store.all()) {
        if (node.titleIsManual) continue;
        const title = adapter.getConversationTitle(node.conversationId);
        if (title && title !== node.title) await store.setAutoTitle(node.id, title);
      }
    }, 1000);
  }

  // ---- branching --------------------------------------------------------

  function recordPending(messageId) {
    const op = writePending(messageId);
    pendingWrite = op.catch(() => {});
    return op;
  }

  async function writePending(messageId) {
    const conversationId = adapter.getConversationId();
    if (!conversationId) return null;
    const { node } = await store.touchConversation({
      conversationId,
      path: adapter.getConversationPath(conversationId),
      title: adapter.getConversationTitle(conversationId),
    });
    await store.setPendingBranch({
      parentId: node.id,
      messageId,
      excerpt: adapter.getMessageExcerpt(messageId),
      method: 'native',
      knownConversationIds: [...adapter.getKnownConversationIds(), ...store.all().map((n) => n.conversationId)],
    });
    return node;
  }

  async function branchFromButton(messageId) {
    if (!adapter.getConversationId()) {
      panel.toast('저장된 대화에서만 분기할 수 있습니다.');
      return;
    }
    // The pending branch is recorded by onNativeBranch once the user picks.
    const result = await adapter.openBranchMenu(messageId);
    if (result === 'opened') return;
    if (result === 'disabled') {
      // The site allows one branch per page load. Reload, then continue the
      // same branch automatically (see resumeBranchAfterReload).
      const conversationId = adapter.getConversationId();
      try {
        sessionStorage.setItem(RESUME_KEY, JSON.stringify({ conversationId, messageId, at: Date.now() }));
      } catch {
        panel.toast(`${adapter.label}가 분기를 잠시 막아 두었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.`);
        return;
      }
      location.reload();
      return;
    }
    panel.toast(`${adapter.label}의 '대화 브랜치' 메뉴를 찾지 못했습니다. 답변의 ⋯ 메뉴에서 직접 시도해 주세요.`);
  }

  async function resumeBranchAfterReload() {
    let intent = null;
    try {
      intent = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null');
      sessionStorage.removeItem(RESUME_KEY);
    } catch {}
    if (!intent || Date.now() - intent.at > 30_000 || intent.conversationId !== adapter.getConversationId()) return;
    const ready = await waitFor(
      () => adapter.getAssistantMessages().find((m) => m.id === intent.messageId && m.complete && m.actionBar && m.el.checkVisibility()),
      15_000,
      200,
    );
    if (!ready) {
      panel.toast('분기할 답변을 찾지 못했습니다. 다시 시도해 주세요.');
      return;
    }
    await branchFromButton(intent.messageId);
    panel.toast(`${adapter.label}는 새로고침 전까지 분기를 한 번만 허용해서, 새로고침한 뒤 분기 메뉴를 열었습니다.`);
  }

  // The user picked a branch choice (via our button or the site's own menu).
  adapter.onNativeBranch((messageId) => {
    recordPending(messageId);
  });

  // ---- navigation from the panel ---------------------------------------

  function openNode(node) {
    if (adapter.getConversationId() === node.conversationId) return;
    adapter.openConversation(node.conversationId, node.path);
  }

  async function goToBranchPoint(node) {
    const parent = store.get(node.parentId);
    if (!parent || !node.branchFrom) return;
    if (adapter.getConversationId() !== parent.conversationId) {
      adapter.openConversation(parent.conversationId, parent.path);
    }
    const target = await waitFor(() => adapter.findMessageElement(node.branchFrom.messageId), 8000, 150);
    if (!target) {
      panel.toast('분기 지점 메시지를 찾지 못했습니다. 대화가 수정되었을 수 있습니다.');
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flash(target);
  }

  // ---- keeping injected controls alive ---------------------------------

  function refreshControls() {
    ensureToggleButton(adapter, { pressed: panel.isOpen, onToggle: () => panel.toggle() });
    ensureBranchButtons(adapter, { onBranch: branchFromButton });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'treechat:toggle-panel') panel.toggle();
  });

  observeDom(document.body, () => {
    refreshControls();
    scheduleTitleRefresh();
  });
  watchUrl(() => syncConversation());

  // Unsaved branches left over from a closed tab can't be reopened.
  const current = adapter.getConversationId();
  await store.pruneProvisional(current ? nodeIdFor(current) : null);

  refreshControls();
  await syncConversation();
  await resumeBranchAfterReload();
}
