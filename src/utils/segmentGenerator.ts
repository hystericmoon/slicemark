import {
  AspectPreset,
  ClipSegment,
  CropRect,
  RemainderPolicy,
  SplitStrategy,
} from '../types/editor';
import { findNearestSilenceBoundary } from './smartAnalysis';
import { clamp } from './timecode';

export const AUTO_TRIM_PRESETS = [15, 30, 45, 60, 90, 120] as const;
export const SPLIT_COUNT_PRESETS = [2, 3, 4, 5, 6] as const;
export const MAX_SIZE_PRESETS_MB = [10, 16, 25, 50] as const;

let segmentCounter = 1;
export function nextSegmentId(): string {
  segmentCounter += 1;
  return `seg_${Date.now().toString(36)}_${segmentCounter}`;
}

export interface BatchSplitOptions {
  duration: number;
  fileSizeBytes: number;
  strategy: SplitStrategy;
  intervalSeconds: number;
  splitCount: number;
  maxSizeMB: number;
  overlapSeconds: number;
  remainderPolicy: RemainderPolicy;
  snapToSilence: boolean;
  silenceThreshold: number;
  audioPeaks: number[];
  baseName: string;
  minTailSeconds?: number;
}

/**
 * Generates sequential clips via Interval (15/30/45/60s+), Equal N-Parts, or Max File Size,
 * optionally snapping boundaries to silence valleys and adding pre-roll overlap.
 */
export function generateSmartBatchSegments(opts: BatchSplitOptions): ClipSegment[] {
  const {
    duration,
    fileSizeBytes,
    strategy,
    intervalSeconds,
    splitCount,
    maxSizeMB,
    overlapSeconds,
    remainderPolicy,
    snapToSilence,
    silenceThreshold,
    audioPeaks,
    baseName,
    minTailSeconds = 4,
  } = opts;

  const safeDuration = Math.max(0.5, duration);
  const cleanBase = baseName.replace(/\.[^/.]+$/, '').slice(0, 26) || 'clip';

  let step = Math.max(1, intervalSeconds);

  if (strategy === 'count') {
    const n = Math.max(1, Math.min(60, Math.round(splitCount)));
    step = safeDuration / n;
  } else if (strategy === 'max-size') {
    const targetBytes = Math.max(1, maxSizeMB) * 1024 * 1024 * 0.92;
    const bytesPerSec = Math.max(1, fileSizeBytes) / safeDuration;
    step = clamp(targetBytes / bytesPerSec, 2, safeDuration);
  }

  if (safeDuration <= step + 0.05 && strategy !== 'count') {
    return [
      {
        id: nextSegmentId(),
        label: `${cleanBase}_01`,
        startTime: 0,
        endTime: Number(safeDuration.toFixed(2)),
        selected: true,
      },
    ];
  }

  // First compute exact cut boundaries
  const boundaries: number[] = [0];
  if (strategy === 'count') {
    const n = Math.max(1, Math.min(60, Math.round(splitCount)));
    for (let i = 1; i < n; i++) {
      let cut = (safeDuration * i) / n;
      if (snapToSilence && audioPeaks.length > 0) {
        cut = findNearestSilenceBoundary(audioPeaks, safeDuration, cut, silenceThreshold, 2.5);
      }
      if (cut > boundaries[boundaries.length - 1] + 0.5 && cut < safeDuration - 0.5) {
        boundaries.push(Number(cut.toFixed(2)));
      }
    }
    boundaries.push(Number(safeDuration.toFixed(2)));
  } else {
    let cursor = 0;
    while (cursor < safeDuration - 0.05) {
      let nextCut = Math.min(cursor + step, safeDuration);
      if (
        snapToSilence &&
        audioPeaks.length > 0 &&
        nextCut < safeDuration - 1.0
      ) {
        const snapped = findNearestSilenceBoundary(
          audioPeaks,
          safeDuration,
          nextCut,
          silenceThreshold,
          Math.min(3.0, step * 0.25)
        );
        if (snapped > cursor + 1.0 && snapped < safeDuration - 0.4) {
          nextCut = snapped;
        }
      }
      boundaries.push(Number(nextCut.toFixed(2)));
      cursor = nextCut;
    }
  }

  const rawRanges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    rawRanges.push({ start: boundaries[i], end: boundaries[i + 1] });
  }

  // Apply remainder handling for interval / max-size splits
  if (strategy !== 'count' && rawRanges.length > 1) {
    const last = rawRanges[rawRanges.length - 1];
    const lastLen = last.end - last.start;
    if (lastLen < step - 0.05) {
      if (remainderPolicy === 'drop-short' && lastLen < Math.min(minTailSeconds, step * 0.5)) {
        rawRanges.pop();
      } else if (remainderPolicy === 'merge-last') {
        rawRanges.pop();
        rawRanges[rawRanges.length - 1].end = Number(safeDuration.toFixed(2));
      }
    }
  }

  // Apply optional clip overlap (pre-roll on clips after the first)
  const safeOverlap = clamp(overlapSeconds, 0, Math.max(0, step * 0.4));

  return rawRanges.map((range, idx) => {
    const start = idx > 0 ? Math.max(0, range.start - safeOverlap) : range.start;
    const end = range.end;
    return {
      id: nextSegmentId(),
      label: `${cleanBase}_${String(idx + 1).padStart(2, '0')}_${Math.round(end - start)}s`,
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      selected: true,
    };
  });
}

