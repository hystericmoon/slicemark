import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pause,
  Play,
  Redo2,
  Repeat,
  Scissors,
  SkipBack,
  SkipForward,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AudioSettings,
  ClipSegment,
  CropRect,
  ManualCutMode,
  MediaSource,
  OverlaySettings,
  PlaybackSettings,
  SubtitleSettings,
  TransformSettings,
} from '../types/editor';
import { getPresetAspectRatio } from '../utils/segmentGenerator';
import { getActiveCueText } from '../utils/subtitles';
import { clamp, formatTimecode } from '../utils/timecode';

interface VideoPreviewProps {
  source: MediaSource;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentTime: number;
  isPlaying: boolean;
  segments: ClipSegment[];
  activeSegment: ClipSegment | null;
  manualCutMode: ManualCutMode;
  transform: TransformSettings;
  overlay: OverlaySettings;
  subtitles: SubtitleSettings;
  onCropChange: (crop: CropRect) => void;
  audio: AudioSettings;
  onToggleMute: () => void;
  playback: PlaybackSettings;
  onToggleLoop: () => void;
  onTogglePlay: () => void;
  onStepFrame: (deltaFrames: number) => void;
  onJumpSeconds: (deltaSec: number) => void;
  onSplitAtPlayhead: () => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  onSnapshotFrame: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTimeUpdate: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  source,
  videoRef,
  currentTime,
  isPlaying,
  segments,
  activeSegment,
  manualCutMode,
  transform,
  overlay,
  subtitles,
  onCropChange,
  audio,
  onToggleMute,
  playback,
  onToggleLoop,
  onTogglePlay,
  onStepFrame,
  onJumpSeconds,
  onSplitAtPlayhead,
  onMarkIn,
  onMarkOut,
  onSnapshotFrame,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTimeUpdate,
  onPlayingChange,
}) => {
  const frameBoxRef = useRef<HTMLDivElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const [draggingCrop, setDraggingCrop] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startCrop: CropRect;
  } | null>(null);

  const isBackdropFit = transform.aspectPreset !== 'original' && transform.fitMode !== 'crop';
  const isBlurBackdrop = isBackdropFit && transform.fitMode === 'blur';

  // Sync playbackRate on primary video & blurred background video
  useEffect(() => {
    const vid = videoRef.current;
    if (vid) vid.playbackRate = playback.speed;
    if (bgVideoRef.current) bgVideoRef.current.playbackRate = playback.speed;
  }, [playback.speed, videoRef, isBlurBackdrop]);

  // Keep blurred backdrop video synchronized with main video
  useEffect(() => {
    const bg = bgVideoRef.current;
    const fg = videoRef.current;
    if (!isBlurBackdrop || !bg || !fg) return;
    if (Math.abs(bg.currentTime - fg.currentTime) > 0.15) {
      bg.currentTime = fg.currentTime;
    }
    if (isPlaying && bg.paused) {
      bg.play().catch(() => undefined);
    } else if (!isPlaying && !bg.paused) {
      bg.pause();
    }
  }, [isBlurBackdrop, isPlaying, currentTime, videoRef]);

  // Synchronize secondary background music/voiceover track during preview
  useEffect(() => {
    const bgEl = bgAudioRef.current;
    if (!bgEl || !audio.bgAudio.url) return;
    bgEl.volume = clamp(audio.bgAudio.volume, 0, 1);
    bgEl.loop = audio.bgAudio.loop;

    if (isPlaying) {
      const relTime = activeSegment
        ? Math.max(0, currentTime - activeSegment.startTime)
        : currentTime;
      if (bgEl.paused) {
        if (Number.isFinite(bgEl.duration) && bgEl.duration > 0) {
          bgEl.currentTime = audio.bgAudio.loop ? relTime % bgEl.duration : Math.min(relTime, bgEl.duration);
        }
        bgEl.play().catch(() => undefined);
      }
    } else if (!bgEl.paused) {
      bgEl.pause();
    }
  }, [isPlaying, audio.bgAudio, activeSegment, currentTime]);

  // Ensure background audio pauses cleanly on unmount
  useEffect(() => {
    const bgEl = bgAudioRef.current;
    return () => {
      if (bgEl && !bgEl.paused) {
        bgEl.pause();
      }
    };
  }, [audio.bgAudio.url]);

  // Sync primary video audio volume & fade-in/fade-out preview
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (audio.muted) {
      vid.muted = true;
      return;
    }
    vid.muted = false;

    let fadeFactor = 1;
    if (activeSegment && manualCutMode === 'keep-segments') {
      const elapsed = currentTime - activeSegment.startTime;
      const remaining = activeSegment.endTime - currentTime;
      if (audio.fadeIn > 0.05 && elapsed >= 0 && elapsed < audio.fadeIn) {
        fadeFactor = Math.min(fadeFactor, clamp(elapsed / audio.fadeIn, 0, 1));
      }
      if (audio.fadeOut > 0.05 && remaining >= 0 && remaining < audio.fadeOut) {
        fadeFactor = Math.min(fadeFactor, clamp(remaining / audio.fadeOut, 0, 1));
      }
    }

    vid.volume = clamp(audio.volume * fadeFactor, 0, 1);
  }, [audio, currentTime, activeSegment, manualCutMode, videoRef]);

  // Smooth RAF loop during playback
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;

    const tick = () => {
      const vid = videoRef.current;
      if (!vid) return;
      const t = vid.currentTime;

      if (activeSegment && manualCutMode === 'keep-segments' && playback.loopActiveClip) {
        if (t >= activeSegment.endTime - 0.03 || t < activeSegment.startTime - 0.1) {
          vid.currentTime = activeSegment.startTime;
          onTimeUpdate(activeSegment.startTime);
          rafId = requestAnimationFrame(tick);
          return;
        }
      } else if (activeSegment && manualCutMode === 'remove-middle') {
        if (t >= activeSegment.startTime && t < activeSegment.endTime - 0.05) {
          vid.currentTime = activeSegment.endTime;
          onTimeUpdate(activeSegment.endTime);
          rafId = requestAnimationFrame(tick);
          return;
        }
      }

      onTimeUpdate(t);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, activeSegment, manualCutMode, playback.loopActiveClip, onTimeUpdate, videoRef]);

  // Live video fade-to-black opacity calculation
  const videoFadeOpacity = useMemo(() => {
    if (!activeSegment || manualCutMode !== 'keep-segments') return 1;
    const { videoFadeIn, videoFadeOut } = transform.color;
    let op = 1;
    const elapsed = currentTime - activeSegment.startTime;
    const remaining = activeSegment.endTime - currentTime;
    if (videoFadeIn > 0.05 && elapsed >= 0 && elapsed < videoFadeIn) {
      op = Math.min(op, clamp(elapsed / videoFadeIn, 0, 1));
    }
    if (videoFadeOut > 0.05 && remaining >= 0 && remaining < videoFadeOut) {
      op = Math.min(op, clamp(remaining / videoFadeOut, 0, 1));
    }
    return op;
  }, [activeSegment, manualCutMode, transform.color, currentTime]);

  const handleCropPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingCrop(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startCrop: { ...transform.crop },
    };
  };

  const handleCropPointerMove = (e: React.PointerEvent) => {
    if (!draggingCrop || !dragStartRef.current || !frameBoxRef.current) return;
    const rect = frameBoxRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - dragStartRef.current.clientX) / rect.width;
    const dy = (e.clientY - dragStartRef.current.clientY) / rect.height;
    const { startCrop } = dragStartRef.current;

    const nextX = clamp(startCrop.x + dx, 0, Math.max(0, 1 - startCrop.width));
    const nextY = clamp(startCrop.y + dy, 0, Math.max(0, 1 - startCrop.height));
    onCropChange({
      ...startCrop,
      x: Number(nextX.toFixed(4)),
      y: Number(nextY.toFixed(4)),
    });
  };

  const handleCropPointerUp = (e: React.PointerEvent) => {
    if (!draggingCrop) return;
    setDraggingCrop(false);
    dragStartRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const isCropReticleVisible =
    transform.fitMode === 'crop' &&
    (transform.aspectPreset !== 'original' ||
      transform.crop.width < 0.998 ||
      transform.crop.height < 0.998);

  const isRotatedSideways = transform.rotation === 90 || transform.rotation === 270;
  const nativeAspect = isRotatedSideways
    ? source.height / Math.max(1, source.width)
    : source.width / Math.max(1, source.height);

  const stageAspect = isBackdropFit
    ? getPresetAspectRatio(transform.aspectPreset, nativeAspect)
    : nativeAspect;

  const sourceAspect = source.width / Math.max(1, source.height);
  const rotatedContainScale = useMemo(() => {
    if (!isRotatedSideways) return 1;
    // Compute exact scale factor so the rotated video fits cleanly inside stageAspect
    const drawnW = sourceAspect > stageAspect ? stageAspect : sourceAspect;
    const drawnH = sourceAspect > stageAspect ? stageAspect / sourceAspect : 1;
    return Math.min(stageAspect / Math.max(0.001, drawnH), 1 / Math.max(0.001, drawnW));
  }, [isRotatedSideways, sourceAspect, stageAspect]);

  const videoTransformCss = [
    transform.rotation !== 0 ? `rotate(${transform.rotation}deg)` : '',
    transform.flipHorizontal ? 'scaleX(-1)' : '',
    isRotatedSideways ? `scale(${rotatedContainScale.toFixed(4)})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const hasVisualEnhance =
    Math.abs(transform.color.brightness) > 0.01 ||
    Math.abs(transform.color.contrast - 1) > 0.01 ||
    Math.abs(transform.color.saturation - 1) > 0.01 ||
    transform.color.sharpen > 0.02 ||
    transform.color.denoise;

  useEffect(() => {
    if (!hasVisualEnhance && compareOriginal) {
      setCompareOriginal(false);
    }
  }, [hasVisualEnhance, compareOriginal]);

  // Subtle live preview reflection of sharpen (+contrast micro-crispness); FFmpeg renders full unsharp + hqdn3d on export
  const effectiveContrast = transform.color.contrast * (1 + transform.color.sharpen * 0.08);
  const cssColorFilter = compareOriginal
    ? 'none'
    : `brightness(${(1 + transform.color.brightness).toFixed(2)}) contrast(${effectiveContrast.toFixed(
        2
      )}) saturate(${transform.color.saturation.toFixed(2)})`;

  // Live Overlay Badge Data
  const activeClipIndex = activeSegment
    ? Math.max(0, segments.findIndex((s) => s.id === activeSegment.id))
    : 0;
  const hasOverlay =
    overlay.showPartNumber ||
    overlay.watermarkText.trim().length > 0 ||
    overlay.showTimestamp ||
    Boolean(overlay.logoDataUrl);

  const overlayPosClass =
    overlay.position === 'top-left'
      ? 'top-3 left-3'
      : overlay.position === 'top-right'
        ? 'top-3 right-3'
        : overlay.position === 'bottom-left'
          ? 'bottom-3 left-3'
          : 'bottom-3 right-3';

  const activeCueText = useMemo(
    () => (subtitles.cues.length > 0 ? getActiveCueText(subtitles.cues, currentTime) : null),
    [subtitles.cues, currentTime]
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-body">
      {/* Hidden synchronized background audio element */}
      {audio.bgAudio.url && <audio ref={bgAudioRef} src={audio.bgAudio.url} preload="auto" />}

      {/* Studio Video Viewport */}
      <div className="flex-1 min-h-[160px] sm:min-h-[240px] p-2.5 sm:p-4 flex items-center justify-center relative overflow-hidden select-none">
        <div
          ref={frameBoxRef}
          style={{
            aspectRatio: `${stageAspect}`,
            backgroundColor:
              isBackdropFit && transform.fitMode === 'solid'
                ? transform.backdropColor
                : '#09090b',
          }}
          className="relative max-h-full max-w-full h-full rounded-md overflow-hidden border border-border-strong shadow-md flex items-center justify-center"
        >
          {/* Blurred Backdrop Layer for Blur Fit Mode */}
          {isBlurBackdrop && (
            <video
              ref={bgVideoRef}
              src={source.url}
              muted
              playsInline
              preload="auto"
              style={{
                filter: `blur(18px) brightness(0.75) ${cssColorFilter}`,
                transform: `scale(1.18) ${videoTransformCss}`.trim(),
                opacity: videoFadeOpacity,
              }}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          )}

          {/* Primary Video Layer */}
          <video
            ref={videoRef}
            src={source.url}
            playsInline
            preload="auto"
            onClick={onTogglePlay}
            onPlay={() => onPlayingChange(true)}
            onPause={() => onPlayingChange(false)}
            onEnded={() => onPlayingChange(false)}
            onTimeUpdate={(e) => {
              if (!isPlaying) {
                onTimeUpdate(e.currentTarget.currentTime);
              }
            }}
            style={{
              transform: videoTransformCss || undefined,
              filter: cssColorFilter,
              opacity: videoFadeOpacity,
            }}
            className="relative z-10 w-full h-full object-contain cursor-pointer transition-transform duration-150"
          />

          {/* Before / After Compare Toggle when Color or AI Auto-Tune is active */}
          {hasVisualEnhance && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCompareOriginal((v) => !v);
              }}
              title="Toggle Original vs Tuned preview"
              className="absolute z-30 top-2.5 right-2.5 h-7 px-2.5 rounded-sm bg-[#111111]/80 hover:bg-[#111111]/95 border border-white/15 text-white text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5 text-white/80" />
              <span>{compareOriginal ? 'Viewing Original' : 'Compare Original'}</span>
            </button>
          )}

          {/* Live Watermark / Part 1/N / Logo Overlay Preview */}
          {hasOverlay && (
            <div
              style={{ opacity: overlay.opacity }}
              className={`absolute z-20 ${overlayPosClass} pointer-events-none px-2.5 py-1.5 rounded-sm bg-[#111111]/75 border border-white/15 text-white flex items-center gap-2 max-w-[75%]`}
            >
              {overlay.logoDataUrl && (
                <img
                  src={overlay.logoDataUrl}
                  alt=""
                  className="h-6 w-auto object-contain shrink-0"
                />
              )}
              <div className="min-w-0 leading-snug">
                {overlay.showPartNumber && (
                  <div className="text-[12px] font-semibold whitespace-nowrap">
                    {(overlay.partPrefix.trim() || 'Part')} {activeClipIndex + 1}/{Math.max(1, segments.length)}
                  </div>
                )}
                {overlay.watermarkText.trim() && (
                  <div className="text-[11px] text-white/85 truncate">
                    {overlay.watermarkText.trim()}
                  </div>
                )}
                {overlay.showTimestamp && activeSegment && (
                  <div className="text-[10px] font-mono tabular-nums text-white/75">
                    {formatTimecode(activeSegment.startTime)} – {formatTimecode(activeSegment.endTime)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Live Subtitle Caption Preview */}
          {activeCueText && (
            <div className="absolute z-20 bottom-4 inset-x-4 flex justify-center pointer-events-none">
              <div className="px-3 py-1.5 rounded-sm bg-black/80 text-white text-[13px] font-medium text-center leading-snug whitespace-pre-line max-w-[88%]">
                {activeCueText}
              </div>
            </div>
          )}

          {/* Interactive Draggable Crop Reticle (Crop Fill Mode) */}
          {isCropReticleVisible && (
            <div className="absolute inset-0 z-20 pointer-events-none">
              <div
                className="absolute left-0 right-0 top-0 bg-black/60"
                style={{ height: `${transform.crop.y * 100}%` }}
              />
              <div
                className="absolute left-0 right-0 bottom-0 bg-black/60"
                style={{
                  height: `${Math.max(0, (1 - transform.crop.y - transform.crop.height) * 100)}%`,
                }}
              />
              <div
                className="absolute left-0 bg-black/60"
                style={{
                  top: `${transform.crop.y * 100}%`,
                  height: `${transform.crop.height * 100}%`,
                  width: `${transform.crop.x * 100}%`,
                }}
              />
              <div
                className="absolute right-0 bg-black/60"
                style={{
                  top: `${transform.crop.y * 100}%`,
                  height: `${transform.crop.height * 100}%`,
                  width: `${Math.max(0, (1 - transform.crop.x - transform.crop.width) * 100)}%`,
                }}
              />

              <div
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                style={{
                  left: `${transform.crop.x * 100}%`,
                  top: `${transform.crop.y * 100}%`,
                  width: `${transform.crop.width * 100}%`,
                  height: `${transform.crop.height * 100}%`,
                }}
                className={`absolute pointer-events-auto border-2 border-info ${
                  draggingCrop ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-xs bg-black/75 text-white text-[10px] font-mono tabular-nums">
                  {transform.aspectPreset} · Drag to frame
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Studio Transport & Precision Action Bar */}
      <div className="h-12 shrink-0 bg-surface border-t border-border px-2.5 sm:px-4 flex items-center justify-between gap-2 sm:gap-3 select-none">
        {/* Left: Edit Actions */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={onSplitAtPlayhead}
            title="Split clip at playhead (S)"
            className="h-8 px-2 sm:px-2.5 rounded-sm text-[12px] font-medium text-primary hover:bg-overlay-hover inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-info"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split</span>
          </button>

          <button
            type="button"
            onClick={onMarkIn}
            title="Set active clip In point (I)"
            className="hidden sm:inline-flex h-8 px-2 rounded-sm text-[12px] font-medium text-secondary hover:text-primary hover:bg-overlay-hover items-center transition-colors cursor-pointer whitespace-nowrap"
          >
            In
          </button>

          <button
            type="button"
            onClick={onMarkOut}
            title="Set active clip Out point (O)"
            className="hidden sm:inline-flex h-8 px-2 rounded-sm text-[12px] font-medium text-secondary hover:text-primary hover:bg-overlay-hover items-center transition-colors cursor-pointer whitespace-nowrap"
          >
            Out
          </button>

          <button
            type="button"
            onClick={onSnapshotFrame}
            title="Save current frame as PNG cover image"
            className="hidden md:inline-flex h-8 px-2 rounded-sm text-[12px] font-medium text-secondary hover:text-primary hover:bg-overlay-hover items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Frame</span>
          </button>

          <span className="hidden sm:inline-block w-px h-4 bg-border mx-0.5" aria-hidden="true" />

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl/Cmd + Z)"
            aria-label="Undo"
            className="w-7 h-7 rounded-sm flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl/Cmd + Shift + Z)"
            aria-label="Redo"
            className="w-7 h-7 rounded-sm flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: Playback Transport Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={() => onJumpSeconds(-1)}
            title="Back 1 second (Shift + Left)"
            aria-label="Jump back 1 second"
            className="hidden sm:flex w-8 h-8 rounded-sm items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(-1)}
            title="Step back 1 frame (Left Arrow)"
            aria-label="Previous frame"
            className="w-8 h-8 rounded-sm flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            title="Play / Pause (Space)"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-9 h-8 rounded-md bg-accent-bg text-on-accent flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer mx-1 focus-visible:outline-2 focus-visible:outline-info"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(1)}
            title="Step forward 1 frame (Right Arrow)"
            aria-label="Next frame"
            className="w-8 h-8 rounded-sm flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onJumpSeconds(1)}
            title="Forward 1 second (Shift + Right)"
            aria-label="Jump forward 1 second"
            className="hidden sm:flex w-8 h-8 rounded-sm items-center justify-center text-secondary hover:text-primary hover:bg-overlay-hover transition-colors cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Timecode + Loop + Mute + Speed */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="font-mono tabular-nums text-[11px] sm:text-[12px] text-primary whitespace-nowrap">
            <span>{formatTimecode(currentTime)}</span>
            <span className="hidden sm:inline text-secondary mx-1">/</span>
            <span className="hidden sm:inline text-secondary">{formatTimecode(source.duration)}</span>
          </div>

          <span className="hidden sm:inline-block w-px h-4 bg-border mx-0.5" aria-hidden="true" />

          <button
            type="button"
            onClick={onToggleLoop}
            title="Loop active clip (L)"
            aria-label="Loop active clip"
            aria-pressed={playback.loopActiveClip}
            className={`w-7 h-7 rounded-sm flex items-center justify-center transition-colors cursor-pointer ${
              playback.loopActiveClip
                ? 'bg-neutral text-info'
                : 'text-secondary hover:text-primary hover:bg-overlay-hover'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            title="Mute audio (M)"
            aria-label={audio.muted ? 'Unmute audio' : 'Mute audio'}
            className={`w-7 h-7 rounded-sm flex items-center justify-center transition-colors cursor-pointer ${
              audio.muted
                ? 'bg-neutral text-error'
                : 'text-secondary hover:text-primary hover:bg-overlay-hover'
            }`}
          >
            {audio.muted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>

          <span className="hidden md:inline text-[11px] font-mono tabular-nums text-secondary whitespace-nowrap">
            {playback.speed}x
            {playback.motionMode !== 'normal' ? ` · ${playback.motionMode}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
