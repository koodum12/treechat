// Every chatgpt.com DOM assumption lives here. Verified against the logged-in
// app on 2026-10-19 (see docs/dom-analysis/chatgpt.md).
// Rules: no utility class names, no localized aria-label text. Icon sprite ids
// (`use[href$="#…"]`) are language-independent, so they identify buttons.

export const SELECTORS = {
  sidebar: '#app-shell-sidebar',
  sidebarConversationLink: (id) => `#app-shell-sidebar a[data-interactive-row-link][href*="/c/${id}"]`,
  sidebarAnyConversationLink: '#app-shell-sidebar a[data-interactive-row-link][href*="/c/"]',

  headerEndSlot: 'header[data-app-shell-titlebar] [data-app-shell-main-titlebar] [data-app-shell-header-obstacle]',

  threadScroll: '[data-app-action-timeline-scroll]',
  turn: '[data-turn-key]',
  turnComplete: '[data-talvt-turn-state="complete"]',
  userBubble: '[data-user-message-bubble]',
  assistantUnit: '[data-chatgpt-search-unit-key$=":assistant"]',
  assistantMessage: '[data-chatgpt-selection-message-id]',
  assistantMessageById: (id) => `[data-chatgpt-selection-message-id="${id}"]`,

  // The last button of the assistant action bar ("More actions").
  moreActionsButton: 'button[aria-haspopup="menu"]:has(use[href$="#ellipsis-horizontal-light-16"])',

  menu: '[role="menu"]',
  menuItem: '[role="menuitem"]',
  branchSubmenuTrigger: '[role="menuitem"][aria-haspopup="menu"]:has(use[href$="#branch-light-16"])',

  // Layout push: #root holds the whole app; the app frame inside it is sized
  // to the viewport (1400px on a 1400px window even when #root is narrower).
  appRoot: '#root',
  appFrame: '[data-app-shell-frame]',

  composerInput: 'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
};

// The "Branch conversation" submenu holds ChatGPT's own choices
// ("Branch to Work mode", "Branch in new chat"). TreeChat shows that submenu
// as-is and records whichever item the user picks, so no item text is matched.

// ChatGPT's "Branch in new chat" opens an unsaved conversation at
// /c/local-chatgpt:<uuid> (URL-encoded). It gets a real /c/<uuid> once the user
// sends the first message.
export const LOCAL_CONVERSATION_PATH = /\/c\/(local-chatgpt(?::|%3A)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
export const LOCAL_ID_PREFIX = 'local-chatgpt:';

// /c/<uuid> or /g/<gizmo>/c/<uuid>
export const CONVERSATION_PATH = /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
