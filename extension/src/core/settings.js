// Per-device UI preferences (panel width, sort order). Shared by all providers.

const KEY = 'treechat:settings';

export const PANEL_WIDTH = { default: 320, min: 260, max: 720 };

export const DEFAULT_SETTINGS = {
  panelWidth: PANEL_WIDTH.default,
  sort: { key: 'lastVisited', dir: 'desc' },
};

export async function loadSettings(storage) {
  const saved = (await storage.get(KEY)) ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    sort: { ...DEFAULT_SETTINGS.sort, ...(saved.sort ?? {}) },
  };
}

export async function saveSettings(storage, settings) {
  await storage.set(KEY, settings);
}

export function clampPanelWidth(width, viewportWidth = Infinity) {
  // Always leave room for the page underneath.
  const max = Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, viewportWidth - 200));
  return Math.round(Math.min(max, Math.max(PANEL_WIDTH.min, width)));
}
