export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll `fn` until it returns a truthy value or the timeout passes. */
export async function waitFor(fn, timeout = 3000, interval = 50) {
  const end = Date.now() + timeout;
  while (true) {
    const value = fn();
    if (value) return value;
    if (Date.now() >= end) return null;
    await sleep(interval);
  }
}

export function normalizeText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Coalesce DOM mutations into at most one callback per animation frame.
 * Returns a disconnect function.
 */
export function observeDom(root, cb) {
  let scheduled = false;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      cb();
    });
  });
  obs.observe(root, { childList: true, subtree: true });
  return () => obs.disconnect();
}

/** Call `cb(href)` whenever the SPA URL changes. */
export function watchUrl(cb) {
  let last = location.href;
  const check = () => {
    if (location.href !== last) {
      last = location.href;
      cb(last);
    }
  };
  // The Navigation API covers pushState in Chrome; the interval is a fallback.
  window.navigation?.addEventListener('navigatesuccess', check);
  window.addEventListener('popstate', check);
  const timer = setInterval(check, 500);
  return () => {
    window.navigation?.removeEventListener('navigatesuccess', check);
    window.removeEventListener('popstate', check);
    clearInterval(timer);
  };
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}
