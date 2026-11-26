export type ThemeMode = 'light' | 'dark';

export type AutoTrimMode = 'batch-split' | 'fixed-window' | 'manual';

export type SplitStrategy = 'interval' | 'count' | 'max-size';

export type RemainderPolicy = 'keep' | 'drop-short' | 'merge-last';

export type ManualCutMode = 'keep-segments' | 'remove-middle';

export type AspectPreset = 'original' | '16:9' | '9:16' | '1:1' | '4:5';

export type FitMode = 'crop' | 'blur' | 'solid';

export type ExportMode = 'lossless' | 'reencode';

export type OutputFormat = 'mp4' | 'webm' | 'gif' | 'mp3' | 'wav';

export type ResolutionPreset = 'original' | '1080' | '720' | '480';

export type QualityPreset = 'high' | 'balanced' | 'compact';

export type MotionMode = 'normal' | 'reverse' | 'boomerang';

export type DeliveryMode = 'individual' | 'merge';

export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type InspectorTab = 'trim' | 'enhance' | 'framing' | 'overlay' | 'audio' | 'export';

export type EnhanceGoal =
  | 'auto'
  | 'cinematic'
  | 'social-punch'
  | 'clean-studio'
  | 'podcast';

export type EnhanceProvider = 'local' | 'openrouter' | 'gemini';

export interface EnhanceProviderConfig {
  provider: EnhanceProvider;
  openRouterApiKey: string;
  geminiApiKey: string;
  openRouterModel: string;
  geminiModel: string;
}

export interface FilmstripFrame {
  time: number;
  dataUrl: string;
}

export interface MediaSource {
  file: File;
  url: string;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export interface ClipSegment {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  selected: boolean;
  thumbnail?: string;
}

export interface CropRect {
  /** Normalized 0..1 relative to rotated video dimensions */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorSettings {
  brightness: number; // -0.3 to 0.3
  contrast: number;   // 0.5 to 1.8
  saturation: number; // 0 to 2.0
  sharpen: number;    // 0 to 1.0 (FFmpeg unsharp)
  denoise: boolean;   // FFmpeg hqdn3d video denoise
  videoFadeIn: number;  // 0 to 3s
  videoFadeOut: number; // 0 to 3s
}

export interface TransformSettings {
  aspectPreset: AspectPreset;
  fitMode: FitMode;
  backdropColor: string;
  crop: CropRect;
  rotation: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  color: ColorSettings;
}

export interface OverlaySettings {
  showPartNumber: boolean;
  partPrefix: string; // e.g., "Part"
  watermarkText: string;
  logoDataUrl: string | null;
  logoName: string | null;
  position: OverlayPosition;
  opacity: number; // 0.2 to 1.0
  showTimestamp: boolean;
}

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface SubtitleSettings {
  fileName: string | null;
  cues: SubtitleCue[];
  burnIn: boolean;
  includeSlicedSrt: boolean;
}

export interface BgAudioSettings {
  file: File | null;
  url: string | null;
  name: string | null;
  volume: number; // 0 to 1.5
  loop: boolean;
}

export interface AudioSettings {
  muted: boolean;
  volume: number; // 0 to 2 (1 = 100%)
  fadeIn: number; // seconds, 0 to 5
  fadeOut: number; // seconds, 0 to 5
  normalize: boolean;
  voiceEnhance: boolean; // FFmpeg vocal EQ + compressor
  bgAudio: BgAudioSettings;
}

export interface PlaybackSettings {
  speed: number; // 0.5, 0.75, 1, 1.25, 1.5, 2
  loopActiveClip: boolean;
  motionMode: MotionMode;
}

export interface ExportSettings {
  engineMode: ExportMode;
  format: OutputFormat;
  resolution: ResolutionPreset;
  quality: QualityPreset;
  deliveryMode: DeliveryMode;
  mergeFadeDip: number; // 0 or 0.5s
  includeCoverImages: boolean;
}

export interface SmartSplitSettings {
  strategy: SplitStrategy;
  intervalSeconds: number;
  splitCount: number;
  maxSizeMB: number;
  overlapSeconds: number;
  snapToSilence: boolean;
  silenceThreshold: number; // 0.05 to 0.45
  minSilenceDuration: number; // 0.3 to 2.0s
}

export interface EditorSnapshot {
  mode: AutoTrimMode;
  intervalSeconds: number;
  remainderPolicy: RemainderPolicy;
  manualCutMode: ManualCutMode;
  segments: ClipSegment[];
  activeSegmentId: string | null;
}

export interface ExportProgressState {
  status: 'idle' | 'loading-engine' | 'processing' | 'packaging' | 'done' | 'error';
  message: string;
  currentClipIndex: number;
  totalClips: number;
  clipPercent: number;
  overallPercent: number;
  usedReencode: boolean;
  format?: OutputFormat;
  downloadUrl?: string;
  downloadFilename?: string;
  error?: string;
}

export interface AISuggestedClip {
  label: string;
  startTime: number;
  endTime: number;
  reason: string;
}

export interface AIEnhancePlan {
  engineLabel?: string;
  visualStyleName: string;
  summary: string;
  notes: string[];
  color: {
    brightness: number;
    contrast: number;
    saturation: number;
    sharpen: number;
    denoise: boolean;
    videoFadeIn: number;
    videoFadeOut: number;
  };
  audio: {
    volume: number;
    normalize: boolean;
    voiceEnhance: boolean;
    fadeIn: number;
    fadeOut: number;
  };
  framing: {
    recommendedAspect: AspectPreset;
    recommendedFitMode: FitMode;
    reason: string;
  };
  pacing: {
    recommendedIntervalSeconds: number;
    suggestRemoveSilence: boolean;
    reason: string;
  };
  suggestedClips: AISuggestedClip[];
}
