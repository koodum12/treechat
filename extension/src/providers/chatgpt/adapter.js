import { BaseAdapter } from '../base-adapter.js';
import {
  SELECTORS as S,
  CONVERSATION_PATH,
  LOCAL_CONVERSATION_PATH,
  LOCAL_ID_PREFIX,
} from './selectors.js';
import { waitFor, normalizeText } from '../../core/dom.js';

export class ChatGPTAdapter extends BaseAdapter {
  id = 'chatgpt';
  label = 'ChatGPT';
  hosts = ['chatgpt.com'];
  status = 'ready';

  getConversationId(loc = location) {
    const local = loc.pathname.match(LOCAL_CONVERSATION_PATH)?.[1];
    if (local) return decodeURIComponent(local);
    return loc.pathname.match(CONVERSATION_PATH)?.[1] ?? null;
  }

  isProvisionalId(conversationId) {
    return String(conversationId).startsWith(LOCAL_ID_PREFIX);
  }

  getKnownConversationIds() {
    const ids = [];
    for (const a of document.querySelectorAll(S.sidebarAnyConversationLink)) {
      const id = a.getAttribute('href')?.match(CONVERSATION_PATH)?.[1];
      if (id) ids.push(id);
    }
    return ids;
  }

  getConversationPath(conversationId) {
    if (this.isProvisionalId(conversationId)) return location.pathname;
    // Prefer the sidebar's href: it keeps the project (/g/...) prefix.
    const link = document.querySelector(S.sidebarConversationLink(conversationId));
    return link?.getAttribute('href') || `/c/${conversationId}`;
  }

  getConversationTitle(conversationId) {
    const link = document.querySelector(S.sidebarConversationLink(conversationId));
    const fromSidebar = normalizeText(link?.getAttribute('aria-label') || link?.textContent || '');
    if (fromSidebar) return fromSidebar;
    // document.title is the conversation title on /c/ pages, "ChatGPT" otherwise.
    if (this.getConversationId() === conversationId) {
      const t = normalizeText(document.title);
      if (t && t !== 'ChatGPT') return t;
    }
    return null;
  }

  getAssistantMessages() {
    const out = [];
    for (const msg of document.querySelectorAll(S.assistantMessage)) {
      const id = msg.getAttribute('data-chatgpt-selection-message-id');
      const turn = msg.closest(S.turn);
      if (!id || !turn) continue;
      const complete = !!msg.closest(S.turnComplete);
      out.push({ id, el: msg, actionBar: this.#actionBarFor(turn), complete });
    }
    return out;
  }

  // The action bar is the parent of the turn's "More actions" button.
  #actionBarFor(turn) {
    const more = [...turn.querySelectorAll(S.moreActionsButton)].pop();
    return more?.parentElement ?? null;
  }

  // ChatGPT keeps previously visited views mounted but hidden, and a branch
  // view repeats its parent's messages with the same ids. Act on the copy the
  // user can actually see.
  #visibleMessage(messageId) {
    const all = [...document.querySelectorAll(S.assistantMessageById(messageId))];
    return all.find((el) => el.checkVisibility()) ?? null;
  }

  getMessageExcerpt(messageId, maxLength = 80) {
    const el = this.#visibleMessage(messageId);
    const text = normalizeText(el?.innerText || el?.textContent || '');
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  findMessageElement(messageId) {
    const el = this.#visibleMessage(messageId);
    return el?.closest(S.turn) ?? el;
  }

  getLayoutPushCss(width) {
    // transform makes #root the containing block for ChatGPT's fixed header,
    // so it shrinks with the rest; portals (menus, dialogs) live outside #root.
    return `
      ${S.appRoot} { width: calc(100% - ${width}px) !important; transform: translate(0, 0); }
      ${S.appRoot} ${S.appFrame} { width: 100% !important; max-width: 100% !important; }
    `;
  }

  getHeaderMountPoint() {
    const slots = document.querySelectorAll(S.headerEndSlot);
    return slots.length ? slots[slots.length - 1] : null;
  }

  openConversation(conversationId, path) {
    if (this.isProvisionalId(conversationId)) {
      // Unsaved branches only live in this page session; a full load would
      // drop them. Let ChatGPT's router handle it in-page.
      history.pushState(history.state, '', path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      return;
    }
    const link = document.querySelector(S.sidebarConversationLink(conversationId));
    if (link) {
      link.click(); // SPA navigation, no reload
      return;
    }
    location.assign(path || `/c/${conversationId}`);
  }

  async openBranchMenu(messageId) {
    const turn = this.#visibleMessage(messageId)?.closest(S.turn);
    const more = turn && [...turn.querySelectorAll(S.moreActionsButton)].pop();
    if (!more) return 'not-found';

    // Radix menus open on pointerdown, not click.
    pressPointer(more);
    const trigger = await waitFor(() => openMenuContaining(S.branchSubmenuTrigger), 1500);
    if (!trigger) {
      closeMenus();
      return 'not-found';
    }
    // After one branch, ChatGPT disables "Branch conversation" on every answer
    // of that view until the page is reloaded (verified 2026-10-19).
    if (trigger.getAttribute('aria-disabled') === 'true' || trigger.hasAttribute('data-disabled')) {
      closeMenus();
      return 'disabled';
    }
    trigger.focus();
    trigger.click();
    const submenu = await waitFor(() => document.querySelector(`${S.menu}[aria-labelledby="${trigger.id}"]`), 1500);
    if (!submenu) {
      closeMenus();
      return 'not-found';
    }
    // Land keyboard focus on the first choice, like opening it with →.
    submenu.querySelector(S.menuItem)?.focus();
    return 'opened';
  }

  onNativeBranch(cb) {
    // Users can branch from ChatGPT's own menu without our button. Watch for
    // that click in the capture phase and resolve which message it belongs to.
    const handler = (e) => {
      const item = e.target instanceof Element && e.target.closest(S.menuItem);
      if (!item) return;
      const submenu = item.closest(S.menu);
      const triggerId = submenu?.getAttribute('aria-labelledby');
      const trigger = triggerId && document.getElementById(triggerId);
      if (!trigger?.matches(S.branchSubmenuTrigger)) return;
      // Hidden, cached views can keep a stale expanded button; use the visible one.
      const opener = [...document.querySelectorAll(`${S.moreActionsButton}[aria-expanded="true"]`)].find((b) => b.checkVisibility());
      const msg = opener?.closest(S.turn)?.querySelector(S.assistantMessage);
      const id = msg?.getAttribute('data-chatgpt-selection-message-id');
      if (id) cb(id);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }
}

function pressPointer(el) {
  const opts = { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
}

function openMenuContaining(selector) {
  for (const menu of document.querySelectorAll(`${S.menu}[data-state="open"]`)) {
    const hit = menu.querySelector(selector);
    if (hit) return hit;
  }
  return null;
}

function closeMenus() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}
