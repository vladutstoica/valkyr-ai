/**
 * Abstraction layer for shell/OS operations via electronAPI.
 */

export async function openExternal(url: string): Promise<void> {
  try {
    await window.electronAPI.openExternal(url);
  } catch (error) {
    console.error('Failed to open external URL:', error);
  }
}
