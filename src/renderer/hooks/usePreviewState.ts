import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DevicePreset = 'desktop' | 'tablet' | 'mobile';

export const DEVICE_DIMENSIONS = {
  desktop: { width: '100%', height: '100%' },
  tablet: { width: '768px', height: '1024px' },
  mobile: { width: '375px', height: '667px' },
} as const;

export const ZOOM_LEVELS = [50, 75, 100, 125, 150] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

interface PreviewState {
  url: string;
  devicePreset: DevicePreset;
  zoom: ZoomLevel;
  autoRefresh: boolean;
  refreshKey: number;
  setUrl: (url: string) => void;
  setDevicePreset: (preset: DevicePreset) => void;
  setZoom: (zoom: ZoomLevel) => void;
  toggleAutoRefresh: () => void;
  refresh: () => void;
}

export const usePreviewState = create<PreviewState>()(
  persist(
    (set) => ({
      url: 'http://localhost:3000',
      devicePreset: 'desktop',
      zoom: 100,
      autoRefresh: false,
      refreshKey: 0,
      setUrl: (url) => set({ url }),
      setDevicePreset: (devicePreset) => set({ devicePreset }),
      setZoom: (zoom) => set({ zoom }),
      toggleAutoRefresh: () => set((state) => ({ autoRefresh: !state.autoRefresh })),
      refresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
    }),
    {
      name: 'preview-state',
      partialize: (state) => ({
        url: state.url,
        devicePreset: state.devicePreset,
        zoom: state.zoom,
        autoRefresh: state.autoRefresh,
      }),
    }
  )
);
