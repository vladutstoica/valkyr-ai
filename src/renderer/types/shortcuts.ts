export type ShortcutModifier = 'cmd' | 'ctrl' | 'shift' | 'alt' | 'option' | 'cmd+shift';

export interface ShortcutBinding {
  key: string;
  modifier: ShortcutModifier;
}

export interface KeyboardSettings {
  commandPalette?: ShortcutBinding;
  settings?: ShortcutBinding;
  toggleTheme?: ShortcutBinding;
  closeModal?: ShortcutBinding;
  nextProject?: ShortcutBinding;
  prevProject?: ShortcutBinding;
  newTask?: ShortcutBinding;
  nextAgent?: ShortcutBinding;
  prevAgent?: ShortcutBinding;
}

export interface ShortcutConfig {
  key: string;
  modifier?: ShortcutModifier;
  description: string;
  category?: string;
}

export type KeyboardShortcut = ShortcutConfig & {
  handler: (event: KeyboardEvent) => void;
  preventDefault?: boolean;
  stopPropagation?: boolean;
};

/**
 * Mapping of shortcuts to their handlers
 */
export interface ShortcutMapping {
  config: ShortcutConfig;
  handler: () => void;
  priority: 'modal' | 'global';
  requiresClosed?: boolean;
  isCommandPalette?: boolean;
}

/**
 * Interface for global keyboard shortcut handlers
 */
export interface GlobalShortcutHandlers {
  // Modals (highest priority - checked first)
  onCloseModal?: () => void;

  // Command Palette
  onToggleCommandPalette?: () => void;

  // Settings
  onOpenSettings?: () => void;

  // Theme
  onToggleTheme?: () => void;

  // Project navigation
  onNextProject?: () => void;
  onPrevProject?: () => void;

  // Task creation
  onNewTask?: () => void;

  // Agent switching (within same task)
  onNextAgent?: () => void;
  onPrevAgent?: () => void;

  // State checks
  isCommandPaletteOpen?: boolean;
  isSettingsOpen?: boolean;

  // Custom keyboard settings
  customKeyboardSettings?: KeyboardSettings;
}
