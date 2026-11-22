import { getFFmpegInstance } from './ffmpegEngine';

interface ChapterTheme {
  title: string;
  subtitle: string;
  bgStart: string;
  bgEnd: string;
  accent: string;
}

const CHAPTERS: ChapterTheme[] = [
  {
    title: '01 · Opening Hook',
    subtitle: '00:00 – 00:15 · Studio Introduction',
    bgStart: '#18181b',
    bgEnd: '#27272a',
    accent: '#3b82f6',
  },
  {
    title: '02 · Product Walkthrough',
    subtitle: '00:15 – 00:30 · Key Feature Highlight',
    bgStart: '#14202e',
    bgEnd: '#1e3a5f',
    accent: '#60a5fa',
  },
  {
    title: '03 · Workflow Detail',
    subtitle: '00:30 – 00:45 · Precision Editing Demo',
    bgStart: '#1c2421',
    bgEnd: '#1f3a32',
    accent: '#34d399',
  },
  {
    title: '04 · Export Summary',
    subtitle: '00:45 – 01:00 · Multi-Format Delivery',
    bgStart: '#261f1b',
    bgEnd: '#3f2e22',
    accent: '#f59e0b',
  },
  {
    title: '05 · Outro Tail',
    subtitle: '01:00 – 01:05 · Remainder Test Segment',
    bgStart: '#1e1b24',
    bgEnd: '#31263d',
    accent: '#a78bfa',
  },
];

/**
 * Generates a crisp 65-second 16-bit PCM WAV buffer with musical pulse envelopes
 * so the timeline audio waveform has rich, distinct rhythmic peaks across all 5 chapters.
 */
function buildSyntheticWav(durationSeconds: number, sampleRate = 16000): Uint8Array {
  const numSamples = durationSeconds * sampleRate;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Distinct pentatonic root notes per 15-second chapter
  const chapterFreqs = [220, 261.63, 293.66, 329.63, 392.0];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chapterIdx = Math.min(CHAPTERS.length - 1, Math.floor(t / 15));
    const localSec = t % 15;
    const beatPos = t % 0.5;

    // Pause briefly at chapter boundaries so users can visually see clean 15s cut points on the waveform!
    const boundaryDip =
      localSec < 0.25 || localSec > 14.7 ? 0.12 : 1.0;

    // Rhythmic percussive + harmonic envelope
    const beatEnv = Math.exp(-beatPos * 7.5);
    const phraseMod = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.85));
    const baseFreq = chapterFreqs[chapterIdx];
    const tone =
      0.55 * Math.sin(2 * Math.PI * baseFreq * t) +
      0.28 * Math.sin(2 * Math.PI * baseFreq * 1.5 * t) +
      0.17 * Math.sin(2 * Math.PI * (baseFreq * 0.5) * t);

    const sample = Math.max(-0.95, Math.min(0.95, tone * beatEnv * phraseMod * boundaryDip * 0.72));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  return new Uint8Array(buffer);
}

/**
 * Draws one crisp 640x360 studio chapter frame onto an offscreen canvas.
 */
