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

  private getOAuthTokenMacOS(): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(
        'security',
        ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
        { timeout: 5000 },
        (error, stdout) => {
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
        }
      );
    });
  }
}

export const claudeUsageService = new ClaudeUsageService();
