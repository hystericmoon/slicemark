import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AudioLines,
  Captions,
  Check,
  Crop,
  Download,
  ExternalLink,
  FlipHorizontal2,
  ImagePlus,
  ListVideo,
  Loader2,
  Music,
  RotateCcw,
  RotateCw,
  ScanEye,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AIEnhancePlan,
  AspectPreset,
  AudioSettings,
  AutoTrimMode,
  ClipSegment,
  ColorSettings,
  EnhanceGoal,
  EnhanceProvider,
  EnhanceProviderConfig,
  ExportSettings,
  FitMode,
  InspectorTab,
  ManualCutMode,
  MediaSource,
  MotionMode,
  OutputFormat,
  OverlayPosition,
  OverlaySettings,
  PlaybackSettings,
  QualityPreset,
  RemainderPolicy,
  ResolutionPreset,
  SmartSplitSettings,
  SplitStrategy,
  SubtitleSettings,
  TransformSettings,
} from '../types/editor';
import {
  AUTO_TRIM_PRESETS,
  computeOutputResolution,
  MAX_SIZE_PRESETS_MB,
  SPLIT_COUNT_PRESETS,
} from '../utils/segmentGenerator';
import { GEMINI_MODEL_PRESETS, OPENROUTER_MODEL_PRESETS } from '../utils/aiEnhance';
import { clamp, formatTimecode, parseTimecode } from '../utils/timecode';

interface LeftInspectorProps {
  source: MediaSource;
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  mode: AutoTrimMode;
  onModeChange: (mode: AutoTrimMode) => void;
  smartSplit: SmartSplitSettings;
  onSmartSplitChange: (next: Partial<SmartSplitSettings>, regenerate?: boolean) => void;
  remainderPolicy: RemainderPolicy;
  onRemainderPolicyChange: (policy: RemainderPolicy) => void;
  manualCutMode: ManualCutMode;
  onManualCutModeChange: (mode: ManualCutMode) => void;
  onAutoRemoveSilence: () => void;
  isAnalyzing: boolean;
  onDetectScenes: () => void;
  isDetectingScenes: boolean;
  sceneDetectPercent: number;
  onOpenChaptersModal: () => void;
  activeSegment: ClipSegment | null;
  onUpdateSegmentBounds: (id: string, start: number, end: number) => void;
  transform: TransformSettings;
  onAspectPresetChange: (preset: AspectPreset) => void;
  onFitModeChange: (fit: FitMode) => void;
  onBackdropColorChange: (hex: string) => void;
  onRotate90: () => void;
  onToggleFlipH: () => void;
  onColorChange: (next: Partial<ColorSettings>) => void;
  onResetTransform: () => void;
  overlay: OverlaySettings;
  onOverlayChange: (next: Partial<OverlaySettings>) => void;
  onUploadLogo: (file: File) => void;
  subtitles: SubtitleSettings;
  onSubtitleChange: (next: Partial<SubtitleSettings>) => void;
  onUploadSubtitles: (file: File) => void;
  audio: AudioSettings;
  onAudioChange: (next: Partial<AudioSettings>) => void;
  onUploadBgAudio: (file: File) => void;
  onClearBgAudio: () => void;
  playback: PlaybackSettings;
  onPlaybackChange: (next: Partial<PlaybackSettings>) => void;
  exportSettings: ExportSettings;
  onExportSettingsChange: (next: Partial<ExportSettings>) => void;
  onApplyPlatformPreset: (presetId: 'reels' | 'tiktok' | 'whatsapp' | 'discord' | 'square') => void;
  reencodeReasons: string[];
  enhanceGoal: EnhanceGoal;
  onEnhanceGoalChange: (goal: EnhanceGoal) => void;
  enhancePrompt: string;
  onEnhancePromptChange: (prompt: string) => void;
  enhanceProviderConfig: EnhanceProviderConfig;
  onEnhanceProviderConfigChange: (next: Partial<EnhanceProviderConfig>) => void;
  isEnhancing: boolean;
  enhanceStep: string;
  enhancePlan: AIEnhancePlan | null;
  enhanceError: string | null;
  onRunAIEnhance: () => void;
  onApplyAIVisualAudio: (plan: AIEnhancePlan) => void;
  onApplyAIFraming: (plan: AIEnhancePlan) => void;
  onApplyAISmartSplit: (plan: AIEnhancePlan) => void;
  onApplyAIClips: (plan: AIEnhancePlan) => void;
  onResetEnhancements: () => void;
  className?: string;
  hideTabBar?: boolean;
}

const ENHANCE_GOALS: Array<{ id: EnhanceGoal; label: string; hint: string }> = [
  { id: 'auto', label: 'Balanced Auto', hint: 'Natural exposure, clarity & audio' },
  { id: 'cinematic', label: 'Cinematic', hint: 'Filmic contrast & rich tone' },
  { id: 'social-punch', label: 'Social Punch', hint: 'Crisp, vivid & punchy for Reels' },
  { id: 'clean-studio', label: 'Clean Studio', hint: 'Bright, sharp detail & clean voice' },
  { id: 'podcast', label: 'Podcast / Voice', hint: 'Flattering tone & vocal EQ boost' },
];

const ASPECT_OPTIONS: Array<{ value: AspectPreset; label: string; hint: string }> = [
  { value: 'original', label: 'Original', hint: 'Native' },
  { value: '9:16', label: '9:16', hint: 'Reels / Shorts' },
  { value: '1:1', label: '1:1', hint: 'Square' },
  { value: '4:5', label: '4:5', hint: 'Feed' },
  { value: '16:9', label: '16:9', hint: 'Landscape' },
];

