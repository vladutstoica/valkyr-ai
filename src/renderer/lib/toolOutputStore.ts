import { create } from 'zustand';

type ToolOutputEntry = {
  output: string;
  done: boolean;
};

type ToolOutputState = {
  entries: Map<string, ToolOutputEntry>;
  /** Append incremental output for a running tool. */
  append: (toolCallId: string, text: string) => void;
  /** Mark a tool as done (completed/failed). */
  markDone: (toolCallId: string) => void;
  /** Get the accumulated output for a tool. */
  get: (toolCallId: string) => string;
  /** Clear a specific entry. */
  clear: (toolCallId: string) => void;
};

export const useToolOutputStore = create<ToolOutputState>((set, get) => ({
  entries: new Map(),

  append: (toolCallId, text) => {
    set((state) => {
      const next = new Map(state.entries);
      const existing = next.get(toolCallId);
      if (existing) {
        next.set(toolCallId, { ...existing, output: existing.output + text });
      } else {
        next.set(toolCallId, { output: text, done: false });
      }
      return { entries: next };
    });
  },

  markDone: (toolCallId) => {
    set((state) => {
      const next = new Map(state.entries);
      const existing = next.get(toolCallId);
      if (existing) {
        next.set(toolCallId, { ...existing, done: true });
      }
      return { entries: next };
    });
  },

  get: (toolCallId) => {
    return get().entries.get(toolCallId)?.output ?? '';
  },

  clear: (toolCallId) => {
    set((state) => {
      const next = new Map(state.entries);
      next.delete(toolCallId);
      return { entries: next };
    });
  },
}));

/** Hook to subscribe to streaming output for a specific tool call. */
export function useToolOutput(toolCallId: string): string {
  return useToolOutputStore((state) => state.entries.get(toolCallId)?.output ?? '');
}
