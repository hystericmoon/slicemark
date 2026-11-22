import {
  ClipSegment,
  OverlaySettings,
  SubtitleCue,
} from '../types/editor';
import { nextSegmentId } from './segmentGenerator';
import { formatRulerTime, parseTimecode } from './timecode';

/**
 * Parses SRT or WebVTT subtitle file text into structured cues.
 */
export function parseSubtitleFile(rawText: string): SubtitleCue[] {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = text.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  const timePattern =
    /(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}/;

  const parseSrtTime = (ts: string): number => {
    const clean = ts.trim().replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) {
      return (
        parseInt(parts[0], 10) * 3600 +
        parseInt(parts[1], 10) * 60 +
        parseFloat(parts[2])
      );
    }
    if (parts.length === 2) {
      return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
    }
    return 0;
  };

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0].toUpperCase().startsWith('WEBVTT') || lines[0].startsWith('NOTE')) {
      continue;
    }

    const timeLineIdx = lines.findIndex((l) => timePattern.test(l));
    if (timeLineIdx === -1) continue;

    const timeLine = lines[timeLineIdx];
    const [rawStart, rawEndPart] = timeLine.split('-->');
    const rawEnd = rawEndPart.trim().split(/\s+/)[0];
    const start = parseSrtTime(rawStart);
    const end = parseSrtTime(rawEnd);
    const captionText = lines
      .slice(timeLineIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (captionText && end > start) {
      cues.push({
        id: `cue_${cues.length + 1}`,
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        text: captionText,
      });
    }
  }

  return cues;
}

function formatSrtTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const secs = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const mins = totalMin % 60;
  const hours = Math.floor(totalMin / 60);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)},${pad3(ms)}`;
}

/**
 * Slices and re-timestamps cues for an individual clip segment (and adjusts for playback speed).
 */
export function sliceCuesForClip(
  cues: SubtitleCue[],
  clipStart: number,
  clipEnd: number,
  speed = 1
): SubtitleCue[] {
  const sliced: SubtitleCue[] = [];
  for (const cue of cues) {
    if (cue.end <= clipStart || cue.start >= clipEnd) continue;
    const relStart = Math.max(0, cue.start - clipStart) / speed;
    const relEnd = Math.min(clipEnd - clipStart, cue.end - clipStart) / speed;
    if (relEnd - relStart >= 0.08) {
      sliced.push({
        id: cue.id,
        start: Number(relStart.toFixed(3)),
        end: Number(relEnd.toFixed(3)),
        text: cue.text,
      });
    }
  }
  return sliced;
}

/**
 * Serializes cues back into a standard UTF-8 .srt string.
 */
export function serializeCuesToSrt(cues: SubtitleCue[]): string {
  return cues
    .map(
      (cue, idx) =>
        `${idx + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(
          cue.end
        )}\n${cue.text}`
    )
    .join('\n\n');
}

/**
 * Finds the active subtitle cue text at a given video playback timestamp.
 */
export function getActiveCueText(cues: SubtitleCue[], currentTime: number): string | null {
  const active = cues.filter((c) => currentTime >= c.start && currentTime <= c.end);
  if (active.length === 0) return null;
  return active.map((c) => c.text).join('\n');
}

/**
 * Parses YouTube-style chapter lines (e.g., "00:00 Intro", "0:15 Demo - Feature") into ClipSegments.
 */
export function parseChaptersToSegments(
  rawText: string,
  duration: number
): ClipSegment[] {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: Array<{ time: number; title: string }> = [];

  for (const line of lines) {
    const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[-–—|:]?\s*(.*)$/);
    if (!match) continue;
    const parsedTime = parseTimecode(match[1]);
    if (parsedTime === null || parsedTime >= duration - 0.1) continue;
    const title = match[2]?.trim() || `Chapter ${entries.length + 1}`;
    entries.push({ time: parsedTime, title });
  }

  if (entries.length === 0) return [];
  entries.sort((a, b) => a.time - b.time);

  const segments: ClipSegment[] = [];
  for (let i = 0; i < entries.length; i++) {
    const start = entries[i].time;
    const end = i + 1 < entries.length ? entries[i + 1].time : duration;
    if (end - start >= 0.4) {
      segments.push({
        id: nextSegmentId(),
        label: entries[i].title,
        startTime: Number(start.toFixed(2)),
        endTime: Number(end.toFixed(2)),
        selected: true,
      });
    }
  }
  return segments;
}

/**
 * Formats segments as YouTube chapter lines ("00:00 Clip Name").
 */
export function formatSegmentsAsChapters(segments: ClipSegment[]): string {
  return segments
    .map((s) => `${formatRulerTime(s.startTime)} ${s.label}`)
    .join('\n');
}

/**
 * Loads an image dataUrl into an HTMLImageElement for canvas compositing.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Renders a crisp transparent PNG plate containing Part 1/N badge, custom watermark text,
 * optional timestamp range label, and optional PNG logo for reliable FFmpeg.wasm overlay compositing.
 */
export async function renderOverlayPlatePng(
  width: number,
  height: number,
  overlay: OverlaySettings,
  clipIndex: number,
  totalClips: number,
  clipRangeLabel: string
): Promise<Uint8Array | null> {
  const hasAny =
    overlay.showPartNumber ||
    overlay.watermarkText.trim().length > 0 ||
    overlay.showTimestamp ||
    Boolean(overlay.logoDataUrl);

  if (!hasAny) return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, width);
  canvas.height = Math.max(2, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = overlay.opacity;

  const pad = Math.round(Math.min(width, height) * 0.045);
  const baseFont = Math.max(14, Math.round(Math.min(width, height) * 0.036));
  const isRight = overlay.position.endsWith('right');
  const isBottom = overlay.position.startsWith('bottom');

  const lines: string[] = [];
  if (overlay.showPartNumber) {
    const prefix = overlay.partPrefix.trim() || 'Part';
    lines.push(`${prefix} ${clipIndex + 1}/${totalClips}`);
  }
  if (overlay.watermarkText.trim()) {
    lines.push(overlay.watermarkText.trim());
  }
  if (overlay.showTimestamp) {
    lines.push(clipRangeLabel);
  }

  let logoImg: HTMLImageElement | null = null;
  if (overlay.logoDataUrl) {
    try {
      logoImg = await loadImage(overlay.logoDataUrl);
    } catch {
      logoImg = null;
    }
  }

  const lineHeight = Math.round(baseFont * 1.32);
  ctx.font = `600 ${baseFont}px Figtree, -apple-system, sans-serif`;

  let maxTextW = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxTextW) maxTextW = m.width;
  }

  const logoMaxH = Math.round(baseFont * 2.1);
  let logoW = 0;
  let logoH = 0;
  if (logoImg && logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0) {
    const ratio = logoImg.naturalWidth / logoImg.naturalHeight;
    logoH = logoMaxH;
    logoW = Math.round(logoH * ratio);
  }

  const boxPadX = Math.round(baseFont * 0.7);
  const boxPadY = Math.round(baseFont * 0.45);
  const textBlockH = lines.length > 0 ? lines.length * lineHeight : 0;
  const gapBetweenLogoAndText = logoImg && lines.length > 0 ? Math.round(baseFont * 0.6) : 0;

  const maxAllowedBoxW = Math.max(80, width - pad * 2);
  const maxAllowedTextW = Math.max(
    40,
    maxAllowedBoxW - boxPadX * 2 - logoW - gapBetweenLogoAndText
  );
  const clampedTextW = Math.min(maxTextW, maxAllowedTextW);

  const contentW = logoW + gapBetweenLogoAndText + clampedTextW;
  const contentH = Math.max(logoH, textBlockH);
  const boxW = Math.min(maxAllowedBoxW, contentW + boxPadX * 2);
  const boxH = contentH + boxPadY * 2;

  const boxX = isRight ? Math.max(pad, width - pad - boxW) : pad;
  const boxY = isBottom ? Math.max(pad, height - pad - boxH) : pad;

  // Draw crisp translucent dark Astryx backing plate for guaranteed readability
  ctx.fillStyle = 'rgba(17, 17, 17, 0.72)';
  const r = Math.max(6, Math.round(baseFont * 0.35));
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, r);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  let cursorX = boxX + boxPadX;
  if (logoImg) {
    const ly = boxY + (boxH - logoH) / 2;
    ctx.drawImage(logoImg, cursorX, ly, logoW, logoH);
    cursorX += logoW + gapBetweenLogoAndText;
  }

  if (lines.length > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    const startY = boxY + (boxH - textBlockH) / 2 + lineHeight / 2;
    lines.forEach((line, i) => {
      ctx.font =
        i === 0
          ? `600 ${baseFont}px Figtree, -apple-system, sans-serif`
          : `500 ${Math.round(baseFont * 0.86)}px Figtree, -apple-system, sans-serif`;
      ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,0.82)';
      ctx.fillText(line, cursorX, startY + i * lineHeight, maxAllowedTextW);
    });
  }

  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}

/**
 * Renders a crisp bottom-centered subtitle caption PNG plate for burned-in caption overlays.
 */
export async function renderSubtitleCuePng(
  width: number,
  height: number,
  text: string
): Promise<Uint8Array | null> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, width);
  canvas.height = Math.max(2, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  const fontSize = Math.max(16, Math.round(Math.min(width, height) * 0.044));
  ctx.font = `600 ${fontSize}px Figtree, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxLineWidth = width * 0.84;
  const wrappedLines: string[] = [];
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(/\s+/);
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxLineWidth && current) {
        wrappedLines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) wrappedLines.push(current);
  }

  if (wrappedLines.length === 0) return null;

  const lineHeight = Math.round(fontSize * 1.32);
  let widest = 0;
  for (const l of wrappedLines) {
    const w = ctx.measureText(l).width;
    if (w > widest) widest = w;
  }

  const padX = Math.round(fontSize * 0.85);
  const padY = Math.round(fontSize * 0.45);
  const boxW = Math.min(width - 24, widest + padX * 2);
  const boxH = wrappedLines.length * lineHeight + padY * 2;
  const boxX = (width - boxW) / 2;
  const boxY = height - boxH - Math.round(height * 0.065);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 8);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  wrappedLines.forEach((line, idx) => {
    const y = boxY + padY + idx * lineHeight + lineHeight / 2;
    ctx.fillText(line, width / 2, y);
  });

  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}
