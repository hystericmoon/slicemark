import {
  AIEnhancePlan,
  AISuggestedClip,
  AspectPreset,
  EnhanceGoal,
  EnhanceProviderConfig,
  FitMode,
  MediaSource,
} from '../types/editor';

export interface SampledKeyframe {
  timeSeconds: number;
  dataBase64: string;
  mimeType: 'image/jpeg';
}

export interface ClientAudioStats {
  hasAudio: boolean;
  avgLevel: number;
  peakLevel: number;
  quietRatio: number;
  dynamicRange: number;
}

export interface VisualTelemetry {
  avgLuma: number;     // 0..1
  p05Luma: number;     // 0..1
  p95Luma: number;     // 0..1
  avgSat: number;      // 0..1
  sharpness: number;   // 0..1 (edge gradient energy)
  shadowNoise: number; // 0..1 (high-frequency variation in dark pixels)
}

const VALID_ASPECTS = new Set<AspectPreset>(['original', '9:16', '1:1', '4:5', '16:9']);
const VALID_FIT_MODES = new Set<FitMode>(['crop', 'blur', 'solid']);

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

/**
 * Computes concise audio loudness & silence telemetry from extracted waveform peaks.
 */
export function computeAudioStats(audioPeaks: number[], hasAudio: boolean): ClientAudioStats {
  if (!hasAudio || audioPeaks.length === 0) {
    return {
      hasAudio,
      avgLevel: 0,
      peakLevel: 0,
      quietRatio: 0,
      dynamicRange: 0,
    };
  }

  let sum = 0;
  let peak = 0;
  let minNonZero = 1;
  let quietCount = 0;

  for (let i = 0; i < audioPeaks.length; i++) {
    const v = Math.max(0, Math.min(1, audioPeaks[i]));
    sum += v;
    if (v > peak) peak = v;
    if (v > 0.02 && v < minNonZero) minNonZero = v;
    if (v < 0.14) quietCount++;
  }

  const avgLevel = sum / audioPeaks.length;
  const quietRatio = quietCount / audioPeaks.length;
  const dynamicRange = Math.max(0, peak - (minNonZero === 1 ? 0 : minNonZero));

  return {
    hasAudio: true,
    avgLevel: Number(avgLevel.toFixed(3)),
    peakLevel: Number(peak.toFixed(3)),
    quietRatio: Number(quietRatio.toFixed(3)),
    dynamicRange: Number(dynamicRange.toFixed(3)),
  };
}

function seekVideoTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', done);
      resolve();
    };
    const timer = window.setTimeout(done, 1800);
    video.addEventListener(
      'seeked',
      () => {
        window.clearTimeout(timer);
        done();
      },
      { once: true }
    );
    video.addEventListener(
      'error',
      () => {
        window.clearTimeout(timer);
        done();
      },
      { once: true }
    );
    try {
      video.currentTime = timeSec;
    } catch {
      window.clearTimeout(timer);
      done();
    }
  });
}

function analyzeFramePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number
): {
  avgLuma: number;
  p05Luma: number;
  p95Luma: number;
  avgSat: number;
  sharpness: number;
  shadowNoise: number;
} {
  const pixelCount = width * height;
  if (pixelCount === 0) {
    return { avgLuma: 0.45, p05Luma: 0.1, p95Luma: 0.85, avgSat: 0.35, sharpness: 0.5, shadowNoise: 0.1 };
  }

  const hist = new Uint32Array(256);
  const lumaBuf = new Float32Array(pixelCount);
  let lumaSum = 0;
  let satSum = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaBuf[p] = luma;
    lumaSum += luma;
    const bin = Math.min(255, Math.max(0, Math.round(luma * 255)));
    hist[bin]++;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0.001 ? (maxC - minC) / maxC : 0;
    satSum += sat;
  }

  let acc = 0;
  let p05Luma = 0;
  let p95Luma = 1;
  let foundP05 = false;
  const target05 = pixelCount * 0.05;
  const target95 = pixelCount * 0.95;

  for (let b = 0; b < 256; b++) {
    acc += hist[b];
    if (!foundP05 && acc >= target05) {
      p05Luma = b / 255;
      foundP05 = true;
    }
    if (acc >= target95) {
      p95Luma = b / 255;
      break;
    }
  }

  let edgeSum = 0;
  let edgeSamples = 0;
  let shadowDiffSum = 0;
  let shadowCount = 0;

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = y * width + x;
      const c = lumaBuf[idx];
      const dx = Math.abs(lumaBuf[idx + 1] - lumaBuf[idx - 1]);
      const dy = Math.abs(lumaBuf[idx + width] - lumaBuf[idx - width]);
      const grad = (dx + dy) * 0.5;
      edgeSum += grad;
      edgeSamples++;
      if (c < 0.24 && grad > 0.015 && grad < 0.14) {
        shadowDiffSum += grad;
        shadowCount++;
      }
    }
  }

  const avgEdge = edgeSamples > 0 ? edgeSum / edgeSamples : 0.04;
  const sharpness = Math.min(1, avgEdge / 0.12);
  const shadowNoise = shadowCount > 12 ? Math.min(1, (shadowDiffSum / shadowCount) / 0.08) : 0.05;

  return {
    avgLuma: lumaSum / pixelCount,
    p05Luma,
    p95Luma,
    avgSat: satSum / pixelCount,
    sharpness,
    shadowNoise,
  };
}

