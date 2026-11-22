import React from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2, X } from 'lucide-react';
import { ExportProgressState } from '../types/editor';
import { triggerBrowserDownload } from '../utils/ffmpegEngine';

interface ExportModalProps {
  state: ExportProgressState;
  onCancel: () => void;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  state,
  onCancel,
  onClose,
}) => {
  if (state.status === 'idle') return null;

  const isBusy =
    state.status === 'loading-engine' ||
    state.status === 'processing' ||
    state.status === 'packaging';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-surface border border-border-strong shadow-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="export-modal-title" className="text-[16px] font-semibold text-primary">
              {state.status === 'done'
                ? 'Export Complete'
                : state.status === 'error'
                  ? 'Export Interrupted'
                  : 'Exporting Video'}
            </h2>
            <p className="mt-0.5 text-[12px] text-secondary">
              {state.format === 'mp3' || state.format === 'wav'
                ? `${state.format.toUpperCase()} audio extraction · Local FFmpeg.wasm`
                : state.format === 'gif'
                  ? 'Animated GIF palette render · Local FFmpeg.wasm'
                  : state.format === 'webm'
                    ? 'WebM VP8 video render · Local FFmpeg.wasm'
                    : state.usedReencode
                      ? 'H.264 / AAC filter re-encode · Local FFmpeg.wasm'
                      : 'Fast lossless stream copy · Local FFmpeg.wasm'}
            </p>
          </div>
          {!isBusy && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close export dialog"
              className="w-8 h-8 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="mt-5">
          {isBusy && (
            <>
              <div className="flex items-center justify-between text-[13px] mb-2">
                <span className="text-primary inline-flex items-center gap-2 truncate pr-3">
                  <Loader2 className="w-4 h-4 animate-spin text-info shrink-0" />
                  <span className="truncate">{state.message}</span>
                </span>
                <span className="font-mono tabular-nums text-primary font-medium shrink-0">
                  {state.overallPercent}%
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-body overflow-hidden">
                <div
                  className="h-full bg-info transition-transform duration-150 origin-left"
                  style={{
                    transform: `scaleX(${Math.max(0.02, state.overallPercent / 100)})`,
                  }}
                />
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[12px] text-secondary font-mono tabular-nums">
                <span>
                  Clip {Math.max(1, state.currentClipIndex)} of {Math.max(1, state.totalClips)}
                </span>
                <span>Current clip: {state.clipPercent}%</span>
              </div>
            </>
          )}

          {state.status === 'done' && (
            <div className="rounded-md bg-body border border-border p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-primary">{state.message}</p>
                <p className="mt-0.5 text-[12px] text-secondary">
                  Your download started automatically. Click below if you need to save it again.
                </p>
              </div>
            </div>
          )}

          {state.status === 'error' && (
            <div className="rounded-md bg-error-muted/40 border border-error p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-error">
                  {state.error || 'An error occurred during export.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          {isBusy ? (
            <button
              type="button"
              onClick={onCancel}
              className="h-9 px-4 rounded-md bg-surface border border-border-strong text-[13px] font-medium text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
            >
              Cancel Export
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-md bg-surface border border-border-strong text-[13px] font-medium text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
              >
                Close
              </button>
              {state.status === 'done' && state.downloadUrl && state.downloadFilename && (
                <button
                  type="button"
                  onClick={() =>
                    triggerBrowserDownload(state.downloadUrl!, state.downloadFilename!)
                  }
                  className="h-9 px-4 rounded-md bg-accent-bg text-on-accent text-[13px] font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Again</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
