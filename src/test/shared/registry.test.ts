import { describe, it, expect } from 'vitest';
import {
  PROVIDER_IDS,
  PROVIDERS,
  getProvider,
  getInstallCommandForProvider,
  isValidProviderId,
  getDocUrlForProvider,
  listDetectableProviders,
  type ProviderId,
  type ProviderDefinition,
} from '../../shared/providers/registry';

// ---------------------------------------------------------------------------
// PROVIDER_IDS constant
// ---------------------------------------------------------------------------

describe('PROVIDER_IDS', () => {
  it('is a non-empty readonly tuple', () => {
    expect(PROVIDER_IDS.length).toBeGreaterThan(0);
  });

  it('contains expected well-known provider IDs', () => {
    expect(PROVIDER_IDS).toContain('claude');
    expect(PROVIDER_IDS).toContain('codex');
    expect(PROVIDER_IDS).toContain('gemini');
    expect(PROVIDER_IDS).toContain('qwen');
    expect(PROVIDER_IDS).toContain('cursor');
    expect(PROVIDER_IDS).toContain('copilot');
    expect(PROVIDER_IDS).toContain('amp');
  });

  it('has no duplicate IDs', () => {
    const unique = new Set(PROVIDER_IDS);
    expect(unique.size).toBe(PROVIDER_IDS.length);
  });
});

// ---------------------------------------------------------------------------
// PROVIDERS array
// ---------------------------------------------------------------------------

