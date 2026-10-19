import { el } from '../core/dom.js';
import { searchTree, highlightSegments } from '../core/search.js';
import { sortNodes, DEFAULT_DIRECTION } from '../core/sort.js';
import { clampPanelWidth, PANEL_WIDTH } from '../core/settings.js';
import { icons } from './icons.js';

/**
 * Right-side tree panel, isolated in a Shadow DOM so neither side's CSS leaks.
 *
 * callbacks:
 *   onOpenNode(node)          open the conversation
 *   onGoToBranchPoint(node)   open the parent at the message the branch came from
 *   onVisibilityChange(open)
 *   onSettingsChange(settings)  persist panel width / sort order
 *   onLayoutChange({ open, width })  so the page can make room for the panel
 */

const SORT_LABELS = { lastVisited: '최근 사용순', created: '생성순', title: '이름순' };
const DIRECTION_LABELS = {
  lastVisited: { desc: '최근 것 먼저', asc: '오래된 것 먼저' },
  created: { desc: '최근 것 먼저', asc: '오래된 것 먼저' },
  title: { asc: '가 → 하', desc: '하 → 가' },
};
export class TreePanel {
  #store;
  #cb;
  #host;
  #root;
  #panel;
  #tree;
  #search;
  #menu;
  #scrim;
  #toasts;
  #query = '';
  #activeId = null;
  #focusId = null;
  #renamingId = null;
  #dragId = null;
  #menuReturnFocus = null;
  #settings;
  #resizer;
  #currentWidth = PANEL_WIDTH.default;

  constructor({ store, providerLabel, settings, callbacks }) {
    this.#store = store;
    this.#cb = callbacks;
    this.#settings = structuredClone(settings);
    this.#host = el('treechat-root', { 'data-treechat-owned': true });
    this.#root = this.#host.attachShadow({ mode: 'open' });
    this.#build(providerLabel);
    store.subscribe(() => this.render());
  }

  async mount(cssText) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    this.#root.adoptedStyleSheets = [sheet];
    document.documentElement.append(this.#host);
    this.render();
  }

  setTheme({ mode }) {
    this.#host.setAttribute('data-theme', mode);
  }

  get isOpen() {
    return !this.#panel.hidden;
  }

  open() {
    if (this.isOpen) return;
    this.#panel.hidden = false;
    this.#panel.removeAttribute('inert');
    this.#cb.onVisibilityChange?.(true);
    this.#emitLayout();
    this.render();
    requestAnimationFrame(() => this.#focusRow(this.#activeId) || this.#search.focus());
  }

  close() {
    if (!this.isOpen) return;
    this.#closeMenu();
    this.#panel.hidden = true;
    this.#panel.setAttribute('inert', '');
    this.#cb.onVisibilityChange?.(false);
    this.#emitLayout();
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  setActive(nodeId) {
    if (this.#activeId === nodeId) return;
    this.#activeId = nodeId;
    // Reveal the active conversation inside collapsed parents.
    for (const a of this.#store.ancestors(nodeId)) if (a.collapsed) this.#store.setCollapsed(a.id, false);
    this.render();
  }

  toast(message, action) {
    const t = el('div', { class: `toast${action ? '' : ' no-action'}`, role: 'status' }, [el('span', { text: message })]);
    if (action) {
      t.append(
        el('button', {
          type: 'button',
          text: action.label,
          onclick: () => {
            action.run();
            t.remove();
          },
        }),
      );
    }
    this.#toasts.append(t);
    setTimeout(() => t.remove(), action ? 6000 : 4000);
  }

  // ---------------------------------------------------------------------

  #build(providerLabel) {
    this.#search = el('input', {
      type: 'search',
      placeholder: '트리 검색',
      'aria-label': '트리 검색',
      autocomplete: 'off',
      spellcheck: 'false',
      oninput: (e) => {
        this.#query = e.target.value;
        this.render();
      },
      onkeydown: (e) => {
        if (e.key === 'Escape' && this.#query) {
          e.stopPropagation();
          this.#search.value = '';
          this.#query = '';
          this.render();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.#focusRow(this.#visibleIds()[0]);
        }
      },
    });

    const moreBtn = el('button', {
      type: 'button',
      class: 'icon-btn',
      'aria-label': 'TreeChat 메뉴',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      html: icons.ellipsis(20),
      onclick: (e) => this.#openPanelMenu(e.currentTarget),
    });

    const sortBtn = el('button', {
      type: 'button',
      class: 'icon-btn',
      'aria-label': '정렬',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      html: icons.sort(20),
      onclick: (e) => this.#openSortMenu(e.currentTarget),
    });

    this.#resizer = el('div', {
      class: 'resizer',
      role: 'separator',
      tabindex: '0',
      'aria-orientation': 'vertical',
      'aria-label': '패널 너비 조절',
      'aria-valuemin': String(PANEL_WIDTH.min),
      'aria-valuemax': String(PANEL_WIDTH.max),
      title: '드래그해서 너비 조절 · 더블클릭하면 기본 너비',
    });
    this.#wireResize();

