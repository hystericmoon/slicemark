import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Download,
  Moon,
  Pause,
  Play,
  Sun,
} from 'lucide-react';
import { ThemeMode } from '../types/editor';
import urbanStill from '../assets/images/slicemark_urban_cinema_1795442353933.jpg';
import creatorStill from '../assets/images/slicemark_studio_gentleman_1795610517206.jpg';

interface LandingShowcaseProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onLaunchStudio: () => void;
}

type HeroCutPreset = '15s' | '30s' | 'silence';
type TunePresetId = 'auto' | 'cinematic' | 'social' | 'studio' | 'podcast';
type FrameAspectId = '9:16' | '1:1' | '4:5' | '16:9';
type FrameFitId = 'blur' | 'crop' | 'solid';
type MotionDemoId = 'normal' | '1.5x' | 'reverse' | 'boomerang';

const WAVEFORM_BARS = [
  0.22, 0.48, 0.72, 0.61, 0.85, 0.42, 0.14, 0.08, 0.11, 0.56, 0.88, 0.74, 0.64,
  0.91, 0.52, 0.35, 0.12, 0.07, 0.09, 0.1, 0.68, 0.84, 0.95, 0.71, 0.58, 0.44,
  0.79, 0.66, 0.28, 0.1, 0.06, 0.09, 0.62, 0.81, 0.76, 0.89, 0.54, 0.49, 0.73,
  0.39, 0.13, 0.08, 0.65, 0.86, 0.78, 0.69, 0.51, 0.31,
];

const TUNE_PRESETS: Record<
  TunePresetId,
  {
    label: string;
    lookName: string;
    exposure: string;
    contrast: string;
    saturation: string;
    sharpen: string;
    denoise: string;
    voiceEq: string;
    filterCss: string;
    summary: string;
  }
> = {
  auto: {
    label: 'Balanced Auto',
    lookName: 'Clean Daylight Master',
    exposure: '+10%',
    contrast: '114%',
    saturation: '112%',
    sharpen: '40%',
    denoise: 'On',
    voiceEq: 'On',
    filterCss: 'brightness(1.1) contrast(1.14) saturate(1.12)',
    summary: 'Lifts shadow detail, stabilizes speech loudness, and restores natural skin tones.',
  },
  cinematic: {
    label: 'Cinematic',
    lookName: 'Filmic Shadow Grade',
    exposure: '+4%',
    contrast: '124%',
    saturation: '108%',
    sharpen: '30%',
    denoise: 'On',
    voiceEq: 'Off',
    filterCss: 'brightness(1.04) contrast(1.24) saturate(1.08)',
    summary: 'Deepens midtone contrast with smooth 0.4s clip fades and clean shadow denoise.',
  },
  social: {
    label: 'Social Punch',
    lookName: 'High-Retention Crisp',
    exposure: '+12%',
    contrast: '122%',
    saturation: '128%',
    sharpen: '60%',
    denoise: 'Off',
    voiceEq: 'On',
    filterCss: 'brightness(1.12) contrast(1.22) saturate(1.28)',
    summary: 'Boosts color pop, edge clarity, and vocal presence for 9:16 Reels and Shorts.',
  },
  studio: {
    label: 'Clean Studio',
    lookName: 'Neutral Tutorial Clarity',
    exposure: '+14%',
    contrast: '112%',
    saturation: '104%',
    sharpen: '50%',
    denoise: 'On',
    voiceEq: 'On',
    filterCss: 'brightness(1.14) contrast(1.12) saturate(1.04)',
    summary: 'Bright neutral exposure with crisp text sharpening and 80Hz rumble removal.',
  },
  podcast: {
    label: 'Podcast',
    lookName: 'Vocal Broadcast Polish',
    exposure: '+9%',
    contrast: '110%',
    saturation: '106%',
    sharpen: '35%',
    denoise: 'On',
    voiceEq: 'On',
    filterCss: 'brightness(1.09) contrast(1.1) saturate(1.06)',
    summary: 'Pairs vocal EQ compression and dynamic normalization with silence jump-cut detection.',
  },
};

const SPEC_GROUPS = [
  {
    title: 'Cutting & Auto-Split',
    items: [
      'Auto-split by interval (15s, 30s, 45s, 60s, or custom)',
      'Split by equal part count or target file size (10 MB / 16 MB)',
      'Fixed-length sliding trim window & remove-middle stitch',
      'Silence jump-cut detection & visual scene-change detection',
      'YouTube chapter timestamp import (00:00 Intro format)',
      'Overlap padding, remainder policy, undo/redo history',
    ],
  },
  {
    title: 'Smart Auto-Tune',
    items: [
      'Samples 6 keyframes + audio loudness & quiet-ratio telemetry locally',
      '5 tuned style goals offline, plus optional BYOK OpenRouter & Gemini AI',
      'Auto-calibrates brightness, contrast, saturation, sharpen, denoise',
      'Auto-configures vocal EQ, loudness normalization & fade ramps',
      'One-click smart framing, split cadence & highlight clip queue',
      'Instant Before / After Original compare toggle in viewport',
    ],
  },
  {
    title: 'Framing, Overlays & Captions',
    items: [
      'Aspect presets: Original, 9:16, 1:1, 4:5, 16:9 with draggable crop',
      'Fit modes: Crop Fill, Blurred Backdrop, or Solid Color Backdrop',
      '90° rotation, horizontal flip, video fade-in/out & PNG frame snapshot',
      'Automatic Part 1/N clip stamp, text watermark & PNG/SVG logo',
      'Import .SRT / .VTT subtitles with live playback caption preview',
      'Burn-in captions or auto-slice re-timed .SRT files per clip in ZIP',
    ],
  },
  {
    title: 'Audio, Export & Offline PWA',
    items: [
      'Voice Clarity EQ (80Hz highpass, 13kHz lowpass, 3:1 compressor)',
      'Dynamic loudness normalize (dynaudnorm), gain & fade ramps',
      'Background music/voiceover track mixer with loop & volume control',
      'Playback speed (0.5x–2x), Reverse, and Boomerang loop export',
      'Lossless stream-copy MP4 or re-encoded MP4, WebM, GIF, MP3, WAV',
      'Batch ZIP delivery, Highlight Reel Merge & installable Android PWA',
    ],
  },
];

function formatDemoTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export const LandingShowcase: React.FC<LandingShowcaseProps> = ({
  theme,
  onToggleTheme,
  onLaunchStudio,
}) => {
  const [heroPlaying, setHeroPlaying] = useState(true);
  const [heroPreset, setHeroPreset] = useState<HeroCutPreset>('15s');
  const [playheadSec, setPlayheadSec] = useState(8.4);

  const [tunePreset, setTunePreset] = useState<TunePresetId>('auto');
  const [frameAspect, setFrameAspect] = useState<FrameAspectId>('9:16');
  const [frameFit, setFrameFit] = useState<FrameFitId>('blur');
  const [motionDemo, setMotionDemo] = useState<MotionDemoId>('1.5x');

  // Smooth live playhead animation for the Hero & Auto-Split studio screenshots
  useEffect(() => {
    if (!heroPlaying) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setPlayheadSec((prev) => {
        const next = prev + dt * 3.6;
        return next >= 60 ? 0 : next;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [heroPlaying]);

  // Auto-cycle framing aspect subtly if user hasn't locked one (every 5.5s)
  const [autoCycleFrame, setAutoCycleFrame] = useState(true);
  useEffect(() => {
    if (!autoCycleFrame) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const order: FrameAspectId[] = ['9:16', '1:1', '4:5', '16:9'];
    const id = window.setInterval(() => {
      setFrameAspect((curr) => order[(order.indexOf(curr) + 1) % order.length]);
    }, 4200);
    return () => window.clearInterval(id);
  }, [autoCycleFrame]);

  const heroSegments =
    heroPreset === '15s'
      ? [
          { id: '01', label: 'tokyo_cut_01', start: 0, end: 15 },
          { id: '02', label: 'tokyo_cut_02', start: 15, end: 30 },
          { id: '03', label: 'tokyo_cut_03', start: 30, end: 45 },
          { id: '04', label: 'tokyo_cut_04', start: 45, end: 60 },
        ]
      : heroPreset === '30s'
        ? [
            { id: '01', label: 'tokyo_part_01', start: 0, end: 30 },
            { id: '02', label: 'tokyo_part_02', start: 30, end: 60 },
          ]
        : [
            { id: '01', label: 'speech_01', start: 0, end: 11.5 },
            { id: '02', label: 'speech_02', start: 15.5, end: 27.0 },
            { id: '03', label: 'speech_03', start: 32.5, end: 46.5 },
            { id: '04', label: 'speech_04', start: 50.0, end: 60.0 },
          ];

  const activeHeroSeg =
    heroSegments.find((s) => playheadSec >= s.start && playheadSec <= s.end) ?? heroSegments[0];

  const activeTune = TUNE_PRESETS[tunePreset];

  const aspectBoxClass =
    frameAspect === '9:16'
      ? 'w-[172px] sm:w-[196px] aspect-[9/16]'
      : frameAspect === '1:1'
        ? 'w-[248px] sm:w-[276px] aspect-square'
        : frameAspect === '4:5'
          ? 'w-[216px] sm:w-[240px] aspect-[4/5]'
          : 'w-full max-w-[440px] aspect-[16/9]';

  return (
    <div className="min-h-screen w-full bg-body text-primary selection:bg-info/25">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-14 bg-surface/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-[1200px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            className="inline-flex items-center gap-2.5 text-[16px] font-display font-bold tracking-tight text-primary whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-info rounded-xs"
          >
            <span
              aria-hidden="true"
              className="w-7 h-7 rounded-sm bg-accent-bg text-on-accent flex items-center justify-center shrink-0"
            >
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                <rect x="2.5" y="4" width="6" height="12" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
                <rect x="11.5" y="4" width="6" height="12" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
                <line x1="10" y1="2" x2="10" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <span>Slicemark</span>
          </a>

          {/* Zone 2: 4 Concise Single-Line Nav Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-[14px] font-medium text-secondary"
          >
            <a href="#workflows" className="hover:text-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              Workflows
            </a>
            <a href="#auto-tune" className="hover:text-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              AI Auto-Tune
            </a>
            <a href="#framing" className="hover:text-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              Framing
            </a>
            <a href="#specs" className="hover:text-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
              Specifications
            </a>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onLaunchStudio}
              className="h-9 px-4 rounded-md bg-accent-bg text-on-accent text-[13px] font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2"
            >
              <span>Launch Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ==================== HERO SECTION ==================== */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-16 lg:pt-16 lg:pb-24">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-secondary mb-4">
              <span>Haho Studio</span>
              <span aria-hidden="true">·</span>
              <span>Local FFmpeg.wasm</span>
              <span aria-hidden="true">·</span>
              <span>Lossless MP4 &amp; Batch ZIP</span>
              <span aria-hidden="true">·</span>
              <span>Offline Android PWA</span>
            </div>

            <h1
              className="font-display font-bold tracking-tight text-primary leading-[1.08]"
              style={{ fontSize: 'clamp(2.25rem, 4.3vw, 3.75rem)', textWrap: 'balance' }}
            >
              Cut, auto-tune, and batch-export video locally in your browser.
            </h1>

            <p className="mt-5 text-[16px] sm:text-[17px] text-secondary leading-relaxed max-w-2xl">
              Slicemark slices long recordings into 15s, 30s, 45s, or 60s clips, excises silent
              pauses, balances exposure and vocal clarity with AI Auto-Tune, and exports lossless
              MP4s or ZIP packs without uploading a single megabyte of footage.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-5">
              <button
                type="button"
                onClick={onLaunchStudio}
                className="h-11 px-6 rounded-md bg-accent-bg text-on-accent text-[14px] font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2"
              >
                <span>Launch Slicemark Studio</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="#specs"
                className="inline-flex items-center gap-1.5 text-[14px] font-medium text-secondary hover:text-primary hover:underline underline-offset-4 transition-colors whitespace-nowrap"
              >
                <span>Explore complete capabilities</span>
              </a>
            </div>
          </div>

          {/* ANIMATED HERO STUDIO SCREENSHOT */}
          <div className="mt-12 rounded-xl bg-surface border border-border-strong overflow-hidden shadow-lg">
            {/* Mock Studio Window Header */}
            <div className="h-11 px-4 border-b border-border flex items-center justify-between gap-4 bg-surface">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[12px] font-semibold text-primary whitespace-nowrap">
                  Slicemark Studio
                </span>
                <span className="text-[12px] font-mono tabular-nums text-secondary truncate">
                  tokyo_golden_hour_4k.mp4 · 3840×2160 · 30 fps
                </span>
              </div>

              {/* Interactive Cut Preset Switcher directly inside screenshot */}
              <div className="flex items-center gap-1 p-0.5 rounded-md bg-body border border-border shrink-0">
                {(
                  [
                    { id: '15s', label: '15s Split' },
                    { id: '30s', label: '30s Split' },
                    { id: 'silence', label: 'Silence Cut' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setHeroPreset(item.id)}
                    className={`h-7 px-2.5 rounded-sm text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      heroPreset === item.id
                        ? 'bg-surface text-primary shadow-sm'
                        : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3-Column Studio Body */}
            <div className="grid grid-cols-1 lg:grid-cols-12 border-b border-border">
              {/* Left Inspector Summary */}
              <div className="hidden lg:flex lg:col-span-3 border-r border-border p-4 flex-col justify-between bg-surface">
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-body text-[11px] font-medium text-center">
                    <span className="py-1 rounded-sm bg-surface text-primary">Trim</span>
                    <span className="py-1 text-secondary">Tune</span>
                    <span className="py-1 text-secondary">Export</span>
                  </div>

                  <div>
                    <div className="text-[11px] text-secondary mb-1.5">Active Strategy</div>
                    <div className="text-[13px] font-medium text-primary">
                      {heroPreset === '15s'
                        ? 'Batch Split · 15s Clips'
                        : heroPreset === '30s'
                          ? 'Batch Split · 30s Clips'
                          : 'Smart Silence Jump-Cut'}
                    </div>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-border text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-secondary">Engine</span>
                      <span className="font-mono text-primary">Lossless Copy</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Output Clips</span>
                      <span className="font-mono tabular-nums text-primary">
                        {heroSegments.length} MP4s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Active Window</span>
                      <span className="font-mono tabular-nums text-primary">
                        {formatDemoTime(activeHeroSeg.start)}–{formatDemoTime(activeHeroSeg.end)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex items-center justify-between text-[11px] text-secondary">
                  <span>Zero server upload</span>
                  <span className="font-mono tabular-nums text-primary">100% local</span>
                </div>
              </div>

              {/* Center Live Video Viewport */}
              <div className="lg:col-span-6 bg-[#0a0a0b] p-4 flex flex-col justify-between">
                <div className="relative aspect-[16/9] w-full rounded-md overflow-hidden border border-white/10 bg-[#111113]">
                  <img
                    src={urbanStill}
                    alt="Slicemark live studio viewport showing golden hour Tokyo intersection footage"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {/* Measured contrast scrim at bottom */}
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />

                  {/* Part stamp preview */}
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-sm bg-black/75 border border-white/15 text-white text-[11px] font-medium">
                    Part {activeHeroSeg.id}/{heroSegments.length} · @hahostudio
                  </div>

                  {/* Live Playhead Timecode */}
                  <div className="absolute bottom-2.5 inset-x-3 flex items-center justify-between text-white">
                    <button
                      type="button"
                      onClick={() => setHeroPlaying((p) => !p)}
                      aria-label={heroPlaying ? 'Pause animated screenshot' : 'Play animated screenshot'}
                      className="h-7 px-2.5 rounded-sm bg-white/15 hover:bg-white/25 text-white text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {heroPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      <span>{heroPlaying ? 'Live Preview' : 'Paused'}</span>
                    </button>

                    <span className="font-mono tabular-nums text-[12px] text-white/95">
                      {formatDemoTime(playheadSec)} / 01:00.00
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Clip Queue */}
              <div className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-border p-4 bg-surface flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-[12px] mb-3">
                    <span className="font-medium text-primary">Clip Queue</span>
                    <span className="font-mono tabular-nums text-secondary">
                      {heroSegments.length} ready
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {heroSegments.map((seg) => {
                      const isActive = seg.id === activeHeroSeg.id;
                      return (
                        <button
                          key={seg.id}
                          type="button"
                          onClick={() => setPlayheadSec(seg.start + 0.2)}
                          className={`w-full px-2.5 py-2 rounded-md border text-left transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-neutral border-border-strong text-primary'
                              : 'bg-body border-border text-secondary hover:text-primary'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="font-medium truncate">{seg.label}.mp4</span>
                            <span className="font-mono tabular-nums text-[11px] shrink-0">
                              {(seg.end - seg.start).toFixed(1)}s
                            </span>
                          </div>
                          <div className="text-[10px] font-mono tabular-nums text-secondary mt-0.5">
                            {formatDemoTime(seg.start)} → {formatDemoTime(seg.end)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-secondary">
                  <span>Export Package</span>
                  <span className="font-mono text-primary">ZIP Archive</span>
                </div>
              </div>
            </div>

            {/* Animated Filmstrip + Waveform Timeline */}
            <div className="p-4 bg-body">
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-secondary mb-2">
                <span>00:00</span>
                <span>00:15</span>
                <span>00:30</span>
                <span>00:45</span>
                <span>01:00</span>
              </div>

              <div className="relative h-20 rounded-md bg-surface border border-border overflow-hidden">
                {/* Segment Blocks */}
                {heroSegments.map((seg) => {
                  const leftPct = (seg.start / 60) * 100;
                  const widthPct = ((seg.end - seg.start) / 60) * 100;
                  const isActive = seg.id === activeHeroSeg.id;
                  return (
                    <div
                      key={seg.id}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      className={`absolute inset-y-0 border-r border-border-strong transition-colors ${
                        isActive ? 'bg-info/14' : 'bg-neutral/35'
                      }`}
                    >
                      <span className="absolute top-1 left-1.5 text-[10px] font-mono tabular-nums text-secondary">
                        {seg.label}
                      </span>
                    </div>
                  );
                })}

                {/* Audio Waveform Bars */}
                <div className="absolute inset-x-0 bottom-2 h-11 px-1 flex items-end gap-[2px] pointer-events-none">
                  {WAVEFORM_BARS.map((amp, idx) => {
                    const barTime = (idx / WAVEFORM_BARS.length) * 60;
                    const inKeptSegment = heroSegments.some(
                      (s) => barTime >= s.start && barTime <= s.end
                    );
                    return (
                      <div
                        key={idx}
                        style={{
                          height: `${Math.max(10, Math.round(amp * 100))}%`,
                          animationDelay: `${(idx % 8) * 140}ms`,
                        }}
                        className={`flex-1 rounded-xs sm-animate-wave ${
                          inKeptSegment ? 'bg-info/65' : 'bg-border-strong/40 opacity-35'
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Animated Playhead Needle */}
                <div
                  style={{ transform: `translateX(${(playheadSec / 60) * 100}%)` }}
                  className="absolute inset-y-0 left-0 w-full pointer-events-none"
                >
                  <div className="w-[2px] h-full bg-info shadow-sm" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== 01. SMART CUTTING & AUTO-SPLIT ==================== */}
        <section id="workflows" className="border-t border-border">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 lg:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <div className="lg:col-span-5 space-y-4">
                <div className="text-[13px] font-medium text-secondary">01. Auto-Trim &amp; Smart Cutting</div>
                <h2 className="font-display text-[28px] sm:text-[34px] font-bold tracking-tight text-primary leading-tight">
                  Slice by duration, file size, silence, or scene cuts.
                </h2>
                <p className="text-[15px] text-secondary leading-relaxed">
                  Drop a 20-minute lecture, vlog, or gaming clip and split it cleanly in one pass.
                  Slicemark supports exact interval batching (15s, 30s, 45s, 60s+), equal-part
                  splits, WhatsApp 16 MB or Discord 10 MB size budgets, silence jump-cuts, visual
                  scene detection, and YouTube chapter imports.
                </p>
                <div className="pt-2 space-y-2 text-[14px] text-primary">
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span>Interval &amp; Fixed Trim Window</span>
                    <span className="font-mono tabular-nums text-[12px] text-secondary">15s / 30s / 45s / 60s+</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span>Max File Size Auto-Split</span>
                    <span className="font-mono tabular-nums text-[12px] text-secondary">10 MB Discord · 16 MB WhatsApp</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span>Silence &amp; Scene Detection</span>
                    <span className="font-mono tabular-nums text-[12px] text-secondary">Waveform + Luma Cut</span>
                  </div>
                </div>
              </div>

              {/* Animated Screenshot: Silence Jump-Cut + Chapter Breakdown */}
              <div className="lg:col-span-7 rounded-xl bg-surface border border-border-strong p-5 space-y-4">
                <div className="flex items-center justify-between gap-4 pb-3 border-b border-border">
                  <div>
                    <div className="text-[13px] font-semibold text-primary">
                      Silence Jump-Cut &amp; Smart Split Preview
                    </div>
                    <div className="text-[12px] text-secondary">
                      Low-amplitude pauses are automatically excluded before export
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-[12px] text-info shrink-0">
                    -24% dead air
                  </span>
                </div>

                {/* Animated Waveform with Excised Silence Regions */}
                <div className="relative h-28 rounded-md bg-body border border-border p-3 flex items-end gap-[3px] overflow-hidden">
                  {WAVEFORM_BARS.map((amp, i) => {
                    const isSilent = amp < 0.16;
                    return (
                      <div key={i} className="flex-1 h-full flex flex-col justify-end relative">
                        {isSilent && (
                          <div className="absolute inset-0 bg-error/12 border-x border-error/20" />
                        )}
                        <div
                          style={{
                            height: `${Math.max(8, Math.round(amp * 100))}%`,
                            animationDelay: `${(i % 10) * 110}ms`,
                          }}
                          className={`w-full rounded-xs sm-animate-wave ${
                            isSilent ? 'bg-error/50' : 'bg-info/75'
                          }`}
                        />
                      </div>
                    );
                  })}
                  {/* Animated Scan Playhead */}
                  <div
                    style={{ transform: `translateX(${(playheadSec / 60) * 100}%)` }}
                    className="absolute inset-y-0 left-0 w-full pointer-events-none"
                  >
                    <div className="w-[2px] h-full bg-primary/80" />
                  </div>
                </div>

                {/* Resulting Chapters / Segments Table */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12px]">
                  {[
                    { name: '01_hook_intro.mp4', range: '00:00.00 – 00:11.50', note: 'Kept · Active speech' },
                    { name: '02_core_demo.mp4', range: '00:15.50 – 00:27.00', note: 'Kept · Silence trimmed' },
                    { name: '03_key_takeaway.mp4', range: '00:32.50 – 00:46.50', note: 'Kept · Scene snap' },
                    { name: '04_outro_cta.mp4', range: '00:50.00 – 01:00.00', note: 'Kept · Fade out 0.4s' },
                  ].map((clip) => (
                    <div
                      key={clip.name}
                      className="px-3 py-2.5 rounded-md bg-body border border-border flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-primary truncate">{clip.name}</div>
                        <div className="text-[11px] text-secondary">{clip.note}</div>
                      </div>
                      <span className="font-mono tabular-nums text-[11px] text-secondary shrink-0">
                        {clip.range}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== 02. AI VIDEO AUTO-TUNE (ANIMATED BEFORE/AFTER WIPE) ==================== */}
        <section id="auto-tune" className="border-t border-border bg-surface/40">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 lg:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* Animated Before / After Wipe Screenshot */}
              <div className="lg:col-span-7 order-2 lg:order-1 rounded-xl bg-surface border border-border-strong overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-primary">
                    AI Auto-Tune · {activeTune.lookName}
                  </span>
                  <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-md bg-body border border-border">
                    {(Object.keys(TUNE_PRESETS) as TunePresetId[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTunePreset(key)}
                        className={`h-7 px-2.5 rounded-sm text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          tunePreset === key
                            ? 'bg-surface text-primary shadow-sm'
                            : 'text-secondary hover:text-primary'
                        }`}
                      >
                        {TUNE_PRESETS[key].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Animated Before/After Split Frame */}
                <div className="relative aspect-[16/9] w-full bg-[#0a0a0b] overflow-hidden select-none">
                  {/* Raw Original Base Layer */}
                  <img
                    src={creatorStill}
                    alt="Original ungraded studio creator footage before AI Auto-Tune"
                    referrerPolicy="no-referrer"
                    style={{ filter: 'brightness(0.86) contrast(0.9) saturate(0.76)' }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />

                  {/* AI-Tuned Layer with Continuous Wipe Curtain */}
                  <div className="absolute inset-0 sm-animate-wipe">
                    <img
                      src={creatorStill}
                      alt="AI Auto-Tuned studio creator footage with balanced exposure and clarity"
                      referrerPolicy="no-referrer"
                      style={{ filter: activeTune.filterCss }}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Animated Curtain Handle Line */}
                  <div className="absolute inset-0 pointer-events-none sm-animate-divider">
                    <div className="w-[2px] h-full bg-white shadow-md relative">
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-10 rounded-sm bg-black/80 border border-white/40 flex items-center justify-center text-white text-[10px] font-mono">
                        ↔
                      </div>
                    </div>
                  </div>

                  {/* Clean Viewport Labels */}
                  <span className="absolute top-3 left-3 px-2 py-1 rounded-xs bg-black/75 border border-white/15 text-white text-[11px] font-medium">
                    Auto-Tuned
                  </span>
                  <span className="absolute top-3 right-3 px-2 py-1 rounded-xs bg-black/75 border border-white/15 text-white/85 text-[11px] font-medium">
                    Original Raw
                  </span>
                </div>

                {/* Calibrated FFmpeg Parameters Readout */}
                <div className="p-4 border-t border-border space-y-3">
                  <p className="text-[12px] text-secondary">{activeTune.summary}</p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px]">
                    {[
                      { k: 'Exposure', v: activeTune.exposure },
                      { k: 'Contrast', v: activeTune.contrast },
                      { k: 'Saturation', v: activeTune.saturation },
                      { k: 'Unsharp', v: activeTune.sharpen },
                      { k: 'Denoise', v: activeTune.denoise },
                      { k: 'Voice EQ', v: activeTune.voiceEq },
                    ].map((stat) => (
                      <div
                        key={stat.k}
                        className="px-2.5 py-2 rounded-sm bg-body border border-border"
                      >
                        <div className="text-secondary text-[10px]">{stat.k}</div>
                        <div className="font-mono tabular-nums font-semibold text-primary mt-0.5">
                          {stat.v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 order-1 lg:order-2 space-y-4">
                <div className="text-[13px] font-medium text-secondary">
                  02. Smart Auto-Tune (Local + Optional BYOK AI)
                </div>
                <h2 className="font-display text-[28px] sm:text-[34px] font-bold tracking-tight text-primary leading-tight">
                  One-click color, sharpening, denoise, and vocal mastering.
                </h2>
                <p className="text-[15px] text-secondary leading-relaxed">
                  Slicemark samples 6 keyframes and audio loudness metrics locally in your browser
                  (with optional BYOK OpenRouter or Gemini AI) and calibrates real FFmpeg filters—
                  <code className="font-mono text-[13px] text-primary">eq</code>,{' '}
                  <code className="font-mono text-[13px] text-primary">unsharp</code>,{' '}
                  <code className="font-mono text-[13px] text-primary">hqdn3d</code>,{' '}
                  <code className="font-mono text-[13px] text-primary">acompressor</code>, and{' '}
                  <code className="font-mono text-[13px] text-primary">dynaudnorm</code>—alongside
                  suggested framing and highlight clips.
                </p>
                <p className="text-[14px] text-secondary leading-relaxed">
                  Toggle the built-in Compare Original button inside the viewport to verify every
                  adjustment before exporting, or fine-tune any slider manually.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== 03. FRAMING, BACKDROPS & SUBTITLES ==================== */}
        <section id="framing" className="border-t border-border">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 lg:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <div className="lg:col-span-5 space-y-4">
                <div className="text-[13px] font-medium text-secondary">
                  03. Social Framing, Overlays &amp; Captions
                </div>
                <h2 className="font-display text-[28px] sm:text-[34px] font-bold tracking-tight text-primary leading-tight">
                  Reframe widescreen video for Reels, Shorts, and Square feeds.
                </h2>
                <p className="text-[15px] text-secondary leading-relaxed">
                  Switch between 9:16, 1:1, 4:5, and 16:9 with a draggable crop reticle, a
                  synchronized blurred video backdrop, or a clean solid-color canvas. Stamp
                  automatic Part 1/N counters, brand watermarks, PNG logos, and burned-in SRT/VTT
                  captions on every clip in the batch.
                </p>

                {/* Interactive Framing Controls */}
                <div className="pt-2 space-y-3">
                  <div>
                    <div className="text-[12px] text-secondary mb-1.5">Aspect Ratio</div>
                    <div className="inline-flex items-center gap-1 p-1 rounded-md bg-surface border border-border">
                      {(['9:16', '1:1', '4:5', '16:9'] as const).map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => {
                            setAutoCycleFrame(false);
                            setFrameAspect(ratio);
                          }}
                          className={`h-8 px-3 rounded-sm text-[12px] font-mono tabular-nums font-medium transition-colors cursor-pointer ${
                            frameAspect === ratio
                              ? 'bg-accent-bg text-on-accent'
                              : 'text-secondary hover:text-primary'
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[12px] text-secondary mb-1.5">Fit Mode</div>
                    <div className="inline-flex items-center gap-1 p-1 rounded-md bg-surface border border-border">
                      {(
                        [
                          { id: 'blur', label: 'Blur Backdrop' },
                          { id: 'crop', label: 'Crop Fill' },
                          { id: 'solid', label: 'Solid Matte' },
                        ] as const
                      ).map((fit) => (
                        <button
                          key={fit.id}
                          type="button"
                          onClick={() => setFrameFit(fit.id)}
                          className={`h-8 px-3 rounded-sm text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                            frameFit === fit.id
                              ? 'bg-neutral text-primary'
                              : 'text-secondary hover:text-primary'
                          }`}
                        >
                          {fit.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Animated Framing Stage Screenshot */}
              <div className="lg:col-span-7 rounded-xl bg-surface border border-border-strong p-6 flex flex-col items-center justify-center min-h-[380px]">
                <div
                  className={`relative rounded-md overflow-hidden border border-border-strong bg-[#111113] transition-all duration-300 flex items-center justify-center ${aspectBoxClass}`}
                >
                  {frameFit === 'blur' && (
                    <img
                      src={urbanStill}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      style={{ filter: 'blur(18px) brightness(0.68)', transform: 'scale(1.18)' }}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}

                  <img
                    src={urbanStill}
                    alt={`Slicemark ${frameAspect} ${frameFit} framing preview`}
                    referrerPolicy="no-referrer"
                    className={`relative z-10 w-full h-full ${
                      frameFit === 'crop' ? 'object-cover' : 'object-contain'
                    }`}
                  />

                  {/* Live Part Stamp Overlay */}
                  <div className="absolute z-20 top-2.5 left-2.5 px-2 py-1 rounded-xs bg-black/75 border border-white/15 text-white text-[10px] font-medium leading-tight">
                    <div>Part 1/4</div>
                    <div className="text-white/75">@hahostudio</div>
                  </div>

                  {/* Live Burned-In Caption Preview */}
                  <div className="absolute z-20 bottom-3 inset-x-3 flex justify-center">
                    <div className="px-2.5 py-1 rounded-xs bg-black/80 text-white text-[11px] font-medium text-center">
                      “Golden hour cut exported cleanly at 1080p.”
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3 text-[12px] font-mono tabular-nums text-secondary">
                  <span>{frameAspect}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {frameFit === 'blur'
                      ? 'Boxblur Backdrop'
                      : frameFit === 'crop'
                        ? 'Center Crop Fill'
                        : 'Solid #111113 Matte'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Sliced .SRT included</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== 04. AUDIO, MOTION & EXPORT + ANDROID PWA ==================== */}
        <section className="border-t border-border bg-surface/40">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 lg:py-24 space-y-16">
            {/* Row A: Audio & Motion */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              <div className="lg:col-span-6 rounded-xl bg-surface border border-border-strong p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border">
                  <span className="text-[13px] font-semibold text-primary">
                    Audio Mastering &amp; Speed Control
                  </span>
                  <div className="flex items-center gap-1 p-0.5 rounded-md bg-body border border-border">
                    {(['normal', '1.5x', 'reverse', 'boomerang'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMotionDemo(m)}
                        className={`h-7 px-2.5 rounded-sm text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                          motionDemo === m
                            ? 'bg-surface text-primary shadow-sm'
                            : 'text-secondary hover:text-primary'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Primary Speech + Secondary Music Mix Tracks */}
                <div className="space-y-2.5">
                  <div className="p-3 rounded-md bg-body border border-border">
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <span className="font-medium text-primary">Primary Audio · Voice Clarity EQ + dynaudnorm</span>
                      <span className="font-mono tabular-nums text-info">115%</span>
                    </div>
                    <div className="h-10 flex items-center gap-[2px]">
                      {WAVEFORM_BARS.slice(0, 36).map((amp, i) => (
                        <div
                          key={i}
                          style={{
                            height: `${Math.max(18, Math.round(amp * 100))}%`,
                            animationDelay: `${(i % 6) * 160}ms`,
                          }}
                          className="flex-1 rounded-xs bg-info/70 sm-animate-wave"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="p-3 rounded-md bg-body border border-border">
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <span className="font-medium text-primary">Background Track · ambient_bed.mp3 (Loop)</span>
                      <span className="font-mono tabular-nums text-secondary">30%</span>
                    </div>
                    <div className="h-7 flex items-center gap-[2px]">
                      {WAVEFORM_BARS.slice(12, 48).map((amp, i) => (
                        <div
                          key={i}
                          style={{
                            height: `${Math.max(20, Math.round(amp * 55))}%`,
                            animationDelay: `${(i % 7) * 180}ms`,
                          }}
                          className="flex-1 rounded-xs bg-border-strong sm-animate-wave"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[12px] pt-1 text-secondary">
                  <span>
                    Active Mode:{' '}
                    <strong className="font-medium text-primary capitalize">{motionDemo}</strong>
                  </span>
                  <span className="font-mono tabular-nums">
                    {motionDemo === '1.5x'
                      ? 'atempo=1.50 · setpts=0.6667*PTS'
                      : motionDemo === 'reverse'
                        ? 'reverse · areverse'
                        : motionDemo === 'boomerang'
                          ? 'split + reverse + concat'
                          : '1.00x · fade in/out 0.3s'}
                  </span>
                </div>
              </div>

              <div className="lg:col-span-6 space-y-4">
                <div className="text-[13px] font-medium text-secondary">04. Audio, Speed &amp; Motion</div>
                <h2 className="font-display text-[28px] sm:text-[34px] font-bold tracking-tight text-primary leading-tight">
                  Broadcast-ready dialogue and creative playback motion.
                </h2>
                <p className="text-[15px] text-secondary leading-relaxed">
                  Clean up low-end microphone rumble with Voice Clarity EQ, even out volume dips
                  with dynamic normalization, mix in a looping background track, or shift clip speed
                  from 0.5x slow-motion up to 2x—including full Reverse and Boomerang exports.
                </p>
              </div>
            </div>

            {/* Row B: Multi-Format Export + Android Offline PWA */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center pt-12 border-t border-border">
              <div className="lg:col-span-5 space-y-4">
                <div className="text-[13px] font-medium text-secondary">
                  05. Multi-Format Export &amp; Android Offline PWA
                </div>
                <h2 className="font-display text-[28px] sm:text-[34px] font-bold tracking-tight text-primary leading-tight">
                  Export MP4, WebM, GIF, or audio—desktop or Android offline.
                </h2>
                <p className="text-[15px] text-secondary leading-relaxed">
                  Render lossless stream-copy MP4s in seconds, merge selected segments into a single
                  highlight reel with fade dips, or bundle clips, sliced SRT captions, and cover JPGs
                  into one ZIP archive. Install Slicemark directly onto Android home screens with
                  cached FFmpeg.wasm for full offline editing.
                </p>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-12 gap-5 items-stretch">
                {/* Export Progress Animated Screenshot */}
                <div className="sm:col-span-7 rounded-xl bg-surface border border-border-strong p-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-semibold text-primary">Batch Export Engine</span>
                      <span className="font-mono tabular-nums text-[11px] text-secondary">
                        FFmpeg.wasm
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-secondary">Packaging 4 clips + .srt + cover.jpg</span>
                        <span className="font-mono tabular-nums text-primary">ZIP</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-body overflow-hidden border border-border">
                        <div className="h-full w-full bg-info sm-animate-progress" />
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 text-[12px] font-mono tabular-nums">
                      <div className="flex justify-between py-1.5 border-b border-border">
                        <span className="text-primary">clip_01.mp4</span>
                        <span className="text-secondary">1080p · 4.2 MB</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-border">
                        <span className="text-primary">clip_01.srt</span>
                        <span className="text-secondary">Re-timed captions</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-border">
                        <span className="text-primary">clip_01_cover.jpg</span>
                        <span className="text-secondary">Poster frame</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-primary">Formats</span>
                        <span className="text-secondary">MP4 · WebM · GIF · MP3 · WAV</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[12px] text-secondary">
                    <span className="inline-flex items-center gap-1.5 text-primary font-medium">
                      <Download className="w-3.5 h-3.5" />
                      slicemark_4_clips.zip
                    </span>
                    <span className="font-mono">Offline Ready</span>
                  </div>
                </div>

                {/* Android Mobile PWA Frame */}
                <div className="sm:col-span-5 rounded-xl bg-surface border border-border-strong p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between px-1 pb-2 text-[11px]">
                    <span className="font-semibold text-primary">Slicemark Mobile</span>
                    <span className="font-mono text-secondary">Android PWA</span>
                  </div>

                  <div className="relative aspect-[16/10] rounded-md overflow-hidden bg-[#0a0a0b] border border-border">
                    <img
                      src={creatorStill}
                      alt="Slicemark Android PWA mobile editor preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-xs bg-black/75 text-white font-mono tabular-nums text-[9px]">
                      00:15.00
                    </span>
                  </div>

                  <div className="my-2.5 p-2 rounded-md bg-body border border-border">
                    <div className="text-[10px] text-secondary mb-1">Slide-up Sheet · AI Auto-Tune</div>
                    <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                      <div className="h-full w-3/4 bg-info" />
                    </div>
                  </div>

                  {/* Mobile Bottom Tool Dock Mirror */}
                  <div className="grid grid-cols-5 gap-1 pt-2 border-t border-border text-[9px] text-center font-medium text-secondary">
                    <span className="py-1 rounded-xs bg-neutral text-primary">Trim</span>
                    <span className="py-1">Tune</span>
                    <span className="py-1">Frame</span>
                    <span className="py-1">Audio</span>
                    <span className="py-1">Clips</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== COMPLETE SPECIFICATIONS MATRIX ==================== */}
        <section id="specs" className="border-t border-border">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 lg:py-24">
            <div className="max-w-2xl mb-12">
              <div className="text-[13px] font-medium text-secondary mb-2">Complete Feature Set</div>
              <h2 className="font-display text-[28px] sm:text-[34px] font-bold tracking-tight text-primary">
                Everything shipped in Slicemark.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
              {SPEC_GROUPS.map((group) => (
                <div key={group.title} className="border-t border-border-strong pt-5">
                  <h3 className="text-[16px] font-semibold text-primary mb-3.5">{group.title}</h3>
                  <ul className="space-y-2.5 text-[14px] text-secondary">
                    {group.items.map((item) => (
                      <li key={item} className="leading-snug flex items-start gap-2.5">
                        <span className="text-info mt-0.5 shrink-0" aria-hidden="true">
                          —
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== FINAL CTA BAND ==================== */}
        <section className="border-t border-border bg-surface/50">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 lg:py-20 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="text-[13px] font-medium text-secondary">Zero uploads · Runs in your browser</div>
              <h2 className="font-display text-[28px] sm:text-[34px] font-bold tracking-tight text-primary leading-tight">
                Start cutting locally in your browser.
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-4 shrink-0">
              <button
                type="button"
                onClick={onLaunchStudio}
                className="h-11 px-6 rounded-md bg-accent-bg text-on-accent text-[14px] font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2"
              >
                <span>Launch Slicemark Studio</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-border bg-surface">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[13px] text-secondary">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-primary">Slicemark</span>
            <span aria-hidden="true">·</span>
            <span>Haho Studio</span>
            <span aria-hidden="true">·</span>
            <span>Local Browser Video Studio</span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <a
              href="https://github.com/hystericmoon/slicemark"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              GitHub
            </a>
            <button
              type="button"
              onClick={onLaunchStudio}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Open Editor
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-1.5 hover:text-primary transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
