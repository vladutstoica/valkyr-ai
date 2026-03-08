import type { UIMessage } from 'ai';

/**
 * Map ACP model aliases (e.g. "default", "opus") to real model IDs that tokenlens can resolve.
 * Uses the description hint (e.g. "Sonnet 4.6 · Best for everyday tasks") as the primary signal.
 */
const MODEL_HINT_MAP: Record<string, string> = {
  'sonnet 4.6': 'claude-sonnet-4-20250514',
  'sonnet 4.5': 'claude-sonnet-4-20250514',
  'sonnet 4': 'claude-sonnet-4-20250514',
  'opus 4.6': 'claude-opus-4-20250514',
  'opus 4.5': 'claude-opus-4-20250514',
  'opus 4': 'claude-opus-4-20250514',
  'haiku 4.5': 'claude-3-5-haiku-20241022',
  'haiku 4': 'claude-3-5-haiku-20241022',
  'haiku 3.5': 'claude-3-5-haiku-20241022',
  'gpt-4o': 'gpt-4o',
  'gpt-4.1': 'gpt-4.1',
  o3: 'o3',
  'o4-mini': 'o4-mini',
  'gemini 2.5': 'gemini-2.5-pro',
};

const ALIAS_MAP: Record<string, string> = {
  default: 'claude-sonnet-4-20250514',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-3-5-haiku-20241022',
};

export function resolveModelId(acpModelId: string, description?: string): string {
  // 1. Try to extract a hint from the description (e.g. "Sonnet 4.6 · ...")
  if (description) {
    const lower = description.toLowerCase();
    for (const [hint, realId] of Object.entries(MODEL_HINT_MAP)) {
      if (lower.includes(hint)) return realId;
    }
  }

  // 2. Try direct alias mapping
  const aliased = ALIAS_MAP[acpModelId.toLowerCase()];
  if (aliased) return aliased;

  // 3. If the ID already looks like a real model ID, pass it through
  return acpModelId;
}

export const CHARS_PER_TOKEN = 4;
export const MESSAGE_OVERHEAD_CHARS = 16; // ~4 tokens per message for role/separator markers

/** Rough client-side token estimate from the UI message array. */
export function estimateTokensFromMessages(messages: UIMessage[]): {
  total: number;
  inputTokens: number;
  outputTokens: number;
} {
  let inputChars = 0;
  let outputChars = 0;
  for (const msg of messages) {
    let msgChars = MESSAGE_OVERHEAD_CHARS;
    for (const part of msg.parts ?? []) {
      if (part.type === 'text' || part.type === 'reasoning') {
        msgChars += part.text.length;
      } else if (part.type.startsWith('tool-')) {
        // Tool parts have toolCallId, title, input, output — estimate from serialised form
        msgChars += JSON.stringify(part).length;
      }
    }
    if (msg.role === 'assistant') {
      outputChars += msgChars;
    } else {
      inputChars += msgChars;
    }
  }
  const inputTokens = Math.ceil(inputChars / CHARS_PER_TOKEN);
  const outputTokens = Math.ceil(outputChars / CHARS_PER_TOKEN);
  return { total: inputTokens + outputTokens, inputTokens, outputTokens };
}
