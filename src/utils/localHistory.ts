import { LocalHistoryEntry } from '../types/editor';

const STORAGE_KEY = 'slicemark_local_history';
const MAX_ENTRIES = 20;

export function loadLocalHistory(): LocalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is LocalHistoryEntry =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as LocalHistoryEntry).id === 'string' &&
          typeof (item as LocalHistoryEntry).createdAt === 'number' &&
          ((item as LocalHistoryEntry).kind === 'autotune' ||
            (item as LocalHistoryEntry).kind === 'export') &&
          typeof (item as LocalHistoryEntry).label === 'string' &&
          Boolean((item as LocalHistoryEntry).color) &&
          Boolean((item as LocalHistoryEntry).audio)
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveLocalHistory(entries: LocalHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore storage quota errors
  }
}

export function addLocalHistoryEntry(
  entry: Omit<LocalHistoryEntry, 'id' | 'createdAt'>
): LocalHistoryEntry[] {
  const existing = loadLocalHistory();
  const nextItem: LocalHistoryEntry = {
    ...entry,
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
  const next = [nextItem, ...existing].slice(0, MAX_ENTRIES);
  saveLocalHistory(next);
  return next;
}

export function removeLocalHistoryEntry(id: string): LocalHistoryEntry[] {
  const next = loadLocalHistory().filter((item) => item.id !== id);
  saveLocalHistory(next);
  return next;
}

export function clearLocalHistory(): LocalHistoryEntry[] {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return [];
}