/**
 * Samples evenly spaced keyframes from the loaded video at 384px max width (JPEG 0.72)
 * and computes real pixel-level visual telemetry in a single pass.
 */
export async function sampleVideoKeyframes(
  videoUrl: string,
  duration: number,
  count = 6
): Promise<{ frames: SampledKeyframe[]; visualStats: VisualTelemetry }> {
  const safeCount = Math.max(1, Math.min(6, duration < 4 ? 3 : count));
  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not decode video frames for analysis.'));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, 4000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });

  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 360;
  const targetW = Math.min(384, vw);
  const targetH = Math.max(2, Math.round((vh / Math.max(1, vw)) * targetW));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for frame sampling.');
  }

  const frames: SampledKeyframe[] = [];
  let sumLuma = 0;
  let sumP05 = 0;
  let sumP95 = 0;
  let sumSat = 0;
  let sumSharp = 0;
  let sumNoise = 0;

  for (let i = 0; i < safeCount; i++) {
    const ratio = safeCount === 1 ? 0.5 : 0.08 + (i / (safeCount - 1)) * 0.84;
    const t = Number(Math.max(0, Math.min(Math.max(0, duration - 0.1), duration * ratio)).toFixed(2));
    await seekVideoTo(video, t);
    ctx.drawImage(video, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const metrics = analyzeFramePixels(imgData.data, targetW, targetH);
    sumLuma += metrics.avgLuma;
    sumP05 += metrics.p05Luma;
    sumP95 += metrics.p95Luma;
    sumSat += metrics.avgSat;
    sumSharp += metrics.sharpness;
    sumNoise += metrics.shadowNoise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    const commaIdx = dataUrl.indexOf(',');
    const dataBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
    if (dataBase64) {
      frames.push({
        timeSeconds: t,
        dataBase64,
        mimeType: 'image/jpeg',
      });
    }
  }

  video.src = '';
  video.load();

  if (frames.length === 0) {
    throw new Error('Failed to capture keyframes from the video.');
  }

  const n = frames.length;
  return {
    frames,
    visualStats: {
      avgLuma: Number((sumLuma / n).toFixed(3)),
      p05Luma: Number((sumP05 / n).toFixed(3)),
      p95Luma: Number((sumP95 / n).toFixed(3)),
      avgSat: Number((sumSat / n).toFixed(3)),
      sharpness: Number((sumSharp / n).toFixed(3)),
      shadowNoise: Number((sumNoise / n).toFixed(3)),
    },
  };
}

