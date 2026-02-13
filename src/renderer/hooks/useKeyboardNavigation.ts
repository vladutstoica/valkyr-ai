import { useEffect } from 'react';
import { useTabState, type TabId } from './useTabState';

const TAB_KEYS: Record<string, TabId> = {
  '1': 'agents',
  '2': 'editor',
  '3': 'git',
  '4': 'preview',
};

export function useKeyboardNavigation() {
  const setActiveTab = useTabState((state) => state.setActiveTab);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux) + number key
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (!modifierPressed) return;

      const tabId = TAB_KEYS[event.key];
      if (tabId) {
        event.preventDefault();
        setActiveTab(tabId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);
}
