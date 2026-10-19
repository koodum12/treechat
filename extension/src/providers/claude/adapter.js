import { BaseAdapter } from '../base-adapter.js';
import { CONVERSATION_PATH } from './selectors.js';

// Placeholder. status 'planned' keeps it inactive, and claude.ai is not in the
// manifest's matches, so this never runs until it's implemented.
export class ClaudeAdapter extends BaseAdapter {
  id = 'claude';
  label = 'Claude';
  hosts = ['claude.ai'];
  status = 'planned';

  getConversationId(loc = location) {
    return loc.pathname.match(CONVERSATION_PATH)?.[1] ?? null;
  }
}