describe('PROVIDERS', () => {
  it('has the same number of entries as PROVIDER_IDS', () => {
    expect(PROVIDERS.length).toBe(PROVIDER_IDS.length);
  });

  it('every provider has a unique id matching a PROVIDER_ID', () => {
    const ids = PROVIDERS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    for (const id of ids) {
      expect(PROVIDER_IDS).toContain(id);
    }
  });

  it('every provider has a non-empty name', () => {
    for (const provider of PROVIDERS) {
      expect(typeof provider.name).toBe('string');
      expect(provider.name.length).toBeGreaterThan(0);
    }
  });

  it('every provider with acpSupport has a non-empty command', () => {
    for (const provider of PROVIDERS) {
      if (provider.acpSupport) {
        expect(typeof provider.acpSupport.command).toBe('string');
        expect(provider.acpSupport.command.length).toBeGreaterThan(0);
      }
    }
  });

  it('providers with contextWindow have a positive integer value', () => {
    for (const provider of PROVIDERS) {
      if (provider.contextWindow !== undefined) {
        expect(typeof provider.contextWindow).toBe('number');
        expect(provider.contextWindow).toBeGreaterThan(0);
      }
    }
  });

  it('providers with envVars have non-empty string items', () => {
    for (const provider of PROVIDERS) {
      if (provider.envVars) {
        expect(Array.isArray(provider.envVars)).toBe(true);
        for (const envVar of provider.envVars) {
          expect(typeof envVar).toBe('string');
          expect(envVar.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('all terminalOnly providers have terminalOnly set to true', () => {
    const terminalOnlyProviders = PROVIDERS.filter((p) => p.terminalOnly);
    for (const p of terminalOnlyProviders) {
      expect(p.terminalOnly).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getProvider
// ---------------------------------------------------------------------------

describe('getProvider', () => {
  it('returns the correct provider definition for a known ID', () => {
    const provider = getProvider('claude');
    expect(provider).toBeDefined();
    expect(provider!.id).toBe('claude');
    expect(provider!.name).toBe('Claude Code');
  });

  it('returns the correct provider for every ID in PROVIDER_IDS', () => {
    for (const id of PROVIDER_IDS) {
      const provider = getProvider(id);
      expect(provider).toBeDefined();
      expect(provider!.id).toBe(id);
    }
  });

  it('returns undefined for an unknown provider ID', () => {
    const provider = getProvider('unknown-provider' as ProviderId);
    expect(provider).toBeUndefined();
  });

  it('returns the codex provider with the correct acpSupport args', () => {
    const provider = getProvider('codex');
    expect(provider!.acpSupport).toBeDefined();
    expect(provider!.acpSupport!.args).toContain('--acp');
  });

  it('returns the claude provider with acpMultiSession=true', () => {
    const provider = getProvider('claude');
    expect(provider!.acpMultiSession).toBe(true);
  });

  it('returns the gemini provider with the correct context window', () => {
    const provider = getProvider('gemini');
    expect(provider!.contextWindow).toBe(1000000);
  });
});

// ---------------------------------------------------------------------------
// getInstallCommandForProvider
// ---------------------------------------------------------------------------

describe('getInstallCommandForProvider', () => {
  it('returns the install command for a known provider', () => {
    const cmd = getInstallCommandForProvider('codex');
    expect(cmd).toBe('npm install -g @openai/codex');
  });

  it('returns the install command for claude', () => {
    const cmd = getInstallCommandForProvider('claude');
    expect(cmd).not.toBeNull();
    expect(typeof cmd).toBe('string');
    expect(cmd!.length).toBeGreaterThan(0);
  });

  it('returns null for a provider ID not in the map', () => {
    const cmd = getInstallCommandForProvider('nonexistent' as ProviderId);
    expect(cmd).toBeNull();
  });

  it('returns a non-null string for every provider that has an installCommand', () => {
    for (const provider of PROVIDERS) {
      if (provider.installCommand) {
        const cmd = getInstallCommandForProvider(provider.id);
        expect(cmd).toBe(provider.installCommand);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isValidProviderId
// ---------------------------------------------------------------------------

describe('isValidProviderId', () => {
  it('returns true for all valid provider IDs', () => {
    for (const id of PROVIDER_IDS) {
      expect(isValidProviderId(id)).toBe(true);
    }
  });

  it('returns false for an unknown string', () => {
    expect(isValidProviderId('unknown')).toBe(false);
    expect(isValidProviderId('vscode')).toBe(false);
    expect(isValidProviderId('')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isValidProviderId(null)).toBe(false);
    expect(isValidProviderId(undefined)).toBe(false);
    expect(isValidProviderId(42)).toBe(false);
    expect(isValidProviderId({})).toBe(false);
    expect(isValidProviderId([])).toBe(false);
    expect(isValidProviderId(true)).toBe(false);
  });

  it('is case-sensitive — uppercase versions of valid IDs are invalid', () => {
    expect(isValidProviderId('Claude')).toBe(false);
    expect(isValidProviderId('CODEX')).toBe(false);
    expect(isValidProviderId('GEMINI')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getDocUrlForProvider
// ---------------------------------------------------------------------------

describe('getDocUrlForProvider', () => {
  it('returns the doc URL for a known provider with docUrl', () => {
    const url = getDocUrlForProvider('codex');
    expect(url).toBe('https://github.com/openai/codex');
  });

  it('returns the doc URL for claude', () => {
    const url = getDocUrlForProvider('claude');
    expect(url).not.toBeNull();
    expect(url).toContain('http');
  });

  it('returns null for a provider ID not in the map', () => {
    const url = getDocUrlForProvider('nonexistent' as ProviderId);
    expect(url).toBeNull();
  });

  it('returns a non-null URL for every provider that has a docUrl', () => {
    for (const provider of PROVIDERS) {
      if (provider.docUrl) {
        const url = getDocUrlForProvider(provider.id);
        expect(url).toBe(provider.docUrl);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// listDetectableProviders
// ---------------------------------------------------------------------------

describe('listDetectableProviders', () => {
  it('returns only providers that are detectable (not detectable: false) and have commands', () => {
    const detectable = listDetectableProviders();
    for (const provider of detectable) {
      expect(provider.detectable).not.toBe(false);
      expect(provider.commands).toBeDefined();
      expect(provider.commands!.length).toBeGreaterThan(0);
    }
  });

  it('excludes providers where detectable is explicitly false', () => {
    const detectable = listDetectableProviders();
    const gooseProvider = detectable.find((p) => p.id === 'goose');
    // goose has detectable: false
    expect(gooseProvider).toBeUndefined();
  });

  it('excludes providers without any commands', () => {
    const detectable = listDetectableProviders();
    for (const provider of detectable) {
      expect(Array.isArray(provider.commands)).toBe(true);
      expect(provider.commands!.length).toBeGreaterThan(0);
    }
  });

  it('includes claude since it has commands and detectable is not false', () => {
    const detectable = listDetectableProviders();
    const claudeProvider = detectable.find((p) => p.id === 'claude');
    expect(claudeProvider).toBeDefined();
  });

  it('includes codex in the detectable list', () => {
    const detectable = listDetectableProviders();
    expect(detectable.some((p) => p.id === 'codex')).toBe(true);
  });

  it('returns a non-empty list', () => {
    const detectable = listDetectableProviders();
    expect(detectable.length).toBeGreaterThan(0);
  });

  it('returned providers are a subset of the full PROVIDERS list', () => {
    const detectable = listDetectableProviders();
    const allIds = new Set(PROVIDERS.map((p) => p.id));
    for (const provider of detectable) {
      expect(allIds.has(provider.id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Spot-checks for specific provider fields
// ---------------------------------------------------------------------------

describe('Individual provider spot-checks', () => {
  it('claude provider has planActivateCommand set to /plan', () => {
    const claude = getProvider('claude')!;
    expect(claude.planActivateCommand).toBe('/plan');
  });

  it('claude provider env var is ANTHROPIC_API_KEY', () => {
    const claude = getProvider('claude')!;
    expect(claude.envVars).toContain('ANTHROPIC_API_KEY');
  });

  it('gemini provider has acpSupport with --experimental-acp arg', () => {
    const gemini = getProvider('gemini')!;
    expect(gemini.acpSupport!.args).toContain('--experimental-acp');
  });

  it('copilot provider has acpSupport', () => {
    const copilot = getProvider('copilot')!;
    expect(copilot.acpSupport).toBeDefined();
    expect(copilot.acpSupport!.command).toBe('copilot-acp');
  });

  it('goose provider has defaultArgs including run and -s', () => {
    const goose = getProvider('goose')!;
    expect(goose.defaultArgs).toContain('run');
    expect(goose.defaultArgs).toContain('-s');
  });

  it('auggie provider has --allow-indexing in defaultArgs', () => {
    const auggie = getProvider('auggie')!;
    expect(auggie.defaultArgs).toContain('--allow-indexing');
  });

  it('rovo provider has autoStartCommand defined', () => {
    const rovo = getProvider('rovo')!;
    expect(rovo.autoStartCommand).toBeDefined();
    expect(typeof rovo.autoStartCommand).toBe('string');
  });

  it('codex provider has OPENAI_API_KEY env var', () => {
    const codex = getProvider('codex')!;
    expect(codex.envVars).toContain('OPENAI_API_KEY');
  });

  it('kiro provider cli is kiro-cli', () => {
    const kiro = getProvider('kiro')!;
    expect(kiro.cli).toBe('kiro-cli');
  });

  it('mistral provider autoApproveFlag is --auto-approve', () => {
    const mistral = getProvider('mistral')!;
    expect(mistral.autoApproveFlag).toBe('--auto-approve');
  });

  it('continue provider cli is cn', () => {
    const cont = getProvider('continue')!;
    expect(cont.cli).toBe('cn');
  });
});
