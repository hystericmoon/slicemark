import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Magnet, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import {
  AudioSettings,
  AutoTrimMode,
  ClipSegment,
  FilmstripFrame,
  ManualCutMode,
  MediaSource,
  ThemeMode,
} from '../types/editor';
import { clamp, formatDurationShort, formatFileSize, formatRulerTime, formatTimecode } from '../utils/timecode';

interface TimelineProps {
  source: MediaSource;
  theme: ThemeMode;
  filmstrip: FilmstripFrame[];
  audioPeaks: number[];
  isAnalyzing: boolean;
  segments: ClipSegment[];
  activeSegmentId: string | null;
  mode: AutoTrimMode;
  manualCutMode: ManualCutMode;
  intervalSeconds: number;
  currentTime: number;
  audio: AudioSettings;
  onSeek: (time: number) => void;
  onSelectSegment: (id: string) => void;
  onSegmentDragChange: (id: string, startTime: number, endTime: number) => void;
  onSegmentDragEnd: () => void;
}

type DragInteraction =
  | { kind: 'scrub' }
  | {
      kind: 'handle-left' | 'handle-right' | 'window-move';
      segmentId: string;
      originX: number;
      origStart: number;
      origEnd: number;
    };

export const Timeline: React.FC<TimelineProps> = ({
  source,
  theme,
  filmstrip,
  audioPeaks,
  isAnalyzing,
  segments,
  activeSegmentId,
  mode,
  manualCutMode,
  intervalSeconds,
  currentTime,
  audio,
  onSeek,
  onSelectSegment,
  onSegmentDragChange,
  onSegmentDragEnd,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [containerWidth, setContainerWidth] = useState(800);
  const [dragState, setDragState] = useState<DragInteraction | null>(null);

  const liveRef = useRef({
    currentTime,
    onSeek,
    onSegmentDragChange,
    onSegmentDragEnd,
  });
  liveRef.current = {
    currentTime,
    onSeek,
    onSegmentDragChange,
    onSegmentDragEnd,
  };

  // Measure scroll viewport width cleanly
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(Math.max(320, el.clientWidth - 24));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trackWidth = Math.max(containerWidth, Math.round(containerWidth * zoom));
  const duration = Math.max(0.5, source.duration);
  const pxPerSec = trackWidth / duration;

  const timeToPx = (t: number) => (clamp(t, 0, duration) / duration) * trackWidth;

  const clientXToTime = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    return (x / Math.max(1, rect.width)) * duration;
  };

  // Compute crisp ruler tick spacing based on pixels per second
  const rulerTicks = useMemo(() => {
    const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const minPxSpacing = 68;
    const majorStep =
      candidates.find((step) => step * pxPerSec >= minPxSpacing) ?? 300;
    const ticks: Array<{ time: number; major: boolean }> = [];
    const minorStep = majorStep >= 10 ? majorStep / 5 : majorStep / 2;

    for (let t = 0; t <= duration + 0.001; t += minorStep) {
      const rounded = Number(t.toFixed(2));
      const isMajor = Math.abs(rounded % majorStep) < 0.02 || Math.abs(majorStep - (rounded % majorStep)) < 0.02;
      ticks.push({ time: rounded, major: isMajor });
    }
    return ticks;
  }, [duration, pxPerSec]);

  // Draw crisp high-DPI waveform canvas with active fade envelope overlays
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const height = 52;
    canvas.width = Math.max(1, Math.round(trackWidth * dpr));
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, trackWidth, height);

    const isDark = theme === 'dark';
    const barColor = audio.muted
      ? isDark
        ? 'rgba(255,255,255,0.14)'
        : 'rgba(0,0,0,0.14)'
      : isDark
        ? 'rgba(241,241,241,0.45)'
        : 'rgba(27,27,27,0.42)';

    const activeBarColor = audio.muted
      ? isDark
        ? 'rgba(255,255,255,0.22)'
        : 'rgba(0,0,0,0.2)'
      : isDark
        ? '#6d9cfe'
        : '#0074e2';

    const midY = height / 2;
    const peaks = audioPeaks.length > 0 ? audioPeaks : new Array(160).fill(0.08);
    const barSpacing = Math.max(2.5, trackWidth / peaks.length);
    const barW = Math.max(1.5, Math.min(3, barSpacing * 0.62));
    const gainVisual = audio.muted ? 0.2 : clamp(audio.volume, 0.25, 1.45);

    const activeSeg = segments.find((s) => s.id === activeSegmentId);

    for (let i = 0; i < peaks.length; i++) {
      const ratio = i / peaks.length;
      const x = ratio * trackWidth;
      const t = ratio * duration;
      const isInActive =
        activeSeg && t >= activeSeg.startTime && t <= activeSeg.endTime;

      let amp = peaks[i] * gainVisual;

      // Visualize fade-in and fade-out ramps on active clip waveform
      if (isInActive && activeSeg && !audio.muted) {
        const elapsed = t - activeSeg.startTime;
        const remaining = activeSeg.endTime - t;
        if (audio.fadeIn > 0.05 && elapsed < audio.fadeIn) {
          amp *= clamp(elapsed / audio.fadeIn, 0.08, 1);
        }
        if (audio.fadeOut > 0.05 && remaining < audio.fadeOut) {
          amp *= clamp(remaining / audio.fadeOut, 0.08, 1);
        }
      }

      const barH = Math.max(2, Math.min(height - 8, amp * (height - 8)));
      ctx.fillStyle = isInActive ? activeBarColor : barColor;
      ctx.fillRect(x, midY - barH / 2, barW, barH);
    }

    // Centerline hairline
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, midY, trackWidth, 1);
  }, [audioPeaks, trackWidth, theme, audio, segments, activeSegmentId, duration]);

  // Global pointer handlers for smooth scrubbing & trim handle dragging
  useEffect(() => {
    if (!dragState) return;

    const snapTime = (rawTime: number): number => {
      if (!snapEnabled) return Number(rawTime.toFixed(2));
      const snapThresholdSec = 10 / Math.max(1, pxPerSec);
      const targets: number[] = [0, duration, liveRef.current.currentTime];

      // Snap to interval grid multiples (15s, 30s, 45s, 60s...)
      if (intervalSeconds >= 1) {
        const nearestGrid = Math.round(rawTime / intervalSeconds) * intervalSeconds;
        targets.push(nearestGrid);
      }

      for (const target of targets) {
        if (Math.abs(rawTime - target) <= snapThresholdSec) {
          return Number(clamp(target, 0, duration).toFixed(2));
        }
      }
      return Number(rawTime.toFixed(2));
    };

    const handleMove = (e: PointerEvent) => {
      if (dragState.kind === 'scrub') {
        const t = clientXToTime(e.clientX);
        liveRef.current.onSeek(t);
        return;
      }

      const deltaPx = e.clientX - dragState.originX;
      const deltaSec = deltaPx / Math.max(1, pxPerSec);

      if (dragState.kind === 'window-move') {
        const len = dragState.origEnd - dragState.origStart;
        const rawStart = clamp(dragState.origStart + deltaSec, 0, Math.max(0, duration - len));
        const snappedStart = snapTime(rawStart);
        const finalStart = clamp(snappedStart, 0, Math.max(0, duration - len));
        liveRef.current.onSegmentDragChange(
          dragState.segmentId,
          Number(finalStart.toFixed(2)),
          Number(Math.min(duration, finalStart + len).toFixed(2))
        );
      } else if (dragState.kind === 'handle-left') {
        const rawStart = clamp(dragState.origStart + deltaSec, 0, dragState.origEnd - 0.5);
        const nextStart = clamp(snapTime(rawStart), 0, dragState.origEnd - 0.5);
        liveRef.current.onSegmentDragChange(dragState.segmentId, nextStart, dragState.origEnd);
        liveRef.current.onSeek(nextStart);
      } else if (dragState.kind === 'handle-right') {
        const rawEnd = clamp(dragState.origEnd + deltaSec, dragState.origStart + 0.5, duration);
        const nextEnd = clamp(snapTime(rawEnd), dragState.origStart + 0.5, duration);
        liveRef.current.onSegmentDragChange(dragState.segmentId, dragState.origStart, nextEnd);
        liveRef.current.onSeek(nextEnd);
      }
    };

    const handleUp = () => {
      if (dragState.kind !== 'scrub') {
        liveRef.current.onSegmentDragEnd();
      }
      setDragState(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, pxPerSec, duration, snapEnabled, intervalSeconds]);

  const startScrub = (e: React.PointerEvent) => {
    e.preventDefault();
    const t = clientXToTime(e.clientX);
    onSeek(t);
    setDragState({ kind: 'scrub' });
  };

  return (
    <section
      aria-label="Video timeline"
      className="h-[176px] lg:h-[228px] shrink-0 bg-surface border-t border-border flex flex-col select-none"
    >
      {/* Timeline Toolbar & Quiet Unboxed File Metadata */}
      <div className="h-9 shrink-0 px-3 sm:px-4 border-b border-border flex items-center justify-between gap-2 sm:gap-4 text-[12px]">
        <div className="flex items-center gap-2 text-secondary min-w-0 truncate">
          <span className="text-primary font-medium truncate max-w-[120px] sm:max-w-[200px]">
            {source.name}
          </span>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <span className="hidden sm:inline font-mono tabular-nums whitespace-nowrap">
            {source.width}×{source.height}
          </span>
          <span className="hidden md:inline" aria-hidden="true">·</span>
          <span className="hidden md:inline font-mono tabular-nums whitespace-nowrap">
            {formatFileSize(source.size)}
          </span>
          {isAnalyzing && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-info whitespace-nowrap">Analyzing...</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSnapEnabled((s) => !s)}
            title="Snap trim handles to interval grid"
            className={`h-7 px-2 rounded-xs inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              snapEnabled
                ? 'bg-neutral text-primary'
                : 'text-secondary hover:text-primary hover:bg-overlay-hover'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Snap</span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setZoom((z) => clamp(Number((z - 0.75).toFixed(2)), 1, 8))}
              aria-label="Zoom out timeline"
              className="w-6 h-6 rounded-xs flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={1}
              max={8}
              step={0.25}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              aria-label="Timeline zoom"
              className="w-16 sm:w-24 astryx-range"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => clamp(Number((z + 0.75).toFixed(2)), 1, 8))}
              aria-label="Zoom in timeline"
              className="w-6 h-6 rounded-xs flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Fit timeline to view"
              aria-label="Fit timeline"
              className="hidden sm:flex w-6 h-6 rounded-xs items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <span className="font-mono tabular-nums text-[11px] text-secondary w-8 sm:w-9 text-right">
              {zoom.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable Timeline Tracks */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden studio-scroll touch-pan-x px-3 py-2 bg-body"
      >
        <div
          ref={trackRef}
          style={{ width: `${trackWidth}px` }}
          className="relative h-full flex flex-col"
        >
          {/* 1. Timecode Ruler */}
          <div
            onPointerDown={startScrub}
            className="h-6 relative border-b border-border cursor-ew-resize shrink-0"
          >
            {rulerTicks.map((tick) => {
              const left = timeToPx(tick.time);
              return (
                <div
                  key={`${tick.time}-${tick.major ? 'M' : 'm'}`}
                  style={{ left: `${left}px` }}
                  className="absolute bottom-0 flex flex-col items-start pointer-events-none"
                >
                  {tick.major && (
                    <span className="text-[10px] font-mono tabular-nums text-secondary -translate-x-0.5 mb-0.5 leading-none">
                      {formatRulerTime(tick.time)}
                    </span>
                  )}
                  <div
                    className={`w-px ${
                      tick.major ? 'h-2 bg-border-strong' : 'h-1 bg-border'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* 2. Composite Media Tracks (Filmstrip + Waveform + Interactive Segments) */}
          <div className="relative flex-1 mt-1.5 rounded-md overflow-hidden border border-border-strong bg-surface flex flex-col">
            {/* Filmstrip Frame Strip */}
            <div
              onPointerDown={startScrub}
              className="flex-1 min-h-[54px] flex items-stretch overflow-hidden bg-[#101012] relative cursor-pointer"
            >
              {filmstrip.length > 0 ? (
                filmstrip.map((frame, i) => (
                  <div
                    key={`${frame.time}-${i}`}
                    className="flex-1 h-full overflow-hidden border-r border-black/30 last:border-r-0"
                  >
                    <img
                      src={frame.dataUrl}
                      alt=""
                      draggable={false}
                      className="w-full h-full object-cover opacity-90 pointer-events-none"
                    />
                  </div>
                ))
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] text-secondary">
                  Extracting filmstrip frames...
                </div>
              )}
            </div>

            {/* Audio Waveform Track */}
            <div
              onPointerDown={startScrub}
              className="h-[52px] shrink-0 border-t border-border bg-surface relative cursor-pointer"
            >
              <canvas
                ref={waveformCanvasRef}
                style={{ width: `${trackWidth}px`, height: '52px' }}
                className="block"
              />
            </div>

            {/* Interactive Segment Regions Overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {segments.map((seg, idx) => {
                const leftPx = timeToPx(seg.startTime);
                const widthPx = Math.max(12, timeToPx(seg.endTime) - leftPx);
                const isActive = seg.id === activeSegmentId;
                const isRemoveMode = mode === 'manual' && manualCutMode === 'remove-middle';
                const isFixedWindow = mode === 'fixed-window';

                return (
                  <div
                    key={seg.id}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSegment(seg.id);
                    }}
                    onPointerDown={(e) => {
                      if (isFixedWindow) {
                        e.stopPropagation();
                        onSelectSegment(seg.id);
                        setDragState({
                          kind: 'window-move',
                          segmentId: seg.id,
                          originX: e.clientX,
                          origStart: seg.startTime,
                          origEnd: seg.endTime,
                        });
                      }
                    }}
                    className={`absolute inset-y-0 pointer-events-auto transition-colors duration-100 ${
                      isFixedWindow ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                    } ${
                      isRemoveMode
                        ? 'bg-error/25 border-x-2 border-error'
                        : isActive
                          ? 'bg-info/15 border-2 border-info z-10'
                          : seg.selected
                            ? 'bg-info/6 border border-border-strong/80 hover:bg-info/10'
                            : 'bg-black/45 border border-border/60'
                    }`}
                  >
                    {/* Segment Label Tag */}
                    <div className="px-2 py-1 flex items-center justify-between gap-1 pointer-events-none overflow-hidden">
                      <span
                        className={`text-[10px] font-mono tabular-nums font-medium px-1.5 py-0.5 rounded-xs truncate ${
                          isRemoveMode
                            ? 'bg-error text-on-error'
                            : isActive
                              ? 'bg-info text-on-info'
                              : 'bg-black/70 text-white'
                        }`}
                      >
                        {isRemoveMode
                          ? `Cut Out · ${formatDurationShort(seg.endTime - seg.startTime)}`
                          : `${String(idx + 1).padStart(2, '0')} · ${formatDurationShort(
                              seg.endTime - seg.startTime
                            )}`}
                      </span>
                    </div>

                    {/* Left & Right Trim Handles (disabled in fixed-window since window slides as one block) */}
                    {!isFixedWindow && (isActive || isRemoveMode || segments.length <= 8) && (
                      <>
                        <div
                          role="slider"
                          aria-label={`Adjust start of ${seg.label}`}
                          aria-valuenow={seg.startTime}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onSelectSegment(seg.id);
                            setDragState({
                              kind: 'handle-left',
                              segmentId: seg.id,
                              originX: e.clientX,
                              origStart: seg.startTime,
                              origEnd: seg.endTime,
                            });
                          }}
                          className={`absolute left-0 inset-y-0 w-3 -ml-1 cursor-ew-resize flex items-center justify-center group z-20`}
                        >
                          <span
                            className={`w-1.5 h-8 rounded-full transition-transform group-hover:scale-y-110 ${
                              isRemoveMode
                                ? 'bg-error'
                                : isActive
                                  ? 'bg-info'
                                  : 'bg-white/80'
                            }`}
                          />
                        </div>

                        <div
                          role="slider"
                          aria-label={`Adjust end of ${seg.label}`}
                          aria-valuenow={seg.endTime}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onSelectSegment(seg.id);
                            setDragState({
                              kind: 'handle-right',
                              segmentId: seg.id,
                              originX: e.clientX,
                              origStart: seg.startTime,
                              origEnd: seg.endTime,
                            });
                          }}
                          className={`absolute right-0 inset-y-0 w-3 -mr-1 cursor-ew-resize flex items-center justify-center group z-20`}
                        >
                          <span
                            className={`w-1.5 h-8 rounded-full transition-transform group-hover:scale-y-110 ${
                              isRemoveMode
                                ? 'bg-error'
                                : isActive
                                  ? 'bg-info'
                                  : 'bg-white/80'
                            }`}
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Playhead Scrubber Needle */}
          <div
            style={{ transform: `translateX(${timeToPx(currentTime)}px)` }}
            className="absolute top-0 bottom-0 left-0 w-0 z-30 pointer-events-none"
          >
            <div className="w-2.5 h-3 -ml-[5px] bg-info rounded-b-[3px]" />
            <div className="w-[1.5px] h-full -ml-[0.75px] bg-info" />
            {dragState?.kind === 'scrub' && (
              <div className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded-xs bg-accent-bg text-on-accent text-[10px] font-mono tabular-nums whitespace-nowrap shadow-sm">
                {formatTimecode(currentTime)}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
