import React from 'react';
import { Check, Download, History, Sparkles, Trash2, X } from 'lucide-react';
import { LocalHistoryEntry } from '../types/editor';

interface HistoryModalProps {
  open: boolean;
  entries: LocalHistoryEntry[];
  hasLoadedVideo: boolean;
  onApplyEntry: (entry: LocalHistoryEntry) => void;
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

function formatHistoryTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  open,
  entries,
  hasLoadedVideo,
  onApplyEntry,
  onDeleteEntry,
  onClearAll,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg bg-surface border border-border-strong shadow-lg p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="history-title" className="text-[16px] font-semibold text-primary">
              Local History
            </h2>
            <p className="text-[12px] text-secondary mt-0.5">
              Saved only in your browser · no account required
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="h-8 px-2.5 rounded-md border border-border-strong text-[12px] text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close local history"
              className="w-8 h-8 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-md bg-body border border-border">
            <div className="w-10 h-10 mx-auto rounded-md bg-neutral flex items-center justify-center text-secondary mb-3">
              <History className="w-5 h-5" />
            </div>
            <p className="text-[13px] font-medium text-primary">No local history yet</p>
            <p className="text-[12px] text-secondary mt-1 max-w-sm mx-auto leading-relaxed">
              Run Smart Auto-Tune or export a video and your looks &amp; exports will be saved here.
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto studio-scroll divide-y divide-border pr-1">
            {entries.map((entry) => {
              const isTune = entry.kind === 'autotune';
              return (
                <div
                  key={entry.id}
                  className="py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[10px] font-medium ${
                          isTune
                            ? 'bg-info/15 text-info'
                            : 'bg-neutral text-primary border border-border'
                        }`}
                      >
                        {isTune ? (
                          <Sparkles className="w-2.5 h-2.5" />
                        ) : (
                          <Download className="w-2.5 h-2.5" />
                        )}
                        {isTune ? 'Auto-Tune' : 'Export'}
                      </span>
                      <span className="text-[13px] font-medium text-primary truncate">
                        {entry.label}
                      </span>
                      <span className="text-[11px] text-secondary">
                        · {formatHistoryTime(entry.createdAt)}
                      </span>
                    </div>

                    <div className="text-[11px] text-secondary truncate">
                      {entry.fileName} · {entry.resolution}
                    </div>
                    <div className="text-[11px] text-secondary/80 truncate">
                      {entry.detail}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <button
                      type="button"
                      disabled={!hasLoadedVideo}
                      onClick={() => {
                        onApplyEntry(entry);
                        onClose();
                      }}
                      title={
                        hasLoadedVideo
                          ? 'Apply this color & audio look to current video'
                          : 'Load a video to apply this look'
                      }
                      className="h-7 px-2.5 rounded-sm bg-accent-bg text-on-accent text-[11px] font-medium inline-flex items-center gap-1 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                    >
                      <Check className="w-3 h-3" />
                      <span>Apply Look</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.id)}
                      aria-label="Remove entry"
                      title="Remove entry"
                      className="w-7 h-7 rounded-sm border border-border text-secondary hover:text-error hover:border-error/40 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