/**
 * Convenience wrapper for default batch splitting on initial video load.
 */
export function generateBatchSplitSegments(
  duration: number,
  intervalSeconds: number,
  remainderPolicy: RemainderPolicy,
  baseName: string,
  minTailSeconds = 4
): ClipSegment[] {
  return generateSmartBatchSegments({
    duration,
    fileSizeBytes: 0,
    strategy: 'interval',
    intervalSeconds,
    splitCount: 4,
    maxSizeMB: 10,
    overlapSeconds: 0,
    remainderPolicy,
    snapToSilence: false,
    silenceThreshold: 0.16,
    audioPeaks: [],
    baseName,
    minTailSeconds,
  });
}

/**
 * Converts detected scene-change timestamps into contiguous named clips.
 */
export function generateSegmentsFromCutPoints(
  duration: number,
  cutPoints: number[],
  baseName: string
): ClipSegment[] {
  const cleanBase = baseName.replace(/\.[^/.]+$/, '').slice(0, 24) || 'scene';
  const sorted = [0, ...cutPoints.filter((t) => t > 0.4 && t < duration - 0.4).sort((a, b) => a - b), duration];
  const segments: ClipSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end - start >= 0.4) {
      segments.push({
        id: nextSegmentId(),
        label: `${cleanBase}_scene_${String(segments.length + 1).padStart(2, '0')}`,
        startTime: Number(start.toFixed(2)),
        endTime: Number(end.toFixed(2)),
        selected: true,
      });
    }
  }
  return segments;
}

/**
 * Generates a single target-length window snapped to intervalSeconds around anchorTime.
 */
export function generateFixedWindowSegment(
  duration: number,
  intervalSeconds: number,
  anchorTime: number,
  baseName: string
): ClipSegment {
  const safeDuration = Math.max(0.5, duration);
  const windowLen = Math.min(Math.max(1, intervalSeconds), safeDuration);
  const maxStart = Math.max(0, safeDuration - windowLen);
  const start = clamp(anchorTime, 0, maxStart);
  const end = Math.min(safeDuration, start + windowLen);
  const cleanBase = baseName.replace(/\.[^/.]+$/, '').slice(0, 26) || 'clip';

  return {
    id: nextSegmentId(),
    label: `${cleanBase}_${Math.round(end - start)}s_trim`,
    startTime: Number(start.toFixed(2)),
    endTime: Number(end.toFixed(2)),
    selected: true,
  };
}

/**
 * Splits whichever segment contains `splitTime` into two contiguous clips.
 */
export function splitSegmentsAtTime(
  segments: ClipSegment[],
  splitTime: number,
  minSegmentLen = 0.5
): { segments: ClipSegment[]; newActiveId: string | null } {
  const idx = segments.findIndex(
    (s) => splitTime > s.startTime + minSegmentLen && splitTime < s.endTime - minSegmentLen
  );
  if (idx === -1) {
    return { segments, newActiveId: null };
  }

  const target = segments[idx];
  const cut = Number(splitTime.toFixed(2));
  const left: ClipSegment = {
    ...target,
    endTime: cut,
  };
  const rightId = nextSegmentId();
  const right: ClipSegment = {
    id: rightId,
    label: `${target.label}_part2`,
    startTime: cut,
    endTime: target.endTime,
    selected: target.selected,
  };

  const next = [...segments];
  next.splice(idx, 1, left, right);
  return { segments: next, newActiveId: rightId };
}

