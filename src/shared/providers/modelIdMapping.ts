/**
 * Maps ACP/provider IDs to OpenRouter model prefixes and StatusPage URLs.
 */

/** Maps provider IDs to OpenRouter slug prefixes */
export const PROVIDER_TO_OPENROUTER: Record<string, string> = {
  claude: 'anthropic',
  codex: 'openai',
  gemini: 'google',
  mistral: 'mistralai',
  qwen: 'qwen',
};

/** Maps provider IDs to StatusPage base URLs */
export const PROVIDER_STATUS_PAGES: Record<string, string> = {
  claude: 'https://status.anthropic.com',
  codex: 'https://status.openai.com',
};

/** Maps provider IDs to StatusPage component names to monitor */
export const PROVIDER_STATUS_COMPONENTS: Record<string, string[]> = {
  claude: ['API', 'api.anthropic.com'],
  codex: ['API'],
};
