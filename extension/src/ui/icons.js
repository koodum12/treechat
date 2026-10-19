// Line icons drawn to match ChatGPT's 20px / 16px sprite style (1.5 stroke, round caps).
const svg = (size, body) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  branch: (s = 20) => svg(s, '<circle cx="6" cy="4.5" r="1.75"/><circle cx="6" cy="15.5" r="1.75"/><circle cx="14" cy="8" r="1.75"/><path d="M6 6.25v7.5"/><path d="M14 9.75c0 2.5-2 3.25-4.5 3.5C8 13.4 6.6 13.6 6 13.75"/>'),
  tree: (s = 20) => svg(s, '<rect x="2.75" y="2.75" width="5" height="4" rx="1"/><rect x="11.25" y="8" width="6" height="4" rx="1"/><rect x="11.25" y="14" width="6" height="3.5" rx="1"/><path d="M5.25 6.75v8a1 1 0 0 0 1 1h5"/><path d="M5.25 10h6"/>'),
  chevronRight: (s = 16) => svg(s, '<path d="M8 5.5 12.5 10 8 14.5"/>'),
  search: (s = 20) => svg(s, '<circle cx="9" cy="9" r="5.75"/><path d="m13.25 13.25 3.5 3.5"/>'),
  ellipsis: (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="4.5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15.5" cy="10" r="1.5"/></svg>`,
  close: (s = 20) => svg(s, '<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>'),
  pencil: (s = 18) => svg(s, '<path d="M12.6 4.4a1.9 1.9 0 0 1 2.7 2.7l-8.4 8.4-3.4.7.7-3.4z"/><path d="m11.5 5.5 3 3"/>'),
  trash: (s = 18) => svg(s, '<path d="M3.75 5.75h12.5"/><path d="M8 5.75V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.25"/><path d="M5.25 5.75l.7 9.6a1.5 1.5 0 0 0 1.5 1.4h5.1a1.5 1.5 0 0 0 1.5-1.4l.7-9.6"/>'),
  arrowUpLeft: (s = 18) => svg(s, '<path d="M14.5 14.5 5.5 5.5"/><path d="M5.5 12V5.5H12"/>'),
  cornerDownRight: (s = 18) => svg(s, '<path d="M5 4v6.5a2 2 0 0 0 2 2h8"/><path d="m12 9.5 3 3-3 3"/>'),
  sort: (s = 20) => svg(s, '<path d="M6 4v12"/><path d="m3 7 3-3 3 3"/><path d="M14 16V4"/><path d="m11 13 3 3 3-3"/>'),
  check: (s = 16) => svg(s, '<path d="m4.5 10.5 3.5 3.5 7.5-8"/>'),
  chat: (s = 16) => svg(s, '<path d="M4.5 15.5 3.5 17v-11a2.5 2.5 0 0 1 2.5-2.5h8A2.5 2.5 0 0 1 16.5 6v6a2.5 2.5 0 0 1-2.5 2.5H6.5z"/>'),
};
