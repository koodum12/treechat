// Storage backends share one tiny interface so the tree store stays testable:
//   get(key) -> Promise<value|undefined>
//   set(key, value) -> Promise<void>
//   remove(key) -> Promise<void>
//   onChange(key, cb) -> unsubscribe   (changes made by other tabs)
// All data stays on this device (chrome.storage.local). Nothing is uploaded.

export function createChromeStorage() {
  const area = chrome.storage.local;
  return {
    async get(key) {
      const res = await area.get(key);
      return res[key];
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
    async remove(key) {
      await area.remove(key);
    },
    onChange(key, cb) {
      const listener = (changes, areaName) => {
        if (areaName === 'local' && key in changes) cb(changes[key].newValue);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    },
  };
}

export function createMemoryStorage(initial = {}) {
  const data = { ...initial };
  const listeners = new Map();
  return {
    async get(key) {
      return data[key] === undefined ? undefined : structuredClone(data[key]);
    },
    async set(key, value) {
      data[key] = structuredClone(value);
    },
    async remove(key) {
      delete data[key];
    },
    onChange(key, cb) {
      listeners.set(cb, key);
      return () => listeners.delete(cb);
    },
    // Test helper: simulate a write coming from another tab.
    emitExternal(key, value) {
      data[key] = structuredClone(value);
      for (const [cb, k] of listeners) if (k === key) cb(structuredClone(value));
    },
  };
}
