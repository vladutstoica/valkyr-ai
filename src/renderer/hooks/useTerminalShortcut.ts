import { useEffect } from 'react';
import { useTerminalPanelCollapsed } from './useTerminalPanel';

const isMacPlatform =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/**
 * Hook to handle terminal panel keyboard shortcuts
 * - Cmd+` (Mac) or Ctrl+` (Windows/Linux) toggles collapse
 */
export function useTerminalShortcut(): void {
  const { toggleCollapsed } = useTerminalPanelCollapsed();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Check for backtick key
      if (event.key !== '`') return;

      // Check for correct modifier based on platform
      const hasCorrectModifier = isMacPlatform ? event.metaKey : event.ctrlKey;

      if (!hasCorrectModifier) return;

      // Prevent default browser behavior
      event.preventDefault();

      // Toggle the terminal panel
      toggleCollapsed();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapsed]);
}