function renderFrameToJpeg(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  second: number,
  totalSeconds: number
): Promise<Uint8Array> {
  const chapterIdx = Math.min(CHAPTERS.length - 1, Math.floor(second / 15));
  const chapter = CHAPTERS[chapterIdx];
  const w = canvas.width;
  const h = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, chapter.bgStart);
  grad.addColorStop(1, chapter.bgEnd);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle architectural studio grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 80; x < w; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 60; y < h; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Animated kinetic orbital ring
  const phase = (second / totalSeconds) * Math.PI * 8;
  const cx = w * 0.76;
  const cy = h * 0.48;
  ctx.save();
  ctx.strokeStyle = chapter.accent;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 86, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 86, phase, phase + Math.PI * 0.65);
  ctx.stroke();

  // Moving accent dot
  const dotX = cx + Math.cos(phase + Math.PI * 0.65) * 86;
  const dotY = cy + Math.sin(phase + Math.PI * 0.65) * 86;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Chapter typography
  ctx.fillStyle = chapter.accent;
  ctx.font = '600 13px Figtree, sans-serif';
  ctx.fillText('SLICEMARK BY HAHO STUDIO · 65 SECONDS', 44, 58);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 34px Figtree, sans-serif';
  ctx.fillText(chapter.title, 44, 118);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '400 17px Figtree, sans-serif';
  ctx.fillText(chapter.subtitle, 44, 152);

  // Large tabular timecode readout
  const mins = Math.floor(second / 60).toString().padStart(2, '0');
  const secs = (second % 60).toString().padStart(2, '0');
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 54px "JetBrains Mono", monospace';
  ctx.fillText(`${mins}:${secs}`, 44, 245);

  // Chapter marker progress bar at bottom
  const barX = 44;
  const barY = h - 46;
  const barW = w - 88;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(barX, barY, barW, 6);
  ctx.fillStyle = chapter.accent;
  ctx.fillRect(barX, barY, barW * ((second + 1) / totalSeconds), 6);

  // 15s interval ticks
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  [15, 30, 45, 60].forEach((mark) => {
    const mx = barX + barW * (mark / totalSeconds);
    ctx.fillRect(mx - 1, barY - 4, 2, 14);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Canvas frame export failed.'));
          return;
        }
        const buf = await blob.arrayBuffer();
        resolve(new Uint8Array(buf));
      },
      'image/jpeg',
      0.86
    );
  });
}

/**
 * Generates a real 65-second H.264/AAC MP4 sample clip locally using FFmpeg.wasm
 * with 1-second keyframes so 15s/30s/45s/60s lossless cutting works instantaneously.
 */
export async function generateSampleVideoFile(
  onProgress?: (percent: number, label: string) => void
): Promise<File> {
  const totalSeconds = 65;
  onProgress?.(10, 'Preparing FFmpeg.wasm engine...');
  const ff = await getFFmpegInstance();

  onProgress?.(25, 'Rendering 65-second multi-chapter frames...');
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  for (let sec = 0; sec < totalSeconds; sec++) {
    const jpg = await renderFrameToJpeg(canvas, ctx, sec, totalSeconds);
    const frameName = `sf_${String(sec).padStart(3, '0')}.jpg`;
    await ff.writeFile(frameName, jpg);
    if (sec % 8 === 0) {
      onProgress?.(25 + Math.round((sec / totalSeconds) * 35), `Rendering sample frame ${sec + 1}/${totalSeconds}...`);
    }
  }

  onProgress?.(65, 'Synthesizing chapter audio waveform...');
  const wavBytes = buildSyntheticWav(totalSeconds);
  await ff.writeFile('sf_audio.wav', wavBytes);

  onProgress?.(78, 'Encoding 65s H.264 MP4...');
  const exitCode = await ff.exec([
    '-framerate',
    '1',
    '-i',
    'sf_%03d.jpg',
    '-i',
    'sf_audio.wav',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-g',
    '1',
    '-r',
    '10',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-shortest',
    '-movflags',
    '+faststart',
    '-y',
    'sample_65s.mp4',
  ]);

  // Clean up temporary files
  for (let sec = 0; sec < totalSeconds; sec++) {
    await ff.deleteFile(`sf_${String(sec).padStart(3, '0')}.jpg`).catch(() => undefined);
  }
  await ff.deleteFile('sf_audio.wav').catch(() => undefined);

  if (exitCode !== 0) {
    throw new Error('Failed to encode sample MP4.');
  }

  const raw = await ff.readFile('sample_65s.mp4');
  await ff.deleteFile('sample_65s.mp4').catch(() => undefined);

  const bytes = raw instanceof Uint8Array ? new Uint8Array(raw) : new TextEncoder().encode(raw);
  onProgress?.(100, 'Sample video ready');

  return new File([bytes], 'slicemark_demo_65s.mp4', { type: 'video/mp4' });
}
