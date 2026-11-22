import { FilmstripFrame, MediaSource } from '../types/editor';

/**
 * Loads basic metadata (duration, resolution) from a local video File.
 */
export function probeMediaFile(file: File): Promise<MediaSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      cleanup();
      if (duration <= 0) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read video duration. Try an MP4, WebM, or MOV file.'));
        return;
      }
      resolve({
        file,
        url,
        name: file.name,
        size: file.size,
        duration,
        width,
        height,
        fps: 30,
        hasAudio: true,
      });
    };

    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('Unsupported video format or corrupted file.'));
    };

    video.src = url;
  });
}

/**
 * Extracts evenly spaced filmstrip thumbnail frames using an offscreen video element.
 */
export async function extractFilmstrip(
  videoUrl: string,
  duration: number,
  frameCount = 24,
  signal?: AbortSignal
): Promise<FilmstripFrame[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');

    const frames: FilmstripFrame[] = [];
    const safeCount = Math.max(4, Math.min(frameCount, Math.ceil(duration * 2)));
    const times: number[] = [];
    for (let i = 0; i < safeCount; i++) {
      const t = (i / safeCount) * Math.max(0.1, duration - 0.1) + 0.05;
      times.push(Math.min(duration - 0.05, Math.max(0, t)));
    }

    let index = 0;

    const finish = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      resolve(frames);
    };

    const seekNext = () => {
      if (signal?.aborted || index >= times.length) {
        finish();
        return;
      }
      video.currentTime = times[index];
    };

    video.onseeked = () => {
      if (signal?.aborted) {
        finish();
        return;
      }
      if (ctx) {
        const vw = video.videoWidth || 160;
        const vh = video.videoHeight || 90;
        const scale = Math.max(canvas.width / vw, canvas.height / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, dx, dy, dw, dh);
        frames.push({
          time: times[index],
          dataUrl: canvas.toDataURL('image/jpeg', 0.65),
        });
      }
      index += 1;
      seekNext();
    };

    video.onloadeddata = () => {
      seekNext();
    };

    video.onerror = () => {
      finish();
    };
  });
}

/**
 * Decodes real audio waveform peaks (0..1) from the video file via Web Audio API.
 */
export async function extractAudioPeaks(
  file: File,
  bucketCount = 360
): Promise<{ peaks: number[]; hasAudio: boolean }> {
  try {
    // Guard against huge files (> 350MB) exhausting browser RAM during full decode
    if (file.size > 350 * 1024 * 1024) {
      return { peaks: new Array(bucketCount).fill(0.12), hasAudio: true };
    }
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return { peaks: new Array(bucketCount).fill(0.08), hasAudio: false };
    }
    const ctx = new AudioCtx();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const channelData = audioBuffer.getChannelData(0);
      const totalSamples = channelData.length;
      if (totalSamples === 0) {
        return { peaks: new Array(bucketCount).fill(0.05), hasAudio: false };
      }

      const samplesPerBucket = Math.max(1, Math.floor(totalSamples / bucketCount));
      const rawPeaks: number[] = [];
      let maxPeak = 0.001;

      for (let i = 0; i < bucketCount; i++) {
        const start = i * samplesPerBucket;
        const end = Math.min(totalSamples, start + samplesPerBucket);
        const stride = Math.max(1, Math.floor((end - start) / 64));
        let sumSq = 0;
        let count = 0;
        for (let j = start; j < end; j += stride) {
          const sample = channelData[j];
          sumSq += sample * sample;
          count += 1;
        }
        const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
        rawPeaks.push(rms);
        if (rms > maxPeak) maxPeak = rms;
      }

      const normalized = rawPeaks.map((p) => Math.min(1, Math.max(0.04, p / maxPeak)));
      return { peaks: normalized, hasAudio: maxPeak > 0.002 };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  } catch {
    return { peaks: new Array(bucketCount).fill(0.06), hasAudio: false };
  }
}

/**
 * Picks the closest filmstrip thumbnail for a given timestamp.
 */
export function findNearestThumbnail(
  frames: FilmstripFrame[],
  time: number
): string | undefined {
  if (frames.length === 0) return undefined;
  let best = frames[0];
  let bestDist = Math.abs(frames[0].time - time);
  for (let i = 1; i < frames.length; i++) {
    const dist = Math.abs(frames[i].time - time);
    if (dist < bestDist) {
      best = frames[i];
      bestDist = dist;
    }
  }
  return best.dataUrl;
}