function findLocalHighlightClips(
  audioPeaks: number[],
  duration: number
): AISuggestedClip[] {
  if (duration <= 4) {
    return [
      {
        label: 'Full Clip',
        startTime: 0,
        endTime: roundTo(duration, 2),
        reason: 'Short video kept intact as a single highlight.',
      },
    ];
  }

  const targetLen = Math.min(duration, Math.max(6, Math.min(18, duration * 0.28)));
  const maxClips = duration >= 30 ? 3 : duration >= 14 ? 2 : 1;

  if (audioPeaks.length < 6) {
    const clips: AISuggestedClip[] = [];
    for (let i = 0; i < maxClips; i++) {
      const start = roundTo((i / maxClips) * Math.max(0, duration - targetLen), 2);
      const end = roundTo(Math.min(duration, start + targetLen), 2);
      clips.push({
        label: `Highlight ${String(i + 1).padStart(2, '0')}`,
        startTime: start,
        endTime: end,
        reason: 'Evenly spaced highlight window.',
      });
    }
    return clips;
  }

  const secPerBucket = duration / audioPeaks.length;
  const winBuckets = Math.max(2, Math.round(targetLen / secPerBucket));
  const scored: Array<{ startIdx: number; score: number }> = [];

  for (let i = 0; i <= audioPeaks.length - winBuckets; i += Math.max(1, Math.floor(winBuckets / 3))) {
    let sum = 0;
    let peak = 0;
    for (let j = 0; j < winBuckets; j++) {
      const v = audioPeaks[i + j];
      sum += v;
      if (v > peak) peak = v;
    }
    const avg = sum / winBuckets;
    scored.push({ startIdx: i, score: avg * 0.7 + peak * 0.3 });
  }

  scored.sort((a, b) => b.score - a.score);

  const chosen: AISuggestedClip[] = [];
  for (const cand of scored) {
    if (chosen.length >= maxClips) break;
    const startTime = roundTo(cand.startIdx * secPerBucket, 2);
    const endTime = roundTo(Math.min(duration, startTime + targetLen), 2);
    const overlaps = chosen.some(
      (c) => Math.min(endTime, c.endTime) - Math.max(startTime, c.startTime) > targetLen * 0.35
    );
    if (!overlaps && endTime - startTime >= 2) {
      chosen.push({
        label: `Peak Moment ${String(chosen.length + 1).padStart(2, '0')}`,
        startTime,
        endTime,
        reason: 'High audio energy & active pacing detected in waveform.',
      });
    }
  }

  chosen.sort((a, b) => a.startTime - b.startTime);
  return chosen;
}

/**
 * 100% local pixel & audio Auto-Tune engine. Zero API calls, works offline.
 */
