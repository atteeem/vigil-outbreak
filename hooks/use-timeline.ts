"use client";

import { useCallback, useEffect, useState } from "react";
import { PLAYBACK_TICK_MS, atProgress, clampDate, stepSize, windowFor, type PlaybackSpeed, type TimelinePreset } from "@/lib/domain/timeline";
import type { TimelineState } from "@/components/dashboard/timeline-controls";

export function useTimeline(initialAsOf: Date | null) {
  const [state, setState] = useState<TimelineState>(() => ({
    preset: initialAsOf ? "custom" : "live",
    asOf: initialAsOf,
    rangeStart: initialAsOf ? new Date(initialAsOf.getTime() - 7 * 86400_000) : null,
    rangeEnd: initialAsOf ? new Date() : null,
    playing: false,
    speed: 1,
  }));

  const selectPreset = useCallback((p: TimelinePreset) => {
    const { start, end } = windowFor(p, new Date());
    // A preset starts at the beginning of its window, so Play moves forward through it.
    setState((s) => ({ ...s, preset: p, rangeStart: start, rangeEnd: end, asOf: start, playing: false }));
  }, []);
  const selectCustom = useCallback((d: Date) => {
    const end = new Date();
    setState((s) => ({ ...s, preset: "custom", asOf: d, rangeStart: d < end ? new Date(Math.min(d.getTime(), end.getTime() - 86400_000)) : d, rangeEnd: end, playing: false }));
  }, []);
  const live = useCallback(() => setState((s) => ({ ...s, preset: "live", asOf: null, rangeStart: null, rangeEnd: null, playing: false })), []);
  const step = useCallback((dir: 1 | -1) => {
    setState((s) => {
      if (!s.asOf || !s.rangeStart || !s.rangeEnd) return s;
      const next = clampDate(new Date(s.asOf.getTime() + dir * stepSize(s.rangeStart, s.rangeEnd)), s.rangeStart, s.rangeEnd);
      return { ...s, asOf: next, playing: s.playing && next < s.rangeEnd };
    });
  }, []);
  const scrub = useCallback((f: number) => setState((s) => (s.rangeStart && s.rangeEnd ? { ...s, asOf: atProgress(f, s.rangeStart, s.rangeEnd), playing: false } : s)), []);
  const play = useCallback(() => setState((s) => (s.asOf && s.rangeStart && s.rangeEnd ? { ...s, playing: true, asOf: s.asOf >= s.rangeEnd ? s.rangeStart : s.asOf } : s)), []);
  const pause = useCallback(() => setState((s) => ({ ...s, playing: false })), []);
  const setSpeed = useCallback((speed: PlaybackSpeed) => setState((s) => ({ ...s, speed })), []);

  useEffect(() => {
    if (!state.playing) return;
    const t = setInterval(() => step(1), PLAYBACK_TICK_MS / state.speed);
    return () => clearInterval(t);
  }, [state.playing, state.speed, step]);

  return { state, selectPreset, selectCustom, live, step, scrub, play, pause, setSpeed };
}