    this.#tree = el('ul', { role: 'tree', 'aria-label': '대화 트리' });
    this.#tree.addEventListener('keydown', (e) => this.#onTreeKey(e));

    this.#panel = el(
      'aside',
      { class: 'panel', role: 'complementary', 'aria-label': 'TreeChat', hidden: true, inert: true },
      [
        this.#resizer,
        el('div', { class: 'head' }, [
          el('div', { class: 'head-title' }, [el('span', { text: 'TreeChat' })]),
          sortBtn,
          moreBtn,
          el('button', {
            type: 'button',
            class: 'icon-btn',
            'aria-label': '패널 닫기',
            html: icons.close(20),
            onclick: () => this.close(),
          }),
        ]),
        el('label', { class: 'search' }, [el('span', { html: icons.search(18), style: 'display:inline-flex' }), this.#search]),
        el('div', { class: 'body' }, [this.#tree]),
        el('div', {
          class: 'foot',
          text: `트리는 이 브라우저에만 저장됩니다 · ${providerLabel}`,
        }),
      ],
    );
    this.#panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.#menu.hidden) return;
      if (e.key === 'Escape' && this.#renamingId == null) this.close();
    });

    this.#menu = el('div', { class: 'menu', role: 'menu', hidden: true });
    this.#menu.addEventListener('keydown', (e) => this.#onMenuKey(e));

    this.#scrim = el('div', { class: 'scrim', hidden: true });
    this.#toasts = el('div', { class: 'toasts', 'aria-live': 'polite' });

    this.#root.append(this.#panel, this.#menu, this.#scrim, this.#toasts);
    this.#applyWidth(this.#settings.panelWidth);
    // Keep the panel inside the viewport when the window shrinks.
    window.addEventListener('resize', () => this.#applyWidth(this.#settings.panelWidth));

    // Click outside closes the menu.
    this.#root.addEventListener('pointerdown', (e) => {
      if (!this.#menu.hidden && !e.composedPath().includes(this.#menu)) this.#closeMenu();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.#menu.hidden && !e.composedPath().includes(this.#host)) this.#closeMenu();
    });
  }

  render() {
    if (!this.#tree) return;
    const result = searchTree(this.#store, this.#query);
    const roots = this.#sorted(this.#store.children(null));
    this.#tree.replaceChildren();

    const body = this.#tree.parentElement;
    body.querySelectorAll('.section-label, .empty, .root-drop').forEach((n) => n.remove());

    if (!roots.length) {
      body.prepend(this.#emptyState());
      return;
    }

    const sortLabel = SORT_LABELS[this.#settings.sort.key];
    body.prepend(el('div', { class: 'section-label', text: `${result ? '검색 결과' : '대화'} · ${sortLabel}` }));

    const ids = [];
    for (const node of roots) this.#renderNode(node, 0, this.#tree, result, ids);

    if (result && !result.visible.size) {
      body.append(el('div', { class: 'empty', text: '일치하는 대화가 없습니다.' }));
    }

    if (!result) body.append(this.#rootDropZone());

    if (!ids.includes(this.#focusId)) this.#focusId = ids.includes(this.#activeId) ? this.#activeId : ids[0] ?? null;
    for (const li of this.#tree.querySelectorAll('[role="treeitem"]')) {
      li.tabIndex = li.dataset.id === this.#focusId ? 0 : -1;
    }

    if (this.#renamingId) {
      const input = this.#tree.querySelector('.rename');
      input?.focus();
      input?.select();
    }
  }

  #renderNode(node, level, parentList, result, ids) {
    if (result && !result.visible.has(node.id)) return;
    const children = this.#sorted(this.#store.children(node.id));
    const visibleChildren = result ? children.filter((c) => result.visible.has(c.id)) : children;
    // While searching, expand everything that leads to a hit.
    const expanded = visibleChildren.length > 0 && (result ? true : !node.collapsed);

    const li = el('li', {
      role: 'treeitem',
      'data-id': node.id,
      'aria-level': String(level + 1),
      'aria-selected': String(node.id === this.#activeId),
      'aria-expanded': visibleChildren.length ? String(expanded) : null,
      'aria-label': node.title || '제목 없는 대화',
      style: `--tc-level:${level}`,
    });
    ids.push(node.id);

    const twisty = el('button', {
      type: 'button',
      class: `twisty${visibleChildren.length ? '' : ' leaf'}`,
      tabindex: '-1',
      'aria-hidden': 'true',
      html: icons.chevronRight(16),
      onclick: (e) => {
        e.stopPropagation();
        this.#store.setCollapsed(node.id, expanded);
      },
    });

    const title =
      this.#renamingId === node.id
        ? this.#renameInput(node)
        : el('span', { class: `title${node.title ? '' : ' untitled'}` }, this.#highlight(node.title || '제목 없는 대화'));

    const titleLine = el('span', { class: 'title-line' }, [title]);
    if (node.provisional) {
      titleLine.append(el('span', { class: 'badge', text: '저장 전', title: '첫 메시지를 보내면 저장됩니다. 새로고침하면 사라집니다.' }));
    }
    const label = el('span', { class: 'label' }, [titleLine]);
    if (node.branchFrom) {
      label.append(
        el('span', { class: 'sub', title: node.branchFrom.excerpt }, [
          el('span', { class: 'sub-icon', html: icons.cornerDownRight(14) }),
          el('span', { class: 'sub-text' }, this.#highlight(node.branchFrom.excerpt || '분기 지점')),
        ]),
      );
    }

    const menuBtn = el('button', {
      type: 'button',
      class: 'row-menu icon-btn',
      tabindex: '-1',
      'aria-label': '노드 메뉴',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      html: icons.ellipsis(16),
      onclick: (e) => {
        e.stopPropagation();
        this.#openNodeMenu(node, e.currentTarget);
      },
    });

    const row = el('div', { class: 'row', draggable: this.#renamingId ? 'false' : 'true' }, [twisty, label, menuBtn]);
    row.addEventListener('click', () => {
      if (this.#renamingId === node.id) return;
      this.#focusId = node.id;
      this.#cb.onOpenNode(node);
    });
    row.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.#startRename(node.id);
    });
    this.#wireDrag(row, node);

    li.append(row);
    if (expanded) {
      const group = el('ul', { role: 'group', style: `--tc-level:${level}` });
      for (const child of visibleChildren) this.#renderNode(child, level + 1, group, result, ids);
      li.append(group);
    }
    parentList.append(li);
  }

  #sorted(nodes) {
    return sortNodes(nodes, this.#settings.sort);
  }

  #updateSettings(patch) {
    this.#settings = { ...this.#settings, ...patch };
    this.#cb.onSettingsChange?.(structuredClone(this.#settings));
  }

  // ---- sort --------------------------------------------------------------

  #openSortMenu(anchor) {
    const { key, dir } = this.#settings.sort;
    const pick = (sort) => {
      this.#updateSettings({ sort });
      this.render();
    };
    this.#showMenu(
      [
        { heading: '정렬 기준' },
        ...Object.entries(SORT_LABELS).map(([k, label]) => ({
          label,
          checked: k === key,
          run: () => pick({ key: k, dir: k === key ? dir : DEFAULT_DIRECTION[k] }),
        })),
        'sep',
        { heading: '순서' },
        ...(key === 'title' ? ['asc', 'desc'] : ['desc', 'asc']).map((d) => ({ label: DIRECTION_LABELS[key][d], checked: d === dir, run: () => pick({ key, dir: d }) })),
      ],
      anchor,
    );
  }

  // ---- resize (drag the left edge) -----------------------------------------

  #applyWidth(width) {
    const w = clampPanelWidth(width, innerWidth);
    this.#panel.style.width = `${w}px`;
    this.#resizer.setAttribute('aria-valuenow', String(w));
    this.#currentWidth = w;
    this.#emitLayout();
    return w;
  }

  #emitLayout() {
    this.#cb.onLayoutChange?.({ open: this.isOpen, width: this.#currentWidth });
  }

  #wireResize() {
    const r = this.#resizer;
    let dragging = false;
    r.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      r.setPointerCapture(e.pointerId);
      r.classList.add('active');
      this.#panel.classList.add('resizing');
    });
    r.addEventListener('pointermove', (e) => {
      if (dragging) this.#applyWidth(innerWidth - e.clientX);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      r.releasePointerCapture?.(e.pointerId);
      r.classList.remove('active');
      this.#panel.classList.remove('resizing');
      this.#updateSettings({ panelWidth: this.#applyWidth(innerWidth - e.clientX) });
    };
    r.addEventListener('pointerup', end);
    r.addEventListener('pointercancel', end);
    r.addEventListener('dblclick', () => this.#updateSettings({ panelWidth: this.#applyWidth(PANEL_WIDTH.default) }));
    r.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 64 : 16;
      let next = null;
      if (e.key === 'ArrowLeft') next = this.#settings.panelWidth + step;
      else if (e.key === 'ArrowRight') next = this.#settings.panelWidth - step;
      else if (e.key === 'Home') next = PANEL_WIDTH.max;
      else if (e.key === 'End') next = PANEL_WIDTH.min;
      if (next == null) return;
      e.preventDefault();
      this.#updateSettings({ panelWidth: this.#applyWidth(next) });
    });
  }

  #highlight(text) {
    return highlightSegments(text, this.#query).map((s) => (s.hit ? el('mark', { text: s.text }) : document.createTextNode(s.text)));
  }

  #emptyState() {
    return el('div', { class: 'empty' }, [
      el('strong', { text: '아직 트리가 비어 있습니다' }),
      el('br'),
      document.createTextNode('대화를 열면 여기에 추가됩니다. 답변 아래의 '),
      el('span', { class: 'inline-icon', html: icons.branch(18) }),
      document.createTextNode(' 버튼이나 ChatGPT의 '),
      el('strong', { text: '대화 브랜치 → 새 채팅으로 브랜치' }),
      document.createTextNode('로 가지를 만들 수 있습니다.'),
    ]);
  }

  #rootDropZone() {
    const zone = el('div', { class: 'root-drop', text: '여기에 놓으면 최상위로 이동' });
    zone.hidden = true;
    zone.addEventListener('dragover', (e) => {
      if (!this.#dragId) return;
      e.preventDefault();
      zone.classList.add('drop-target');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drop-target'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drop-target');
      if (this.#dragId) this.#store.move(this.#dragId, null);
    });
    return zone;
  }

  // ---- drag & drop: reparent like a file explorer ------------------------

  #wireDrag(row, node) {
    row.addEventListener('dragstart', (e) => {
      this.#dragId = node.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.title || node.id);
      row.classList.add('dragging');
      const zone = this.#tree.parentElement.querySelector('.root-drop');
      if (zone && node.parentId) zone.hidden = false;
    });
    row.addEventListener('dragend', () => {
      this.#dragId = null;
      row.classList.remove('dragging');
      const zone = this.#tree.parentElement.querySelector('.root-drop');
      if (zone) zone.hidden = true;
    });
    row.addEventListener('dragover', (e) => {
      if (!this.#canDrop(node.id)) return;
      e.preventDefault();
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('drop-target');
      const dragged = this.#dragId;
      if (!dragged || !this.#canDrop(node.id)) return;
      await this.#store.move(dragged, node.id);
      await this.#store.setCollapsed(node.id, false);
    });
  }

  #canDrop(targetId) {
    const dragged = this.#dragId;
    if (!dragged || dragged === targetId) return false;
    if (this.#store.get(dragged)?.parentId === targetId) return false;
    return !this.#store.ancestors(targetId).some((a) => a.id === dragged);
  }

  // ---- rename ------------------------------------------------------------

  #startRename(id) {
    this.#closeMenu();
    this.#renamingId = id;
    this.render();
  }

  #renameInput(node) {
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const value = input.value;
      this.#renamingId = null;
      if (save) await this.#store.rename(node.id, value);
      else this.render();
      this.#focusRow(node.id);
    };
    const input = el('input', {
      class: 'rename',
      value: node.title || '',
      'aria-label': '이름 변경',
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      },
      onblur: () => finish(true),
      onclick: (e) => e.stopPropagation(),
    });
    return input;
  }

  // ---- menus -------------------------------------------------------------

  #openNodeMenu(node, anchor) {
    const items = [{ icon: icons.pencil(18), label: '이름 변경', run: () => this.#startRename(node.id) }];
    if (node.branchFrom) {
      items.push({ icon: icons.cornerDownRight(18), label: '분기 지점으로 이동', run: () => this.#cb.onGoToBranchPoint(node) });
    }
    if (node.parentId) {
      items.push({ icon: icons.arrowUpLeft(18), label: '최상위로 이동', run: () => this.#store.move(node.id, null) });
    }
    items.push('sep', {
      icon: icons.trash(18),
      label: '트리에서 제거',
      danger: true,
      run: () => this.#store.remove(node.id),
    });
    this.#showMenu(items, anchor);
  }

  #openPanelMenu(anchor) {
    const count = this.#store.all().length;
    this.#showMenu(
      [
        {
          icon: icons.tree(18),
          label: '모두 펼치기',
          run: () => this.#store.all().forEach((n) => this.#store.setCollapsed(n.id, false)),
        },
        'sep',
        {
          icon: icons.trash(18),
          label: '트리 데이터 모두 지우기',
          danger: true,
          disabled: !count,
          run: () => this.#confirmClear(count),
        },
      ],
      anchor,
    );
  }

  #showMenu(items, anchor) {
    this.#closeMenu();
    this.#menuReturnFocus = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    this.#menu.replaceChildren(
      ...items
        .filter((i) => i === 'sep' || !i.disabled)
        .map((i) => {
          if (i === 'sep') return el('div', { class: 'menu-sep', role: 'separator' });
          if (i.heading) return el('div', { class: 'menu-heading', role: 'presentation', text: i.heading });
          const radio = 'checked' in i;
          return el(
            'button',
            {
              type: 'button',
              role: radio ? 'menuitemradio' : 'menuitem',
              'aria-checked': radio ? String(i.checked) : null,
              tabindex: '-1',
              class: `menu-item${i.danger ? ' danger' : ''}`,
              onclick: () => {
                this.#closeMenu(false);
                i.run();
              },
            },
            radio
              ? [el('span', { text: i.label, class: 'menu-label' }), el('span', { class: 'menu-check', html: i.checked ? icons.check(16) : '' })]
              : [el('span', { html: i.icon, style: 'display:inline-flex' }), el('span', { text: i.label })],
          );
        }),
    );
    this.#menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const m = this.#menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - m.width, innerWidth - m.width - 8));
    const below = r.bottom + 4;
    const top = below + m.height > innerHeight - 8 ? Math.max(8, r.top - m.height - 4) : below;
    this.#menu.style.left = `${left}px`;
    this.#menu.style.top = `${top}px`;
    (this.#menu.querySelector('[aria-checked="true"]') ?? this.#menu.querySelector('[role^="menuitem"]'))?.focus();
  }

  #closeMenu(restoreFocus = true) {
    if (this.#menu.hidden) return;
    this.#menu.hidden = true;
    this.#menuReturnFocus?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.#menuReturnFocus?.focus();
    this.#menuReturnFocus = null;
  }

  #onMenuKey(e) {
    const items = [...this.#menu.querySelectorAll('[role^="menuitem"]')];
    const i = items.indexOf(this.#root.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      this.#closeMenu();
    }
  }

  #confirmClear(count) {
    const cancel = el('button', { type: 'button', class: 'btn secondary', text: '취소' });
    const ok = el('button', { type: 'button', class: 'btn danger', text: '모두 지우기' });
    const dialog = el('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'tc-clear-title' }, [
      el('h2', { id: 'tc-clear-title', text: '트리 데이터를 지울까요?' }),
      el('p', {
        text: `TreeChat에 저장된 ${count}개 노드와 분기 정보가 이 브라우저에서 삭제됩니다. ChatGPT의 대화 자체는 삭제되지 않습니다.`,
      }),
      el('div', { class: 'dialog-actions' }, [cancel, ok]),
    ]);
    const closeDialog = () => {
      this.#scrim.hidden = true;
      this.#scrim.replaceChildren();
    };
    cancel.onclick = closeDialog;
    ok.onclick = async () => {
      closeDialog();
      await this.#store.clearAll();
      this.toast('트리 데이터를 지웠습니다.');
    };
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeDialog();
      }
    });
    this.#scrim.replaceChildren(dialog);
    this.#scrim.hidden = false;
    cancel.focus();
  }

  // ---- keyboard navigation (WAI-ARIA tree pattern) ------------------------

  #visibleIds() {
    return [...this.#tree.querySelectorAll('[role="treeitem"]')].map((li) => li.dataset.id);
  }

  #focusRow(id) {
    if (!id) return false;
    const li = this.#tree.querySelector(`[role="treeitem"][data-id="${CSS.escape(id)}"]`);
    if (!li) return false;
    this.#focusId = id;
    for (const other of this.#tree.querySelectorAll('[role="treeitem"]')) other.tabIndex = other === li ? 0 : -1;
    li.focus();
    li.scrollIntoView({ block: 'nearest' });
    return true;
  }

  #onTreeKey(e) {
    if (this.#renamingId) return;
    const li = e.target.closest?.('[role="treeitem"]');
    if (!li) return;
    const id = li.dataset.id;
    const node = this.#store.get(id);
    const ids = this.#visibleIds();
    const idx = ids.indexOf(id);
    const expanded = li.getAttribute('aria-expanded');
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.#focusRow(ids[idx + 1]);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (idx === 0) this.#search.focus();
        else this.#focusRow(ids[idx - 1]);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (expanded === 'false') this.#store.setCollapsed(id, false).then(() => this.#focusRow(id));
        else if (expanded === 'true') this.#focusRow(ids[idx + 1]);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (expanded === 'true') this.#store.setCollapsed(id, true).then(() => this.#focusRow(id));
        else if (node?.parentId) this.#focusRow(node.parentId);
        break;
      case 'Home':
        e.preventDefault();
        this.#focusRow(ids[0]);
        break;
      case 'End':
        e.preventDefault();
        this.#focusRow(ids[ids.length - 1]);
        break;
      case 'Enter':
        e.preventDefault();
        if (node) this.#cb.onOpenNode(node);
        break;
      case 'F2':
        e.preventDefault();
        this.#startRename(id);
        break;
      case 'ContextMenu':
        e.preventDefault();
        if (node) this.#openNodeMenu(node, li.querySelector('.row-menu'));
        break;
    }
  }
}