function runLocalSmartEnhance(
  source: MediaSource,
  audioPeaks: number[],
  goal: EnhanceGoal,
  visual: VisualTelemetry,
  audioStats: ClientAudioStats
): AIEnhancePlan {
  // Base exposure correction targeting ~0.46 balanced mid-luma
  let brightness = clampNum((0.46 - visual.avgLuma) * 0.38, -0.14, 0.16, 0);
  // Dynamic range contrast adjustment
  const lumaSpread = Math.max(0.08, visual.p95Luma - visual.p05Luma);
  let contrast = clampNum(1 + (0.68 - lumaSpread) * 0.35, 0.92, 1.24, 1);
  // Saturation adjustment toward balanced 0.36
  let saturation = clampNum(1 + (0.36 - visual.avgSat) * 0.45, 0.88, 1.28, 1);
  // Sharpening based on measured edge gradient
  let sharpen = clampNum((0.62 - visual.sharpness) * 0.7, 0.1, 0.55, 0.25);
  let denoise = visual.shadowNoise > 0.36 || visual.avgLuma < 0.24;
  let videoFadeIn = 0;
  let videoFadeOut = 0;

  let volume = 1.0;
  let normalize = false;
  let voiceEnhance = false;
  let fadeIn = 0;
  let fadeOut = 0;

  if (audioStats.hasAudio) {
    normalize = audioStats.avgLevel < 0.32 || audioStats.dynamicRange > 0.45;
    volume = audioStats.avgLevel < 0.22 ? 1.22 : audioStats.avgLevel < 0.32 ? 1.1 : 1.0;
    voiceEnhance = goal === 'podcast' || goal === 'clean-studio' || goal === 'social-punch' || audioStats.quietRatio > 0.18;
  }

  let visualStyleName = 'Balanced Auto Master';
  if (goal === 'cinematic') {
    visualStyleName = 'Filmic Shadow Grade';
    brightness = clampNum(brightness - 0.02, -0.18, 0.16, 0);
    contrast = clampNum(contrast + 0.1, 0.95, 1.34, 1.15);
    saturation = clampNum(saturation + 0.04, 0.85, 1.3, 1.06);
    sharpen = clampNum(sharpen * 0.85, 0.1, 0.5, 0.25);
    videoFadeIn = 0.4;
    videoFadeOut = 0.4;
    fadeIn = audioStats.hasAudio ? 0.3 : 0;
    fadeOut = audioStats.hasAudio ? 0.4 : 0;
  } else if (goal === 'social-punch') {
    visualStyleName = 'High-Retention Crisp';
    brightness = clampNum(brightness + 0.03, -0.14, 0.18, 0.04);
    contrast = clampNum(contrast + 0.1, 0.95, 1.35, 1.16);
    saturation = clampNum(saturation + 0.14, 0.92, 1.42, 1.2);
    sharpen = clampNum(sharpen + 0.18, 0.25, 0.72, 0.48);
    if (audioStats.hasAudio) {
      normalize = true;
      voiceEnhance = true;
      volume = Math.max(volume, 1.15);
    }
  } else if (goal === 'clean-studio') {
    visualStyleName = 'Neutral Studio Clarity';
    brightness = clampNum(brightness + 0.04, -0.1, 0.2, 0.05);
    contrast = clampNum(contrast + 0.04, 0.92, 1.25, 1.08);
    saturation = clampNum(saturation, 0.9, 1.18, 1.03);
    sharpen = clampNum(sharpen + 0.15, 0.22, 0.65, 0.42);
    if (audioStats.hasAudio) {
      normalize = true;
      voiceEnhance = true;
    }
  } else if (goal === 'podcast') {
    visualStyleName = 'Vocal Broadcast Polish';
    brightness = clampNum(brightness + 0.03, -0.12, 0.18, 0.04);
    contrast = clampNum(contrast + 0.03, 0.92, 1.22, 1.06);
    saturation = clampNum(saturation, 0.92, 1.18, 1.04);
    sharpen = clampNum(sharpen, 0.15, 0.48, 0.3);
    if (audioStats.hasAudio) {
      normalize = true;
      voiceEnhance = true;
      volume = Math.max(volume, 1.18);
    }
  }

  const isLandscape = source.width >= source.height;
  const recommendedAspect: AspectPreset =
    goal === 'social-punch' && isLandscape ? '9:16' : 'original';
  const recommendedFitMode: FitMode =
    recommendedAspect === '9:16' && isLandscape ? 'blur' : 'crop';

  const recommendedIntervalSeconds =
    goal === 'social-punch'
      ? source.duration >= 45
        ? 30
        : 15
      : source.duration >= 90
        ? 45
        : source.duration >= 40
          ? 30
          : 15;

  const suggestRemoveSilence = audioStats.hasAudio && audioStats.quietRatio >= 0.22;

  const exposureDesc =
    visual.avgLuma < 0.32
      ? 'underexposed shadows lifted'
      : visual.avgLuma > 0.68
        ? 'bright highlights tamed'
        : 'balanced midtone exposure';
  const contrastDesc =
    lumaSpread < 0.45 ? 'expanded flat tonal range' : 'preserved natural contrast';

  const notes: string[] = [
    `Measured ${Math.round(visual.avgLuma * 100)}% avg brightness — ${exposureDesc} and ${contrastDesc}.`,
    denoise
      ? `Detected shadow grain (${Math.round(visual.shadowNoise * 100)}%) — enabled hqdn3d denoise + ${Math.round(sharpen * 100)}% sharpen.`
      : `Clean shadow detail — applied ${Math.round(sharpen * 100)}% edge sharpening without denoise overhead.`,
    audioStats.hasAudio
      ? `Audio avg ${Math.round(audioStats.avgLevel * 100)}% (${Math.round(audioStats.quietRatio * 100)}% quiet) — ${voiceEnhance ? 'Vocal EQ + ' : ''}${normalize ? 'loudness normalize' : 'neutral gain'} configured.`
      : 'No audio track detected — skipped audio mastering.',
  ];

  return {
    engineLabel: 'Local Engine',
    visualStyleName,
    summary: `Calibrated locally from ${framesSummaryLabel(visual)} and ${audioStats.hasAudio ? 'waveform telemetry' : 'visual contrast'} for ${goal.replace('-', ' ')}.`,
    notes,
    color: {
      brightness: roundTo(brightness, 2),
      contrast: roundTo(contrast, 2),
      saturation: roundTo(saturation, 2),
      sharpen: roundTo(sharpen, 2),
      denoise,
      videoFadeIn: roundTo(videoFadeIn, 1),
      videoFadeOut: roundTo(videoFadeOut, 1),
    },
    audio: audioStats.hasAudio
      ? {
          volume: roundTo(volume, 2),
          normalize,
          voiceEnhance,
          fadeIn: roundTo(fadeIn, 1),
          fadeOut: roundTo(fadeOut, 1),
        }
      : {
          volume: 1,
          normalize: false,
          voiceEnhance: false,
          fadeIn: 0,
          fadeOut: 0,
        },
    framing: {
      recommendedAspect,
      recommendedFitMode,
      reason:
        recommendedAspect === '9:16'
          ? 'Reframes widescreen footage into 9:16 vertical with a blurred backdrop for Reels & Shorts.'
          : 'Preserves native framing cleanly.',
    },
    pacing: {
      recommendedIntervalSeconds,
      suggestRemoveSilence,
      reason: suggestRemoveSilence
        ? `${Math.round(audioStats.quietRatio * 100)}% quiet segments detected — jump-cut silence removal will tighten pacing.`
        : `Matches ${Math.round(source.duration)}s runtime with ${recommendedIntervalSeconds}s clips.`,
    },
    suggestedClips: findLocalHighlightClips(audioPeaks, source.duration),
  };
}

