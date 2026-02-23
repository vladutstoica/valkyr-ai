import { useState, useEffect } from 'react';
import type {
  ModelMetadataResult,
  UptimeDayData,
  ProviderStatusResult,
} from '@/types/electron-api';

export function useModelMetadata(acpModelId: string | null, providerId: string) {
  const [metadata, setMetadata] = useState<ModelMetadataResult | null>(null);
  const [uptimeData, setUptimeData] = useState<UptimeDayData[]>([]);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!acpModelId) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      window.electronAPI.modelMetadataGet({ acpModelId, providerId }),
      window.electronAPI.modelMetadataGetUptime({ providerId }),
      window.electronAPI.modelMetadataGetStatus({ providerId }),
    ])
      .then(([metaRes, uptimeRes, statusRes]) => {
        if (cancelled) return;
        if (metaRes.success && metaRes.data) setMetadata(metaRes.data);
        if (uptimeRes.success && uptimeRes.data) setUptimeData(uptimeRes.data);
        if (statusRes.success && statusRes.data) setProviderStatus(statusRes.data);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [acpModelId, providerId]);

  return { metadata, uptimeData, providerStatus, loading };
}
