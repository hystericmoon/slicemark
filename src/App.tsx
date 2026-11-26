/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crop,
  Layers,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Type,
  Volume2,
  X,
} from 'lucide-react';
import { ChaptersModal } from './components/ChaptersModal';
import { ClipQueue } from './components/ClipQueue';
import { ExportModal } from './components/ExportModal';
import { LandingShowcase } from './components/LandingShowcase';
import { LeftInspector } from './components/LeftInspector';
import { MediaIntake } from './components/MediaIntake';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';
import { VideoPreview } from './components/VideoPreview';
import {
  AIEnhancePlan,
  AspectPreset,
  AudioSettings,
  AutoTrimMode,
  ClipSegment,
  ColorSettings,
  CropRect,
  EditorSnapshot,
  EnhanceGoal,
  ExportProgressState,
  ExportSettings,
  FilmstripFrame,
  FitMode,
  InspectorTab,
  ManualCutMode,
  MediaSource,
  OverlaySettings,
  PlaybackSettings,
  RemainderPolicy,
  SmartSplitSettings,
  SubtitleSettings,
  ThemeMode,
  TransformSettings,
} from './types/editor';
import { requestAIVideoEnhance } from './utils/aiEnhance';
import {
  requiresReencode,
  resetFFmpegInstance,
  runFFmpegExport,
  triggerBrowserDownload,
} from './utils/ffmpegEngine';
import {
  extractAudioPeaks,
  extractFilmstrip,
  probeMediaFile,
} from './utils/mediaAnalysis';
import { generateSampleVideoFile } from './utils/sampleVideoGenerator';
import {
  computeCropRectForAspect,
  computeOutputResolution,
  generateBatchSplitSegments,
  generateFixedWindowSegment,
  generateSegmentsFromCutPoints,
  generateSmartBatchSegments,
  nextSegmentId,
  splitSegmentsAtTime,
} from './utils/segmentGenerator';
import { detectActiveSpeechSegments, detectSceneChanges } from './utils/smartAnalysis';
import { parseSubtitleFile } from './utils/subtitles';
import { clamp, formatRulerTime, sanitizeFilename } from './utils/timecode';

const INITIAL_COLOR: ColorSettings = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  sharpen: 0,
  denoise: false,
  videoFadeIn: 0,
  videoFadeOut: 0,
};

const INITIAL_TRANSFORM: TransformSettings = {
  aspectPreset: 'original',
  fitMode: 'crop',
  backdropColor: '#111111',
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  flipHorizontal: false,
  color: INITIAL_COLOR,
};

const INITIAL_OVERLAY: OverlaySettings = {
  showPartNumber: false,
  partPrefix: 'Part',
  watermarkText: '',
  logoDataUrl: null,
  logoName: null,
  position: 'top-left',
  opacity: 0.9,
  showTimestamp: false,
};

const INITIAL_SUBTITLES: SubtitleSettings = {
  fileName: null,
  cues: [],
  burnIn: false,
  includeSlicedSrt: true,
};

const INITIAL_AUDIO: AudioSettings = {
  muted: false,
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  normalize: false,
  voiceEnhance: false,
  bgAudio: {
    file: null,
    url: null,
    name: null,
    volume: 0.35,
    loop: true,
  },
};

const INITIAL_PLAYBACK: PlaybackSettings = {
  speed: 1,
  loopActiveClip: true,
  motionMode: 'normal',
};

const INITIAL_EXPORT_SETTINGS: ExportSettings = {
  engineMode: 'lossless',
  format: 'mp4',
  resolution: 'original',
  quality: 'balanced',
  deliveryMode: 'individual',
  mergeFadeDip: 0,
  includeCoverImages: false,
};

const INITIAL_SMART_SPLIT: SmartSplitSettings = {
  strategy: 'interval',
  intervalSeconds: 15,
  splitCount: 4,
  maxSizeMB: 10,
  overlapSeconds: 0,
  snapToSilence: false,
  silenceThreshold: 0.16,
  minSilenceDuration: 0.6,
};

const INITIAL_EXPORT_STATE: ExportProgressState = {
  status: 'idle',
  message: '',
  currentClipIndex: 0,
  totalClips: 0,
  clipPercent: 0,
  overallPercent: 0,
  usedReencode: false,
};

