import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { getShortcutsByCategory } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatModifier(modifier?: string): string {
  if (!modifier) return '';
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  switch (modifier) {
    case 'meta':
      return isMac ? '\u2318' : 'Ctrl';
    case 'ctrl':
      return 'Ctrl';
    case 'alt':
      return isMac ? '\u2325' : 'Alt';
    case 'shift':
      return '\u21E7';
    default:
      return modifier;
  }
}

function formatKey(key: string): string {
  if (key === 'Escape') return 'Esc';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  const grouped = useMemo(() => getShortcutsByCategory(), []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {Object.entries(grouped).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                {category}
              </h3>
              <div className="space-y-1">
                {shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.key + (shortcut.modifier || '')}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-sm"
                  >
                    <span>{shortcut.description}</span>
                    <kbd className="bg-muted text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-xs">
                      {shortcut.modifier && <>{formatModifier(shortcut.modifier)}+</>}
                      {formatKey(shortcut.key)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
