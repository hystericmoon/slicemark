import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, ListVideo, X } from 'lucide-react';
import { ClipSegment } from '../types/editor';
import { triggerBrowserDownload } from '../utils/ffmpegEngine';
import { formatSegmentsAsChapters, parseChaptersToSegments } from '../utils/subtitles';

interface ChaptersModalProps {
  open: boolean;
  duration: number;
  segments: ClipSegment[];
  onApplySegments: (segments: ClipSegment[]) => void;
  onClose: () => void;
}

const SAMPLE_PLACEHOLDER = `00:00 Opening Hook
00:15 Product Walkthrough
00:30 Workflow Detail
00:45 Export Summary
01:00 Outro Tail`;

export const ChaptersModal: React.FC<ChaptersModalProps> = ({
  open,
  duration,
  segments,
  onApplySegments,
  onClose,
}) => {
  const [tab, setTab] = useState<'import' | 'export'>('import');
  const [rawInput, setRawInput] = useState('');
  const [copied, setCopied] = useState(false);

  const parsedPreview = useMemo(
    () => parseChaptersToSegments(rawInput, duration),
    [rawInput, duration]
  );

  const exportedChapters = useMemo(
    () => formatSegmentsAsChapters(segments),
    [segments]
  );

  if (!open) return null;

  const handleApply = () => {
    if (parsedPreview.length === 0) return;
    onApplySegments(parsedPreview);
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportedChapters);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadJson = () => {
    const payload = JSON.stringify(
      segments.map((s, i) => ({
        index: i + 1,
        label: s.label,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: Number((s.endTime - s.startTime).toFixed(2)),
        selected: s.selected,
      })),
      null,
      2
    );
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    triggerBrowserDownload(url, 'slicemark_chapters.json');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapters-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg bg-surface border border-border-strong shadow-lg p-6"
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <ListVideo className="w-4 h-4 text-primary" />
            <h2 id="chapters-modal-title" className="text-[16px] font-semibold text-primary">
              Chapters & Timestamps
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chapters dialog"
            className="w-8 h-8 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Switch */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-body mb-4">
          <button
            type="button"
            onClick={() => setTab('import')}
            className={`h-8 rounded-sm text-[12px] font-medium transition-colors cursor-pointer ${
              tab === 'import'
                ? 'bg-surface text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            Paste Timestamps to Split
          </button>
          <button
            type="button"
            onClick={() => setTab('export')}
            className={`h-8 rounded-sm text-[12px] font-medium transition-colors cursor-pointer ${
              tab === 'export'
                ? 'bg-surface text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            Export Current Chapters
          </button>
        </div>

        {tab === 'import' ? (
          <div>
            <p className="text-[12px] text-secondary mb-2">
              Paste YouTube-style timestamp lines (e.g. <code className="font-mono text-primary">00:15 Demo</code>). Each line generates a named clip on the timeline.
            </p>
            <textarea
              rows={6}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={SAMPLE_PLACEHOLDER}
              className="w-full rounded-md bg-body border border-border-strong p-3 text-[13px] font-mono text-primary placeholder:text-secondary/60 focus-visible:outline-2 focus-visible:outline-info resize-none"
            />
            <div className="mt-2.5 flex items-center justify-between text-[12px]">
              <button
                type="button"
                onClick={() => setRawInput(SAMPLE_PLACEHOLDER)}
                className="text-info hover:underline cursor-pointer"
              >
                Insert example timestamps
              </button>
              <span className="font-mono tabular-nums text-secondary">
                {parsedPreview.length} {parsedPreview.length === 1 ? 'clip' : 'clips'} detected
              </span>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-md bg-surface border border-border-strong text-[13px] font-medium text-primary hover:bg-overlay-hover cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={parsedPreview.length === 0}
                onClick={handleApply}
                className="h-9 px-4 rounded-md bg-accent-bg text-on-accent text-[13px] font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                Create {parsedPreview.length || ''} Clips
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[12px] text-secondary mb-2">
              Copy your current timeline cuts as YouTube chapter markers or download a JSON cut list.
            </p>
            <pre className="w-full max-h-48 overflow-auto studio-scroll rounded-md bg-body border border-border-strong p-3 text-[12px] font-mono tabular-nums text-primary whitespace-pre-wrap">
              {exportedChapters}
            </pre>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleDownloadJson}
                className="h-9 px-3.5 rounded-md bg-surface border border-border-strong text-[13px] font-medium text-primary hover:bg-overlay-hover inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download JSON</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="h-9 px-4 rounded-md bg-accent-bg text-on-accent text-[13px] font-medium inline-flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Chapters'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
