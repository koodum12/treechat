// Contract every site adapter implements. The core (tree store, panel, branch
// flow) only talks to this interface, so supporting claude.ai or
// gemini.google.com means writing one adapter and adding its host to the manifest.
//
// Defaults are inert (return null / [] / false) so a partially written adapter
// can't break the page.

export class BaseAdapter {
  /** Stable id used as the storage namespace, e.g. 'chatgpt'. */
  id = 'base';
  /** Human-readable name shown in the panel. */
  label = 'Base';
  /** Hostnames this adapter handles. */
  hosts = [];
  /** 'ready' adapters get activated; 'planned' ones are skipped. */
  status = 'planned';

  matches(loc = location) {
    return this.hosts.includes(loc.hostname);
  }

  /** Conversation id for the current URL, or null on a new/unsaved chat. */
  getConversationId(_loc = location) {
    return null;
  }

  /**
   * True for a conversation that exists only in the page so far (e.g. a branch
   * that isn't saved until the first message). Such nodes are promoted to the
   * real id when the site saves them, or dropped if the user leaves.
   */
  isProvisionalId(_conversationId) {
    return false;
  }

  /** Ids of conversations the site lists right now (its sidebar/history). */
  getKnownConversationIds() {
    return [];
  }

  /** Path to open a conversation (used when it isn't in the native sidebar). */
  getConversationPath(_conversationId) {
    return null;
  }

  /** Title for a conversation if the page shows one, else null. */
  getConversationTitle(_conversationId) {
    return null;
  }

  /**
   * Assistant messages currently rendered.
   * @returns {Array<{ id: string, el: Element, actionBar: Element|null, complete: boolean }>}
   */
  getAssistantMessages() {
    return [];
  }

  /** Short plain-text excerpt of a message, used as the branch label. */
  getMessageExcerpt(_messageId, _maxLength = 80) {
    return '';
  }

  /** Element to scroll to for a message id, or null if not rendered. */
  findMessageElement(_messageId) {
    return null;
  }

  /** Where to mount the panel toggle button in the site's header, or null. */
  getHeaderMountPoint() {
    return null;
  }

  /** Navigate within the SPA when possible. */
  openConversation(_conversationId, _path) {}

  /**
   * Show the site's own branch choices for a message (e.g. "Branch in new
   * chat" / "Branch to Work mode") and let the user pick one.
   * @returns {Promise<'opened'|'disabled'|'not-found'>}
   *   'opened'    the choices are on screen
   *   'disabled'  the site shows the action but won't allow it right now
   *   'not-found' the action couldn't be located
   */
  async openBranchMenu(_messageId) {
    return 'not-found';
  }

  /**
   * Call `cb(messageId)` when the user picks one of the site's branch
   * choices (from our button or the site's own menu). Returns an unsubscribe function.
   */
  onNativeBranch(_cb) {
    return () => {};
  }

  /**
   * CSS that shrinks the site's layout so a right-side panel of `width` px
   * sits beside it instead of covering it. null = the panel overlays.
   */
  getLayoutPushCss(_width) {
    return null;
  }

  /** Element whose background decides light/dark theme. */
  getThemeElement() {
    return document.body;
  }
}