export default function App() {
  const [activeView, setActiveView] = useState<'pages' | 'studio'>(() => {
    try {
      const normalizedPath = window.location.pathname.replace(/\/+$/, '');
      const params = new URLSearchParams(window.location.search);
      if (
        normalizedPath === '/studio' ||
        params.get('view') === 'studio' ||
        window.location.hash === '#studio'
      ) {
        return 'studio';
      }
    } catch {
      // ignore
    }
    return 'pages';
  });

  const navigateView = useCallback((nextView: 'pages' | 'studio') => {
    setActiveView(nextView);
    try {
      const targetPath = nextView === 'studio' ? '/studio' : '/';
      if (window.location.pathname !== targetPath || window.location.search || window.location.hash) {
        window.history.pushState(null, '', targetPath);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const normalizedPath = window.location.pathname.replace(/\/+$/, '');
      const params = new URLSearchParams(window.location.search);
      if (
        normalizedPath !== '/studio' &&
        (params.get('view') === 'studio' || window.location.hash === '#studio')
      ) {
        window.history.replaceState(null, '', '/studio');
      }
    } catch {
      // ignore
    }

    const handlePopState = () => {
      const normalizedPath = window.location.pathname.replace(/\/+$/, '');
      const params = new URLSearchParams(window.location.search);
      const isStudio =
        normalizedPath === '/studio' ||
        params.get('view') === 'studio' ||
        window.location.hash === '#studio';
      setActiveView(isStudio ? 'studio' : 'pages');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Astryx Neutral theme (light & dark mode toggle)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved =
        localStorage.getItem('slicemark_theme') ?? localStorage.getItem('cutframe_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore storage errors
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-astryx-theme', 'neutral');
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', theme === 'dark' ? '#141414' : '#f5f5f5');
    }
    try {
      localStorage.setItem('slicemark_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Media & Analysis State
  const [source, setSource] = useState<MediaSource | null>(null);
  const [filmstrip, setFilmstrip] = useState<FilmstripFrame[]>([]);
  const [audioPeaks, setAudioPeaks] = useState<number[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [sampleProgress, setSampleProgress] = useState<{
    percent: number;
    label: string;
  } | null>(null);
  const [isDetectingScenes, setIsDetectingScenes] = useState(false);
  const [sceneDetectPercent, setSceneDetectPercent] = useState(0);

  // Refs & Modal UI State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('trim');
  const [mobileSheet, setMobileSheet] = useState<InspectorTab | 'queue' | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const showNotice = useCallback((message: string) => {
    setStatusNotice(message);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setStatusNotice(null);
      noticeTimerRef.current = null;
    }, 2800);
  }, []);

  // Undoable Timeline Snapshot Stack
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Live Working State
  const [mode, setMode] = useState<AutoTrimMode>('batch-split');
  const [smartSplit, setSmartSplit] = useState<SmartSplitSettings>(INITIAL_SMART_SPLIT);
  const [remainderPolicy, setRemainderPolicy] = useState<RemainderPolicy>('keep');
  const [manualCutMode, setManualCutMode] = useState<ManualCutMode>('keep-segments');
  const [segments, setSegments] = useState<ClipSegment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  // Visual, Overlay, Subtitle, Audio, Playback & Export State
  const [transform, setTransform] = useState<TransformSettings>(INITIAL_TRANSFORM);
  const [overlay, setOverlay] = useState<OverlaySettings>(INITIAL_OVERLAY);
  const [subtitles, setSubtitles] = useState<SubtitleSettings>(INITIAL_SUBTITLES);
  const [audio, setAudio] = useState<AudioSettings>(INITIAL_AUDIO);
  const [playback, setPlayback] = useState<PlaybackSettings>(INITIAL_PLAYBACK);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(INITIAL_EXPORT_SETTINGS);
  const [exportState, setExportState] = useState<ExportProgressState>(INITIAL_EXPORT_STATE);

  // AI Video Auto-Tune State
  const [enhanceGoal, setEnhanceGoal] = useState<EnhanceGoal>('auto');
  const [enhancePrompt, setEnhancePrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceStep, setEnhanceStep] = useState('');
  const [enhancePlan, setEnhancePlan] = useState<AIEnhancePlan | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  // Track active object URLs for clean unmount disposal
  const activeUrlsRef = useRef<{
    sourceUrl?: string;
    bgAudioUrl?: string | null;
    downloadUrl?: string;
  }>({});
  activeUrlsRef.current = {
    sourceUrl: source?.url,
    bgAudioUrl: audio.bgAudio.url,
    downloadUrl: exportState.downloadUrl,
  };

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      analysisAbortRef.current?.abort();
      exportAbortRef.current?.abort();
      if (activeUrlsRef.current.sourceUrl) {
        URL.revokeObjectURL(activeUrlsRef.current.sourceUrl);
      }
      if (activeUrlsRef.current.bgAudioUrl) {
        URL.revokeObjectURL(activeUrlsRef.current.bgAudioUrl);
      }
      if (activeUrlsRef.current.downloadUrl) {
        URL.revokeObjectURL(activeUrlsRef.current.downloadUrl);
      }
    };
  }, []);

  const activeSegment = useMemo(
    () => segments.find((s) => s.id === activeSegmentId) ?? segments[0] ?? null,
    [segments, activeSegmentId]
  );

  const reencodeInfo = useMemo(
    () =>
      requiresReencode(
        transform,
        overlay,
        subtitles,
        audio,
        playback,
        mode === 'manual' ? manualCutMode : 'keep-segments',
        exportSettings
      ),
    [transform, overlay, subtitles, audio, playback, mode, manualCutMode, exportSettings]
  );

  const mustReencode = useMemo(() => {
    if (!source) return false;
    const isWebm = source.name.toLowerCase().endsWith('.webm');
    return reencodeInfo.required || isWebm;
  }, [source, reencodeInfo.required]);

  const commitSnapshot = useCallback(
    (next: EditorSnapshot) => {
      setMode(next.mode);
      setSmartSplit((prev) => ({ ...prev, intervalSeconds: next.intervalSeconds }));
      setRemainderPolicy(next.remainderPolicy);
      setManualCutMode(next.manualCutMode);
      setSegments(next.segments);
      setActiveSegmentId(next.activeSegmentId);

      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const updated = [...sliced, next].slice(-40);
        setHistoryIndex(updated.length - 1);
        return updated;
      });
    },
    [historyIndex]
  );

  const applySnapshot = useCallback((snap: EditorSnapshot) => {
    setMode(snap.mode);
    setSmartSplit((prev) => ({ ...prev, intervalSeconds: snap.intervalSeconds }));
    setRemainderPolicy(snap.remainderPolicy);
    setManualCutMode(snap.manualCutMode);
    setSegments(snap.segments);
    setActiveSegmentId(snap.activeSegmentId);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIdx = historyIndex - 1;
    setHistoryIndex(nextIdx);
    applySnapshot(history[nextIdx]);
  }, [history, historyIndex, applySnapshot]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIdx = historyIndex + 1;
    setHistoryIndex(nextIdx);
    applySnapshot(history[nextIdx]);
  }, [history, historyIndex, applySnapshot]);

  // Load any video file into the studio
  const loadVideoFile = useCallback(async (file: File) => {
    setIntakeError(null);
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv|m4v)$/i.test(file.name)) {
      setIntakeError('Please choose a valid video file (MP4, WebM, or MOV).');
      return;
    }

    try {
      const probed = await probeMediaFile(file);

      analysisAbortRef.current?.abort();
      setSource((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return probed;
      });

      setCurrentTime(0);
      setIsPlaying(false);
      setTransform(INITIAL_TRANSFORM);
      setOverlay(INITIAL_OVERLAY);
      setSubtitles(INITIAL_SUBTITLES);
      setAudio((prev) => {
        if (prev.bgAudio.url) URL.revokeObjectURL(prev.bgAudio.url);
        return INITIAL_AUDIO;
      });
      setPlayback(INITIAL_PLAYBACK);
      setExportSettings(INITIAL_EXPORT_SETTINGS);
      setSmartSplit(INITIAL_SMART_SPLIT);
      setEnhancePlan(null);
      setEnhanceError(null);
      setEnhanceStep('');

      const initialSegments = generateBatchSplitSegments(
        probed.duration,
        15,
        'keep',
        probed.name
      );
      const initialSnap: EditorSnapshot = {
        mode: 'batch-split',
        intervalSeconds: 15,
        remainderPolicy: 'keep',
        manualCutMode: 'keep-segments',
        segments: initialSegments,
        activeSegmentId: initialSegments[0]?.id ?? null,
      };

      setMode(initialSnap.mode);
      setRemainderPolicy(initialSnap.remainderPolicy);
      setManualCutMode(initialSnap.manualCutMode);
      setSegments(initialSnap.segments);
      setActiveSegmentId(initialSnap.activeSegmentId);
      setHistory([initialSnap]);
      setHistoryIndex(0);

      const controller = new AbortController();
      analysisAbortRef.current = controller;
      setIsAnalyzing(true);
      setFilmstrip([]);
      setAudioPeaks([]);

      const [frames, audioResult] = await Promise.all([
        extractFilmstrip(probed.url, probed.duration, 26, controller.signal),
        extractAudioPeaks(file, 360),
      ]);

      if (!controller.signal.aborted) {
        setFilmstrip(frames);
        setAudioPeaks(audioResult.peaks);
        setSource((curr) => (curr ? { ...curr, hasAudio: audioResult.hasAudio } : curr));
        setIsAnalyzing(false);
      }
    } catch (err) {
      setIntakeError(err instanceof Error ? err.message : 'Unable to open video file.');
    }
  }, []);

  const handleLoadSample = useCallback(async () => {
    setIntakeError(null);
    setIsLoadingSample(true);
    setSampleProgress({ percent: 5, label: 'Initializing sample studio generator...' });
    try {
      const sampleFile = await generateSampleVideoFile((percent, label) => {
        setSampleProgress({ percent, label });
      });
      await loadVideoFile(sampleFile);
    } catch (err) {
      setIntakeError(
        err instanceof Error ? err.message : 'Could not build sample video in browser.'
      );
    } finally {
      setIsLoadingSample(false);
      setSampleProgress(null);
    }
  }, [loadVideoFile]);

  // Seeking & Playback Controls
  const handleSeek = useCallback(
    (time: number) => {
      if (!source) return;
      const clamped = clamp(time, 0, source.duration);
      setCurrentTime(clamped);
      if (videoRef.current) {
        videoRef.current.currentTime = clamped;
      }
    },
    [source]
  );

  const handleTogglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !source) return;

    if (vid.paused) {
      if (
        activeSegment &&
        manualCutMode === 'keep-segments' &&
        (vid.currentTime < activeSegment.startTime ||
          vid.currentTime >= activeSegment.endTime - 0.08)
      ) {
        vid.currentTime = activeSegment.startTime;
        setCurrentTime(activeSegment.startTime);
      }
      vid.play().catch(() => undefined);
    } else {
      vid.pause();
    }
  }, [source, activeSegment, manualCutMode]);

  const handleStepFrame = useCallback(
    (deltaFrames: number) => {
      if (!source) return;
      const vid = videoRef.current;
      if (vid && !vid.paused) vid.pause();
      const frameDuration = 1 / Math.max(10, source.fps);
      handleSeek(currentTime + deltaFrames * frameDuration);
    },
    [source, currentTime, handleSeek]
  );

  const handleJumpSeconds = useCallback(
    (deltaSec: number) => {
      handleSeek(currentTime + deltaSec);
    },
    [currentTime, handleSeek]
  );

  // Snapshot Current Frame (.png) honoring aspect ratio, crop, blur/solid backdrop, rotation, flip & color
  const handleSnapshotFrame = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !source) return;
    const vw = vid.videoWidth || source.width;
    const vh = vid.videoHeight || source.height;
    const sideways = transform.rotation === 90 || transform.rotation === 270;
    const rotW = sideways ? vh : vw;
    const rotH = sideways ? vw : vh;

    // 1. Render rotated + flipped + color-graded intermediate frame
    const stageCanvas = document.createElement('canvas');
    stageCanvas.width = rotW;
    stageCanvas.height = rotH;
    const stageCtx = stageCanvas.getContext('2d');
    if (!stageCtx) return;

    stageCtx.save();
    stageCtx.filter = `brightness(${(1 + transform.color.brightness).toFixed(
      2
    )}) contrast(${transform.color.contrast.toFixed(2)}) saturate(${transform.color.saturation.toFixed(
      2
    )})`;
    stageCtx.translate(rotW / 2, rotH / 2);
    if (transform.rotation !== 0) {
      stageCtx.rotate((transform.rotation * Math.PI) / 180);
    }
    if (transform.flipHorizontal) {
      stageCtx.scale(-1, 1);
    }
    stageCtx.drawImage(vid, -vw / 2, -vh / 2, vw, vh);
    stageCtx.restore();

    // 2. Compose final framed output (crop fill vs blur/solid backdrop fit)
    const maxH =
      exportSettings.resolution === 'original' ? undefined : parseInt(exportSettings.resolution, 10);
    const outRes = computeOutputResolution(
      vw,
      vh,
      transform.rotation,
      transform.crop,
      transform.aspectPreset,
      transform.fitMode,
      maxH
    );

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outRes.width;
    outCanvas.height = outRes.height;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return;

    const isBackdropFit = transform.aspectPreset !== 'original' && transform.fitMode !== 'crop';
    if (isBackdropFit) {
      if (transform.fitMode === 'blur') {
        const coverScale = Math.max(outRes.width / rotW, outRes.height / rotH) * 1.12;
        const bw = rotW * coverScale;
        const bh = rotH * coverScale;
        outCtx.save();
        outCtx.filter = 'blur(24px) brightness(0.75)';
        outCtx.drawImage(stageCanvas, (outRes.width - bw) / 2, (outRes.height - bh) / 2, bw, bh);
        outCtx.restore();
      } else {
        outCtx.fillStyle = transform.backdropColor || '#111111';
        outCtx.fillRect(0, 0, outRes.width, outRes.height);
      }
      const containScale = Math.min(outRes.width / rotW, outRes.height / rotH);
      const fgW = rotW * containScale;
      const fgH = rotH * containScale;
      outCtx.drawImage(stageCanvas, (outRes.width - fgW) / 2, (outRes.height - fgH) / 2, fgW, fgH);
    } else {
      const sx = clamp(Math.round(transform.crop.x * rotW), 0, Math.max(0, rotW - 2));
      const sy = clamp(Math.round(transform.crop.y * rotH), 0, Math.max(0, rotH - 2));
      const sw = clamp(Math.round(transform.crop.width * rotW), 2, rotW - sx);
      const sh = clamp(Math.round(transform.crop.height * rotH), 2, rotH - sy);
      outCtx.drawImage(stageCanvas, sx, sy, sw, sh, 0, 0, outRes.width, outRes.height);
    }

    outCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const base = sanitizeFilename(source.name.replace(/\.[^/.]+$/, ''));
      const stamp = formatRulerTime(currentTime).replace(/:/g, '-');
      triggerBrowserDownload(url, `${base}_frame_${stamp}.png`);
      showNotice(`Saved ${outRes.width}×${outRes.height} PNG frame snapshot`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  }, [source, transform, exportSettings.resolution, currentTime, showNotice]);

  // Mode, Smart Split & Auto-Trim Handlers
  const rebuildBatchSegments = useCallback(
    (nextSmart: SmartSplitSettings, nextPolicy: RemainderPolicy) => {
      if (!source) return;
      const nextSegs = generateSmartBatchSegments({
        duration: source.duration,
        fileSizeBytes: source.size,
        strategy: nextSmart.strategy,
        intervalSeconds: nextSmart.intervalSeconds,
        splitCount: nextSmart.splitCount,
        maxSizeMB: nextSmart.maxSizeMB,
        overlapSeconds: nextSmart.overlapSeconds,
        remainderPolicy: nextPolicy,
        snapToSilence: nextSmart.snapToSilence,
        silenceThreshold: nextSmart.silenceThreshold,
        audioPeaks,
        baseName: source.name,
      });
      commitSnapshot({
        mode: 'batch-split',
        intervalSeconds: nextSmart.intervalSeconds,
        remainderPolicy: nextPolicy,
        manualCutMode: 'keep-segments',
        segments: nextSegs,
        activeSegmentId: nextSegs[0]?.id ?? null,
      });
    },
    [source, audioPeaks, commitSnapshot]
  );

  const handleModeChange = useCallback(
    (nextMode: AutoTrimMode) => {
      if (!source || nextMode === mode) return;

      if (nextMode === 'batch-split') {
        rebuildBatchSegments(smartSplit, remainderPolicy);
      } else if (nextMode === 'fixed-window') {
        const winSeg = generateFixedWindowSegment(
          source.duration,
          smartSplit.intervalSeconds,
          currentTime,
          source.name
        );
        commitSnapshot({
          mode: 'fixed-window',
          intervalSeconds: smartSplit.intervalSeconds,
          remainderPolicy,
          manualCutMode: 'keep-segments',
          segments: [winSeg],
          activeSegmentId: winSeg.id,
        });
        handleSeek(winSeg.startTime);
      } else {
        const baseSegs =
          segments.length > 0
            ? segments
            : [
                {
                  id: nextSegmentId(),
                  label: `${source.name.replace(/\.[^/.]+$/, '')}_01`,
                  startTime: 0,
                  endTime: Number(source.duration.toFixed(2)),
                  selected: true,
                },
              ];
        commitSnapshot({
          mode: 'manual',
          intervalSeconds: smartSplit.intervalSeconds,
          remainderPolicy,
          manualCutMode: 'keep-segments',
          segments: baseSegs,
          activeSegmentId: activeSegmentId ?? baseSegs[0]?.id ?? null,
        });
      }
    },
    [
      source,
      mode,
      smartSplit,
      remainderPolicy,
      currentTime,
      segments,
      activeSegmentId,
      rebuildBatchSegments,
      commitSnapshot,
      handleSeek,
    ]
  );

  const handleSmartSplitChange = useCallback(
    (patch: Partial<SmartSplitSettings>, regenerate = false) => {
      const nextSmart = { ...smartSplit, ...patch };
      setSmartSplit(nextSmart);
      if (!regenerate || !source) return;

      if (mode === 'fixed-window') {
        const anchor = activeSegment ? activeSegment.startTime : currentTime;
        const winSeg = generateFixedWindowSegment(
          source.duration,
          nextSmart.intervalSeconds,
          anchor,
          source.name
        );
        commitSnapshot({
          mode: 'fixed-window',
          intervalSeconds: nextSmart.intervalSeconds,
          remainderPolicy,
          manualCutMode: 'keep-segments',
          segments: [winSeg],
          activeSegmentId: winSeg.id,
        });
      } else {
        rebuildBatchSegments(nextSmart, remainderPolicy);
      }
    },
    [
      smartSplit,
      source,
      mode,
      activeSegment,
      currentTime,
      remainderPolicy,
      commitSnapshot,
      rebuildBatchSegments,
    ]
  );

  const handleRemainderPolicyChange = useCallback(
    (policy: RemainderPolicy) => {
      setRemainderPolicy(policy);
      rebuildBatchSegments(smartSplit, policy);
    },
    [smartSplit, rebuildBatchSegments]
  );

  const handleManualCutModeChange = useCallback(
    (nextCutMode: ManualCutMode) => {
      if (!source) return;
      if (nextCutMode === 'remove-middle') {
        const midStart = Number((source.duration * 0.25).toFixed(2));
        const midEnd = Number((source.duration * 0.65).toFixed(2));
        const cutSeg: ClipSegment = {
          id: nextSegmentId(),
          label: 'cut_section',
          startTime: midStart,
          endTime: Math.max(midStart + 1, midEnd),
          selected: true,
        };
        commitSnapshot({
          mode: 'manual',
          intervalSeconds: smartSplit.intervalSeconds,
          remainderPolicy,
          manualCutMode: 'remove-middle',
          segments: [cutSeg],
          activeSegmentId: cutSeg.id,
        });
      } else {
        commitSnapshot({
          mode: 'manual',
          intervalSeconds: smartSplit.intervalSeconds,
          remainderPolicy,
          manualCutMode: 'keep-segments',
          segments,
          activeSegmentId,
        });
      }
    },
    [source, smartSplit.intervalSeconds, remainderPolicy, segments, activeSegmentId, commitSnapshot]
  );

  // Smart Jump-Cut Silence Removal
  const handleAutoRemoveSilence = useCallback(() => {
    if (!source || isAnalyzing) return;
    const activeSegs = detectActiveSpeechSegments(
      audioPeaks,
      source.duration,
      smartSplit.silenceThreshold,
      smartSplit.minSilenceDuration,
      source.name
    );
    commitSnapshot({
      mode: 'manual',
      intervalSeconds: smartSplit.intervalSeconds,
      remainderPolicy,
      manualCutMode: 'keep-segments',
      segments: activeSegs,
      activeSegmentId: activeSegs[0]?.id ?? null,
    });
    showNotice(
      activeSegs.length > 1
        ? `Jump-cut ready: ${activeSegs.length} active segments kept`
        : 'No silence gaps found at current threshold'
    );
  }, [source, isAnalyzing, audioPeaks, smartSplit, remainderPolicy, commitSnapshot, showNotice]);

  // Visual Scene-Change Detection
  const handleDetectScenes = useCallback(async () => {
    if (!source || isDetectingScenes) return;
    setIsDetectingScenes(true);
    setSceneDetectPercent(0);
    try {
      const cuts = await detectSceneChanges(source.url, source.duration, 0.2, (pct) => {
        setSceneDetectPercent(pct);
      });
      const sceneSegs = generateSegmentsFromCutPoints(source.duration, cuts, source.name);
      if (sceneSegs.length > 0) {
        commitSnapshot({
          mode: 'manual',
          intervalSeconds: smartSplit.intervalSeconds,
          remainderPolicy,
          manualCutMode: 'keep-segments',
          segments: sceneSegs,
          activeSegmentId: sceneSegs[0].id,
        });
        showNotice(
          cuts.length > 0
            ? `Detected ${cuts.length} scene ${cuts.length === 1 ? 'cut' : 'cuts'} (${sceneSegs.length} clips)`
            : 'No distinct scene cuts detected'
        );
      }
    } finally {
      setIsDetectingScenes(false);
      setSceneDetectPercent(0);
    }
  }, [source, isDetectingScenes, smartSplit.intervalSeconds, remainderPolicy, commitSnapshot, showNotice]);

  // Apply Chapters from Modal
  const handleApplyChapterSegments = useCallback(
    (chapterSegments: ClipSegment[]) => {
      if (chapterSegments.length === 0) return;
      commitSnapshot({
        mode: 'manual',
        intervalSeconds: smartSplit.intervalSeconds,
        remainderPolicy,
        manualCutMode: 'keep-segments',
        segments: chapterSegments,
        activeSegmentId: chapterSegments[0].id,
      });
    },
    [smartSplit.intervalSeconds, remainderPolicy, commitSnapshot]
  );

  // Segment Mutation Handlers
  const handleSegmentDragChange = useCallback(
    (id: string, startTime: number, endTime: number) => {
      setSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, startTime, endTime } : s))
      );
    },
    []
  );

  const handleSegmentDragEnd = useCallback(() => {
    commitSnapshot({
      mode,
      intervalSeconds: smartSplit.intervalSeconds,
      remainderPolicy,
      manualCutMode,
      segments,
      activeSegmentId,
    });
  }, [
    mode,
    smartSplit.intervalSeconds,
    remainderPolicy,
    manualCutMode,
    segments,
    activeSegmentId,
    commitSnapshot,
  ]);

  const handleUpdateSegmentBounds = useCallback(
    (id: string, startTime: number, endTime: number) => {
      const nextSegs = segments.map((s) =>
        s.id === id ? { ...s, startTime, endTime } : s
      );
      commitSnapshot({
        mode,
        intervalSeconds: smartSplit.intervalSeconds,
        remainderPolicy,
        manualCutMode,
        segments: nextSegs,
        activeSegmentId: id,
      });
      handleSeek(startTime);
    },
    [
      segments,
      mode,
      smartSplit.intervalSeconds,
      remainderPolicy,
      manualCutMode,
      commitSnapshot,
      handleSeek,
    ]
  );

  const handleSplitAtPlayhead = useCallback(() => {
    if (!source) return;
    if (mode === 'manual' && manualCutMode === 'remove-middle') return;
    const { segments: nextSegs, newActiveId } = splitSegmentsAtTime(segments, currentTime);
    if (!newActiveId) return;
    commitSnapshot({
      mode: mode === 'fixed-window' ? 'manual' : mode,
      intervalSeconds: smartSplit.intervalSeconds,
      remainderPolicy,
      manualCutMode: 'keep-segments',
      segments: nextSegs,
      activeSegmentId: newActiveId,
    });
  }, [
    source,
    mode,
    manualCutMode,
    segments,
    currentTime,
    smartSplit.intervalSeconds,
    remainderPolicy,
    commitSnapshot,
  ]);

  const handleMarkIn = useCallback(() => {
    if (!activeSegment || !source) return;
    if (mode === 'fixed-window') {
      const len = activeSegment.endTime - activeSegment.startTime;
      const start = clamp(currentTime, 0, Math.max(0, source.duration - len));
      handleUpdateSegmentBounds(
        activeSegment.id,
        Number(start.toFixed(2)),
        Number(Math.min(source.duration, start + len).toFixed(2))
      );
    } else if (currentTime < activeSegment.endTime - 0.5) {
      handleUpdateSegmentBounds(
        activeSegment.id,
        Number(currentTime.toFixed(2)),
        activeSegment.endTime
      );
    }
  }, [activeSegment, source, mode, currentTime, handleUpdateSegmentBounds]);

  const handleMarkOut = useCallback(() => {
    if (!activeSegment || !source) return;
    if (mode === 'fixed-window') {
      const len = activeSegment.endTime - activeSegment.startTime;
      const end = clamp(currentTime, len, source.duration);
      handleUpdateSegmentBounds(
        activeSegment.id,
        Number(Math.max(0, end - len).toFixed(2)),
        Number(end.toFixed(2))
      );
    } else if (currentTime > activeSegment.startTime + 0.5) {
      handleUpdateSegmentBounds(
        activeSegment.id,
        activeSegment.startTime,
        Number(currentTime.toFixed(2))
      );
    }
  }, [activeSegment, source, mode, currentTime, handleUpdateSegmentBounds]);

  const handleReorderSegments = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= segments.length ||
        toIndex >= segments.length
      ) {
        return;
      }
      const next = [...segments];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      commitSnapshot({
        mode,
        intervalSeconds: smartSplit.intervalSeconds,
        remainderPolicy,
        manualCutMode,
        segments: next,
        activeSegmentId,
      });
    },
    [
      segments,
      mode,
      smartSplit.intervalSeconds,
      remainderPolicy,
      manualCutMode,
      activeSegmentId,
      commitSnapshot,
    ]
  );

  const handleDeleteSegment = useCallback(
    (id: string) => {
      if (segments.length <= 1) return;
      const nextSegs = segments.filter((s) => s.id !== id);
      const nextActive = activeSegmentId === id ? nextSegs[0]?.id ?? null : activeSegmentId;
      commitSnapshot({
        mode,
        intervalSeconds: smartSplit.intervalSeconds,
        remainderPolicy,
        manualCutMode,
        segments: nextSegs,
        activeSegmentId: nextActive,
      });
    },
    [
      segments,
      activeSegmentId,
      mode,
      smartSplit.intervalSeconds,
      remainderPolicy,
      manualCutMode,
      commitSnapshot,
    ]
  );

  const handleAddManualClip = useCallback(() => {
    if (!source) return;
    const len = Math.min(smartSplit.intervalSeconds, source.duration);
    const start = clamp(currentTime, 0, Math.max(0, source.duration - len));
    const newSeg: ClipSegment = {
      id: nextSegmentId(),
      label: `clip_${String(segments.length + 1).padStart(2, '0')}`,
      startTime: Number(start.toFixed(2)),
      endTime: Number(Math.min(source.duration, start + len).toFixed(2)),
      selected: true,
    };
    commitSnapshot({
      mode: 'manual',
      intervalSeconds: smartSplit.intervalSeconds,
      remainderPolicy,
      manualCutMode: 'keep-segments',
      segments: [...segments, newSeg],
      activeSegmentId: newSeg.id,
    });
  }, [source, smartSplit.intervalSeconds, currentTime, segments, remainderPolicy, commitSnapshot]);

  const handlePreviewSegment = useCallback(
    (seg: ClipSegment) => {
      setActiveSegmentId(seg.id);
      handleSeek(seg.startTime);
      const vid = videoRef.current;
      if (vid) {
        vid.currentTime = seg.startTime;
        vid.play().catch(() => undefined);
      }
    },
    [handleSeek]
  );

  // Framing / Transform / Overlay / Subtitle / BgAudio Handlers
  const handleAspectPresetChange = useCallback(
    (preset: AspectPreset) => {
      if (!source) return;
      const nextCrop = computeCropRectForAspect(
        source.width,
        source.height,
        transform.rotation,
        preset
      );
      setTransform((prev) => ({
        ...prev,
        aspectPreset: preset,
        crop: nextCrop,
      }));
    },
    [source, transform.rotation]
  );

  const handleRotate90 = useCallback(() => {
    if (!source) return;
    setTransform((prev) => {
      const nextRot = ((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      const nextCrop = computeCropRectForAspect(
        source.width,
        source.height,
        nextRot,
        prev.aspectPreset
      );
      return { ...prev, rotation: nextRot, crop: nextCrop };
    });
  }, [source]);

  const handleUploadLogo = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOverlay((prev) => ({
          ...prev,
          logoDataUrl: reader.result as string,
          logoName: file.name,
        }));
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleUploadSubtitles = useCallback(
    async (file: File) => {
      const raw = await file.text();
      const cues = parseSubtitleFile(raw);
      setSubtitles((prev) => ({
        ...prev,
        fileName: file.name,
        cues,
      }));
      showNotice(
        cues.length > 0
          ? `Loaded ${cues.length} subtitle ${cues.length === 1 ? 'cue' : 'cues'}`
          : 'No valid SRT/VTT cues found in file'
      );
    },
    [showNotice]
  );

  const handleUploadBgAudio = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setAudio((prev) => {
      if (prev.bgAudio.url) URL.revokeObjectURL(prev.bgAudio.url);
      return {
        ...prev,
        bgAudio: {
          ...prev.bgAudio,
          file,
          url,
          name: file.name,
        },
      };
    });
  }, []);

  const handleClearBgAudio = useCallback(() => {
    setAudio((prev) => {
      if (prev.bgAudio.url) URL.revokeObjectURL(prev.bgAudio.url);
      return {
        ...prev,
        bgAudio: { ...INITIAL_AUDIO.bgAudio },
      };
    });
  }, []);

  // One-Click Platform Presets (always switches cleanly into Batch Split)
  const handleApplyPlatformPreset = useCallback(
    (presetId: 'reels' | 'tiktok' | 'whatsapp' | 'discord' | 'square') => {
      if (!source) return;
      let nextSmart: SmartSplitSettings = smartSplit;
      let label = '';

      if (presetId === 'reels') {
        handleAspectPresetChange('9:16');
        setExportSettings((e) => ({ ...e, format: 'mp4', resolution: '1080', quality: 'balanced' }));
        nextSmart = { ...smartSplit, strategy: 'interval', intervalSeconds: 15 };
        label = 'Applied Reels 9:16 · 15s split preset';
      } else if (presetId === 'tiktok') {
        handleAspectPresetChange('9:16');
        setExportSettings((e) => ({ ...e, format: 'mp4', resolution: '1080', quality: 'balanced' }));
        nextSmart = { ...smartSplit, strategy: 'interval', intervalSeconds: 60 };
        label = 'Applied TikTok 9:16 · 60s split preset';
      } else if (presetId === 'whatsapp') {
        setExportSettings((e) => ({ ...e, format: 'mp4', resolution: '720', quality: 'compact' }));
        nextSmart = { ...smartSplit, strategy: 'max-size', maxSizeMB: 16 };
        label = 'Applied WhatsApp 16 MB · 720p preset';
      } else if (presetId === 'discord') {
        setExportSettings((e) => ({ ...e, format: 'mp4', resolution: '480', quality: 'compact' }));
        nextSmart = { ...smartSplit, strategy: 'max-size', maxSizeMB: 10 };
        label = 'Applied Discord 10 MB · 480p preset';
      } else if (presetId === 'square') {
        handleAspectPresetChange('1:1');
        setExportSettings((e) => ({ ...e, format: 'mp4', resolution: '1080', quality: 'balanced' }));
        nextSmart = { ...smartSplit, strategy: 'interval', intervalSeconds: 30 };
        label = 'Applied Square 1:1 · 30s split preset';
      }

      setSmartSplit(nextSmart);
      rebuildBatchSegments(nextSmart, remainderPolicy);
      if (label) showNotice(label);
    },
    [source, smartSplit, remainderPolicy, handleAspectPresetChange, rebuildBatchSegments, showNotice]
  );

  // AI Video Auto-Tune Handlers
  const handleApplyAIVisualAudio = useCallback(
    (plan: AIEnhancePlan) => {
      setTransform((prev) => ({
        ...prev,
        color: {
          brightness: plan.color.brightness,
          contrast: plan.color.contrast,
          saturation: plan.color.saturation,
          sharpen: plan.color.sharpen,
          denoise: plan.color.denoise,
          videoFadeIn: plan.color.videoFadeIn,
          videoFadeOut: plan.color.videoFadeOut,
        },
      }));
      setAudio((prev) => ({
        ...prev,
        muted: false,
        volume: plan.audio.volume,
        normalize: plan.audio.normalize,
        voiceEnhance: plan.audio.voiceEnhance,
        fadeIn: plan.audio.fadeIn,
        fadeOut: plan.audio.fadeOut,
      }));
      showNotice(`Applied "${plan.visualStyleName}" auto-tune`);
    },
    [showNotice]
  );

  const handleRunAIEnhance = useCallback(async () => {
    if (!source || isEnhancing) return;
    setIsEnhancing(true);
    setEnhanceError(null);
    setEnhanceStep('Sampling keyframes...');
    try {
      const plan = await requestAIVideoEnhance({
        source,
        audioPeaks,
        goal: enhanceGoal,
        customPrompt: enhancePrompt,
        onStep: setEnhanceStep,
      });
      setEnhancePlan(plan);
      handleApplyAIVisualAudio(plan);
    } catch (err) {
      setEnhanceError(err instanceof Error ? err.message : 'AI Auto-Tune failed unexpectedly.');
    } finally {
      setIsEnhancing(false);
      setEnhanceStep('');
    }
  }, [source, isEnhancing, audioPeaks, enhanceGoal, enhancePrompt, handleApplyAIVisualAudio]);

  const handleApplyAIFraming = useCallback(
    (plan: AIEnhancePlan) => {
      if (!source) return;
      const preset = plan.framing.recommendedAspect;
      const nextCrop = computeCropRectForAspect(
        source.width,
        source.height,
        transform.rotation,
        preset
      );
      setTransform((prev) => ({
        ...prev,
        aspectPreset: preset,
        fitMode: plan.framing.recommendedFitMode,
        crop: nextCrop,
      }));
      showNotice(`Applied ${preset} (${plan.framing.recommendedFitMode}) framing`);
    },
    [source, transform.rotation, showNotice]
  );

  const handleApplyAISmartSplit = useCallback(
    (plan: AIEnhancePlan) => {
      const nextSmart: SmartSplitSettings = {
        ...smartSplit,
        strategy: 'interval',
        intervalSeconds: plan.pacing.recommendedIntervalSeconds,
      };
      setSmartSplit(nextSmart);
      rebuildBatchSegments(nextSmart, remainderPolicy);
      showNotice(`Split into ${plan.pacing.recommendedIntervalSeconds}s clips`);
    },
    [smartSplit, remainderPolicy, rebuildBatchSegments, showNotice]
  );

  const handleApplyAIClips = useCallback(
    (plan: AIEnhancePlan) => {
      if (!source || plan.suggestedClips.length === 0) return;
      const nextSegs: ClipSegment[] = plan.suggestedClips.map((c, idx) => ({
        id: nextSegmentId(),
        label: sanitizeFilename(c.label) || `highlight_${String(idx + 1).padStart(2, '0')}`,
        startTime: clamp(c.startTime, 0, Math.max(0, source.duration - 0.5)),
        endTime: clamp(c.endTime, Math.min(source.duration, c.startTime + 0.5), source.duration),
        selected: true,
      }));
      commitSnapshot({
        mode: 'manual',
        intervalSeconds: smartSplit.intervalSeconds,
        remainderPolicy,
        manualCutMode: 'keep-segments',
        segments: nextSegs,
        activeSegmentId: nextSegs[0]?.id ?? null,
      });
      if (nextSegs[0]) handleSeek(nextSegs[0].startTime);
      showNotice(`Loaded ${nextSegs.length} AI highlight ${nextSegs.length === 1 ? 'clip' : 'clips'}`);
    },
    [source, smartSplit.intervalSeconds, remainderPolicy, commitSnapshot, handleSeek, showNotice]
  );

  const handleResetEnhancements = useCallback(() => {
    setTransform((prev) => ({
      ...prev,
      color: INITIAL_COLOR,
    }));
    setAudio((prev) => ({
      ...prev,
      volume: 1,
      normalize: false,
      voiceEnhance: false,
      fadeIn: 0,
      fadeOut: 0,
    }));
    showNotice('Reset visual and audio auto-tune');
  }, [showNotice]);

  // FFmpeg Export Execution
  const startExport = useCallback(
    async (targetSegments: ClipSegment[], singleClipOverride = false) => {
      if (!source) return;
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      if (exportState.downloadUrl) {
        URL.revokeObjectURL(exportState.downloadUrl);
      }

      const controller = new AbortController();
      exportAbortRef.current = controller;

      try {
        const effectiveExportSettings: ExportSettings = singleClipOverride
          ? { ...exportSettings, deliveryMode: 'individual' }
          : exportSettings;

        const result = await runFFmpegExport({
          source,
          segments: targetSegments,
          transform,
          overlay,
          subtitles,
          audio,
          playback,
          manualCutMode: mode === 'manual' ? manualCutMode : 'keep-segments',
          exportSettings: effectiveExportSettings,
          onProgress: (progress) => setExportState(progress),
          abortSignal: controller.signal,
        });

        setExportState(result);
        if (result.downloadUrl && result.downloadFilename) {
          triggerBrowserDownload(result.downloadUrl, result.downloadFilename);
        }
      } catch (err) {
        setExportState({
          status: 'error',
          message: 'Export failed',
          currentClipIndex: 0,
          totalClips: targetSegments.length,
          clipPercent: 0,
          overallPercent: 0,
          usedReencode: mustReencode,
          format: exportSettings.format,
          error: err instanceof Error ? err.message : 'Export failed unexpectedly.',
        });
      }
    },
    [
      source,
      exportState.downloadUrl,
      exportSettings,
      transform,
      overlay,
      subtitles,
      audio,
      playback,
      mode,
      manualCutMode,
      mustReencode,
    ]
  );

  const handleCancelExport = useCallback(() => {
    exportAbortRef.current?.abort();
    resetFFmpegInstance();
    setExportState(INITIAL_EXPORT_STATE);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!source) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const metaOrCtrl = e.metaKey || e.ctrlKey;
      if (metaOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key.toLowerCase() === 's' && !metaOrCtrl) {
        e.preventDefault();
        handleSplitAtPlayhead();
      } else if (e.key.toLowerCase() === 'i' && !metaOrCtrl) {
        e.preventDefault();
        handleMarkIn();
      } else if (e.key.toLowerCase() === 'o' && !metaOrCtrl) {
        e.preventDefault();
        handleMarkOut();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) handleJumpSeconds(-1);
        else handleStepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) handleJumpSeconds(1);
        else handleStepFrame(1);
      } else if (e.key.toLowerCase() === 'l' && !metaOrCtrl) {
        e.preventDefault();
        setPlayback((p) => ({ ...p, loopActiveClip: !p.loopActiveClip }));
      } else if (e.key.toLowerCase() === 'm' && !metaOrCtrl) {
        e.preventDefault();
        setAudio((a) => ({ ...a, muted: !a.muted }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    source,
    handleTogglePlay,
    handleSplitAtPlayhead,
    handleMarkIn,
    handleMarkOut,
    handleStepFrame,
    handleJumpSeconds,
    handleUndo,
    handleRedo,
  ]);

  const selectedCount = segments.filter((s) => s.selected).length;
  const isExporting =
    exportState.status === 'loading-engine' ||
    exportState.status === 'processing' ||
    exportState.status === 'packaging';

  const inspectorProps = source
    ? {
        source,
        activeTab: inspectorTab,
        onTabChange: setInspectorTab,
        mode,
        onModeChange: handleModeChange,
        smartSplit,
        onSmartSplitChange: handleSmartSplitChange,
        remainderPolicy,
        onRemainderPolicyChange: handleRemainderPolicyChange,
        manualCutMode,
        onManualCutModeChange: handleManualCutModeChange,
        onAutoRemoveSilence: handleAutoRemoveSilence,
        isAnalyzing,
        onDetectScenes: handleDetectScenes,
        isDetectingScenes,
        sceneDetectPercent,
        onOpenChaptersModal: () => {
          setMobileSheet(null);
          setChaptersOpen(true);
        },
        activeSegment,
        onUpdateSegmentBounds: handleUpdateSegmentBounds,
        transform,
        onAspectPresetChange: handleAspectPresetChange,
        onFitModeChange: (fitMode: FitMode) =>
          setTransform((prev) => ({ ...prev, fitMode })),
        onBackdropColorChange: (backdropColor: string) =>
          setTransform((prev) => ({ ...prev, backdropColor })),
        onRotate90: handleRotate90,
        onToggleFlipH: () =>
          setTransform((prev) => ({ ...prev, flipHorizontal: !prev.flipHorizontal })),
        onColorChange: (next: Partial<ColorSettings>) =>
          setTransform((prev) => ({
            ...prev,
            color: { ...prev.color, ...next },
          })),
        onResetTransform: () => setTransform(INITIAL_TRANSFORM),
        overlay,
        onOverlayChange: (next: Partial<OverlaySettings>) =>
          setOverlay((prev) => ({ ...prev, ...next })),
        onUploadLogo: handleUploadLogo,
        subtitles,
        onSubtitleChange: (next: Partial<SubtitleSettings>) =>
          setSubtitles((prev) => ({ ...prev, ...next })),
        onUploadSubtitles: handleUploadSubtitles,
        audio,
        onAudioChange: (next: Partial<AudioSettings>) =>
          setAudio((prev) => ({ ...prev, ...next })),
        onUploadBgAudio: handleUploadBgAudio,
        onClearBgAudio: handleClearBgAudio,
        playback,
        onPlaybackChange: (next: Partial<PlaybackSettings>) =>
          setPlayback((prev) => ({ ...prev, ...next })),
        exportSettings,
        onExportSettingsChange: (next: Partial<ExportSettings>) =>
          setExportSettings((prev) => ({ ...prev, ...next })),
        onApplyPlatformPreset: handleApplyPlatformPreset,
        reencodeReasons: reencodeInfo.reasons,
        enhanceGoal,
        onEnhanceGoalChange: setEnhanceGoal,
        enhancePrompt,
        onEnhancePromptChange: setEnhancePrompt,
        isEnhancing,
        enhanceStep,
        enhancePlan,
        enhanceError,
        onRunAIEnhance: handleRunAIEnhance,
        onApplyAIVisualAudio: handleApplyAIVisualAudio,
        onApplyAIFraming: handleApplyAIFraming,
        onApplyAISmartSplit: handleApplyAISmartSplit,
        onApplyAIClips: handleApplyAIClips,
        onResetEnhancements: handleResetEnhancements,
      }
    : null;

  const clipQueueProps = {
    segments,
    activeSegmentId: activeSegment?.id ?? null,
    filmstrip,
    mode,
    manualCutMode: mode === 'manual' ? manualCutMode : ('keep-segments' as ManualCutMode),
    exportSettings,
    hasSubtitles: subtitles.cues.length > 0 && subtitles.includeSlicedSrt,
    mustReencode,
    isExporting,
    onSelectSegment: (id: string) => {
      setActiveSegmentId(id);
      const found = segments.find((s) => s.id === id);
      if (found) handleSeek(found.startTime);
    },
    onPreviewSegment: (seg: ClipSegment) => {
      setMobileSheet(null);
      handlePreviewSegment(seg);
    },
    onToggleClipSelected: (id: string) =>
      setSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s))
      ),
    onSelectAll: (selected: boolean) =>
      setSegments((prev) => prev.map((s) => ({ ...s, selected }))),
    onRenameSegment: (id: string, label: string) =>
      setSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, label } : s))
      ),
    onDeleteSegment: handleDeleteSegment,
    onReorderSegments: handleReorderSegments,
    onAddManualClip: handleAddManualClip,
    onExportSettingsChange: (next: Partial<ExportSettings>) =>
      setExportSettings((prev) => ({ ...prev, ...next })),
    onExportSingleClip: (seg: ClipSegment) => {
      setMobileSheet(null);
      void startExport([{ ...seg, selected: true }], true);
    },
    onExportBatch: () => {
      setMobileSheet(null);
      void startExport(segments, false);
    },
  };

  const mobileSheetTitle =
    mobileSheet === 'trim'
      ? 'Trim & Auto-Split'
      : mobileSheet === 'enhance'
        ? 'AI Auto-Tune'
        : mobileSheet === 'framing'
          ? 'Frame & Color'
          : mobileSheet === 'overlay'
            ? 'Text & Subtitles'
            : mobileSheet === 'audio'
              ? 'Audio & Speed'
              : mobileSheet === 'export'
                ? 'Export Settings'
                : mobileSheet === 'queue'
                  ? `Clip Queue (${selectedCount}/${segments.length})`
                  : '';

  if (activeView === 'pages') {
    return (
      <LandingShowcase
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onLaunchStudio={() => navigateView('studio')}
      />
    );
  }

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col bg-body text-primary">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadVideoFile(file);
          e.target.value = '';
        }}
      />

      <TopBar
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onImportClick={() => fileInputRef.current?.click()}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onExportClick={() => startExport(segments)}
        onOpenShowcase={() => navigateView('pages')}
        hasMedia={Boolean(source)}
        selectedClipCount={selectedCount}
        exportFormat={exportSettings.format}
        isMergeDelivery={
          exportSettings.deliveryMode === 'merge' &&
          selectedCount > 1 &&
          exportSettings.format === 'mp4' &&
          !(mode === 'manual' && manualCutMode === 'remove-middle')
        }
        isExporting={isExporting}
      />

      {!source ? (
        <MediaIntake
          onSelectFile={loadVideoFile}
          onLoadSample={handleLoadSample}
          isLoadingSample={isLoadingSample}
          sampleProgress={sampleProgress}
          error={intakeError}
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Desktop Left Inspector */}
          {inspectorProps && (
            <LeftInspector
              {...inspectorProps}
              className="hidden lg:flex w-[308px] shrink-0 bg-surface border-r border-border flex-col min-h-0"
            />
          )}

          <main className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
            <VideoPreview
              source={source}
              videoRef={videoRef}
              currentTime={currentTime}
              isPlaying={isPlaying}
              segments={segments}
              activeSegment={activeSegment}
              manualCutMode={mode === 'manual' ? manualCutMode : 'keep-segments'}
              transform={transform}
              overlay={overlay}
              subtitles={subtitles}
              onCropChange={(crop: CropRect) =>
                setTransform((prev) => ({ ...prev, crop }))
              }
              audio={audio}
              onToggleMute={() => setAudio((a) => ({ ...a, muted: !a.muted }))}
              playback={playback}
              onToggleLoop={() =>
                setPlayback((p) => ({ ...p, loopActiveClip: !p.loopActiveClip }))
              }
              onTogglePlay={handleTogglePlay}
              onStepFrame={handleStepFrame}
              onJumpSeconds={handleJumpSeconds}
              onSplitAtPlayhead={handleSplitAtPlayhead}
              onMarkIn={handleMarkIn}
              onMarkOut={handleMarkOut}
              onSnapshotFrame={handleSnapshotFrame}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onTimeUpdate={setCurrentTime}
              onPlayingChange={setIsPlaying}
            />

            <Timeline
              source={source}
              theme={theme}
              filmstrip={filmstrip}
              audioPeaks={audioPeaks}
              isAnalyzing={isAnalyzing}
              segments={segments}
              activeSegmentId={activeSegment?.id ?? null}
              mode={mode}
              manualCutMode={mode === 'manual' ? manualCutMode : 'keep-segments'}
              intervalSeconds={smartSplit.intervalSeconds}
              currentTime={currentTime}
              audio={audio}
              onSeek={handleSeek}
              onSelectSegment={(id) => {
                setActiveSegmentId(id);
                const found = segments.find((s) => s.id === id);
                if (found) handleSeek(found.startTime);
              }}
              onSegmentDragChange={handleSegmentDragChange}
              onSegmentDragEnd={handleSegmentDragEnd}
            />
          </main>

          {/* Desktop Right Clip Queue */}
          <ClipQueue
            {...clipQueueProps}
            className="hidden lg:flex w-[310px] shrink-0 bg-surface border-l border-border flex-col min-h-0"
          />

          {/* Mobile / Android Bottom Tool Dock */}
          <nav
            aria-label="Mobile editor tools"
            className="lg:hidden shrink-0 bg-surface border-t border-border px-0.5 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] grid grid-cols-7 gap-0.5 select-none"
          >
            {(
              [
                { id: 'trim', label: 'Trim', icon: Scissors },
                { id: 'enhance', label: 'Tune', icon: Sparkles },
                { id: 'framing', label: 'Frame', icon: Crop },
                { id: 'overlay', label: 'Text', icon: Type },
                { id: 'audio', label: 'Audio', icon: Volume2 },
                { id: 'export', label: 'Export', icon: SlidersHorizontal },
                { id: 'queue', label: `Clips (${segments.length})`, icon: Layers },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const isOpen = mobileSheet === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (id !== 'queue') {
                      setInspectorTab(id);
                    }
                    setMobileSheet((curr) => (curr === id ? null : id));
                  }}
                  className={`h-12 rounded-md flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isOpen
                      ? 'bg-neutral text-primary'
                      : 'text-secondary hover:text-primary active:bg-overlay-hover'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="leading-none truncate max-w-full px-0.5">{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Mobile / Android Slide-Up Tool Sheet */}
          {mobileSheet && inspectorProps && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={mobileSheetTitle}
              onClick={() => setMobileSheet(null)}
              className="lg:hidden fixed inset-0 z-40 bg-overlay/70 flex flex-col justify-end"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-h-[64dvh] rounded-t-xl bg-surface border-t border-border-strong shadow-lg flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
              >
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0">
                  <h2 className="text-[14px] font-semibold text-primary">
                    {mobileSheetTitle}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setMobileSheet(null)}
                    className="h-7 px-2.5 rounded-sm bg-neutral text-primary text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Done</span>
                  </button>
                </div>

                {mobileSheet === 'queue' ? (
                  <ClipQueue
                    {...clipQueueProps}
                    className="w-full flex-1 min-h-0 flex flex-col bg-surface"
                  />
                ) : (
                  <LeftInspector
                    {...inspectorProps}
                    hideTabBar
                    className="w-full flex-1 min-h-0 flex flex-col bg-surface"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ExportModal
        state={exportState}
        onCancel={handleCancelExport}
        onClose={() => setExportState(INITIAL_EXPORT_STATE)}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {source && (
        <ChaptersModal
          open={chaptersOpen}
          duration={source.duration}
          segments={segments}
          onApplySegments={handleApplyChapterSegments}
          onClose={() => setChaptersOpen(false)}
        />
      )}

      <OfflineIndicator />

      {statusNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 lg:bottom-5 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-md bg-accent-bg text-on-accent text-[12px] font-medium shadow-md pointer-events-none whitespace-nowrap"
        >
          {statusNotice}
        </div>
      )}
    </div>
  );
}
