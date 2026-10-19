// Paste into DevTools on a logged-in chatgpt.com conversation.
// Prints how many elements each TreeChat selector matches. A 0 where you
// expect content means ChatGPT's DOM changed: update
// extension/src/providers/chatgpt/selectors.js.
(() => {
  const checks = {
    sidebar: '#app-shell-sidebar',
    sidebarConversationLinks: '#app-shell-sidebar a[data-interactive-row-link][href*="/c/"]',
    headerEndSlot: 'header[data-app-shell-titlebar] [data-app-shell-main-titlebar] [data-app-shell-header-obstacle]',
    turns: '[data-turn-key]',
    completeTurns: '[data-talvt-turn-state="complete"]',
    userBubbles: '[data-user-message-bubble]',
    assistantMessages: '[data-chatgpt-selection-message-id]',
    moreActionsButtons: 'button[aria-haspopup="menu"]:has(use[href$="#ellipsis-horizontal-light-16"])',
    composerInput: 'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
    treechatBranchButtons: '.treechat-branch-btn',
    treechatToggle: '.treechat-toggle',
  };
  const rows = Object.entries(checks).map(([name, sel]) => ({ name, count: document.querySelectorAll(sel).length, selector: sel }));
  console.table(rows);
  console.log('conversation id from URL:', location.pathname.match(/\/c\/([^/]+)/)?.[1] ?? '(none)');
  console.log('Open an answer\'s ⋯ menu and run again to check the branch submenu:',
    document.querySelectorAll('[role="menuitem"]:has(use[href$="#branch-light-16"])').length);
})();
