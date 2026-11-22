import React, { useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        title="Install Slicemark app"
        className={
          compact
            ? 'inline-flex items-center gap-1.5 py-1.5 text-primary hover:text-info transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2 rounded-xs'
            : 'h-9 px-3.5 rounded-md bg-surface border border-border-strong text-primary text-[13px] font-medium inline-flex items-center gap-2 hover:bg-overlay-hover transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2'
        }
      >
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
        <span className={compact ? 'hidden md:inline' : ''}>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title="Install Slicemark on iOS"
          className={
            compact
              ? 'inline-flex items-center gap-1.5 py-1.5 text-secondary hover:text-primary transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2 rounded-xs'
              : 'h-9 px-3.5 rounded-md bg-surface border border-border-strong text-primary text-[13px] font-medium inline-flex items-center gap-2 hover:bg-overlay-hover transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer'
          }
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className={compact ? 'hidden md:inline' : ''}>Install App</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            onClick={() => setShowIOSGuide(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-lg bg-surface border border-border-strong shadow-lg p-6"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 id="ios-install-title" className="text-[16px] font-semibold text-primary">
                  Install Slicemark on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="w-8 h-8 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-[13px] text-secondary leading-relaxed list-decimal list-inside">
                <li>
                  Tap the <strong className="text-primary">Share</strong> icon in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong className="text-primary">Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong className="text-primary">Add</strong> to launch Slicemark fullscreen.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full h-9 rounded-md bg-accent-bg text-on-accent text-[13px] font-medium hover:opacity-90 cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
