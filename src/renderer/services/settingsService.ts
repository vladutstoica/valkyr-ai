/**
 * Settings service — thin abstraction over window.electronAPI settings calls.
 * Centralizes settings access so components don't scatter direct IPC calls.
 */

type SettingsResult = Awaited<ReturnType<typeof window.electronAPI.getSettings>>;
type Settings = NonNullable<SettingsResult['settings']>;
type SettingsUpdate = Parameters<typeof window.electronAPI.updateSettings>[0];

/** Fetch all settings. Returns the settings object or null on failure. */
export async function getSettings(): Promise<Settings | null> {
  const result = await window.electronAPI.getSettings();
  return result.success ? (result.settings ?? null) : null;
}

/** Update settings (partial merge). Returns true on success. */
export async function updateSettings(update: SettingsUpdate): Promise<boolean> {
  const result = await window.electronAPI.updateSettings(update);
  return result.success;
}

/** Get a single settings key. */
export async function getSetting<K extends keyof Settings>(
  key: K
): Promise<Settings[K] | undefined> {
  const settings = await getSettings();
  return settings?.[key];
}
