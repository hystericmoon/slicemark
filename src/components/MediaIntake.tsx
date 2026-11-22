import React, { useState } from 'react';
import { AlertCircle, Film, Play, Upload } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface MediaIntakeProps {
  onSelectFile: (file: File) => void;
  onLoadSample: () => void;
  isLoadingSample: boolean;
  sampleProgress: { percent: number; label: string } | null;
  error: string | null;
}

export const MediaIntake: React.FC<MediaIntakeProps> = ({
  onSelectFile,
  onLoadSample,
  isLoadingSample,
  sampleProgress,
  error,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onSelectFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-body overflow-auto">
      <div className="w-full max-w-2xl my-auto">
        <div className="mb-5 sm:mb-7">
          <p className="text-[12px] font-medium uppercase tracking-wider text-secondary mb-2">
            Haho Studio · Slicemark
          </p>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-primary leading-tight text-balance">
            Auto-trim and slice video into exact intervals
          </h1>
          <p className="mt-2 text-[13px] sm:text-[14px] text-secondary leading-relaxed max-w-xl">
            Drop a video to batch-split into 15s, 30s, 45s, or 60s clips, lock a target-length trim window, crop for social formats, and export lossless MP4 or ZIP locally in your browser.
          </p>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-lg bg-surface border transition-colors duration-150 p-6 sm:p-10 text-center ${
            isDragging
              ? 'border-info bg-info-muted/20'
              : 'border-border-strong'
          }`}
        >
          <div className="w-12 h-12 mx-auto rounded-md bg-neutral flex items-center justify-center text-primary mb-4">
            <Film className="w-5 h-5" strokeWidth={1.8} />
          </div>

          <h2 className="text-[16px] font-semibold text-primary">
            Drop or pick a video file
          </h2>
          <p className="mt-1 text-[13px] text-secondary">
            MP4, WebM, or MOV · Processed 100% locally via FFmpeg.wasm
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <label className="h-10 px-5 rounded-md bg-accent-bg text-on-accent text-[13px] font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-within:outline-2 focus-within:outline-info focus-within:outline-offset-2">
              <Upload className="w-4 h-4" />
              <span>Choose Video File</span>
              <input
                type="file"
                accept="video/*"
                onChange={handleFileInput}
                className="sr-only"
                disabled={isLoadingSample}
              />
            </label>

            <button
              type="button"
              onClick={onLoadSample}
              disabled={isLoadingSample}
              className="h-10 px-5 rounded-md bg-surface border border-border-strong text-primary text-[13px] font-medium inline-flex items-center gap-2 hover:bg-overlay-hover transition-colors duration-150 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isLoadingSample ? 'Building 65s Sample...' : 'Load 65s Sample Video'}</span>
            </button>

            <PWAInstallButton />
          </div>

          {isLoadingSample && sampleProgress && (
            <div className="mt-6 max-w-md mx-auto text-left">
              <div className="flex items-center justify-between text-[12px] text-secondary mb-1.5">
                <span>{sampleProgress.label}</span>
                <span className="font-mono tabular-nums">{sampleProgress.percent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-neutral overflow-hidden">
                <div
                  className="h-full bg-info transition-transform duration-150 origin-left"
                  style={{ transform: `scaleX(${Math.max(0.03, sampleProgress.percent / 100)})` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-5 max-w-md mx-auto rounded-md bg-error-muted/50 border border-error px-3.5 py-2.5 text-[13px] text-error flex items-center gap-2 text-left"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Clean unboxed workflow metadata row */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-border text-left">
          <div>
            <p className="text-[13px] font-medium text-primary">Interval Auto-Trim</p>
            <p className="mt-0.5 text-[12px] text-secondary leading-relaxed">
              Batch-split at 15s, 30s, 45s, 60s, or custom lengths, or slide a locked trim window.
            </p>
          </div>
          <div>
            <p className="text-[13px] font-medium text-primary">Filmstrip & Waveform</p>
            <p className="mt-0.5 text-[12px] text-secondary leading-relaxed">
              Frame-step scrubbing, visual audio peaks, aspect crop overlays, and audio fades.
            </p>
          </div>
          <div>
            <p className="text-[13px] font-medium text-primary">Lossless MP4 & ZIP</p>
            <p className="mt-0.5 text-[12px] text-secondary leading-relaxed">
              Instant FFmpeg.wasm stream copy when cutting, or automatic H.264 re-encode for filters.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
