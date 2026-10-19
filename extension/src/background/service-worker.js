// Toolbar icon toggles the panel in the active tab. Tabs without the content
// script (non-supported sites) simply reject the message, which we ignore.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { type: 'treechat:toggle-panel' }).catch(() => {});
});
