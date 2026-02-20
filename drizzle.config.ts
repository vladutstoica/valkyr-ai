import { defineConfig } from 'drizzle-kit';
import { join } from 'path';
import { homedir } from 'os';

function resolveDefaultDbFile() {
  const explicit = process.env.EMDASH_DB_FILE || process.env.VALKYR_DB_FILE;
  if (explicit && explicit.length > 0) {
    return explicit;
  }

  const home = process.env.HOME ?? homedir();
  const platform = process.platform;

  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'valkyr', 'valkyr-dev.db');
  }

  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return join(appData, 'valkyr', 'valkyr-dev.db');
  }

  const xdgData = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share');
  return join(xdgData, 'valkyr', 'valkyr-dev.db');
}

export default defineConfig({
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: resolveDefaultDbFile(),
  },
  strict: true,
  verbose: true,
});