function framesSummaryLabel(visual: VisualTelemetry): string {
  if (visual.avgLuma < 0.32) return 'low-light keyframes';
  if (visual.avgLuma > 0.68) return 'high-key keyframes';
  return '6 sampled keyframes';
}

function buildLlmPromptText(
  source: MediaSource,
  frames: SampledKeyframe[],
  audioStats: ClientAudioStats,
  goal: EnhanceGoal,
  customPrompt?: string
): string {
  const goalDescriptions: Record<EnhanceGoal, string> = {
    auto: 'Balanced Auto-Tune: fix exposure, contrast, clarity, and vocal loudness while keeping skin tones and colors natural.',
    cinematic: 'Cinematic Polish: subtle filmic contrast, rich controlled saturation, gentle fades, clean denoise if shadows are noisy, balanced audio.',
    'social-punch': 'Social Punch (Reels/Shorts/TikTok): vibrant colors, crisp sharpness, punchy contrast, loud clear voice, vertical 9:16 framing when suitable, snappy 15s-30s clip pacing.',
    'clean-studio': 'Clean Studio / Tutorial: bright neutral clarity, crisp text/detail sharpening, light denoise, vocal clarity EQ + loudness normalization.',
    podcast: 'Talking Head / Podcast: natural flattering exposure, light denoise, strong vocal clarity EQ + compressor + loudness normalization, silence jump-cut suggestion if quietRatio > 0.22.',
  };

  const frameList = frames.map((f, i) => `Frame ${i + 1} at ${f.timeSeconds.toFixed(1)}s`).join(', ');

  return [
    'You are an expert colorist, finishing editor, and audio mastering engineer inside Slicemark.',
    'Analyze the attached chronological video keyframes and audio telemetry to produce a precise, tasteful, FFmpeg-ready auto-tune plan.',
    '',
    `Target Style Goal: ${goalDescriptions[goal]}`,
    customPrompt?.trim() ? `User Custom Direction: "${customPrompt.trim()}"` : 'User Custom Direction: None',
    '',
    'Video Telemetry:',
    `- File: ${source.name}`,
    `- Resolution: ${source.width}x${source.height} @ ${source.fps}fps`,
    `- Duration: ${source.duration.toFixed(2)}s`,
    `- Sampled Keyframes: ${frameList}`,
    `- Audio Track: ${audioStats.hasAudio ? 'Present' : 'No audio stream detected'}`,
    audioStats.hasAudio
      ? `- Audio Levels (0..1): avg=${audioStats.avgLevel.toFixed(2)}, peak=${audioStats.peakLevel.toFixed(2)}, quietRatio=${audioStats.quietRatio.toFixed(2)}, dynamicRange=${audioStats.dynamicRange.toFixed(2)}`
      : '- Audio Levels: N/A (leave volume=1.0, normalize=false, voiceEnhance=false)',
    '',
    'Return ONLY a single valid JSON object (no markdown fences) with this exact shape:',
    '{',
    '  "visualStyleName": "2-4 word name",',
    '  "summary": "one concise sentence",',
    '  "notes": ["3-4 short notes covering lighting, sharpness/noise, audio, framing"],',
    '  "color": { "brightness": -0.22..0.22, "contrast": 0.85..1.38, "saturation": 0.8..1.45, "sharpen": 0..0.85, "denoise": boolean, "videoFadeIn": 0..1.5, "videoFadeOut": 0..1.5 },',
    '  "audio": { "volume": 0.6..1.6, "normalize": boolean, "voiceEnhance": boolean, "fadeIn": 0..1.5, "fadeOut": 0..1.5 },',
    '  "framing": { "recommendedAspect": "original"|"9:16"|"1:1"|"4:5"|"16:9", "recommendedFitMode": "crop"|"blur"|"solid", "reason": "short reason" },',
    '  "pacing": { "recommendedIntervalSeconds": 15|30|45|60, "suggestRemoveSilence": boolean, "reason": "short reason" },',
    '  "suggestedClips": [{ "label": "short name", "startTime": number, "endTime": number, "reason": "short reason" }]',
    '}',
  ].join('\n');
}

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = unfenced.indexOf('{');
  const lastBrace = unfenced.lastIndexOf('}');
  const jsonCandidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? unfenced.slice(firstBrace, lastBrace + 1)
      : unfenced;

  const parsed = JSON.parse(jsonCandidate) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model returned unexpected JSON structure.');
  }
  return parsed as Record<string, unknown>;
}

