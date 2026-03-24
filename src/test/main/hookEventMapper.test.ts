import { describe, it, expect } from 'vitest';
import { mapHookEvent, type HookStatus } from '../../main/services/hookEventMapper';

describe('hookEventMapper', () => {
  describe('mapHookEvent', () => {
    describe('working status events', () => {
      it('maps UserPromptSubmit to working', () => {
        expect(mapHookEvent('UserPromptSubmit')).toBe('working');
      });

      it('maps PostToolUse to working', () => {
        expect(mapHookEvent('PostToolUse')).toBe('working');
      });

      it('maps PostToolUseFailure to working', () => {
        expect(mapHookEvent('PostToolUseFailure')).toBe('working');
      });
    });

    describe('needs-input status events', () => {
      it('maps PermissionRequest to needs-input', () => {
        expect(mapHookEvent('PermissionRequest')).toBe('needs-input');
      });
    });

    describe('done status events', () => {
      it('maps Stop to done', () => {
        expect(mapHookEvent('Stop')).toBe('done');
      });
    });

    describe('unknown events', () => {
      it('returns null for an unrecognized event type', () => {
        expect(mapHookEvent('UnknownEvent')).toBeNull();
      });

      it('returns null for an empty string', () => {
        expect(mapHookEvent('')).toBeNull();
      });

      it('returns null for a lowercase variant of a known event', () => {
        // Event names are case-sensitive
        expect(mapHookEvent('stop')).toBeNull();
        expect(mapHookEvent('permissionrequest')).toBeNull();
        expect(mapHookEvent('postToolUse')).toBeNull();
      });

      it('returns null for an event name with extra whitespace', () => {
        expect(mapHookEvent(' Stop')).toBeNull();
        expect(mapHookEvent('Stop ')).toBeNull();
      });

      it('returns null for a future/undocumented event type', () => {
        expect(mapHookEvent('PreToolUse')).toBeNull();
        expect(mapHookEvent('AgentStart')).toBeNull();
        expect(mapHookEvent('SubagentStop')).toBeNull();
      });

      it('returns null for numeric strings', () => {
        expect(mapHookEvent('0')).toBeNull();
        expect(mapHookEvent('404')).toBeNull();
      });

      it('returns null for special-character strings', () => {
        expect(mapHookEvent('__proto__')).toBeNull();
        expect(mapHookEvent('constructor')).toBeNull();
      });
    });

    describe('return type', () => {
      it('returns a HookStatus value (not undefined) for known events', () => {
        const result = mapHookEvent('Stop');
        // Confirm it is exactly one of the three valid statuses
        const validStatuses: HookStatus[] = ['working', 'needs-input', 'done'];
        expect(validStatuses).toContain(result);
      });

      it('never returns undefined — only null or a valid status', () => {
        expect(mapHookEvent('anything')).not.toBeUndefined();
        expect(mapHookEvent('Stop')).not.toBeUndefined();
      });
    });

    describe('complete event map exhaustiveness', () => {
      const knownMappings: Array<[string, HookStatus]> = [
        ['UserPromptSubmit', 'working'],
        ['PostToolUse', 'working'],
        ['PostToolUseFailure', 'working'],
        ['PermissionRequest', 'needs-input'],
        ['Stop', 'done'],
      ];

      it.each(knownMappings)('maps %s to %s', (event, expectedStatus) => {
        expect(mapHookEvent(event)).toBe(expectedStatus);
      });
    });
  });
});
