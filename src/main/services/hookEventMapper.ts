/**
 * Maps Claude Code hook event types to normalized status states.
 *
 * Claude Code fires these hook events:
 *   - UserPromptSubmit — user sent a prompt
 *   - Stop — agent finished working
 *   - PostToolUse — agent completed a tool call (still working)
 *   - PostToolUseFailure — tool call failed (still working)
 *   - PermissionRequest — agent needs user approval
 *
 * We normalize to three states that drive the sidebar status dot.
 */

export type HookStatus = 'working' | 'needs-input' | 'done';

const EVENT_TO_STATUS: Record<string, HookStatus> = {
  // Agent is actively working
  UserPromptSubmit: 'working',
  PostToolUse: 'working',
  PostToolUseFailure: 'working',

  // Agent needs user input/approval
  PermissionRequest: 'needs-input',

  // Agent finished
  Stop: 'done',
};

/**
 * Map a raw hook event type to a normalized status.
 * Returns null for unknown event types (forward-compatible).
 */
export function mapHookEvent(eventType: string): HookStatus | null {
  return EVENT_TO_STATUS[eventType] ?? null;
}