function sanitizeEnhancePlan(
  raw: Record<string, unknown>,
  source: MediaSource,
  audioStats: ClientAudioStats,
  engineLabel: string
): AIEnhancePlan {
  const colorRaw = (raw.color && typeof raw.color === 'object' ? raw.color : {}) as Record<string, unknown>;
  const audioRaw = (raw.audio && typeof raw.audio === 'object' ? raw.audio : {}) as Record<string, unknown>;
  const framingRaw = (raw.framing && typeof raw.framing === 'object' ? raw.framing : {}) as Record<string, unknown>;
  const pacingRaw = (raw.pacing && typeof raw.pacing === 'object' ? raw.pacing : {}) as Record<string, unknown>;

  const recommendedAspect =
    typeof framingRaw.recommendedAspect === 'string' &&
    VALID_ASPECTS.has(framingRaw.recommendedAspect as AspectPreset)
      ? (framingRaw.recommendedAspect as AspectPreset)
      : 'original';

  const recommendedFitMode =
    typeof framingRaw.recommendedFitMode === 'string' &&
    VALID_FIT_MODES.has(framingRaw.recommendedFitMode as FitMode)
      ? (framingRaw.recommendedFitMode as FitMode)
      : 'crop';

  const rawNotes = Array.isArray(raw.notes)
    ? raw.notes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).slice(0, 5)
    : [];

  const rawClips = Array.isArray(raw.suggestedClips) ? raw.suggestedClips : [];
  const suggestedClips: AISuggestedClip[] = [];
  for (let i = 0; i < Math.min(4, rawClips.length); i++) {
    const item = rawClips[i];
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const startTime = roundTo(clampNum(Number(c.startTime), 0, Math.max(0, source.duration - 0.5), 0), 2);
    const minEnd = Math.min(source.duration, startTime + Math.min(2, source.duration));
    const endTime = roundTo(clampNum(Number(c.endTime), minEnd, source.duration, source.duration), 2);
    if (endTime - startTime < 0.5) continue;
    suggestedClips.push({
      label:
        typeof c.label === 'string' && c.label.trim()
          ? c.label.trim().slice(0, 48)
          : `highlight_${String(i + 1).padStart(2, '0')}`,
      startTime,
      endTime,
      reason:
        typeof c.reason === 'string' && c.reason.trim()
          ? c.reason.trim().slice(0, 140)
          : 'Recommended highlight window',
    });
  }

  return {
    engineLabel,
    visualStyleName:
      typeof raw.visualStyleName === 'string' && raw.visualStyleName.trim()
        ? raw.visualStyleName.trim().slice(0, 60)
        : 'Auto-Tuned Master',
    summary:
      typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim().slice(0, 260)
        : 'Balanced exposure, contrast, sharpness, and vocal clarity across the footage.',
    notes: rawNotes.length > 0 ? rawNotes : ['Calibrated tone curve and clarity for clean playback.'],
    color: {
      brightness: roundTo(clampNum(colorRaw.brightness, -0.3, 0.3, 0), 2),
      contrast: roundTo(clampNum(colorRaw.contrast, 0.5, 1.8, 1), 2),
      saturation: roundTo(clampNum(colorRaw.saturation, 0, 2, 1), 2),
      sharpen: roundTo(clampNum(colorRaw.sharpen, 0, 1, 0), 2),
      denoise: Boolean(colorRaw.denoise),
      videoFadeIn: roundTo(clampNum(colorRaw.videoFadeIn, 0, 2, 0), 1),
      videoFadeOut: roundTo(clampNum(colorRaw.videoFadeOut, 0, 2, 0), 1),
    },
    audio: audioStats.hasAudio
      ? {
          volume: roundTo(clampNum(audioRaw.volume, 0.5, 1.8, 1), 2),
          normalize: Boolean(audioRaw.normalize),
          voiceEnhance: Boolean(audioRaw.voiceEnhance),
          fadeIn: roundTo(clampNum(audioRaw.fadeIn, 0, 2, 0), 1),
          fadeOut: roundTo(clampNum(audioRaw.fadeOut, 0, 2, 0), 1),
        }
      : {
          volume: 1,
          normalize: false,
          voiceEnhance: false,
          fadeIn: 0,
          fadeOut: 0,
        },
    framing: {
      recommendedAspect,
      recommendedFitMode,
      reason:
        typeof framingRaw.reason === 'string' && framingRaw.reason.trim()
          ? framingRaw.reason.trim().slice(0, 180)
          : 'Preserves native composition cleanly.',
    },
    pacing: {
      recommendedIntervalSeconds: Math.round(
        clampNum(pacingRaw.recommendedIntervalSeconds, 5, Math.max(15, Math.ceil(source.duration)), 15)
      ),
      suggestRemoveSilence: Boolean(pacingRaw.suggestRemoveSilence) && audioStats.hasAudio,
      reason:
        typeof pacingRaw.reason === 'string' && pacingRaw.reason.trim()
          ? pacingRaw.reason.trim().slice(0, 180)
          : 'Matches natural visual pacing.',
    },
    suggestedClips,
  };
}

