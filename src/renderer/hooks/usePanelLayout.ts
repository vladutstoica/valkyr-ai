import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { loadPanelSizes, savePanelSizes } from '../lib/persisted-layout';
import {
  PANEL_LAYOUT_STORAGE_KEY,
  DEFAULT_PANEL_LAYOUT,
  clampRightSidebarSize,
} from '../constants/layout';

export interface UsePanelLayoutOptions {
  showEditorMode: boolean;
  isInitialLoadComplete: boolean;
  showHomeView: boolean;
  selectedProject: { id: string } | null;
  activeTask: { id: string } | null;
}

export function usePanelLayout(opts: UsePanelLayoutOptions) {
  const { showEditorMode, isInitialLoadComplete, showHomeView, selectedProject, activeTask } = opts;

  // Only need to track right sidebar size now (left sidebar is fixed width)
  const defaultPanelLayout = useMemo(() => {
    const stored = loadPanelSizes(PANEL_LAYOUT_STORAGE_KEY, DEFAULT_PANEL_LAYOUT);
    const [, , storedRight = DEFAULT_PANEL_LAYOUT[2]] =
      Array.isArray(stored) && stored.length === 3
        ? (stored as [number, number, number])
        : DEFAULT_PANEL_LAYOUT;
    const right = clampRightSidebarSize(storedRight);
    // Main panel takes remaining space (no left sidebar in resizable group)
    const main = Math.max(0, 100 - right);
    return [0, main, right] as [number, number, number];
  }, []);

  const rightSidebarDefaultWidth = useMemo(
    () => clampRightSidebarSize(defaultPanelLayout[2]),
    [defaultPanelLayout]
  );

  const rightSidebarPanelRef = useRef<ImperativePanelHandle | null>(null);
  const lastRightSidebarSizeRef = useRef<number>(rightSidebarDefaultWidth);
  const leftSidebarSetOpenRef = useRef<((next: boolean) => void) | null>(null);
  const leftSidebarIsMobileRef = useRef<boolean>(false);
  const leftSidebarOpenRef = useRef<boolean>(true);
  const rightSidebarSetCollapsedRef = useRef<((next: boolean) => void) | null>(null);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState<boolean>(false);
  const [autoRightSidebarBehavior, setAutoRightSidebarBehavior] = useState<boolean>(false);

  const handlePanelLayout = useCallback((sizes: number[]) => {
    if (!Array.isArray(sizes) || sizes.length < 2) {
      return;
    }

    const [, rightSize] = sizes;

    let storedRight = lastRightSidebarSizeRef.current;
    if (typeof rightSize === 'number') {
      if (rightSize <= 0.5) {
        rightSidebarSetCollapsedRef.current?.(true);
      } else {
        storedRight = clampRightSidebarSize(rightSize);
        lastRightSidebarSizeRef.current = storedRight;
        rightSidebarSetCollapsedRef.current?.(false);
      }
    }

    const main = Math.max(0, 100 - storedRight);
    savePanelSizes(PANEL_LAYOUT_STORAGE_KEY, [0, main, storedRight]);
  }, []);

  // Handle sidebar context changes for mobile/responsive behavior
  const handleSidebarContextChange = useCallback(
    ({
      open,
      isMobile,
      setOpen,
    }: {
      open: boolean;
      isMobile: boolean;
      setOpen: (next: boolean) => void;
    }) => {
      leftSidebarSetOpenRef.current = setOpen;
      leftSidebarIsMobileRef.current = isMobile;
      leftSidebarOpenRef.current = open;

      // Prevent sidebar from opening when in editor mode
      if (showEditorMode && open) {
        setOpen(false);
      }
    },
    [showEditorMode]
  );

  const handleRightSidebarCollapsedChange = useCallback((collapsed: boolean) => {
    setRightSidebarCollapsed(collapsed);
  }, []);

  // Load autoRightSidebarBehavior setting on mount and listen for changes
  useEffect(() => {
    (async () => {
      try {
        const result = await window.electronAPI.getSettings();
        if (result.success && result.settings) {
          setAutoRightSidebarBehavior(
            Boolean(result.settings.interface?.autoRightSidebarBehavior ?? false)
          );
        }
      } catch (error) {
        console.error('Failed to load right sidebar settings:', error);
      }
    })();

    // Listen for setting changes from RightSidebarSettingsCard
    const handleSettingChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled: boolean }>;
      setAutoRightSidebarBehavior(customEvent.detail.enabled);
    };
    window.addEventListener('autoRightSidebarBehaviorChanged', handleSettingChange);
    return () => {
      window.removeEventListener('autoRightSidebarBehaviorChanged', handleSettingChange);
    };
  }, []);

  // Auto-collapse/expand right sidebar based on current view
  useEffect(() => {
    // Defer sidebar behavior until initial load completes to prevent flash
    if (!autoRightSidebarBehavior || !isInitialLoadComplete) return;

    const isHomePage = showHomeView;
    const isRepoHomePage = selectedProject !== null && activeTask === null;
    const shouldCollapse = isHomePage || isRepoHomePage;

    if (shouldCollapse) {
      rightSidebarSetCollapsedRef.current?.(true);
    } else if (activeTask !== null) {
      rightSidebarSetCollapsedRef.current?.(false);
    }
  }, [autoRightSidebarBehavior, isInitialLoadComplete, showHomeView, selectedProject, activeTask]);

  // Sync right sidebar panel with collapsed state
  useEffect(() => {
    const rightPanel = rightSidebarPanelRef.current;
    if (rightPanel) {
      if (rightSidebarCollapsed) {
        rightPanel.collapse();
      } else {
        const targetRight = clampRightSidebarSize(
          lastRightSidebarSizeRef.current || DEFAULT_PANEL_LAYOUT[2]
        );
        lastRightSidebarSizeRef.current = targetRight;
        rightPanel.expand();
        rightPanel.resize(targetRight);
      }
    }
  }, [rightSidebarCollapsed]);

  return {
    defaultPanelLayout,
    rightSidebarPanelRef,
    rightSidebarSetCollapsedRef,
    rightSidebarCollapsed,
    handlePanelLayout,
    handleSidebarContextChange,
    handleRightSidebarCollapsedChange,
  };
}
