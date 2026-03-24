import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_VALKYR_CONFIG = `{
  "preservePatterns": [
    ".env",
    ".env.keys",
    ".env.local",
    ".env.*.local",
    ".envrc",
    "docker-compose.override.yml"
  ],
  "scripts": {
    "setup": "",
    "run": "",
    "teardown": ""
  },
  "mcpServers": []
}
`;

const CONFIG_FILENAME = '.valkyr.json';

// ---------------------------------------------------------------------------
// FsConfigService
// ---------------------------------------------------------------------------

export interface GetProjectConfigResult {
  path: string;
  content: string;
}

export class FsConfigService {
  /**
   * Read the `.valkyr.json` config from `projectPath`.
   * If the file does not exist it is created with DEFAULT_VALKYR_CONFIG first.
   * Throws on invalid path or I/O error.
   */
  getProjectConfig(projectPath: string): GetProjectConfigResult {
    const configPath = path.join(projectPath, CONFIG_FILENAME);

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, DEFAULT_VALKYR_CONFIG, 'utf8');
    }

    const content = fs.readFileSync(configPath, 'utf8');
    return { path: configPath, content };
  }

  /**
   * Write `content` to the `.valkyr.json` config in `projectPath`.
   * Validates that `content` is valid JSON before writing.
   * Throws on invalid JSON, invalid path, or I/O error.
   */
  saveProjectConfig(projectPath: string, content: string): string {
    // Validate JSON before touching disk
    JSON.parse(content);

    const configPath = path.join(projectPath, CONFIG_FILENAME);
    fs.writeFileSync(configPath, content, 'utf8');
    return configPath;
  }
}

export const fsConfigService = new FsConfigService();
