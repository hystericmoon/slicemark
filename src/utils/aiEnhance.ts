import { AIEnhancePlan, EnhanceGoal, MediaSource } from '../types/editor';

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

/**
 * Samples evenly spaced keyframes from the loaded video at 384px max width (JPEG 0.72)
 * for fast multimodal Gemini analysis.
 */
export async function sampleVideoKeyframes(
  videoUrl: string,
  duration: number,
  count = 6
): Promise<SampledKeyframe[]> {
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
      reject(new Error('Could not decode video frames for AI analysis.'));
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
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for frame sampling.');
  }

  const frames: SampledKeyframe[] = [];
  for (let i = 0; i < safeCount; i++) {
    const ratio = safeCount === 1 ? 0.5 : 0.08 + (i / (safeCount - 1)) * 0.84;
    const t = Number(Math.max(0, Math.min(Math.max(0, duration - 0.1), duration * ratio)).toFixed(2));
    await seekVideoTo(video, t);
    ctx.drawImage(video, 0, 0, targetW, targetH);
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

  return frames;
}

export async function requestAIVideoEnhance(params: {
  source: MediaSource;
  audioPeaks: number[];
  goal: EnhanceGoal;
  customPrompt?: string;
  onStep?: (label: string) => void;
}): Promise<AIEnhancePlan> {
  const { source, audioPeaks, goal, customPrompt, onStep } = params;

  onStep?.('Sampling keyframes & audio levels...');
  const frames = await sampleVideoKeyframes(source.url, source.duration, 6);
  const audioStats = computeAudioStats(audioPeaks, source.hasAudio);

  onStep?.('Analyzing footage & tuning parameters...');
  const response = await fetch('/api/enhance-video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: source.name,
      duration: source.duration,
      width: source.width,
      height: source.height,
      fps: source.fps,
      goal,
      customPrompt: customPrompt?.trim() || '',
      audioStats,
      frames,
    }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errMsg =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `AI Auto-Tune request failed (HTTP ${response.status}).`;
    throw new Error(errMsg);
  }

  return payload as AIEnhancePlan;
}
