export type AcpDistributionNpx = {
  package: string;
  args?: string[];
  env?: Record<string, string>;
};

export type AcpDistributionBinaryTarget = {
  archive: string;
  cmd: string;
  args?: string[];
};

export type AcpDistribution = {
  npx?: AcpDistributionNpx;
  binary?: Record<string, AcpDistributionBinaryTarget>;
};

export type AcpRegistryEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  repository?: string;
  authors: string[];
  license: string;
  icon?: string;
  distribution: AcpDistribution;
};

export type AcpRegistry = { version: string; agents: AcpRegistryEntry[] };

export type InstalledAcpAgent = {
  id: string;
  version: string;
  method: 'npx' | 'binary';
  binaryPath?: string;
  npxPackage?: string;
  npxArgs?: string[];
  npxEnv?: Record<string, string>;
  installedAt: string;
};

// Valkyr ProviderId <-> ACP registry agent ID mapping
export const PROVIDER_TO_ACP_ID: Record<string, string> = {
  claude: 'claude-acp',
  codex: 'codex-acp',
  gemini: 'gemini',
  copilot: 'github-copilot',
  auggie: 'auggie',
  cline: 'cline',
  droid: 'factory-droid',
  kimi: 'kimi',
  mistral: 'mistral-vibe',
  opencode: 'opencode',
  qwen: 'qwen-code',
};

export const ACP_ID_TO_PROVIDER: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_TO_ACP_ID).map(([k, v]) => [v, k])
);
