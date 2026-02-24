import { execFile } from 'child_process';
import { log } from '../lib/logger';

export interface UsageBucket {
  utilization: number;
  resets_at: string | null;
}

export interface ExtraUsage {
  is_enabled: boolean;
  monthly_limit: number;
  used_credits: number;
  utilization: number;
}

export interface ClaudeUsageLimits {
  fiveHour: UsageBucket | null;
  sevenDay: UsageBucket | null;
  sevenDayOpus: UsageBucket | null;
  sevenDaySonnet: UsageBucket | null;
  extraUsage: ExtraUsage | null;
}

const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const CACHE_TTL_MS = 60_000;

class ClaudeUsageService {
  private cache: { data: ClaudeUsageLimits; fetchedAt: number } | null = null;

  async getUsageLimits(): Promise<ClaudeUsageLimits | null> {
    // Return cached data if fresh
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.data;
    }

    try {
      const token = await this.getOAuthToken();
      if (!token) return null;

      const res = await fetch(USAGE_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Content-Type': 'application/json',
          'User-Agent': 'valkyr/1.0',
        },
      });

      if (!res.ok) {
        log.error(`Claude usage API returned ${res.status}`);
        return null;
      }

      const raw = (await res.json()) as Record<string, any>;
      const data: ClaudeUsageLimits = {
        fiveHour: raw.five_hour ?? null,
        sevenDay: raw.seven_day ?? null,
        sevenDayOpus: raw.seven_day_opus ?? null,
        sevenDaySonnet: raw.seven_day_sonnet ?? null,
        extraUsage: raw.extra_usage ?? null,
      };

      this.cache = { data, fetchedAt: Date.now() };
      return data;
    } catch (error) {
      log.error('Failed to fetch Claude usage limits', error);
      return null;
    }
  }

  private async getOAuthToken(): Promise<string | null> {
    try {
      // keytar can't read credentials written by another app (Claude Code CLI)
      // due to macOS keychain access group restrictions, so use `security` CLI
      if (process.platform === 'darwin') {
        return await this.getOAuthTokenMacOS();
      }
      // TODO: Linux (secret-tool) and Windows (cmdkey) support
      return null;
    } catch (error) {
      log.error('Failed to read Claude Code credentials from keychain', error);
      return null;
    }
  }

  /**
   * Try multiple keychain account names to find the one with claudeAiOauth.
   * Claude Code stores OAuth under the OS username, but MCP-only creds may
   * exist under "unknown". Without -a, `security` picks non-deterministically.
   */
  private async getOAuthTokenMacOS(): Promise<string | null> {
    // Build candidate account list: try specific accounts first, then unscoped
    const candidates: (string | null)[] = [];
    try {
      // whoami always works regardless of env vars
      const whoami = await this.exec('whoami');
      if (whoami) candidates.push(whoami);
    } catch {
      // ignore
    }
    // Also try env vars as fallback candidates
    const envUser = process.env.USER || process.env.USERNAME;
    if (envUser && !candidates.includes(envUser)) candidates.push(envUser);
    // Finally try unscoped (no -a flag)
    candidates.push(null);

    for (const account of candidates) {
      const token = await this.tryKeychainAccount(account);
      if (token) return token;
    }
    return null;
  }

  private tryKeychainAccount(account: string | null): Promise<string | null> {
    return new Promise((resolve) => {
      const args = ['find-generic-password', '-s', KEYCHAIN_SERVICE];
      if (account) args.push('-a', account);
      args.push('-w');

      execFile('security', args, { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed?.claudeAiOauth?.accessToken ?? null);
        } catch {
          resolve(null);
        }
      });
    });
  }

  private exec(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(cmd, { timeout: 3000 }, (error, stdout) => {
        if (error) return reject(error);
        resolve(stdout.trim());
      });
    });
  }
}

export const claudeUsageService = new ClaudeUsageService();
