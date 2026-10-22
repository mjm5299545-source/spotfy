import type { Preferences } from '../../shared/types.ts';

/** Choose the next queue entry. A null result means playback is complete. */
export function nextQueueIndex(length: number, current: number, repeat: Preferences['repeat'], shuffle: boolean, random = Math.random, visited: ReadonlySet<number> = new Set()): number | null {
  if (length < 1 || current < 0 || current >= length) return null;
  if (shuffle) {
    let candidates = Array.from({length}, (_, index) => index).filter(index => index !== current && !visited.has(index));
    if (!candidates.length && repeat === 'all') {
      candidates = Array.from({length}, (_, index) => index).filter(index => index !== current);
      if (!candidates.length) return current;
    }
    if (!candidates.length) return null;
    return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))]!;
  }
  if (current + 1 < length) return current + 1;
  return repeat === 'all' ? 0 : null;
}
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
export function normalizePreferences(value: unknown): Preferences {
  const raw = value && typeof value === 'object' ? value as Partial<Preferences> : {};
  return {
    volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : 0.7,
    shuffle: raw.shuffle === true,
    repeat: raw.repeat === 'all' || raw.repeat === 'one' ? raw.repeat : 'off',
  };
}
