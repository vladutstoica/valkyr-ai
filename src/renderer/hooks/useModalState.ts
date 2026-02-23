import { useCallback, useEffect, useState } from 'react';
import { FIRST_LAUNCH_KEY } from '../constants/layout';

export type SettingsTab =
  | 'general'
  | 'appearance'
  | 'agents'
  | 'mcp'
  | 'connections'
  | 'repository'
  | 'about';

export const ORDERED_TABS: SettingsTab[] = [
  'general',
  'appearance',
  'agents',
  'mcp',
  'connections',
  'repository',
  'about',
];

export interface ModalState {
  showSettings: boolean;
  settingsInitialTab: SettingsTab;
  showCommandPalette: boolean;
  showWelcomeScreen: boolean;
  showTaskModal: boolean;
  showNewProjectModal: boolean;
  showCloneModal: boolean;
  showDeviceFlowModal: boolean;
}

export interface ModalActions {
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  setSettingsInitialTab: React.Dispatch<React.SetStateAction<SettingsTab>>;
  setShowCommandPalette: React.Dispatch<React.SetStateAction<boolean>>;
  setShowWelcomeScreen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTaskModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowNewProjectModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCloneModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDeviceFlowModal: React.Dispatch<React.SetStateAction<boolean>>;
  openSettings: (tab?: SettingsTab) => void;
  handleToggleSettings: () => void;
  handleOpenSettings: () => void;
  handleOpenKeyboardShortcuts: () => void;
  handleCloseSettings: () => void;
  handleToggleCommandPalette: () => void;
  handleCloseCommandPalette: () => void;
  handleWelcomeGetStarted: () => void;
  markFirstLaunchSeen: () => void;
}

export function useModalState(): ModalState & ModalActions {
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('general');
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState<boolean>(false);
  const [showTaskModal, setShowTaskModal] = useState<boolean>(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(false);
  const [showCloneModal, setShowCloneModal] = useState<boolean>(false);
  const [showDeviceFlowModal, setShowDeviceFlowModal] = useState(false);

  const openSettings = useCallback((tab: SettingsTab = 'general') => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  }, []);

  const handleToggleSettings = useCallback(() => {
    setShowSettings((prev) => {
      if (!prev) {
        setSettingsInitialTab('general');
      }
      return !prev;
    });
  }, []);

  const handleOpenSettings = useCallback(() => {
    openSettings('general');
  }, [openSettings]);

  const handleOpenKeyboardShortcuts = useCallback(() => {
    openSettings('general');
  }, [openSettings]);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleToggleCommandPalette = useCallback(() => {
    setShowCommandPalette((prev) => !prev);
  }, []);

  const handleCloseCommandPalette = useCallback(() => {
    setShowCommandPalette(false);
  }, []);

  const markFirstLaunchSeen = useCallback(() => {
    try {
      localStorage.setItem(FIRST_LAUNCH_KEY, '1');
    } catch {
      // ignore
    }
    try {
      void window.electronAPI.setOnboardingSeen?.(true);
    } catch {
      // ignore
    }
  }, []);

  const handleWelcomeGetStarted = useCallback(() => {
    setShowWelcomeScreen(false);
    markFirstLaunchSeen();
  }, [markFirstLaunchSeen]);

  // First-launch check effect
  useEffect(() => {
    const check = async () => {
      let seenLocal = false;
      try {
        seenLocal = localStorage.getItem(FIRST_LAUNCH_KEY) === '1';
      } catch {
        // ignore
      }
      if (seenLocal) return;

      try {
        const res = await window.electronAPI.getTelemetryStatus?.();
        if (res?.success && res.status?.onboardingSeen) return;
      } catch {
        // ignore
      }
      // Show WelcomeScreen for first-time users
      setShowWelcomeScreen(true);
    };
    void check();
  }, []);

  return {
    showSettings,
    settingsInitialTab,
    showCommandPalette,
    showWelcomeScreen,
    showTaskModal,
    showNewProjectModal,
    showCloneModal,
    showDeviceFlowModal,
    setShowSettings,
    setSettingsInitialTab,
    setShowCommandPalette,
    setShowWelcomeScreen,
    setShowTaskModal,
    setShowNewProjectModal,
    setShowCloneModal,
    setShowDeviceFlowModal,
    openSettings,
    handleToggleSettings,
    handleOpenSettings,
    handleOpenKeyboardShortcuts,
    handleCloseSettings,
    handleToggleCommandPalette,
    handleCloseCommandPalette,
    handleWelcomeGetStarted,
    markFirstLaunchSeen,
  };
}
