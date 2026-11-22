import { ClipSegment } from '../types/editor';
import { nextSegmentId } from './segmentGenerator';
import { clamp } from './timecode';

/**
 * Finds the quietest audio timestamp within +/- searchWindowSec of targetTime
 * so 15s/30s/45s/60s cuts snap cleanly between sentences or beats.
 */
export function findNearestSilenceBoundary(
  audioPeaks: number[],
  duration: number,
  targetTime: number,
  silenceThreshold = 0.16,
  searchWindowSec = 3.0
): number {
  if (audioPeaks.length === 0 || duration <= 0) {
    return targetTime;
  }

  const secPerBucket = duration / audioPeaks.length;
  const startBucket = Math.max(
    0,
    Math.floor((targetTime - searchWindowSec) / secPerBucket)
  );
  const endBucket = Math.min(
    audioPeaks.length - 1,
    Math.ceil((targetTime + searchWindowSec) / secPerBucket)
  );

  let bestBucket = Math.round(clamp(targetTime / secPerBucket, 0, audioPeaks.length - 1));
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = startBucket; i <= endBucket; i++) {
    // 3-bucket smoothed amplitude to ignore single-sample dips
    const prev = audioPeaks[Math.max(0, i - 1)];
    const curr = audioPeaks[i];
    const next = audioPeaks[Math.min(audioPeaks.length - 1, i + 1)];
    const avg = (prev + curr + next) / 3;

    const bucketTime = (i + 0.5) * secPerBucket;
    const distPenalty = Math.abs(bucketTime - targetTime) * 0.035;
    const score = avg + distPenalty;

    if (avg <= silenceThreshold && score < bestScore) {
      bestScore = score;
      bestBucket = i;
    }
  }

  // If no bucket was strictly below threshold, pick the quietest valley in the window
  if (!Number.isFinite(bestScore)) {
    let minVal = Number.POSITIVE_INFINITY;
    for (let i = startBucket; i <= endBucket; i++) {
      if (audioPeaks[i] < minVal) {
        minVal = audioPeaks[i];
        bestBucket = i;
      }
    }
  }

  return Number(clamp((bestBucket + 0.5) * secPerBucket, 0.5, duration - 0.5).toFixed(2));
}

/**
 * Detects non-silent active speech/sound segments for Auto-Remove Silence (jump cuts).
 */
export function detectActiveSpeechSegments(
  audioPeaks: number[],
  duration: number,
  silenceThreshold = 0.16,
  minSilenceDuration = 0.6,
  baseName = 'clip'
): ClipSegment[] {
  const cleanBase = baseName.replace(/\.[^/.]+$/, '').slice(0, 24) || 'clip';

  if (audioPeaks.length === 0 || duration <= 0.5) {
    return [
      {
        id: nextSegmentId(),
        label: `${cleanBase}_01`,
        startTime: 0,
        endTime: Number(duration.toFixed(2)),
        selected: true,
      },
    ];
  }

  const secPerBucket = duration / audioPeaks.length;
  const minSilentBuckets = Math.max(1, Math.round(minSilenceDuration / secPerBucket));
  const paddingSec = 0.12;

  // Identify silent runs of length >= minSilentBuckets
  const isSilentBucket = audioPeaks.map((p) => p < silenceThreshold);
  const silentMask = new Array<boolean>(audioPeaks.length).fill(false);

  let runStart = -1;
  for (let i = 0; i <= isSilentBucket.length; i++) {
    const silent = i < isSilentBucket.length && isSilentBucket[i];
    if (silent && runStart === -1) {
      runStart = i;
    } else if (!silent && runStart !== -1) {
      if (i - runStart >= minSilentBuckets) {
        for (let j = runStart; j < i; j++) silentMask[j] = true;
      }
      runStart = -1;
    }
  }

  // Convert non-silent spans into segments
  const rawRanges: Array<{ start: number; end: number }> = [];
  let segStart = -1;
  for (let i = 0; i <= silentMask.length; i++) {
    const active = i < silentMask.length && !silentMask[i];
    if (active && segStart === -1) {
      segStart = i;
    } else if (!active && segStart !== -1) {
      const s = clamp(segStart * secPerBucket - paddingSec, 0, duration);
      const e = clamp(i * secPerBucket + paddingSec, 0, duration);
      if (e - s >= 0.4) {
        if (rawRanges.length > 0 && s <= rawRanges[rawRanges.length - 1].end + 0.15) {
          rawRanges[rawRanges.length - 1].end = e;
        } else {
          rawRanges.push({ start: s, end: e });
        }
      }
      segStart = -1;
    }
  }

  if (rawRanges.length === 0) {
    return [
      {
        id: nextSegmentId(),
        label: `${cleanBase}_01`,
        startTime: 0,
        endTime: Number(duration.toFixed(2)),
        selected: true,
      },
    ];
  }

  return rawRanges.map((r, idx) => ({
    id: nextSegmentId(),
    label: `${cleanBase}_speech_${String(idx + 1).padStart(2, '0')}`,
    startTime: Number(r.start.toFixed(2)),
    endTime: Number(r.end.toFixed(2)),
    selected: true,
  }));
}

/**
 * Rapidly samples video frames onto an offscreen 64x36 canvas and detects visual scene cuts
 * by computing mean absolute RGB pixel difference between consecutive samples.
 */
export async function detectSceneChanges(
  videoUrl: string,
  duration: number,
  sensitivity = 0.22,
  onProgress?: (pct: number) => void
): Promise<number[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const w = 64;
    const h = 36;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Sample every ~0.5s to 1.0s (capped at ~120 samples for ~1.5s execution speed)
    const sampleCount = Math.min(120, Math.max(12, Math.ceil(duration * 1.2)));
    const times: number[] = [];
    for (let i = 0; i < sampleCount; i++) {
      times.push(Number(((i / sampleCount) * Math.max(0.2, duration - 0.1) + 0.05).toFixed(2)));
    }

    let idx = 0;
    let prevPixels: Uint8ClampedArray | null = null;
    const cutPoints: number[] = [];
    const minCutGap = 2.0;

    const finish = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      onProgress?.(100);
      resolve(cutPoints);
    };

    const seekNext = () => {
      if (idx >= times.length) {
        finish();
        return;
      }
      video.currentTime = times[idx];
    };

    video.onseeked = () => {
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        if (prevPixels) {
          let totalDiff = 0;
          const pixelCount = w * h;
          for (let p = 0; p < data.length; p += 4) {
            totalDiff +=
              (Math.abs(data[p] - prevPixels[p]) +
                Math.abs(data[p + 1] - prevPixels[p + 1]) +
                Math.abs(data[p + 2] - prevPixels[p + 2])) /
              (3 * 255);
          }
          const avgDiff = totalDiff / pixelCount;
          const t = times[idx];
          const lastCut = cutPoints.length > 0 ? cutPoints[cutPoints.length - 1] : 0;
          if (avgDiff >= sensitivity && t - lastCut >= minCutGap && duration - t >= 1.0) {
            cutPoints.push(t);
          }
        }
        prevPixels = new Uint8ClampedArray(data);
      }

      idx += 1;
      onProgress?.(Math.round((idx / times.length) * 100));
      seekNext();
    };

    video.onloadeddata = () => seekNext();
    video.onerror = () => finish();
  });
}