const BACKDROP_SWATCHES = ['#111111', '#1f2937', '#ffffff', '#0f172a', '#292524'];
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const LeftInspector: React.FC<LeftInspectorProps> = ({
  source,
  activeTab,
  onTabChange,
  mode,
  onModeChange,
  smartSplit,
  onSmartSplitChange,
  remainderPolicy,
  onRemainderPolicyChange,
  manualCutMode,
  onManualCutModeChange,
  onAutoRemoveSilence,
  isAnalyzing,
  onDetectScenes,
  isDetectingScenes,
  sceneDetectPercent,
  onOpenChaptersModal,
  activeSegment,
  onUpdateSegmentBounds,
  transform,
  onAspectPresetChange,
  onFitModeChange,
  onBackdropColorChange,
  onRotate90,
  onToggleFlipH,
  onColorChange,
  onResetTransform,
  overlay,
  onOverlayChange,
  onUploadLogo,
  subtitles,
  onSubtitleChange,
  onUploadSubtitles,
  audio,
  onAudioChange,
  onUploadBgAudio,
  onClearBgAudio,
  playback,
  onPlaybackChange,
  exportSettings,
  onExportSettingsChange,
  onApplyPlatformPreset,
  reencodeReasons,
  enhanceGoal,
  onEnhanceGoalChange,
  enhancePrompt,
  onEnhancePromptChange,
  enhanceProviderConfig,
  onEnhanceProviderConfigChange,
  isEnhancing,
  enhanceStep,
  enhancePlan,
  enhanceError,
  onRunAIEnhance,
  onApplyAIVisualAudio,
  onApplyAIFraming,
  onApplyAISmartSplit,
  onApplyAIClips,
  onResetEnhancements,
  className,
  hideTabBar = false,
}) => {
  const [customIntervalInput, setCustomIntervalInput] = useState(String(smartSplit.intervalSeconds));
  const [customCountInput, setCustomCountInput] = useState(String(smartSplit.splitCount));
  const [customMbInput, setCustomMbInput] = useState(String(smartSplit.maxSizeMB));
  const [startInput, setStartInput] = useState('00:00.00');
  const [endInput, setEndInput] = useState('00:15.00');
  const [customModelOpen, setCustomModelOpen] = useState(false);

  useEffect(() => {
    setCustomIntervalInput(String(smartSplit.intervalSeconds));
  }, [smartSplit.intervalSeconds]);

  useEffect(() => {
    setCustomCountInput(String(smartSplit.splitCount));
  }, [smartSplit.splitCount]);

  useEffect(() => {
    setCustomMbInput(String(smartSplit.maxSizeMB));
  }, [smartSplit.maxSizeMB]);

  useEffect(() => {
    if (activeSegment) {
      setStartInput(formatTimecode(activeSegment.startTime));
      setEndInput(formatTimecode(activeSegment.endTime));
    }
  }, [activeSegment]);

  const handleCustomIntervalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(customIntervalInput);
    if (Number.isFinite(parsed) && parsed >= 1) {
      const clamped = Math.min(Math.round(parsed), Math.max(1, Math.ceil(source.duration)));
      onSmartSplitChange({ intervalSeconds: clamped }, true);
    }
  };

  const handleCustomCountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customCountInput, 10);
    if (Number.isFinite(parsed) && parsed >= 2) {
      onSmartSplitChange({ splitCount: clamp(parsed, 2, 50) }, true);
    }
  };

  const handleCustomMbSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(customMbInput);
    if (Number.isFinite(parsed) && parsed >= 1) {
      onSmartSplitChange({ maxSizeMB: clamp(parsed, 1, 500) }, true);
    }
  };

  const commitStartInput = () => {
    if (!activeSegment) return;
    const parsed = parseTimecode(startInput);
    if (parsed === null) {
      setStartInput(formatTimecode(activeSegment.startTime));
      return;
    }
    if (mode === 'fixed-window') {
      const len = activeSegment.endTime - activeSegment.startTime;
      const clampedStart = clamp(parsed, 0, Math.max(0, source.duration - len));
      onUpdateSegmentBounds(
        activeSegment.id,
        clampedStart,
        Math.min(source.duration, clampedStart + len)
      );
    } else {
      const clampedStart = clamp(parsed, 0, Math.max(0, activeSegment.endTime - 0.5));
      onUpdateSegmentBounds(activeSegment.id, clampedStart, activeSegment.endTime);
    }
  };

  const commitEndInput = () => {
    if (!activeSegment) return;
    const parsed = parseTimecode(endInput);
    if (parsed === null) {
      setEndInput(formatTimecode(activeSegment.endTime));
      return;
    }
    if (mode === 'fixed-window') {
      const len = activeSegment.endTime - activeSegment.startTime;
      const clampedEnd = clamp(parsed, len, source.duration);
      onUpdateSegmentBounds(activeSegment.id, Math.max(0, clampedEnd - len), clampedEnd);
    } else {
      const clampedEnd = clamp(parsed, activeSegment.startTime + 0.5, source.duration);
      onUpdateSegmentBounds(activeSegment.id, activeSegment.startTime, clampedEnd);
    }
  };

  const maxH =
    exportSettings.resolution === 'original' ? undefined : parseInt(exportSettings.resolution, 10);
  const outputRes = computeOutputResolution(
    source.width,
    source.height,
    transform.rotation,
    transform.crop,
    transform.aspectPreset,
    transform.fitMode,
    maxH
  );

  return (
    <aside
      className={
        className ??
        'w-[308px] shrink-0 bg-surface border-r border-border flex flex-col min-h-0'
      }
    >
      {/* 6-Tab Astryx Neutral Segmented Bar */}
      {!hideTabBar && (
        <div className="p-2 border-b border-border">
          <div
            role="tablist"
            aria-label="Inspector sections"
            className="grid grid-cols-6 gap-0.5 p-1 rounded-md bg-body"
          >
            {(
              [
                { id: 'trim', label: 'Trim', icon: Scissors },
                { id: 'enhance', label: 'Tune', icon: Sparkles },
                { id: 'framing', label: 'Frame', icon: Crop },
                { id: 'overlay', label: 'Text', icon: Type },
                { id: 'audio', label: 'Audio', icon: Volume2 },
                { id: 'export', label: 'Export', icon: SlidersHorizontal },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => onTabChange(id)}
                  className={`h-8 rounded-sm text-[10px] font-medium flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-info ${
                    active
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="leading-none">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Scrollable Inspector Content */}
      <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-5">
        {/* ==================== TAB: AI AUTO-TUNE & ENHANCE ==================== */}
        {activeTab === 'enhance' && (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="block text-[12px] font-medium text-primary">
                    Smart Auto-Tune
                  </span>
                  <span className="block text-[11px] text-secondary">
                    Instant local analysis · optional BYOK AI
                  </span>
                </div>
                {(Math.abs(transform.color.brightness) > 0.01 ||
                  Math.abs(transform.color.contrast - 1) > 0.01 ||
                  Math.abs(transform.color.saturation - 1) > 0.01 ||
                  transform.color.sharpen > 0.02 ||
                  transform.color.denoise ||
                  audio.voiceEnhance ||
                  audio.normalize) && (
                  <button
                    type="button"
                    onClick={onResetEnhancements}
                    className="text-[11px] text-secondary hover:text-primary inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>

              <div>
                <span className="block text-[11px] font-medium text-secondary mb-1.5">
                  Target Look
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {ENHANCE_GOALS.map((g) => {
                    const selected = enhanceGoal === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        disabled={isEnhancing}
                        onClick={() => onEnhanceGoalChange(g.id)}
                        className={`w-full px-2.5 py-2 rounded-md border text-left transition-colors cursor-pointer disabled:opacity-50 ${
                          selected
                            ? 'bg-neutral border-border-strong text-primary'
                            : 'bg-body border-border text-secondary hover:text-primary hover:bg-overlay-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-primary">{g.label}</span>
                          {selected && <Check className="w-3.5 h-3.5 text-info shrink-0" />}
                        </div>
                        <div className="text-[11px] text-secondary leading-snug mt-0.5">
                          {g.hint}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block text-[11px] font-medium text-secondary mb-1.5">
                  Engine
                </span>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-body border border-border">
                  {(
                    [
                      { id: 'local', label: 'Local' },
                      { id: 'openrouter', label: 'OpenRouter' },
                      { id: 'gemini', label: 'Gemini' },
                    ] as Array<{ id: EnhanceProvider; label: string }>
                  ).map((opt) => {
                    const active = enhanceProviderConfig.provider === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isEnhancing}
                        onClick={() => onEnhanceProviderConfigChange({ provider: opt.id })}
                        className={`h-7 rounded-sm text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                          active
                            ? 'bg-surface text-primary shadow-sm border border-border-strong'
                            : 'text-secondary hover:text-primary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {enhanceProviderConfig.provider === 'local' ? (
                  <p className="mt-1.5 text-[11px] text-secondary">
                    100% local in your browser · $0 · works offline
                  </p>
                ) : (() => {
                  const isOpenRouter = enhanceProviderConfig.provider === 'openrouter';
                  const presets = isOpenRouter ? OPENROUTER_MODEL_PRESETS : GEMINI_MODEL_PRESETS;
                  const currentModel = isOpenRouter
                    ? enhanceProviderConfig.openRouterModel
                    : enhanceProviderConfig.geminiModel;
                  const isPreset = presets.some((p) => p.id === currentModel);
                  const showCustomInput = customModelOpen || !isPreset;
                  const selectValue = showCustomInput ? '__custom__' : currentModel;

                  return (
                    <div className="mt-2 p-2.5 rounded-md bg-body border border-border space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-medium text-secondary">
                          {isOpenRouter ? 'OpenRouter API Key' : 'Gemini API Key'}
                        </label>
                        <a
                          href={
                            isOpenRouter
                              ? 'https://openrouter.ai/keys'
                              : 'https://aistudio.google.com/apikey'
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-info hover:underline"
                        >
                          <span>Get free key</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <input
                        type="password"
                        value={
                          isOpenRouter
                            ? enhanceProviderConfig.openRouterApiKey
                            : enhanceProviderConfig.geminiApiKey
                        }
                        disabled={isEnhancing}
                        onChange={(e) =>
                          onEnhanceProviderConfigChange(
                            isOpenRouter
                              ? { openRouterApiKey: e.target.value }
                              : { geminiApiKey: e.target.value }
                          )
                        }
                        placeholder={isOpenRouter ? 'sk-or-v1-...' : 'AIza...'}
                        className="w-full h-7 px-2 rounded-sm bg-surface border border-border-strong text-[11px] font-mono text-primary placeholder:text-secondary/60 focus:outline-none focus:border-info disabled:opacity-50"
                      />
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] text-secondary shrink-0">Model</label>
                          <select
                            value={selectValue}
                            disabled={isEnhancing}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__custom__') {
                                setCustomModelOpen(true);
                                return;
                              }
                              setCustomModelOpen(false);
                              onEnhanceProviderConfigChange(
                                isOpenRouter ? { openRouterModel: val } : { geminiModel: val }
                              );
                            }}
                            className="w-full h-7 px-2 rounded-sm bg-surface border border-border-strong text-[11px] text-primary focus:outline-none focus:border-info disabled:opacity-50 cursor-pointer"
                          >
                            {presets.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                            <option value="__custom__">Custom model ID...</option>
                          </select>
                        </div>
                        {showCustomInput && (
                          <input
                            type="text"
                            value={currentModel === 'auto' ? '' : currentModel}
                            disabled={isEnhancing}
                            onChange={(e) =>
                              onEnhanceProviderConfigChange(
                                isOpenRouter
                                  ? { openRouterModel: e.target.value }
                                  : { geminiModel: e.target.value }
                              )
                            }
                            placeholder={
                              isOpenRouter ? 'e.g. google/gemini-2.5-flash' : 'e.g. gemini-2.5-flash'
                            }
                            className="w-full h-7 px-2 rounded-sm bg-surface border border-border-strong text-[11px] font-mono text-primary placeholder:text-secondary/60 focus:outline-none focus:border-info disabled:opacity-50"
                          />
                        )}
                      </div>
                      <p className="text-[10px] text-secondary">
                        Tries best model first, auto-falls back if busy. Key stays in your browser.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {enhanceProviderConfig.provider !== 'local' && (
                <div>
                  <label className="block text-[11px] font-medium text-secondary mb-1">
                    Optional Direction
                  </label>
                  <input
                    type="text"
                    value={enhancePrompt}
                    disabled={isEnhancing}
                    onChange={(e) => onEnhancePromptChange(e.target.value)}
                    placeholder="e.g. brighter face, crisp text, warm vibe..."
                    maxLength={240}
                    className="w-full h-8 px-2.5 rounded-md bg-body border border-border-strong text-[12px] text-primary placeholder:text-secondary/70 focus:outline-none focus:border-info disabled:opacity-50"
                  />
                </div>
              )}

              <button
                type="button"
                disabled={isEnhancing}
                onClick={onRunAIEnhance}
                className="w-full h-9 px-3 rounded-md bg-accent-bg text-on-accent text-[12px] font-medium hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-1.5 transition-opacity cursor-pointer"
              >
                {isEnhancing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="truncate">{enhanceStep || 'Auto-Tuning video...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>{enhancePlan ? 'Re-Analyze & Auto-Tune' : 'Auto-Tune Video'}</span>
                  </>
                )}
              </button>

              {enhanceError && (
                <div
                  role="alert"
                  className="p-2.5 rounded-md bg-error/10 border border-error/30 text-[11px] text-primary flex items-start gap-2"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
                  <span className="leading-snug">{enhanceError}</span>
                </div>
              )}
            </section>

            {enhancePlan && (
              <>
                <section className="pt-4 border-t border-border space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[12px] font-semibold text-primary truncate">
                        {enhancePlan.visualStyleName}
                      </span>
                      {enhancePlan.engineLabel && (
                        <span className="px-1.5 py-0.5 rounded-xs bg-neutral border border-border text-[10px] font-mono text-secondary truncate shrink-0">
                          {enhancePlan.engineLabel}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onApplyAIVisualAudio(enhancePlan)}
                      className="text-[11px] font-medium text-info hover:underline cursor-pointer shrink-0"
                    >
                      Re-Apply
                    </button>
                  </div>
                  <p className="text-[11px] text-secondary leading-relaxed">
                    {enhancePlan.summary}
                  </p>

                  {/* Parameter Summary Grid */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                    <div className="px-2 py-1.5 rounded-sm bg-body border border-border flex justify-between">
                      <span className="text-secondary">Exposure</span>
                      <span className="font-mono tabular-nums text-primary">
                        {enhancePlan.color.brightness > 0 ? '+' : ''}
                        {Math.round(enhancePlan.color.brightness * 100)}%
                      </span>
                    </div>
                    <div className="px-2 py-1.5 rounded-sm bg-body border border-border flex justify-between">
                      <span className="text-secondary">Contrast</span>
                      <span className="font-mono tabular-nums text-primary">
                        {Math.round(enhancePlan.color.contrast * 100)}%
                      </span>
                    </div>
                    <div className="px-2 py-1.5 rounded-sm bg-body border border-border flex justify-between">
                      <span className="text-secondary">Saturation</span>
                      <span className="font-mono tabular-nums text-primary">
                        {Math.round(enhancePlan.color.saturation * 100)}%
                      </span>
                    </div>
                    <div className="px-2 py-1.5 rounded-sm bg-body border border-border flex justify-between">
                      <span className="text-secondary">Sharpen</span>
                      <span className="font-mono tabular-nums text-primary">
                        {Math.round(enhancePlan.color.sharpen * 100)}%
                      </span>
                    </div>
                    <div className="px-2 py-1.5 rounded-sm bg-body border border-border flex justify-between">
                      <span className="text-secondary">Denoise</span>
                      <span className="font-mono text-primary">
                        {enhancePlan.color.denoise ? 'On' : 'Off'}
                      </span>
                    </div>
                    <div className="px-2 py-1.5 rounded-sm bg-body border border-border flex justify-between">
                      <span className="text-secondary">Voice EQ</span>
                      <span className="font-mono text-primary">
                        {enhancePlan.audio.voiceEnhance ? 'On' : 'Off'}
                      </span>
                    </div>
                  </div>

                  {enhancePlan.notes.length > 0 && (
                    <ul className="space-y-1 pt-1">
                      {enhancePlan.notes.map((note, idx) => (
                        <li
                          key={idx}
                          className="text-[11px] text-secondary leading-snug flex items-start gap-1.5"
                        >
                          <span className="text-info mt-0.5">•</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Recommended Framing & Pacing Actions */}
                <section className="pt-4 border-t border-border space-y-2">
                  <span className="block text-[12px] font-medium text-secondary">
                    Smart Actions
                  </span>

                  {enhancePlan.framing.recommendedAspect !== 'original' && (
                    <button
                      type="button"
                      onClick={() => onApplyAIFraming(enhancePlan)}
                      className="w-full px-2.5 py-2 rounded-md bg-body border border-border-strong hover:bg-overlay-hover text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-primary">
                        <span>
                          Apply {enhancePlan.framing.recommendedAspect} ({enhancePlan.framing.recommendedFitMode})
                        </span>
                        <span className="text-[11px] text-info">Apply</span>
                      </div>
                      <div className="text-[11px] text-secondary leading-snug mt-0.5">
                        {enhancePlan.framing.reason}
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onApplyAISmartSplit(enhancePlan)}
                    className="w-full px-2.5 py-2 rounded-md bg-body border border-border-strong hover:bg-overlay-hover text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-primary">
                      <span>
                        Split every {enhancePlan.pacing.recommendedIntervalSeconds}s
                      </span>
                      <span className="text-[11px] text-info">Apply</span>
                    </div>
                    <div className="text-[11px] text-secondary leading-snug mt-0.5">
                      {enhancePlan.pacing.reason}
                    </div>
                  </button>

                  {enhancePlan.pacing.suggestRemoveSilence && (
                    <button
                      type="button"
                      disabled={isAnalyzing}
                      onClick={onAutoRemoveSilence}
                      className="w-full h-8 px-2.5 rounded-md bg-surface border border-border-strong hover:bg-overlay-hover text-[12px] font-medium text-primary inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <AudioLines className="w-3.5 h-3.5 text-secondary" />
                      <span>Run Silence Jump-Cut</span>
                    </button>
                  )}
                </section>

                {/* Suggested Highlight Clips */}
                {enhancePlan.suggestedClips.length > 0 && (
                  <section className="pt-4 border-t border-border space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-secondary">
                        Suggested Highlights ({enhancePlan.suggestedClips.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => onApplyAIClips(enhancePlan)}
                        className="text-[11px] font-medium text-info hover:underline cursor-pointer"
                      >
                        Load into Queue
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {enhancePlan.suggestedClips.map((clip, i) => (
                        <div
                          key={i}
                          className="px-2.5 py-1.5 rounded-md bg-body border border-border"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-medium text-primary truncate">{clip.label}</span>
                            <span className="font-mono tabular-nums text-secondary shrink-0">
                              {formatTimecode(clip.startTime)}–{formatTimecode(clip.endTime)}
                            </span>
                          </div>
                          <div className="text-[10px] text-secondary leading-snug mt-0.5">
                            {clip.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {/* ==================== TAB 1: TRIM & SMART CUTTING ==================== */}
        {activeTab === 'trim' && (
          <>
            <section>
              <label className="block text-[12px] font-medium text-secondary mb-2">
                Trim Workflow
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-body">
                {(
                  [
                    { id: 'batch-split', label: 'Batch Split' },
                    { id: 'fixed-window', label: 'Fixed Trim' },
                    { id: 'manual', label: 'Manual' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onModeChange(item.id)}
                    className={`h-8 px-1.5 rounded-sm text-[12px] font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-info ${
                      mode === item.id
                        ? 'bg-surface text-primary shadow-sm'
                        : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Batch Split Strategy Selector */}
            {mode === 'batch-split' && (
              <section className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-secondary">Split Method</span>
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-body mb-3">
                  {(
                    [
                      { id: 'interval', label: 'Interval' },
                      { id: 'count', label: 'N Parts' },
                      { id: 'max-size', label: 'Max MB' },
                    ] as Array<{ id: SplitStrategy; label: string }>
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => onSmartSplitChange({ strategy: st.id }, true)}
                      className={`h-7 rounded-sm text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        smartSplit.strategy === st.id
                          ? 'bg-surface text-primary shadow-sm'
                          : 'text-secondary hover:text-primary'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {smartSplit.strategy === 'interval' && (
                  <>
                    <div className="grid grid-cols-3 gap-1.5">
                      {AUTO_TRIM_PRESETS.map((sec) => {
                        const isSelected = smartSplit.intervalSeconds === sec;
                        return (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => onSmartSplitChange({ intervalSeconds: sec }, true)}
                            className={`h-8 rounded-md text-[12px] font-mono tabular-nums font-medium border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-accent-bg text-on-accent border-accent-bg'
                                : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                            }`}
                          >
                            {sec}s
                          </button>
                        );
                      })}
                    </div>
                    <form onSubmit={handleCustomIntervalSubmit} className="mt-2 flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, Math.ceil(source.duration))}
                          step={1}
                          value={customIntervalInput}
                          onChange={(e) => setCustomIntervalInput(e.target.value)}
                          aria-label="Custom interval seconds"
                          className="w-full h-8 pl-2.5 pr-8 rounded-md bg-body border border-border-strong text-[12px] font-mono tabular-nums text-primary focus-visible:outline-2 focus-visible:outline-info"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-secondary pointer-events-none">
                          sec
                        </span>
                      </div>
                      <button
                        type="submit"
                        className="h-8 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover cursor-pointer"
                      >
                        Apply
                      </button>
                    </form>
                  </>
                )}

                {smartSplit.strategy === 'count' && (
                  <>
                    <div className="grid grid-cols-5 gap-1.5">
                      {SPLIT_COUNT_PRESETS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => onSmartSplitChange({ splitCount: n }, true)}
                          className={`h-8 rounded-md text-[12px] font-mono tabular-nums font-medium border transition-colors cursor-pointer ${
                            smartSplit.splitCount === n
                              ? 'bg-accent-bg text-on-accent border-accent-bg'
                              : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                          }`}
                        >
                          {n}×
                        </button>
                      ))}
                    </div>
                    <form onSubmit={handleCustomCountSubmit} className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={50}
                        value={customCountInput}
                        onChange={(e) => setCustomCountInput(e.target.value)}
                        aria-label="Number of equal parts"
                        className="flex-1 h-8 px-2.5 rounded-md bg-body border border-border-strong text-[12px] font-mono tabular-nums text-primary"
                      />
                      <button
                        type="submit"
                        className="h-8 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover cursor-pointer"
                      >
                        Split
                      </button>
                    </form>
                  </>
                )}

                {smartSplit.strategy === 'max-size' && (
                  <>
                    <div className="grid grid-cols-2 gap-1.5">
                      {MAX_SIZE_PRESETS_MB.map((mb) => (
                        <button
                          key={mb}
                          type="button"
                          onClick={() => onSmartSplitChange({ maxSizeMB: mb }, true)}
                          className={`h-8 rounded-md text-[12px] font-mono tabular-nums font-medium border transition-colors cursor-pointer ${
                            smartSplit.maxSizeMB === mb
                              ? 'bg-accent-bg text-on-accent border-accent-bg'
                              : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                          }`}
                        >
                          {mb} MB {mb === 10 ? '(Discord)' : mb === 16 ? '(WhatsApp)' : ''}
                        </button>
                      ))}
                    </div>
                    <form onSubmit={handleCustomMbSubmit} className="mt-2 flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={customMbInput}
                          onChange={(e) => setCustomMbInput(e.target.value)}
                          aria-label="Max file size in MB"
                          className="w-full h-8 pl-2.5 pr-9 rounded-md bg-body border border-border-strong text-[12px] font-mono tabular-nums text-primary"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-secondary pointer-events-none">
                          MB
                        </span>
                      </div>
                      <button
                        type="submit"
                        className="h-8 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover cursor-pointer"
                      >
                        Apply
                      </button>
                    </form>
                  </>
                )}

                {/* Silence Snap & Clip Overlap */}
                <div className="mt-4 space-y-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-medium text-primary">Snap Cuts to Silence</div>
                      <div className="text-[11px] text-secondary">Avoid chopping mid-sentence (±3s)</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={smartSplit.snapToSilence}
                      onClick={() =>
                        onSmartSplitChange({ snapToSilence: !smartSplit.snapToSilence }, true)
                      }
                      className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                        smartSplit.snapToSilence ? 'bg-accent-bg' : 'bg-border-strong'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                          smartSplit.snapToSilence ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[12px] mb-1.5">
                      <span className="text-secondary font-medium">Clip Overlap (Pre-Roll)</span>
                      <span className="font-mono tabular-nums text-primary">
                        {smartSplit.overlapSeconds.toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2.5}
                      step={0.5}
                      value={smartSplit.overlapSeconds}
                      onChange={(e) =>
                        onSmartSplitChange({ overlapSeconds: parseFloat(e.target.value) }, true)
                      }
                      className="w-full astryx-range"
                    />
                  </div>
                </div>

                {/* Remainder Policy */}
                {smartSplit.strategy !== 'count' && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <span className="block text-[12px] font-medium text-secondary mb-1.5">
                      Trailing Remainder
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'keep', label: 'Keep' },
                          { id: 'drop-short', label: 'Drop <4s' },
                          { id: 'merge-last', label: 'Merge' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onRemainderPolicyChange(opt.id)}
                          className={`h-7 rounded-sm text-[11px] font-medium border transition-colors cursor-pointer ${
                            remainderPolicy === opt.id
                              ? 'bg-body border-border-strong text-primary'
                              : 'bg-surface border-border text-secondary hover:text-primary'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Fixed Window Presets */}
            {mode === 'fixed-window' && (
              <section className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-secondary">Target Window Length</span>
                  <span className="text-[12px] font-mono tabular-nums text-primary font-medium">
                    {smartSplit.intervalSeconds}s
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {AUTO_TRIM_PRESETS.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => onSmartSplitChange({ intervalSeconds: sec }, true)}
                      className={`h-8 rounded-md text-[12px] font-mono tabular-nums font-medium border transition-colors cursor-pointer ${
                        smartSplit.intervalSeconds === sec
                          ? 'bg-accent-bg text-on-accent border-accent-bg'
                          : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
                <form onSubmit={handleCustomIntervalSubmit} className="mt-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, Math.ceil(source.duration))}
                      value={customIntervalInput}
                      onChange={(e) => setCustomIntervalInput(e.target.value)}
                      className="w-full h-8 pl-2.5 pr-8 rounded-md bg-body border border-border-strong text-[12px] font-mono tabular-nums text-primary"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-secondary pointer-events-none">
                      sec
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="h-8 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover cursor-pointer"
                  >
                    Lock
                  </button>
                </form>
              </section>
            )}

            {/* Manual Cut Behavior */}
            {mode === 'manual' && (
              <section className="pt-4 border-t border-border">
                <span className="block text-[12px] font-medium text-secondary mb-2">
                  Manual Cut Behavior
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onManualCutModeChange('keep-segments')}
                    className={`h-8 px-2 rounded-md border text-[12px] font-medium transition-colors cursor-pointer ${
                      manualCutMode === 'keep-segments'
                        ? 'bg-accent-bg text-on-accent border-accent-bg'
                        : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                    }`}
                  >
                    Keep Segments
                  </button>
                  <button
                    type="button"
                    onClick={() => onManualCutModeChange('remove-middle')}
                    className={`h-8 px-2 rounded-md border text-[12px] font-medium transition-colors cursor-pointer ${
                      manualCutMode === 'remove-middle'
                        ? 'bg-error text-on-error border-error'
                        : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                    }`}
                  >
                    Remove Middle
                  </button>
                </div>
              </section>
            )}

            {/* Smart Cutting Tools: Silence Jump-Cut, Scene Detection, Chapters */}
            <section className="pt-4 border-t border-border space-y-2.5">
              <span className="block text-[12px] font-medium text-secondary">
                Smart Cut Tools
              </span>

              <div>
                <div className="flex items-center justify-between text-[11px] text-secondary mb-1">
                  <span>Silence Threshold</span>
                  <span className="font-mono tabular-nums text-primary">
                    {Math.round(smartSplit.silenceThreshold * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.45}
                  step={0.01}
                  value={smartSplit.silenceThreshold}
                  onChange={(e) =>
                    onSmartSplitChange({ silenceThreshold: parseFloat(e.target.value) }, false)
                  }
                  className="w-full astryx-range"
                />
              </div>

              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={onAutoRemoveSilence}
                  className="w-full h-9 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover inline-flex items-center justify-between cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="inline-flex items-center gap-2">
                    <AudioLines className="w-3.5 h-3.5 text-secondary" />
                    Auto-Remove Silence
                  </span>
                  <span className="text-[11px] text-secondary">
                    {isAnalyzing ? 'Analyzing...' : 'Jump Cut'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isDetectingScenes}
                  onClick={onDetectScenes}
                  className="w-full h-9 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover inline-flex items-center justify-between cursor-pointer disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-2">
                    {isDetectingScenes ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-info" />
                    ) : (
                      <ScanEye className="w-3.5 h-3.5 text-secondary" />
                    )}
                    {isDetectingScenes
                      ? `Scanning scenes (${sceneDetectPercent}%)`
                      : 'Detect Scene Changes'}
                  </span>
                  <span className="text-[11px] text-secondary">Visual</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenChaptersModal}
                  className="w-full h-9 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover inline-flex items-center justify-between cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <ListVideo className="w-3.5 h-3.5 text-secondary" />
                    Chapters / Timestamps
                  </span>
                  <span className="text-[11px] text-secondary">Import / Export</span>
                </button>
              </div>
            </section>

            {/* Active Segment Precision Timecodes */}
            {activeSegment && (
              <section className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-secondary">Active Clip Range</span>
                  <span className="text-[12px] font-mono tabular-nums text-secondary">
                    {(activeSegment.endTime - activeSegment.startTime).toFixed(2)}s
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-secondary mb-1">Start (In)</label>
                    <input
                      type="text"
                      value={startInput}
                      onChange={(e) => setStartInput(e.target.value)}
                      onBlur={commitStartInput}
                      onKeyDown={(e) => e.key === 'Enter' && commitStartInput()}
                      className="w-full h-8 px-2.5 rounded-md bg-body border border-border-strong text-[12px] font-mono tabular-nums text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-secondary mb-1">End (Out)</label>
                    <input
                      type="text"
                      value={endInput}
                      onChange={(e) => setEndInput(e.target.value)}
                      onBlur={commitEndInput}
                      onKeyDown={(e) => e.key === 'Enter' && commitEndInput()}
                      className="w-full h-8 px-2.5 rounded-md bg-body border border-border-strong text-[12px] font-mono tabular-nums text-primary"
                    />
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ==================== TAB 2: FRAMING, BACKDROP & COLOR ==================== */}
        {activeTab === 'framing' && (
          <>
            <section>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-secondary">Aspect Ratio</span>
                <button
                  type="button"
                  onClick={onResetTransform}
                  className="text-[12px] text-secondary hover:text-primary inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {ASPECT_OPTIONS.map((item) => {
                  const active = transform.aspectPreset === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => onAspectPresetChange(item.value)}
                      className={`px-2.5 py-1.5 rounded-md border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-accent-bg text-on-accent border-accent-bg'
                          : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                      }`}
                    >
                      <div className="text-[12px] font-medium">{item.label}</div>
                      <div className={`text-[10px] ${active ? 'opacity-75' : 'text-secondary'}`}>
                        {item.hint}
                      </div>
                    </button>
                  );
                })}
              </div>

              {transform.aspectPreset !== 'original' && (
                <div className="mt-3">
                  <span className="block text-[11px] font-medium text-secondary mb-1.5">
                    Framing Mode (No-Crop Backdrop)
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-body">
                    {(
                      [
                        { id: 'crop', label: 'Crop Fill' },
                        { id: 'blur', label: 'Blur Fit' },
                        { id: 'solid', label: 'Solid Fit' },
                      ] as const
                    ).map((fm) => (
                      <button
                        key={fm.id}
                        type="button"
                        onClick={() => onFitModeChange(fm.id)}
                        className={`h-7 rounded-sm text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          transform.fitMode === fm.id
                            ? 'bg-surface text-primary shadow-sm'
                            : 'text-secondary hover:text-primary'
                        }`}
                      >
                        {fm.label}
                      </button>
                    ))}
                  </div>

                  {transform.fitMode === 'solid' && (
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-secondary">Backdrop Color</span>
                      <div className="flex items-center gap-1.5">
                        {BACKDROP_SWATCHES.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => onBackdropColorChange(hex)}
                            aria-label={`Set backdrop color ${hex}`}
                            style={{ backgroundColor: hex }}
                            className={`w-5 h-5 rounded-full border cursor-pointer ${
                              transform.backdropColor === hex
                                ? 'border-info ring-2 ring-info/40'
                                : 'border-border-strong'
                            }`}
                          />
                        ))}
                        <input
                          type="color"
                          value={transform.backdropColor}
                          onChange={(e) => onBackdropColorChange(e.target.value)}
                          aria-label="Custom backdrop color"
                          className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Orientation */}
            <section className="pt-4 border-t border-border">
              <span className="block text-[12px] font-medium text-secondary mb-2">
                Orientation · Output {outputRes.width}×{outputRes.height}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onRotate90}
                  className="h-8 px-2.5 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotate ({transform.rotation}°)</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleFlipH}
                  className={`h-8 px-2.5 rounded-md border text-[12px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                    transform.flipHorizontal
                      ? 'bg-accent-bg text-on-accent border-accent-bg'
                      : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                  }`}
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                  <span>Flip H</span>
                </button>
              </div>
            </section>

            {/* Video Fade In/Out */}
            <section className="pt-4 border-t border-border space-y-3">
              <span className="block text-[12px] font-medium text-secondary">
                Video Transitions (Fade to Black)
              </span>
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-secondary">Video Fade In</span>
                  <span className="font-mono tabular-nums text-primary">
                    {transform.color.videoFadeIn.toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={transform.color.videoFadeIn}
                  onChange={(e) => onColorChange({ videoFadeIn: parseFloat(e.target.value) })}
                  className="w-full astryx-range"
                />
              </div>
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-secondary">Video Fade Out</span>
                  <span className="font-mono tabular-nums text-primary">
                    {transform.color.videoFadeOut.toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={transform.color.videoFadeOut}
                  onChange={(e) => onColorChange({ videoFadeOut: parseFloat(e.target.value) })}
                  className="w-full astryx-range"
                />
              </div>
            </section>

            {/* Color Tuning */}
            <section className="pt-4 border-t border-border space-y-3">
              <span className="block text-[12px] font-medium text-secondary">Color Tuning</span>
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-secondary">Brightness</span>
                  <span className="font-mono tabular-nums text-primary">
                    {transform.color.brightness > 0 ? '+' : ''}
                    {Math.round(transform.color.brightness * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-0.3}
                  max={0.3}
                  step={0.02}
                  value={transform.color.brightness}
                  onChange={(e) => onColorChange({ brightness: parseFloat(e.target.value) })}
                  className="w-full astryx-range"
                />
              </div>
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-secondary">Contrast</span>
                  <span className="font-mono tabular-nums text-primary">
                    {Math.round(transform.color.contrast * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  value={transform.color.contrast}
                  onChange={(e) => onColorChange({ contrast: parseFloat(e.target.value) })}
                  className="w-full astryx-range"
                />
              </div>
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-secondary">Saturation</span>
                  <span className="font-mono tabular-nums text-primary">
                    {Math.round(transform.color.saturation * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={transform.color.saturation}
                  onChange={(e) => onColorChange({ saturation: parseFloat(e.target.value) })}
                  className="w-full astryx-range"
                />
              </div>
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-secondary">Sharpen (Unsharp)</span>
                  <span className="font-mono tabular-nums text-primary">
                    {Math.round(transform.color.sharpen * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={transform.color.sharpen}
                  onChange={(e) => onColorChange({ sharpen: parseFloat(e.target.value) })}
                  className="w-full astryx-range"
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <div>
                  <div className="text-[12px] font-medium text-primary">Video Denoise</div>
                  <div className="text-[11px] text-secondary">Reduce low-light grain on export</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={transform.color.denoise}
                  onClick={() => onColorChange({ denoise: !transform.color.denoise })}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    transform.color.denoise ? 'bg-accent-bg' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                      transform.color.denoise ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </section>
          </>
        )}

        {/* ==================== TAB 3: OVERLAYS, WATERMARK & SUBTITLES ==================== */}
        {activeTab === 'overlay' && (
          <>
            <section className="space-y-3">
              <span className="block text-[12px] font-medium text-secondary">
                Batch Part Stamp & Watermark
              </span>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-medium text-primary">Auto Part Number</div>
                  <div className="text-[11px] text-secondary">Stamps “Part 1/4” on each clip</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={overlay.showPartNumber}
                  onClick={() => onOverlayChange({ showPartNumber: !overlay.showPartNumber })}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    overlay.showPartNumber ? 'bg-accent-bg' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                      overlay.showPartNumber ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {overlay.showPartNumber && (
                <div>
                  <label className="block text-[11px] text-secondary mb-1">Part Label Prefix</label>
                  <input
                    type="text"
                    value={overlay.partPrefix}
                    onChange={(e) => onOverlayChange({ partPrefix: e.target.value })}
                    placeholder="Part"
                    className="w-full h-8 px-2.5 rounded-md bg-body border border-border-strong text-[12px] text-primary"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-secondary mb-1">Custom Watermark Text</label>
                <input
                  type="text"
                  value={overlay.watermarkText}
                  onChange={(e) => onOverlayChange({ watermarkText: e.target.value })}
                  placeholder="@yourhandle or brand"
                  className="w-full h-8 px-2.5 rounded-md bg-body border border-border-strong text-[12px] text-primary"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-primary">Burn Clip Timecode</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={overlay.showTimestamp}
                  onClick={() => onOverlayChange({ showTimestamp: !overlay.showTimestamp })}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    overlay.showTimestamp ? 'bg-accent-bg' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                      overlay.showTimestamp ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* PNG Logo Upload */}
              <div>
                <span className="block text-[11px] text-secondary mb-1">PNG Logo Watermark</span>
                {overlay.logoDataUrl ? (
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-body border border-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={overlay.logoDataUrl}
                        alt="Logo preview"
                        className="w-6 h-6 object-contain rounded-xs bg-black/20"
                      />
                      <span className="text-[12px] text-primary truncate">
                        {overlay.logoName || 'logo.png'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOverlayChange({ logoDataUrl: null, logoName: null })}
                      aria-label="Remove logo"
                      className="text-secondary hover:text-error p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="w-full h-8 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover inline-flex items-center justify-center gap-1.5 cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5 text-secondary" />
                    <span>Upload PNG / SVG Logo</span>
                    <input
                      type="file"
                      accept="image/png,image/webp,image/svg+xml,image/jpeg"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadLogo(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Position & Opacity */}
              <div>
                <span className="block text-[11px] text-secondary mb-1.5">Overlay Position</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'top-left', label: 'Top Left' },
                      { id: 'top-right', label: 'Top Right' },
                      { id: 'bottom-left', label: 'Bottom Left' },
                      { id: 'bottom-right', label: 'Bottom Right' },
                    ] as Array<{ id: OverlayPosition; label: string }>
                  ).map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => onOverlayChange({ position: pos.id })}
                      className={`h-7 rounded-sm text-[11px] font-medium border transition-colors cursor-pointer ${
                        overlay.position === pos.id
                          ? 'bg-accent-bg text-on-accent border-accent-bg'
                          : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-secondary">Overlay Opacity</span>
                  <span className="font-mono tabular-nums text-primary">
                    {Math.round(overlay.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={overlay.opacity}
                  onChange={(e) => onOverlayChange({ opacity: parseFloat(e.target.value) })}
                  className="w-full astryx-range"
                />
              </div>
            </section>

            {/* SRT / VTT Subtitles */}
            <section className="pt-4 border-t border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-secondary inline-flex items-center gap-1.5">
                  <Captions className="w-3.5 h-3.5" />
                  SRT / VTT Captions
                </span>
                {subtitles.cues.length > 0 && (
                  <span className="text-[11px] font-mono tabular-nums text-info">
                    {subtitles.cues.length} cues
                  </span>
                )}
              </div>

              {subtitles.fileName ? (
                <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-body border border-border">
                  <span className="text-[12px] text-primary truncate">{subtitles.fileName}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onSubtitleChange({ fileName: null, cues: [], burnIn: false })
                    }
                    aria-label="Remove subtitle file"
                    className="text-secondary hover:text-error p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="w-full h-9 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover inline-flex items-center justify-center gap-1.5 cursor-pointer">
                  <Captions className="w-3.5 h-3.5 text-secondary" />
                  <span>Import .SRT or .VTT File</span>
                  <input
                    type="file"
                    accept=".srt,.vtt,text/plain,text/vtt"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadSubtitles(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}

              {subtitles.cues.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-medium text-primary">Auto-Slice .SRT in ZIP</div>
                      <div className="text-[11px] text-secondary">Re-time captions per clip</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={subtitles.includeSlicedSrt}
                      onClick={() =>
                        onSubtitleChange({ includeSlicedSrt: !subtitles.includeSlicedSrt })
                      }
                      className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                        subtitles.includeSlicedSrt ? 'bg-accent-bg' : 'bg-border-strong'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                          subtitles.includeSlicedSrt ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-medium text-primary">Burn Captions into Video</div>
                      <div className="text-[11px] text-secondary">Hard-render styled text overlay</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={subtitles.burnIn}
                      onClick={() => onSubtitleChange({ burnIn: !subtitles.burnIn })}
                      className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                        subtitles.burnIn ? 'bg-accent-bg' : 'bg-border-strong'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                          subtitles.burnIn ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* ==================== TAB 4: AUDIO & BACKGROUND TRACK ==================== */}
        {activeTab === 'audio' && (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-primary">Mute Original Audio</div>
                  <div className="text-[11px] text-secondary">Strip source sound from clips</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={audio.muted}
                  onClick={() => onAudioChange({ muted: !audio.muted })}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer ${
                    audio.muted ? 'bg-accent-bg' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                      audio.muted ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-primary">Loudness Normalize</div>
                  <div className="text-[11px] text-secondary">Balance speech & music volume</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={audio.normalize}
                  disabled={audio.muted}
                  onClick={() => onAudioChange({ normalize: !audio.normalize })}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer disabled:opacity-40 ${
                    audio.normalize ? 'bg-accent-bg' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                      audio.normalize ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-primary">Voice Clarity EQ</div>
                  <div className="text-[11px] text-secondary">Rumble cut + speech compressor</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={audio.voiceEnhance}
                  disabled={audio.muted}
                  onClick={() => onAudioChange({ voiceEnhance: !audio.voiceEnhance })}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer disabled:opacity-40 ${
                    audio.voiceEnhance ? 'bg-accent-bg' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                      audio.voiceEnhance ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </section>

            <section className="pt-4 border-t border-border space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium text-secondary inline-flex items-center gap-1.5">
                    {audio.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    Volume Gain
                  </span>
                  <span className="text-[12px] font-mono tabular-nums text-primary">
                    {audio.muted ? '0%' : `${Math.round(audio.volume * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  disabled={audio.muted}
                  value={audio.volume}
                  onChange={(e) => onAudioChange({ volume: parseFloat(e.target.value) })}
                  className="w-full astryx-range disabled:opacity-40"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium text-secondary">Audio Fade In</span>
                  <span className="text-[12px] font-mono tabular-nums text-primary">
                    {audio.fadeIn.toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.1}
                  disabled={audio.muted}
                  value={audio.fadeIn}
                  onChange={(e) => onAudioChange({ fadeIn: parseFloat(e.target.value) })}
                  className="w-full astryx-range disabled:opacity-40"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium text-secondary">Audio Fade Out</span>
                  <span className="text-[12px] font-mono tabular-nums text-primary">
                    {audio.fadeOut.toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.1}
                  disabled={audio.muted}
                  value={audio.fadeOut}
                  onChange={(e) => onAudioChange({ fadeOut: parseFloat(e.target.value) })}
                  className="w-full astryx-range disabled:opacity-40"
                />
              </div>
            </section>

            {/* Background Music / Voiceover Mix */}
            <section className="pt-4 border-t border-border space-y-3">
              <span className="block text-[12px] font-medium text-secondary">
                Background Music / Voiceover
              </span>

              {audio.bgAudio.file ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-body border border-border">
                    <span className="inline-flex items-center gap-2 min-w-0 text-[12px] text-primary">
                      <Music className="w-3.5 h-3.5 text-info shrink-0" />
                      <span className="truncate">{audio.bgAudio.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={onClearBgAudio}
                      aria-label="Remove background audio"
                      className="text-secondary hover:text-error p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="text-secondary">Track Mix Level</span>
                      <span className="font-mono tabular-nums text-primary">
                        {Math.round(audio.bgAudio.volume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={audio.bgAudio.volume}
                      onChange={(e) =>
                        onAudioChange({
                          bgAudio: { ...audio.bgAudio, volume: parseFloat(e.target.value) },
                        })
                      }
                      className="w-full astryx-range"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-secondary">Loop Track to Clip Length</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={audio.bgAudio.loop}
                      onClick={() =>
                        onAudioChange({
                          bgAudio: { ...audio.bgAudio, loop: !audio.bgAudio.loop },
                        })
                      }
                      className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer ${
                        audio.bgAudio.loop ? 'bg-accent-bg' : 'bg-border-strong'
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                          audio.bgAudio.loop ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <label className="w-full h-9 px-3 rounded-md bg-surface border border-border-strong text-[12px] font-medium text-primary hover:bg-overlay-hover inline-flex items-center justify-center gap-1.5 cursor-pointer">
                  <Music className="w-3.5 h-3.5 text-secondary" />
                  <span>Add Audio Track (.MP3 / .WAV)</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadBgAudio(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </section>
          </>
        )}

        {/* ==================== TAB 5: MOTION, PLATFORM PRESETS & EXPORT ==================== */}
        {activeTab === 'export' && (
          <>
            {/* One-Click Platform Presets */}
            <section>
              <span className="block text-[12px] font-medium text-secondary mb-2">
                Platform Quick Presets
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'reels', title: 'Reels / Shorts', sub: '9:16 · 15s · MP4' },
                    { id: 'tiktok', title: 'TikTok', sub: '9:16 · 60s · MP4' },
                    { id: 'whatsapp', title: 'WhatsApp', sub: '16 MB max · 720p' },
                    { id: 'discord', title: 'Discord', sub: '10 MB max · 480p' },
                    { id: 'square', title: 'Square Feed', sub: '1:1 · 30s · MP4' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onApplyPlatformPreset(p.id)}
                    className="px-2.5 py-2 rounded-md bg-surface border border-border-strong hover:bg-overlay-hover text-left transition-colors cursor-pointer"
                  >
                    <div className="text-[12px] font-medium text-primary">{p.title}</div>
                    <div className="text-[10px] text-secondary mt-0.5">{p.sub}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Speed & Motion Mode (Normal / Reverse / Boomerang) */}
            <section className="pt-4 border-t border-border space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium text-secondary">Playback Speed</span>
                  <span className="text-[12px] font-mono tabular-nums text-primary font-medium">
                    {playback.speed}x
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {SPEED_OPTIONS.map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onPlaybackChange({ speed: spd })}
                      className={`h-8 rounded-md border text-[12px] font-mono tabular-nums font-medium transition-colors cursor-pointer ${
                        playback.speed === spd
                          ? 'bg-accent-bg text-on-accent border-accent-bg'
                          : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-[12px] font-medium text-secondary mb-1.5">
                  Motion Direction
                </span>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-body">
                  {(
                    [
                      { id: 'normal', label: 'Normal' },
                      { id: 'reverse', label: 'Reverse' },
                      { id: 'boomerang', label: 'Boomerang' },
                    ] as Array<{ id: MotionMode; label: string }>
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onPlaybackChange({ motionMode: m.id })}
                      className={`h-7 rounded-sm text-[11px] font-medium transition-colors cursor-pointer ${
                        playback.motionMode === m.id
                          ? 'bg-surface text-primary shadow-sm'
                          : 'text-secondary hover:text-primary'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Output Format, Resolution & Quality */}
            <section className="pt-4 border-t border-border space-y-3">
              <div>
                <span className="block text-[12px] font-medium text-secondary mb-1.5">
                  Output Format
                </span>
                <div className="grid grid-cols-5 gap-1">
                  {(
                    [
                      { id: 'mp4', label: 'MP4' },
                      { id: 'webm', label: 'WebM' },
                      { id: 'gif', label: 'GIF' },
                      { id: 'mp3', label: 'MP3' },
                      { id: 'wav', label: 'WAV' },
                    ] as Array<{ id: OutputFormat; label: string }>
                  ).map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => onExportSettingsChange({ format: fmt.id })}
                      className={`h-8 rounded-md border text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                        exportSettings.format === fmt.id
                          ? 'bg-accent-bg text-on-accent border-accent-bg'
                          : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {(exportSettings.format === 'mp4' || exportSettings.format === 'webm') && (
                <>
                  <div>
                    <span className="block text-[12px] font-medium text-secondary mb-1.5">
                      Resolution Cap
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { id: 'original', label: 'Orig' },
                          { id: '1080', label: '1080p' },
                          { id: '720', label: '720p' },
                          { id: '480', label: '480p' },
                        ] as Array<{ id: ResolutionPreset; label: string }>
                      ).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => onExportSettingsChange({ resolution: r.id })}
                          className={`h-7 rounded-sm border text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                            exportSettings.resolution === r.id
                              ? 'bg-accent-bg text-on-accent border-accent-bg'
                              : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-[12px] font-medium text-secondary mb-1.5">
                      Compression Quality
                    </span>
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-body">
                      {(
                        [
                          { id: 'high', label: 'High' },
                          { id: 'balanced', label: 'Balanced' },
                          { id: 'compact', label: 'Compact' },
                        ] as Array<{ id: QualityPreset; label: string }>
                      ).map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => onExportSettingsChange({ quality: q.id })}
                          className={`h-7 rounded-sm text-[11px] font-medium transition-colors cursor-pointer ${
                            exportSettings.quality === q.id
                              ? 'bg-surface text-primary shadow-sm'
                              : 'text-secondary hover:text-primary'
                          }`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Cover JPG bundling & Lossless Engine Preference */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  <div className="text-[12px] font-medium text-primary">Bundle Cover JPGs</div>
                  <div className="text-[11px] text-secondary">Include thumbnail per clip in ZIP</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={exportSettings.includeCoverImages}
                  onClick={() =>
                    onExportSettingsChange({
                      includeCoverImages: !exportSettings.includeCoverImages,
                    })
                  }
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    exportSettings.includeCoverImages ? 'bg-accent-bg' : 'bg-border-strong'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${
                      exportSettings.includeCoverImages ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {exportSettings.format === 'mp4' && (
                <div className="pt-2 border-t border-border">
                  <span className="block text-[12px] font-medium text-secondary mb-1.5">
                    Cut Engine Mode
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onExportSettingsChange({ engineMode: 'lossless' })}
                      className={`h-8 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                        exportSettings.engineMode === 'lossless'
                          ? 'bg-accent-bg text-on-accent border-accent-bg'
                          : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                      }`}
                    >
                      Fast Lossless
                    </button>
                    <button
                      type="button"
                      onClick={() => onExportSettingsChange({ engineMode: 'reencode' })}
                      className={`h-8 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                        exportSettings.engineMode === 'reencode'
                          ? 'bg-accent-bg text-on-accent border-accent-bg'
                          : 'bg-surface text-primary border-border-strong hover:bg-overlay-hover'
                      }`}
                    >
                      Frame-Accurate
                    </button>
                  </div>

                  {reencodeReasons.length > 0 && exportSettings.engineMode === 'lossless' && (
                    <p className="mt-2 text-[11px] text-warning leading-relaxed inline-flex items-start gap-1.5">
                      <Download className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Auto re-encode active for: {reencodeReasons.join(', ')}.</span>
                    </p>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
};
