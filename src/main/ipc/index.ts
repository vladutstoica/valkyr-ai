import { registerPtyIpc } from '../services/ptyIpc';
import { registerWorktreeIpc } from '../services/worktreeIpc';
import { registerFsIpc } from '../services/fsIpc';
import { registerLifecycleIpc } from '../services/lifecycleIpc';

import { registerAppIpc } from './appIpc';
import { registerProjectIpc } from './projectIpc';
import { registerProjectSettingsIpc } from './projectSettingsIpc';
import { registerDatabaseIpc } from './dbIpc';
import { registerDebugIpc } from './debugIpc';
import { registerGitIpc } from './gitIpc';
import { registerUpdateIpc } from '../services/updateIpc';
import { registerTelemetryIpc } from './telemetryIpc';
import { registerPlanLockIpc } from '../services/planLockIpc';
import { registerSettingsIpc } from './settingsIpc';
import { registerHostPreviewIpc } from './hostPreviewIpc';
import { registerBrowserIpc } from './browserIpc';
import { registerNetIpc } from './netIpc';
import { registerLineCommentsIpc } from './lineCommentsIpc';
import { registerSshIpc } from './sshIpc';
import { registerSkillsIpc } from './skillsIpc';
import { registerScriptRunnerIpc } from './scriptRunnerIpc';
import { registerAcpIpc } from './acpIpc';
import { registerAcpRegistryIpc } from './acpRegistryIpc';
import { registerModelMetadataIpc } from './modelMetadataIpc';
import { registerMcpIpc } from './mcpIpc';
import { registerWhisperIpc } from './whisperIpc';

export function registerAllIpc() {
  // Core app/utility IPC
  registerAppIpc();
  registerDebugIpc();
  registerTelemetryIpc();
  registerUpdateIpc();
  registerSettingsIpc();

  // Domain IPC
  registerProjectIpc();
  registerProjectSettingsIpc();
  registerDatabaseIpc();
  registerGitIpc();
  registerHostPreviewIpc();
  registerBrowserIpc();
  registerNetIpc();
  registerLineCommentsIpc();

  // Existing modules
  registerPtyIpc();
  registerWorktreeIpc();
  registerFsIpc();
  registerLifecycleIpc();
  registerPlanLockIpc();
  registerSshIpc();
  registerSkillsIpc();
  registerScriptRunnerIpc();
  registerAcpIpc();
  registerAcpRegistryIpc();
  registerModelMetadataIpc();
  registerMcpIpc();
  registerWhisperIpc();
}
