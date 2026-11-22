import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  GripVertical,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  AutoTrimMode,
  ClipSegment,
  ExportSettings,
  FilmstripFrame,
  ManualCutMode,
} from '../types/editor';
import { findNearestThumbnail } from '../utils/mediaAnalysis';
import { formatDurationShort, formatTimecode } from '../utils/timecode';

interface ClipQueueProps {
  segments: ClipSegment[];
  activeSegmentId: string | null;
  filmstrip: FilmstripFrame[];
  mode: AutoTrimMode;
  manualCutMode: ManualCutMode;
  exportSettings: ExportSettings;
  hasSubtitles: boolean;
  mustReencode: boolean;
  isExporting: boolean;
  onSelectSegment: (id: string) => void;
  onPreviewSegment: (segment: ClipSegment) => void;
  onToggleClipSelected: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
  onRenameSegment: (id: string, label: string) => void;
  onDeleteSegment: (id: string) => void;
  onReorderSegments: (fromIndex: number, toIndex: number) => void;
  onAddManualClip: () => void;
  onExportSettingsChange: (next: Partial<ExportSettings>) => void;
  onExportSingleClip: (segment: ClipSegment) => void;
  onExportBatch: () => void;
  className?: string;
}

export const ClipQueue: React.FC<ClipQueueProps> = ({
  segments,
  activeSegmentId,
  filmstrip,
  mode,
  manualCutMode,
  exportSettings,
  hasSubtitles,
  mustReencode,
  isExporting,
  onSelectSegment,
  onPreviewSegment,
  onToggleClipSelected,
  onSelectAll,
  onRenameSegment,
  onDeleteSegment,
  onReorderSegments,
  onAddManualClip,
  onExportSettingsChange,
  onExportSingleClip,
  onExportBatch,
  className,
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const selectedClips = segments.filter((s) => s.selected);
  const totalSelectedDuration = selectedClips.reduce(
    (sum, s) => sum + Math.max(0, s.endTime - s.startTime),
    0
  );
  const allSelected = segments.length > 0 && selectedClips.length === segments.length;
  const isRemoveMiddle = mode === 'manual' && manualCutMode === 'remove-middle';
  const canMerge = !isRemoveMiddle && selectedClips.length > 1 && exportSettings.format === 'mp4';
  const isMergeActive = canMerge && exportSettings.deliveryMode === 'merge';
  const fmtUpper = exportSettings.format.toUpperCase();

  return (
    <aside
      className={
        className ??
        'w-[310px] shrink-0 bg-surface border-l border-border flex flex-col min-h-0'
      }
    >
      {/* Queue Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-primary">
            {isRemoveMiddle ? 'Cut-Out Region' : 'Clip Queue'}
          </h2>
          <p className="text-[12px] text-secondary font-mono tabular-nums mt-0.5">
            {isRemoveMiddle
              ? '1 stitched output'
              : `${selectedClips.length}/${segments.length} selected · ${formatDurationShort(
                  totalSelectedDuration
                )}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {!isRemoveMiddle && segments.length > 1 && (
            <button
              type="button"
              onClick={() => onSelectAll(!allSelected)}
              className="h-7 px-2 rounded-xs text-[12px] font-medium text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer whitespace-nowrap"
            >
              {allSelected ? 'None' : 'All'}
            </button>
          )}
          {mode === 'manual' && !isRemoveMiddle && (
            <button
              type="button"
              onClick={onAddManualClip}
              title="Add new clip segment"
              className="h-7 px-2 rounded-xs bg-neutral text-primary text-[12px] font-medium inline-flex items-center gap-1 hover:bg-overlay-pressed transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Draggable Segment List */}
      <div className="flex-1 overflow-y-auto studio-scroll divide-y divide-border">
        {segments.map((seg, index) => {
          const isActive = seg.id === activeSegmentId;
          const thumb = seg.thumbnail || findNearestThumbnail(filmstrip, seg.startTime + 0.25);
          const clipDur = Math.max(0, seg.endTime - seg.startTime);
          const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;

          return (
            <div
              key={seg.id}
              draggable={segments.length > 1 && !isRemoveMiddle}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setDropIndex(index);
              }}
              onDragLeave={() => {
                if (dropIndex === index) setDropIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== index) {
                  onReorderSegments(dragIndex, index);
                }
                setDragIndex(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
              onClick={() => onSelectSegment(seg.id)}
              className={`p-3 transition-colors duration-150 cursor-pointer ${
                isDropTarget ? 'border-t-2 border-t-info' : ''
              } ${isActive ? 'bg-body' : 'bg-surface hover:bg-overlay-hover'}`}
            >
              <div className="flex items-start gap-2">
                {/* Drag Grip & Checkbox */}
                {!isRemoveMiddle && (
                  <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={seg.selected}
                      aria-label={`Include ${seg.label} in export`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleClipSelected(seg.id);
                      }}
                      className={`w-4 h-4 rounded-xs border flex items-center justify-center transition-colors cursor-pointer ${
                        seg.selected
                          ? 'bg-accent-bg border-accent-bg text-on-accent'
                          : 'bg-surface border-border-strong'
                      }`}
                    >
                      {seg.selected && <Check className="w-3 h-3" strokeWidth={2.8} />}
                    </button>
                    {segments.length > 1 && (
                      <GripVertical
                        className="w-3.5 h-3.5 text-secondary/60 cursor-grab"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                )}

                {/* Thumbnail Preview */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreviewSegment(seg);
                  }}
                  title={`Play ${seg.label}`}
                  className="relative w-16 h-10 rounded-xs overflow-hidden bg-[#111111] border border-border shrink-0 group cursor-pointer"
                >
                  {thumb && (
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  )}
                  <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </span>
                  <span className="absolute bottom-0.5 right-0.5 px-1 bg-black/75 text-white text-[9px] font-mono tabular-nums rounded-[2px]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </button>

                {/* Clip Name & Timecode */}
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={seg.label}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onRenameSegment(seg.id, e.target.value)}
                    aria-label={`Clip ${index + 1} filename`}
                    className="w-full bg-transparent text-[13px] font-medium text-primary truncate border-b border-transparent hover:border-border-strong focus:border-info focus:outline-none pb-0.5"
                  />
                  <div className="mt-1 flex items-center gap-1 text-[11px] font-mono tabular-nums text-secondary">
                    <span>{formatTimecode(seg.startTime)}</span>
                    <span>–</span>
                    <span>{formatTimecode(seg.endTime)}</span>
                    <span>·</span>
                    <span className="text-primary">{formatDurationShort(clipDur)}</span>
                  </div>
                </div>
              </div>

              {/* Quiet Row Actions */}
              <div className="mt-2 pl-6 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreviewSegment(seg);
                  }}
                  className="text-[11px] font-medium text-secondary hover:text-primary inline-flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3 h-3" />
                  <span>Preview</span>
                </button>

                <div className="flex items-center gap-1.5">
                  {segments.length > 1 && !isRemoveMiddle && (
                    <>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReorderSegments(index, index - 1);
                        }}
                        aria-label="Move clip up"
                        className="text-secondary hover:text-primary disabled:opacity-25 p-0.5 cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={index === segments.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReorderSegments(index, index + 1);
                        }}
                        aria-label="Move clip down"
                        className="text-secondary hover:text-primary disabled:opacity-25 p-0.5 cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </>
                  )}

                  {!isRemoveMiddle && (
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportSingleClip(seg);
                      }}
                      className="text-[11px] font-medium text-secondary hover:text-primary inline-flex items-center gap-1 px-1 cursor-pointer disabled:opacity-40"
                    >
                      <Download className="w-3 h-3" />
                      <span>{fmtUpper}</span>
                    </button>
                  )}

                  {segments.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSegment(seg.id);
                      }}
                      title="Delete clip"
                      aria-label={`Delete ${seg.label}`}
                      className="text-secondary hover:text-error p-0.5 rounded-xs transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Delivery & Export Summary Footer */}
      <div className="p-4 border-t border-border bg-surface space-y-3">
        {/* Individual vs Merge Highlight Reel Toggle */}
        {canMerge && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-body">
              <button
                type="button"
                onClick={() => onExportSettingsChange({ deliveryMode: 'individual' })}
                className={`h-7 rounded-sm text-[11px] font-medium transition-colors cursor-pointer ${
                  exportSettings.deliveryMode === 'individual'
                    ? 'bg-surface text-primary shadow-sm'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                Separate Clips
              </button>
              <button
                type="button"
                onClick={() => onExportSettingsChange({ deliveryMode: 'merge' })}
                className={`h-7 rounded-sm text-[11px] font-medium transition-colors cursor-pointer ${
                  exportSettings.deliveryMode === 'merge'
                    ? 'bg-surface text-primary shadow-sm'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                Merge Highlight
              </button>
            </div>

            {isMergeActive && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-secondary">Cut Transitions</span>
                <button
                  type="button"
                  onClick={() =>
                    onExportSettingsChange({
                      mergeFadeDip: exportSettings.mergeFadeDip > 0 ? 0 : 0.4,
                    })
                  }
                  className="text-primary font-medium hover:text-info cursor-pointer"
                >
                  {exportSettings.mergeFadeDip > 0 ? '0.4s Fade Dip' : 'Hard Cut'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-secondary">
            {fmtUpper} · {mustReencode ? 'Re-Encode' : 'Lossless'}
          </span>
          <span className="text-secondary font-mono tabular-nums text-[11px]">
            {hasSubtitles ? '+ SRT' : ''}
            {exportSettings.includeCoverImages ? ' + JPG' : ''}
          </span>
        </div>

        <button
          type="button"
          onClick={onExportBatch}
          disabled={selectedClips.length === 0 || isExporting}
          className="w-full h-10 px-4 rounded-md bg-accent-bg text-on-accent text-[13px] font-medium inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2"
        >
          <Download className="w-4 h-4" />
          <span>
            {isRemoveMiddle
              ? 'Export Stitched MP4'
              : isMergeActive
                ? `Merge ${selectedClips.length} Clips (.mp4)`
                : selectedClips.length > 1
                  ? `Download ${selectedClips.length} ${fmtUpper}s (.zip)`
                  : `Download Clip (.${exportSettings.format})`}
          </span>
        </button>
      </div>
    </aside>
  );
};
