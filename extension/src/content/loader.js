// Classic content scripts can't be ES modules, so this shim loads the module graph.
(async () => {
  try {
    const { start } = await import(chrome.runtime.getURL('src/content/main.js'));
    start();
  } catch (err) {
    console.error('[TreeChat] failed to start', err);
  }
})();
