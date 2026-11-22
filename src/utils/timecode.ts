export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Formats seconds to MM:SS.cc or HH:MM:SS.cc with strict two-digit padding.
 */
export function formatTimecode(seconds: number, includeHours = false): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalCentis = Math.round(safe * 100);
  const centis = totalCentis % 100;
  const totalSeconds = Math.floor(totalCentis / 100);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  if (includeHours || hours > 0) {
    return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}.${pad2(centis)}`;
  }
  return `${pad2(mins)}:${pad2(secs)}.${pad2(centis)}`;
}

/**
 * Formats ruler tick markers cleanly (e.g. 00:00, 00:15, 01:00).
 */
export function formatRulerTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const secs = safe % 60;
  const totalMinutes = Math.floor(safe / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) {
    return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}`;
  }
  return `${pad2(mins)}:${pad2(secs)}`;
}

/**
 * Compact duration string (e.g., 15.0s, 1m 30s).
 */
export function formatDurationShort(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (safe < 60) {
    return `${safe.toFixed(1)}s`;
  }
  const mins = Math.floor(safe / 60);
  const secs = Math.round(safe % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/**
 * Parses MM:SS.cc, HH:MM:SS.cc, or plain seconds string into numeric seconds.
 */
export function parseTimecode(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const val = parseFloat(trimmed);
    return Number.isFinite(val) ? val : null;
  }
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseFloat(parts[1]);
    if (!Number.isNaN(mins) && !Number.isNaN(secs) && mins >= 0 && secs >= 0) {
      return mins * 60 + secs;
    }
  } else if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parseFloat(parts[2]);
    if (
      !Number.isNaN(hours) &&
      !Number.isNaN(mins) &&
      !Number.isNaN(secs) &&
      hours >= 0 &&
      mins >= 0 &&
      secs >= 0
    ) {
      return hours * 3600 + mins * 60 + secs;
    }
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9_\-. ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
  return cleaned || 'clip';
}
