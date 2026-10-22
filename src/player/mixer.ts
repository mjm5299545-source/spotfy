export type MixerSettings = { equalizer: boolean; bass: number; mids: number; treble: number; smoothTransition: boolean };

export function normalizeMixer(value: unknown): MixerSettings {
  const raw = value && typeof value === 'object' ? value as Partial<MixerSettings> : {};
  const band = (item: unknown) => typeof item === 'number' && Number.isFinite(item) ? Math.max(-12, Math.min(12, item)) : 0;
  return { equalizer: raw.equalizer === true, bass: band(raw.bass), mids: band(raw.mids), treble: band(raw.treble), smoothTransition: raw.smoothTransition === true };
}

/** Two-second fade at the start and end of each track; tracks do not overlap. */
export function transitionGain(time: number, duration: number, enabled: boolean): number {
  if (!enabled || !Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return 1;
  return Math.max(0, Math.min(1, time / 2, (duration - time) / 2));
}
