// Historical playback model (adapted from VIGIL's world-timeline): a preset picks a window ending now; playback
// moves `asOf` through it. `asOf === null` means Live.

export const TIMELINE_PRESETS = ["24H", "7D", "30D", "90D"] as const;
export type TimelinePreset = (typeof TIMELINE_PRESETS)[number];
export type TimelinePresetKey = "live" | TimelinePreset | "custom";

export const PRESET_MS: Record<TimelinePreset, number> = {
  "24H": 24 * 3600_000,
  "7D": 7 * 24 * 3600_000,
  "30D": 30 * 24 * 3600_000,
  "90D": 90 * 24 * 3600_000,
};

export const PLAYBACK_SPEEDS = [1, 2, 4] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/** Steps across the window per full playback at 1×. */
export const PLAYBACK_STEPS = 48;
export const PLAYBACK_TICK_MS = 600;

export function windowFor(preset: TimelinePreset, now: Date): { start: Date; end: Date } {
  return { start: new Date(now.getTime() - PRESET_MS[preset]), end: now };
}

export function stepSize(start: Date, end: Date): number {
  return Math.max(60_000, Math.round((end.getTime() - start.getTime()) / PLAYBACK_STEPS));
}

export function clampDate(d: Date, start: Date, end: Date): Date {
  return new Date(Math.min(end.getTime(), Math.max(start.getTime(), d.getTime())));
}

export function progress(asOf: Date, start: Date, end: Date): number {
  const span = end.getTime() - start.getTime();
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (asOf.getTime() - start.getTime()) / span));
}

export function atProgress(fraction: number, start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.min(1, Math.max(0, fraction)) * (end.getTime() - start.getTime()));
}

/** Parses an `asOf` query parameter. Invalid or future values mean Live (null). */
export function parseAsOf(value: string | null | undefined, now = new Date()): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() >= now.getTime()) return null;
  return d;
}