export interface ModelPresetOption {
  id: string;
  label: string;
}

export const GEMINI_MODEL_PRESETS: ModelPresetOption[] = [
  { id: 'auto', label: 'Auto (Best -> Fast fallback)' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro · Best quality' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash · Free & fast' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite · Fastest' },
];

export const OPENROUTER_MODEL_PRESETS: ModelPresetOption[] = [
  { id: 'auto', label: 'Auto (Best Free -> Fallback)' },
  { id: 'openrouter/free', label: 'OpenRouter Free Auto · Free' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash · Fast' },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4 · Best quality' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini · Balanced' },
];

class ProviderCallError extends Error {
  readonly isAuthError: boolean;
  readonly status?: number;

  constructor(message: string, options: { isAuthError: boolean; status?: number }) {
    super(message);
    this.name = 'ProviderCallError';
    this.isAuthError = options.isAuthError;
    this.status = options.status;
  }
}

function dedupeModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const trimmed = m.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function getGeminiFallbackChain(selectedModel: string): string[] {
  const trimmed = selectedModel.trim();
  if (!trimmed || trimmed === 'auto') {
    return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  }
  return dedupeModels([trimmed, 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
}

function getOpenRouterFallbackChain(selectedModel: string): string[] {
  const trimmed = selectedModel.trim();
  if (!trimmed || trimmed === 'auto') {
    return [
      'openrouter/free',
      'google/gemma-3-27b-it:free',
      'qwen/qwen2.5-vl-72b-instruct:free',
    ];
  }
  return dedupeModels([trimmed, 'openrouter/free']);
}

async function callOpenRouterModel(params: {
  source: MediaSource;
  frames: SampledKeyframe[];
  audioStats: ClientAudioStats;
  goal: EnhanceGoal;
  customPrompt?: string;
  apiKey: string;
  model: string;
  isFallback: boolean;
}): Promise<AIEnhancePlan> {
  const { source, frames, audioStats, goal, customPrompt, apiKey, model, isFallback } = params;
  const promptText = buildLlmPromptText(source, frames, audioStats, goal, customPrompt);

  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: promptText }];

  for (const frame of frames) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${frame.mimeType};base64,${frame.dataBase64}` },
    });
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://slicemark.vercel.app',
      'X-Title': 'Slicemark',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      temperature: 0.2,
    }),
  });

  const payload = await response.json().catch(() => null) as {
    model?: string;
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ProviderCallError(
        'OpenRouter rejected your API key. Check your key at openrouter.ai/keys.',
        { isAuthError: true, status: response.status }
      );
    }
    if (response.status === 429) {
      throw new ProviderCallError(
        'OpenRouter free-tier rate limit reached.',
        { isAuthError: false, status: response.status }
      );
    }
    if (response.status === 402) {
      throw new ProviderCallError(
        'Selected OpenRouter model requires credits.',
        { isAuthError: false, status: response.status }
      );
    }
    throw new ProviderCallError(
      payload?.error?.message || `OpenRouter request failed (HTTP ${response.status}).`,
      { isAuthError: false, status: response.status }
    );
  }

  const rawText = payload?.choices?.[0]?.message?.content;
  if (!rawText || !rawText.trim()) {
    throw new ProviderCallError('OpenRouter returned an empty response.', { isAuthError: false });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJsonObject(rawText);
  } catch {
    throw new ProviderCallError('OpenRouter returned invalid JSON.', { isAuthError: false });
  }

  const resolvedModel =
    typeof payload?.model === 'string' && payload.model.trim() ? payload.model.trim() : model;
  const label = `OpenRouter · ${resolvedModel}${isFallback ? ' (Fallback)' : ''}`;
  return sanitizeEnhancePlan(parsed, source, audioStats, label);
}

async function callGeminiModel(params: {
  source: MediaSource;
  frames: SampledKeyframe[];
  audioStats: ClientAudioStats;
  goal: EnhanceGoal;
  customPrompt?: string;
  apiKey: string;
  model: string;
  isFallback: boolean;
}): Promise<AIEnhancePlan> {
  const { source, frames, audioStats, goal, customPrompt, apiKey, model, isFallback } = params;
  const promptText = buildLlmPromptText(source, frames, audioStats, goal, customPrompt);

  const parts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  > = [{ text: promptText }];

  for (const frame of frames) {
    parts.push({
      inline_data: {
        mime_type: frame.mimeType,
        data: frame.dataBase64,
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  const payload = await response.json().catch(() => null) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } | null;

  if (!response.ok) {
    const errMsg = payload?.error?.message || '';
    const isBadKey =
      response.status === 401 ||
      response.status === 403 ||
      (response.status === 400 && /api[_ ]?key|API_KEY_INVALID/i.test(errMsg));

    if (isBadKey) {
      throw new ProviderCallError(
        errMsg || 'Gemini API key was rejected. Check your key at aistudio.google.com.',
        { isAuthError: true, status: response.status }
      );
    }
    if (response.status === 429) {
      throw new ProviderCallError(
        'Gemini rate limit reached.',
        { isAuthError: false, status: response.status }
      );
    }
    throw new ProviderCallError(
      errMsg || `Gemini request failed (HTTP ${response.status}).`,
      { isAuthError: false, status: response.status }
    );
  }

  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText || !rawText.trim()) {
    throw new ProviderCallError('Gemini returned an empty response.', { isAuthError: false });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJsonObject(rawText);
  } catch {
    throw new ProviderCallError('Gemini returned invalid JSON.', { isAuthError: false });
  }

  const label = `Gemini · ${model}${isFallback ? ' (Fallback)' : ''}`;
  return sanitizeEnhancePlan(parsed, source, audioStats, label);
}

export async function requestAIVideoEnhance(params: {
  source: MediaSource;
  audioPeaks: number[];
  goal: EnhanceGoal;
  customPrompt?: string;
  providerConfig: EnhanceProviderConfig;
  onStep?: (label: string) => void;
}): Promise<AIEnhancePlan> {
  const { source, audioPeaks, goal, customPrompt, providerConfig, onStep } = params;

  onStep?.('Sampling keyframes & pixel telemetry...');
  const { frames, visualStats } = await sampleVideoKeyframes(source.url, source.duration, 6);
  const audioStats = computeAudioStats(audioPeaks, source.hasAudio);

  if (providerConfig.provider === 'local') {
    onStep?.('Calibrating color & audio locally...');
    return runLocalSmartEnhance(source, audioPeaks, goal, visualStats, audioStats);
  }

  const isOpenRouter = providerConfig.provider === 'openrouter';
  const apiKey = (isOpenRouter ? providerConfig.openRouterApiKey : providerConfig.geminiApiKey).trim();

  if (!apiKey) {
    throw new Error(
      isOpenRouter
        ? 'Paste your OpenRouter API key (or switch to Local Engine for $0 offline use).'
        : 'Paste your Gemini API key (or switch to Local Engine for $0 offline use).'
    );
  }

  const chain = isOpenRouter
    ? getOpenRouterFallbackChain(providerConfig.openRouterModel)
    : getGeminiFallbackChain(providerConfig.geminiModel);

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const isFallback = i > 0;
    onStep?.(
      isFallback
        ? `Model busy — falling back to ${model}...`
        : isOpenRouter
          ? 'Analyzing keyframes with OpenRouter...'
          : 'Analyzing keyframes with Gemini...'
    );

    try {
      if (isOpenRouter) {
        return await callOpenRouterModel({
          source,
          frames,
          audioStats,
          goal,
          customPrompt,
          apiKey,
          model,
          isFallback,
        });
      }
      return await callGeminiModel({
        source,
        frames,
        audioStats,
        goal,
        customPrompt,
        apiKey,
        model,
        isFallback,
      });
    } catch (err) {
      if (err instanceof ProviderCallError && err.isAuthError) {
        throw err;
      }
      // Recoverable error: continue to next fallback model in chain
    }
  }

  onStep?.('Cloud models busy — using Local Engine fallback...');
  const localFallback = runLocalSmartEnhance(source, audioPeaks, goal, visualStats, audioStats);
  return {
    ...localFallback,
    engineLabel: 'Local Engine (Fallback)',
    notes: [
      'Cloud model was busy or unavailable — completed with Local Engine fallback.',
      ...localFallback.notes,
    ],
  };
}
