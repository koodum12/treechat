import { ChatGPTAdapter } from './chatgpt/adapter.js';
import { ClaudeAdapter } from './claude/adapter.js';
import { GeminiAdapter } from './gemini/adapter.js';

// To add a site: implement an adapter (see base-adapter.js), list it here,
// set status 'ready', and add the host to manifest.json content_scripts.matches
// and web_accessible_resources.matches.
const ADAPTERS = [ChatGPTAdapter, ClaudeAdapter, GeminiAdapter];

export function resolveAdapter(loc = location) {
  for (const Adapter of ADAPTERS) {
    const adapter = new Adapter();
    if (adapter.status === 'ready' && adapter.matches(loc)) return adapter;
  }
  return null;
}
