import { el } from '../core/dom.js';
import { icons } from './icons.js';

// The two things TreeChat puts into the site's own DOM. Both are marked
// data-treechat-owned and re-inserted if the site re-renders them away.

export function ensureToggleButton(adapter, { pressed, onToggle }) {
  let btn = document.querySelector('.treechat-toggle[data-treechat-owned]');
  if (!btn) {
    btn = el('button', {
      type: 'button',
      class: 'treechat-toggle',
      'data-treechat-owned': true,
      'aria-label': 'TreeChat 트리 열기',
      'data-treechat-tip': '대화 트리',
      html: icons.tree(20),
      onclick: onToggle,
    });
  }
  const mount = adapter.getHeaderMountPoint();
  if (mount) {
    btn.classList.remove('treechat-floating');
    if (btn.parentElement !== mount || mount.firstElementChild !== btn) mount.prepend(btn);
  } else {
    btn.classList.add('treechat-floating');
    if (btn.parentElement !== document.body) document.body.append(btn);
  }
  btn.setAttribute('aria-pressed', String(pressed));
  btn.setAttribute('aria-label', pressed ? 'TreeChat 트리 닫기' : 'TreeChat 트리 열기');
  return btn;
}

export function ensureBranchButtons(adapter, { onBranch }) {
  let nativeColor = null; // read once per pass: getComputedStyle forces a style flush
  for (const msg of adapter.getAssistantMessages()) {
    if (!msg.complete || !msg.actionBar) continue;
    let btn = msg.actionBar.querySelector(':scope > .treechat-branch-btn');
    if (!btn) {
      btn = el('button', {
        type: 'button',
        class: 'treechat-branch-btn',
        'data-treechat-owned': true,
        'aria-label': '여기서 분기 (TreeChat)',
        'data-treechat-tip': '여기서 분기',
        html: icons.branch(18),
      });
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.setAttribute('aria-busy', 'true');
        try {
          await onBranch(btn.dataset.messageId);
        } finally {
          btn.removeAttribute('aria-busy');
        }
      });
      msg.actionBar.append(btn);
    }
    btn.dataset.messageId = msg.id;
    // Match the native icons' color (differs per theme).
    if (nativeColor === null) {
      const native = msg.actionBar.querySelector('button:not([data-treechat-owned])');
      nativeColor = native ? getComputedStyle(native).color : '';
    }
    if (nativeColor && btn.style.color !== nativeColor) btn.style.color = nativeColor;
  }
}

export function flash(element) {
  if (!element) return;
  element.classList.remove('treechat-flash');
  void element.offsetWidth;
  element.classList.add('treechat-flash');
  setTimeout(() => element.classList.remove('treechat-flash'), 1700);
}