/**
 * Computes effective rotated dimensions of a video source.
 */
export function getRotatedDimensions(
  width: number,
  height: number,
  rotation: 0 | 90 | 180 | 270
): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width };
  }
  return { width, height };
}

export function getPresetAspectRatio(preset: AspectPreset, fallback: number): number {
  switch (preset) {
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '1:1':
      return 1;
    case '4:5':
      return 4 / 5;
    default:
      return fallback;
  }
}

/**
 * Computes a centered normalized CropRect (0..1) for a target aspect preset.
 */
export function computeCropRectForAspect(
  sourceWidth: number,
  sourceHeight: number,
  rotation: 0 | 90 | 180 | 270,
  preset: AspectPreset
): CropRect {
  if (preset === 'original' || sourceWidth <= 0 || sourceHeight <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const { width: rotW, height: rotH } = getRotatedDimensions(sourceWidth, sourceHeight, rotation);
  const currentRatio = rotW / rotH;
  const targetRatio = getPresetAspectRatio(preset, currentRatio);

  let normW = 1;
  let normH = 1;

  if (targetRatio < currentRatio) {
    normW = targetRatio / currentRatio;
    normH = 1;
  } else {
    normW = 1;
    normH = currentRatio / targetRatio;
  }

  return {
    x: Number(((1 - normW) / 2).toFixed(4)),
    y: Number(((1 - normH) / 2).toFixed(4)),
    width: Number(normW.toFixed(4)),
    height: Number(normH.toFixed(4)),
  };
}

/**
 * Computes exact even pixel output dimensions after rotation, crop/fitMode, and optional target height scaling.
 */
export function computeOutputResolution(
  sourceWidth: number,
  sourceHeight: number,
  rotation: 0 | 90 | 180 | 270,
  crop: CropRect,
  aspectPreset: AspectPreset = 'original',
  fitMode: 'crop' | 'blur' | 'solid' = 'crop',
  maxHeight?: number
): { width: number; height: number; x: number; y: number } {
  const { width: rotW, height: rotH } = getRotatedDimensions(sourceWidth, sourceHeight, rotation);

  let rawW: number;
  let rawH: number;
  let x = 0;
  let y = 0;

  if (aspectPreset !== 'original' && fitMode !== 'crop') {
    const targetRatio = getPresetAspectRatio(aspectPreset, rotW / Math.max(1, rotH));
    // Preserve high resolution when fitting inside blur/solid backdrop
    const longest = Math.max(rotW, rotH);
    if (targetRatio >= 1) {
      rawW = longest;
      rawH = Math.round(longest / targetRatio);
    } else {
      rawH = longest;
      rawW = Math.round(longest * targetRatio);
    }
  } else {
    rawW = Math.max(16, Math.round(rotW * crop.width));
    rawH = Math.max(16, Math.round(rotH * crop.height));
    x = clamp(Math.round(rotW * crop.x), 0, Math.max(0, rotW - rawW));
    y = clamp(Math.round(rotH * crop.y), 0, Math.max(0, rotH - rawH));
  }

  if (maxHeight && rawH > maxHeight) {
    const scale = maxHeight / rawH;
    rawH = maxHeight;
    rawW = Math.round(rawW * scale);
  }

  let evenW = Math.max(16, rawW - (rawW % 2));
  let evenH = Math.max(16, rawH - (rawH % 2));
  if (aspectPreset === 'original' || fitMode === 'crop') {
    const maxW = Math.max(16, rotW - (rotW % 2));
    const maxHBound = Math.max(16, rotH - (rotH % 2));
    if (!maxHeight) {
      evenW = Math.min(evenW, maxW);
      evenH = Math.min(evenH, maxHBound);
    }
    x = clamp(x, 0, Math.max(0, rotW - evenW));
    y = clamp(y, 0, Math.max(0, rotH - evenH));
  }
  return { width: evenW, height: evenH, x, y };
}
