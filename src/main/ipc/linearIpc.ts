import { ipcMain } from 'electron';
import { log } from '../lib/logger';

const KEYTAR_SERVICE = 'valkyr-linear';
const KEYTAR_ACCOUNT = 'api-token';
const LINEAR_API_URL = 'https://api.linear.app/graphql';

async function getStoredToken(): Promise<string | null> {
  try {
    const keytar = await import('keytar');
    return keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } catch {
    return null;
  }
}

async function graphqlRequest(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<any> {
  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Linear API request failed: ${res.status}`);
  }

  const json = (await res.json()) as { data?: any; errors?: any[] };
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || 'Linear API error');
  }
  return json.data;
}

export function registerLinearIpc(): void {
  // ---------------------------------------------------------------------------
  // linear:saveToken — Persist the personal API token in the OS keychain
  // ---------------------------------------------------------------------------
  ipcMain.handle('linear:saveToken', async (_event, token: string) => {
    try {
      if (!token || typeof token !== 'string') {
        return { success: false, error: 'Token is required' };
      }
      const keytar = await import('keytar');
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, token.trim());
      return { success: true };
    } catch (error: any) {
      log.error('linear:saveToken failed', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // ---------------------------------------------------------------------------
  // linear:clearToken — Remove the stored token from the OS keychain
  // ---------------------------------------------------------------------------
  ipcMain.handle('linear:clearToken', async () => {
    try {
      const keytar = await import('keytar');
      await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      return { success: true };
    } catch (error: any) {
      log.error('linear:clearToken failed', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // ---------------------------------------------------------------------------
  // linear:checkConnection — Verify stored token works by fetching viewer info
  // ---------------------------------------------------------------------------
  ipcMain.handle('linear:checkConnection', async () => {
    try {
      const token = await getStoredToken();
      if (!token) {
        return { connected: false, error: 'No token stored' };
      }

      const data = await graphqlRequest(token, `{ viewer { id name email } }`);
      const name: string = data?.viewer?.name ?? '';
      return { connected: true, taskName: name };
    } catch (error: any) {
      log.error('linear:checkConnection failed', error);
      return { connected: false, error: error.message || 'Unknown error' };
    }
  });

  // ---------------------------------------------------------------------------
  // linear:initialFetch — Fetch the most recent issues assigned to the viewer
  // ---------------------------------------------------------------------------
  ipcMain.handle('linear:initialFetch', async (_event, limit = 50) => {
    try {
      const token = await getStoredToken();
      if (!token) {
        return { success: false, error: 'No token stored' };
      }

      const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 250);
      const data = await graphqlRequest(
        token,
        `query($limit: Int!) {
          issues(filter: { assignee: { isMe: { eq: true } } }, first: $limit) {
            nodes {
              id
              identifier
              title
              state { name color }
              priority
              url
              updatedAt
            }
          }
        }`,
        { limit: safeLimit }
      );

      const issues = data?.issues?.nodes ?? [];
      return { success: true, issues };
    } catch (error: any) {
      log.error('linear:initialFetch failed', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  // ---------------------------------------------------------------------------
  // linear:searchIssues — Full-text search against Linear issues
  // ---------------------------------------------------------------------------
  ipcMain.handle('linear:searchIssues', async (_event, searchTerm: string, limit = 20) => {
    try {
      const token = await getStoredToken();
      if (!token) {
        return { success: false, error: 'No token stored' };
      }

      if (!searchTerm || typeof searchTerm !== 'string') {
        return { success: false, error: 'Search term is required' };
      }

      const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
      const data = await graphqlRequest(
        token,
        `query($term: String!, $limit: Int!) {
          issueSearch(query: $term, first: $limit) {
            nodes {
              id
              identifier
              title
              state { name color }
              priority
              url
              updatedAt
            }
          }
        }`,
        { term: searchTerm, limit: safeLimit }
      );

      const issues = data?.issueSearch?.nodes ?? [];
      return { success: true, issues };
    } catch (error: any) {
      log.error('linear:searchIssues failed', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });
}
