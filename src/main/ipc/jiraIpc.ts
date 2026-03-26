import { ipcMain } from 'electron';
import { log } from '../lib/logger';

const KEYTAR_SERVICE = 'valkyr-jira';
const KEYTAR_ACCOUNT_TOKEN = 'api-token';
const KEYTAR_ACCOUNT_EMAIL = 'email';
const KEYTAR_ACCOUNT_SITE = 'site-url';

interface JiraCredentials {
  siteUrl: string;
  email: string;
  token: string;
}

async function getStoredCredentials(): Promise<JiraCredentials | null> {
  try {
    const keytar = await import('keytar');
    const [token, email, siteUrl] = await Promise.all([
      keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_TOKEN),
      keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_EMAIL),
      keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_SITE),
    ]);
    if (!token || !email || !siteUrl) return null;
    return { token, email, siteUrl };
  } catch {
    return null;
  }
}

function makeAuthHeader(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

async function jiraRequest(
  creds: JiraCredentials,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${creds.siteUrl.replace(/\/$/, '')}/rest/api/3${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: makeAuthHeader(creds.email, creds.token),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    throw new Error(`Jira API request failed: ${res.status}`);
  }

  return res.json();
}

export function registerJiraIpc(): void {
  // ---------------------------------------------------------------------------
  // jira:saveCredentials — Persist site URL, email, and API token in keychain
  // ---------------------------------------------------------------------------
  ipcMain.handle(
    'jira:saveCredentials',
    async (_event, args: { siteUrl: string; email: string; token: string }) => {
      try {
        const { siteUrl, email, token } = args ?? {};
        if (!siteUrl || !email || !token) {
          return { success: false, error: 'siteUrl, email, and token are required' };
        }

        const keytar = await import('keytar');
        await Promise.all([
          keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_TOKEN, token),
          keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_EMAIL, email),
          keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_SITE, siteUrl),
        ]);

        // Verify the credentials work and grab display name
        const creds: JiraCredentials = { siteUrl, email, token };
        const data = await jiraRequest(creds, '/myself');
        const displayName: string = data?.displayName ?? email;

        return { success: true, displayName };
      } catch (error: any) {
        log.error('jira:saveCredentials failed', error);
        return { success: false, error: error.message || 'Unknown error' };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // jira:clearCredentials — Remove all stored Jira credentials from keychain
  // ---------------------------------------------------------------------------
  ipcMain.handle('jira:clearCredentials', async () => {
    try {
      const keytar = await import('keytar');
      await Promise.all([
        keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_TOKEN),
        keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_EMAIL),
        keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT_SITE),
      ]);
      return { success: true };
    } catch (error: any) {
      log.error('jira:clearCredentials failed', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // ---------------------------------------------------------------------------
  // jira:checkConnection — Verify credentials by calling /myself
  // ---------------------------------------------------------------------------
  ipcMain.handle('jira:checkConnection', async () => {
    try {
      const creds = await getStoredCredentials();
      if (!creds) {
        return { connected: false, error: 'No credentials stored' };
      }

      const data = await jiraRequest(creds, '/myself');
      const displayName: string = data?.displayName ?? '';

      return {
        connected: true,
        displayName,
        siteUrl: creds.siteUrl,
      };
    } catch (error: any) {
      log.error('jira:checkConnection failed', error);
      return { connected: false, error: error.message || 'Unknown error' };
    }
  });

  // ---------------------------------------------------------------------------
  // jira:initialFetch — Fetch issues assigned to the current user
  // ---------------------------------------------------------------------------
  ipcMain.handle('jira:initialFetch', async (_event, limit = 50) => {
    try {
      const creds = await getStoredCredentials();
      if (!creds) {
        return { success: false, error: 'No credentials stored' };
      }

      const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
      const jql = encodeURIComponent('assignee = currentUser() ORDER BY updated DESC');
      const data = await jiraRequest(
        creds,
        `/search?jql=${jql}&maxResults=${safeLimit}&fields=summary,status,priority,assignee,updated,issuetype,project`
      );

      const issues = (data?.issues ?? []).map((issue: any) => ({
        id: issue.id,
        key: issue.key,
        title: issue.fields?.summary ?? '',
        status: issue.fields?.status?.name ?? '',
        priority: issue.fields?.priority?.name ?? '',
        url: `${creds.siteUrl.replace(/\/$/, '')}/browse/${issue.key}`,
        updatedAt: issue.fields?.updated ?? null,
      }));

      return { success: true, issues };
    } catch (error: any) {
      log.error('jira:initialFetch failed', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // ---------------------------------------------------------------------------
  // jira:searchIssues — JQL text search
  // ---------------------------------------------------------------------------
  ipcMain.handle('jira:searchIssues', async (_event, searchTerm: string, limit = 20) => {
    try {
      const creds = await getStoredCredentials();
      if (!creds) {
        return { success: false, error: 'No credentials stored' };
      }

      if (!searchTerm || typeof searchTerm !== 'string') {
        return { success: false, error: 'Search term is required' };
      }

      const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
      // Escape double-quotes in the search term to prevent JQL injection
      const safeTerm = searchTerm.replace(/"/g, '\\"');
      const jql = encodeURIComponent(
        `text ~ "${safeTerm}" ORDER BY updated DESC`
      );
      const data = await jiraRequest(
        creds,
        `/search?jql=${jql}&maxResults=${safeLimit}&fields=summary,status,priority,assignee,updated,issuetype,project`
      );

      const issues = (data?.issues ?? []).map((issue: any) => ({
        id: issue.id,
        key: issue.key,
        title: issue.fields?.summary ?? '',
        status: issue.fields?.status?.name ?? '',
        priority: issue.fields?.priority?.name ?? '',
        url: `${creds.siteUrl.replace(/\/$/, '')}/browse/${issue.key}`,
        updatedAt: issue.fields?.updated ?? null,
      }));

      return { success: true, issues };
    } catch (error: any) {
      log.error('jira:searchIssues failed', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });
}
