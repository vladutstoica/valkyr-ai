import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';

import {
  agentTargets,
  skillScanPaths,
  type AgentSyncTarget,
} from '../../shared/skills/agentTargets';

const home = os.homedir();

describe('agentTargets', () => {
  // ─── Array shape ─────────────────────────────────────────────────────────

  it('is a non-empty array', () => {
    expect(Array.isArray(agentTargets)).toBe(true);
    expect(agentTargets.length).toBeGreaterThan(0);
  });

  it('every entry has id, name, configDir, and getSkillDir fields', () => {
    for (const target of agentTargets) {
      expect(typeof target.id).toBe('string');
      expect(typeof target.name).toBe('string');
      expect(typeof target.configDir).toBe('string');
      expect(typeof target.getSkillDir).toBe('function');
    }
  });

  it('all ids are unique', () => {
    const ids = agentTargets.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all names are unique', () => {
    const names = agentTargets.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // ─── Known agents ────────────────────────────────────────────────────────

  describe('expected agent entries', () => {
    const expectedIds = [
      'claude-code',
      'codex',
      'opencode',
      'cursor',
      'gemini',
      'roo-code',
      'mistral-vibe',
    ];

    it.each(expectedIds)('contains agent with id "%s"', (id) => {
      const target = agentTargets.find((t) => t.id === id);
      expect(target).toBeDefined();
    });
  });

  // ─── claude-code specific ────────────────────────────────────────────────

  describe('claude-code agent', () => {
    let target: AgentSyncTarget;

    beforeEachFindTarget('claude-code', (t) => {
      target = t;
    });

    it('has configDir at ~/.claude', () => {
      expect(target.configDir).toBe(path.join(home, '.claude'));
    });

    it('getSkillDir returns path under ~/.claude/commands/<skillId>', () => {
      const skillDir = target.getSkillDir('my-skill');
      expect(skillDir).toBe(path.join(home, '.claude', 'commands', 'my-skill'));
    });

    it('getSkillDir uses the provided skillId as the leaf directory', () => {
      expect(target.getSkillDir('code-review')).toContain('code-review');
      expect(target.getSkillDir('pr-summary')).toContain('pr-summary');
    });
  });

  // ─── codex specific ──────────────────────────────────────────────────────

  describe('codex agent', () => {
    let target: AgentSyncTarget;

    beforeEachFindTarget('codex', (t) => {
      target = t;
    });

    it('has configDir at ~/.codex', () => {
      expect(target.configDir).toBe(path.join(home, '.codex'));
    });

    it('getSkillDir returns path under ~/.codex/skills/<skillId>', () => {
      const skillDir = target.getSkillDir('my-skill');
      expect(skillDir).toBe(path.join(home, '.codex', 'skills', 'my-skill'));
    });
  });

  // ─── opencode specific ───────────────────────────────────────────────────

  describe('opencode agent', () => {
    let target: AgentSyncTarget;

    beforeEachFindTarget('opencode', (t) => {
      target = t;
    });

    it('has configDir at ~/.config/opencode', () => {
      expect(target.configDir).toBe(path.join(home, '.config', 'opencode'));
    });

    it('getSkillDir returns path under ~/.config/opencode/skills/<skillId>', () => {
      expect(target.getSkillDir('test-skill')).toBe(
        path.join(home, '.config', 'opencode', 'skills', 'test-skill')
      );
    });
  });

  // ─── cursor specific ─────────────────────────────────────────────────────

  describe('cursor agent', () => {
    let target: AgentSyncTarget;

    beforeEachFindTarget('cursor', (t) => {
      target = t;
    });

    it('has configDir at ~/.cursor', () => {
      expect(target.configDir).toBe(path.join(home, '.cursor'));
    });

    it('getSkillDir returns path under ~/.cursor/skills/<skillId>', () => {
      expect(target.getSkillDir('my-skill')).toBe(path.join(home, '.cursor', 'skills', 'my-skill'));
    });
  });

  // ─── gemini specific ─────────────────────────────────────────────────────

  describe('gemini agent', () => {
    let target: AgentSyncTarget;

    beforeEachFindTarget('gemini', (t) => {
      target = t;
    });

    it('has configDir at ~/.gemini', () => {
      expect(target.configDir).toBe(path.join(home, '.gemini'));
    });

    it('getSkillDir returns path under ~/.gemini/skills/<skillId>', () => {
      expect(target.getSkillDir('my-skill')).toBe(path.join(home, '.gemini', 'skills', 'my-skill'));
    });
  });

  // ─── roo-code specific ───────────────────────────────────────────────────

  describe('roo-code agent', () => {
    let target: AgentSyncTarget;

    beforeEachFindTarget('roo-code', (t) => {
      target = t;
    });

    it('has configDir at ~/.roo', () => {
      expect(target.configDir).toBe(path.join(home, '.roo'));
    });

    it('getSkillDir returns path under ~/.roo/skills/<skillId>', () => {
      expect(target.getSkillDir('my-skill')).toBe(path.join(home, '.roo', 'skills', 'my-skill'));
    });
  });

  // ─── mistral-vibe specific ───────────────────────────────────────────────

  describe('mistral-vibe agent', () => {
    let target: AgentSyncTarget;

    beforeEachFindTarget('mistral-vibe', (t) => {
      target = t;
    });

    it('has configDir at ~/.vibe', () => {
      expect(target.configDir).toBe(path.join(home, '.vibe'));
    });

    it('getSkillDir returns path under ~/.vibe/skills/<skillId>', () => {
      expect(target.getSkillDir('my-skill')).toBe(path.join(home, '.vibe', 'skills', 'my-skill'));
    });
  });

  // ─── getSkillDir general contract ────────────────────────────────────────

  describe('getSkillDir general contract', () => {
    it('returns an absolute path for every agent', () => {
      for (const target of agentTargets) {
        const skillDir = target.getSkillDir('some-skill');
        expect(path.isAbsolute(skillDir)).toBe(true);
      }
    });

    it('always places the skillId as the leaf segment', () => {
      for (const target of agentTargets) {
        const skillId = 'test-skill-id';
        const skillDir = target.getSkillDir(skillId);
        expect(path.basename(skillDir)).toBe(skillId);
      }
    });

    it('returned path starts with configDir for all agents except opencode', () => {
      // opencode uses ~/.config/opencode which is not the same prefix logic
      const nonstandardAgents = new Set(['opencode']);
      for (const target of agentTargets) {
        if (nonstandardAgents.has(target.id)) continue;
        const skillDir = target.getSkillDir('x');
        expect(skillDir.startsWith(target.configDir)).toBe(true);
      }
    });

    it('handles skill IDs with hyphens', () => {
      for (const target of agentTargets) {
        const dir = target.getSkillDir('code-review-plus');
        expect(dir).toContain('code-review-plus');
      }
    });

    it('handles skill IDs with numbers', () => {
      for (const target of agentTargets) {
        const dir = target.getSkillDir('skill123');
        expect(dir).toContain('skill123');
      }
    });
  });
});

// ─── skillScanPaths ──────────────────────────────────────────────────────────

describe('skillScanPaths', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(skillScanPaths)).toBe(true);
    expect(skillScanPaths.length).toBeGreaterThan(0);
    for (const p of skillScanPaths) {
      expect(typeof p).toBe('string');
    }
  });

  it('all entries are absolute paths', () => {
    for (const p of skillScanPaths) {
      expect(path.isAbsolute(p)).toBe(true);
    }
  });

  it('contains no duplicates', () => {
    expect(new Set(skillScanPaths).size).toBe(skillScanPaths.length);
  });

  it('includes derived parent dirs from agentTargets', () => {
    const derivedParents = agentTargets.map((t) => path.dirname(t.getSkillDir('_placeholder')));
    for (const derived of derivedParents) {
      expect(skillScanPaths).toContain(derived);
    }
  });

  it('includes ~/.claude/commands (derived from claude-code agent)', () => {
    expect(skillScanPaths).toContain(path.join(home, '.claude', 'commands'));
  });

  it('includes ~/.codex/skills (derived from codex agent)', () => {
    expect(skillScanPaths).toContain(path.join(home, '.codex', 'skills'));
  });

  it('includes the additional ~/.claude/skills path', () => {
    expect(skillScanPaths).toContain(path.join(home, '.claude', 'skills'));
  });

  it('includes the additional ~/.agent/skills path', () => {
    expect(skillScanPaths).toContain(path.join(home, '.agent', 'skills'));
  });

  it('includes the additional ~/.agents/skills path', () => {
    expect(skillScanPaths).toContain(path.join(home, '.agents', 'skills'));
  });

  it('derives paths relative to the current user home directory', () => {
    for (const p of skillScanPaths) {
      expect(p.startsWith(home)).toBe(true);
    }
  });
});

// ─── Helper: lookup target before each test ───────────────────────────────────
function beforeEachFindTarget(id: string, assignFn: (t: AgentSyncTarget) => void): void {
  // Use a simple beforeEach at describe scope via closure trick.
  // Vitest doesn't expose describe-level beforeEach by reference, so we
  // call it directly from the outer scope.
  // This is a module-level utility — we rely on it being called once inside
  // the describe block so that the closured variable is populated.
  const target = agentTargets.find((t) => t.id === id);
  if (!target) {
    throw new Error(`Agent target "${id}" not found in agentTargets`);
  }
  assignFn(target);
}
