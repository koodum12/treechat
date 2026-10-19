import { BaseAdapter } from '../base-adapter.js';
import { CONVERSATION_PATH } from './selectors.js';

// Placeholder. See ClaudeAdapter for why this stays inactive.
export class GeminiAdapter extends BaseAdapter {
  id = 'gemini';
  label = 'Gemini';
  hosts = ['gemini.google.com'];
  status = 'planned';

  getConversationId(loc = location) {
    return loc.pathname.match(CONVERSATION_PATH)?.[1] ?? null;
  }
}
