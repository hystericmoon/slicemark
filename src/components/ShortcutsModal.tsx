import React from 'react';
import { X } from 'lucide-react';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ['Space'], action: 'Play or pause video preview' },
  { keys: ['S'], action: 'Split clip at playhead position' },
  { keys: ['I'], action: 'Set active clip Start (In) to playhead' },
  { keys: ['O'], action: 'Set active clip End (Out) to playhead' },
  { keys: ['←', '→'], action: 'Step backward / forward 1 frame' },
  { keys: ['Shift', '← / →'], action: 'Jump backward / forward 1 second' },
  { keys: ['L'], action: 'Toggle loop active clip playback' },
  { keys: ['M'], action: 'Toggle mute audio' },
  { keys: ['Ctrl / ⌘', 'Z'], action: 'Undo last timeline edit' },
  { keys: ['Ctrl / ⌘', 'Shift', 'Z'], action: 'Redo timeline edit' },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-surface border border-border-strong shadow-lg p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="shortcuts-title" className="text-[16px] font-semibold text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="w-8 h-8 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-border">
          {SHORTCUTS.map((item) => (
            <div
              key={item.action}
              className="py-2.5 flex items-center justify-between gap-4 text-[13px]"
            >
              <span className="text-secondary">{item.action}</span>
              <div className="flex items-center gap-1 shrink-0">
                {item.keys.map((k) => (
                  <kbd
                    key={k}
                    className="px-2 py-0.5 rounded-xs bg-body border border-border-strong text-[11px] font-mono text-primary"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
