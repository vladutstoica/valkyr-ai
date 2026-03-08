import React from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useKeyboardSettings } from '../../contexts/KeyboardSettingsContext';
import { emitAgentSwitch } from '../../lib/agentSwitchStore';

export interface AppKeyboardShortcutsProps {
  showCommandPalette: boolean;
  showSettings: boolean;
  handleToggleCommandPalette: () => void;
  handleOpenSettings: () => void;
  handleCloseCommandPalette: () => void;
  handleCloseSettings: () => void;
  handleNextTask: () => void;
  handlePrevTask: () => void;
  handleNewTask: () => void;
}

const AppKeyboardShortcuts: React.FC<AppKeyboardShortcutsProps> = ({
  showCommandPalette,
  showSettings,
  handleToggleCommandPalette,
  handleOpenSettings,
  handleCloseCommandPalette,
  handleCloseSettings,
  handleNextTask,
  handlePrevTask,
  handleNewTask,
}) => {
  const { toggleTheme } = useTheme();
  const { settings: keyboardSettings } = useKeyboardSettings();

  useKeyboardShortcuts({
    onToggleCommandPalette: handleToggleCommandPalette,
    onOpenSettings: handleOpenSettings,
    onToggleTheme: toggleTheme,
    onNextProject: handleNextTask,
    onPrevProject: handlePrevTask,
    onNewTask: handleNewTask,
    onNextAgent: () => emitAgentSwitch('next'),
    onPrevAgent: () => emitAgentSwitch('prev'),
    onCloseModal: showCommandPalette
      ? handleCloseCommandPalette
      : showSettings
        ? handleCloseSettings
        : undefined,
    isCommandPaletteOpen: showCommandPalette,
    isSettingsOpen: showSettings,
    customKeyboardSettings: keyboardSettings ?? undefined,
  });

  return null;
};

export default AppKeyboardShortcuts;
