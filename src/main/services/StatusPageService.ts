import { log } from '../lib/logger';
import {
  PROVIDER_STATUS_PAGES,
  PROVIDER_STATUS_COMPONENTS,
} from '@shared/providers/modelIdMapping';

export type ProviderStatus = {
  status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage';
  components: { name: string; status: string }[];
  activeIncidents: { name: string; impact: string; startedAt: string }[];
};

export type UptimeDayData = {
  date: string; // ISO date string (YYYY-MM-DD)
  status: 'operational' | 'degraded' | 'outage';
  incidentCount: number;
};

type StatusPageSummary = {
  status?: { indicator?: string };
  components?: Array<{ name: string; status: string }>;
  incidents?: Array<{
    name: string;
    impact: string;
    started_at: string;
    status: string;
  }>;
};

type StatusPageIncident = {
  name: string;
  impact: string;
  started_at: string;
  resolved_at: string | null;
  status: string;
  components?: Array<{ name: string }>;
};

const STATUS_TTL = 1000 * 60 * 5; // 5 min
const INCIDENT_TTL = 1000 * 60 * 30; // 30 min
const UPTIME_DAYS = 90;

export class StatusPageService {
  private statusCache = new Map<string, { data: ProviderStatus; ts: number }>();
  private uptimeCache = new Map<string, { data: UptimeDayData[]; ts: number }>();

  async getStatus(providerId: string): Promise<ProviderStatus | null> {
    const baseUrl = PROVIDER_STATUS_PAGES[providerId];
    if (!baseUrl) return null;

    const cached = this.statusCache.get(providerId);
    if (cached && Date.now() - cached.ts < STATUS_TTL) return cached.data;

    try {
      const res = await fetch(`${baseUrl}/api/v2/summary.json`);
      if (!res.ok) throw new Error(`StatusPage returned ${res.status}`);
      const json = (await res.json()) as StatusPageSummary;

      const componentNames = PROVIDER_STATUS_COMPONENTS[providerId] ?? [];
      const relevantComponents = (json.components ?? []).filter(
        (c) =>
          componentNames.length === 0 ||
          componentNames.some((n) => c.name.toLowerCase().includes(n.toLowerCase()))
      );

      const worstStatus = this.deriveOverallStatus(relevantComponents);

      const activeIncidents = (json.incidents ?? [])
        .filter((i) => i.status !== 'resolved' && i.status !== 'postmortem')
        .map((i) => ({
          name: i.name,
          impact: i.impact,
          startedAt: i.started_at,
        }));

      const result: ProviderStatus = {
        status: worstStatus,
        components: relevantComponents.map((c) => ({
          name: c.name,
          status: c.status,
        })),
        activeIncidents,
      };

      this.statusCache.set(providerId, { data: result, ts: Date.now() });
      return result;
    } catch (err) {
      log.error(`[StatusPage] Failed to fetch status for ${providerId}`, err);
      return cached?.data ?? null;
    }
  }

  async getUptimeData(providerId: string): Promise<UptimeDayData[]> {
    const baseUrl = PROVIDER_STATUS_PAGES[providerId];
    if (!baseUrl) return [];

    const cached = this.uptimeCache.get(providerId);
    if (cached && Date.now() - cached.ts < INCIDENT_TTL) return cached.data;

    try {
      const res = await fetch(`${baseUrl}/api/v2/incidents.json`);
      if (!res.ok) throw new Error(`StatusPage incidents returned ${res.status}`);
      const json = (await res.json()) as { incidents: StatusPageIncident[] };

      const componentNames = PROVIDER_STATUS_COMPONENTS[providerId] ?? [];
      const incidents = (json.incidents ?? []).filter((inc) => {
        if (componentNames.length === 0) return true;
        if (!inc.components?.length) return false;
        return inc.components.some((c) =>
          componentNames.some((n) => c.name.toLowerCase().includes(n.toLowerCase()))
        );
      });

      const days = this.buildUptimeDays(incidents);
      this.uptimeCache.set(providerId, { data: days, ts: Date.now() });
      return days;
    } catch (err) {
      log.error(`[StatusPage] Failed to fetch incidents for ${providerId}`, err);
      return cached?.data ?? [];
    }
  }

  private buildUptimeDays(incidents: StatusPageIncident[]): UptimeDayData[] {
    const days: UptimeDayData[] = [];
    const now = new Date();

    for (let i = UPTIME_DAYS - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayStart = new Date(`${dateStr}T00:00:00Z`).getTime();
      const dayEnd = dayStart + 86400000;

      let status: UptimeDayData['status'] = 'operational';
      let count = 0;

      for (const inc of incidents) {
        const incStart = new Date(inc.started_at).getTime();
        // For unresolved incidents, only count them on their start day —
        // don't paint every subsequent day as an outage
        const incEnd = inc.resolved_at
          ? new Date(inc.resolved_at).getTime()
          : incStart + 86400000;

        if (incStart < dayEnd && incEnd > dayStart) {
          count++;
          // Only escalate status for significant incidents;
          // minor/none incidents keep the day operational (matches real status pages)
          if (inc.impact === 'major' || inc.impact === 'critical') {
            status = 'outage';
          } else if (inc.impact === 'minor' || inc.impact === 'none') {
            // minor incidents don't change day status
          } else if (status !== 'outage') {
            status = 'degraded';
          }
        }
      }

      days.push({ date: dateStr, status, incidentCount: count });
    }

    return days;
  }

  private deriveOverallStatus(
    components: Array<{ status: string }>
  ): ProviderStatus['status'] {
    const statuses = components.map((c) => c.status);
    if (statuses.includes('major_outage')) return 'major_outage';
    if (statuses.includes('partial_outage')) return 'partial_outage';
    if (statuses.includes('degraded_performance')) return 'degraded';
    return 'operational';
  }
}

export const statusPageService = new StatusPageService();
