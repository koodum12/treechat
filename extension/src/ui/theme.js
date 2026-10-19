// ChatGPT's dark mode isn't a class on <html>; the reliable signal is the
// computed page background. Read it and report changes.

function parseRgb(color) {
  const m = String(color).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
}

export function readTheme(el = document.body) {
  let bg = parseRgb(getComputedStyle(el).backgroundColor);
  if (!bg || bg.a === 0) bg = parseRgb(getComputedStyle(document.documentElement).backgroundColor);
  if (!bg || bg.a === 0) {
    return { mode: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', background: null };
  }
  const luminance = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255;
  return { mode: luminance < 0.5 ? 'dark' : 'light', background: `rgb(${bg.r}, ${bg.g}, ${bg.b})` };
}

export function watchTheme(getEl, cb) {
  let last = '';
  const check = () => {
    const t = readTheme(getEl());
    const key = `${t.mode}|${t.background}`;
    if (key !== last) {
      last = key;
      cb(t);
    }
  };
  check();
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', check);
  const obs = new MutationObserver(check);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  obs.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  // Theme switches in ChatGPT settings may only touch stylesheets.
  const timer = setInterval(check, 2000);
  return () => {
    mq.removeEventListener('change', check);
    obs.disconnect();
    clearInterval(timer);
  };
}
