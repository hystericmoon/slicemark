import React from 'react';
import { Download, History, Keyboard, Moon, Sun, Upload } from 'lucide-react';
import { OutputFormat, ThemeMode } from '../types/editor';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onImportClick: () => void;
  onOpenHistory: () => void;
  historyCount: number;
  onOpenShortcuts: () => void;
  onExportClick: () => void;
  onOpenShowcase?: () => void;
  hasMedia: boolean;
  selectedClipCount: number;
  exportFormat: OutputFormat;
  isMergeDelivery: boolean;
  isExporting: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  theme,
  onToggleTheme,
  onImportClick,
  onOpenHistory,
  historyCount,
  onOpenShortcuts,
  onExportClick,
  onOpenShowcase,
  hasMedia,
  selectedClipCount,
  exportFormat,
  isMergeDelivery,
  isExporting,
}) => {
  const fmtUpper = exportFormat.toUpperCase();
  const exportLabel = isMergeDelivery
    ? `Merge ${selectedClipCount} Clips`
    : selectedClipCount > 1
      ? `Export ${selectedClipCount} ${fmtUpper}s`
      : `Export ${fmtUpper}`;

  const compactExportLabel = isMergeDelivery
    ? `Merge (${selectedClipCount})`
    : selectedClipCount > 1
      ? `Export (${selectedClipCount})`
      : 'Export';

  return (
    <header className="h-14 shrink-0 bg-surface border-b border-border px-3 sm:px-5 flex items-center justify-between gap-3 sm:gap-8 select-none">
      {/* Zone 1: Single-line Brand Wordmark */}
      <div className="flex items-center gap-2 sm:gap-2.5 whitespace-nowrap shrink-0">
        <span
          aria-hidden="true"
          className="w-7 h-7 rounded-sm bg-accent-bg text-on-accent flex items-center justify-center shrink-0"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="2.5"
              y="4"
              width="6"
              height="12"
              rx="1.2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <rect
              x="11.5"
              y="4"
              width="6"
              height="12"
              rx="1.2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <line
              x1="10"
              y1="2"
              x2="10"
              y2="18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="text-[15px] sm:text-[16px] font-semibold tracking-tight text-primary whitespace-nowrap shrink-0">
          Slicemark
        </span>
        <span className="hidden md:inline text-[12px] text-secondary whitespace-nowrap shrink-0">
          by Haho Studio
        </span>
      </div>

      {/* Zone 2: Concise single-line workspace navigation links */}
      <nav
        aria-label="Workspace actions"
        className="flex items-center gap-3.5 sm:gap-6 text-[13px] font-medium text-secondary"
      >
        <button
          type="button"
          onClick={onImportClick}
          title={hasMedia ? 'Replace Video' : 'Import Video'}
          className="inline-flex items-center gap-1.5 py-1.5 text-secondary hover:text-primary transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2 rounded-xs"
        >
          <Upload className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">{hasMedia ? 'Replace Video' : 'Import Video'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenHistory}
          title="Local History"
          className="inline-flex items-center gap-1.5 py-1.5 text-secondary hover:text-primary transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2 rounded-xs"
        >
          <History className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">
            History{historyCount > 0 ? ` (${historyCount})` : ''}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenShortcuts}
          className="hidden lg:inline-flex items-center gap-1.5 py-1.5 text-secondary hover:text-primary transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2 rounded-xs"
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span>Shortcuts</span>
        </button>

        {onOpenShowcase && (
          <button
            type="button"
            onClick={onOpenShowcase}
            className="hidden md:inline-flex items-center gap-1.5 py-1.5 text-secondary hover:text-primary transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2 rounded-xs"
          >
            <span>Overview</span>
          </button>
        )}

        <PWAInstallButton compact />

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          className="inline-flex items-center gap-1.5 py-1.5 text-secondary hover:text-primary transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2 rounded-xs"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden md:inline">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden md:inline">Dark Mode</span>
            </>
          )}
        </button>
      </nav>

      {/* Zone 3: Single Primary Action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onExportClick}
          disabled={!hasMedia || selectedClipCount === 0 || isExporting}
          className="h-9 px-3 sm:px-4 rounded-md bg-accent-bg text-on-accent text-[13px] font-medium inline-flex items-center gap-1.5 sm:gap-2 transition-opacity duration-150 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="sm:hidden">{isExporting ? 'Exporting...' : compactExportLabel}</span>
          <span className="hidden sm:inline">{isExporting ? 'Exporting...' : exportLabel}</span>
        </button>
      </div>
    </header>
  );
};
