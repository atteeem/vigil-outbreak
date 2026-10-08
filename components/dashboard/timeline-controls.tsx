"use client";

// Historical playback (adapted from VIGIL's TimelineControls). Separate from the "reported within" filter:
// this control answers "what was publicly known at time T", using publication timestamps only.
import { useState } from "react";
import { History, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { cn, fmtUtc } from "@/lib/utils";
import { PLAYBACK_SPEEDS, TIMELINE_PRESETS, progress, type PlaybackSpeed, type TimelinePreset, type TimelinePresetKey } from "@/lib/domain/timeline";

const RES = 1000;

export interface TimelineState {
  preset: TimelinePresetKey;
  asOf: Date | null;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  playing: boolean;
  speed: PlaybackSpeed;
}

export function TimelineControls({
  state,
  onPreset,
  onCustom,
  onLive,
  onPlay,
  onPause,
  onStep,
  onSpeed,
  onScrub,
  className,
}: {
  state: TimelineState;
  onPreset: (p: TimelinePreset) => void;
  onCustom: (d: Date) => void;
  onLive: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStep: (dir: 1 | -1) => void;
  onSpeed: (s: PlaybackSpeed) => void;
  onScrub: (fraction: number) => void;
  className?: string;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const { asOf, rangeStart, rangeEnd, playing, speed, preset } = state;
  const historical = asOf !== null;
  const canPlay = historical && rangeStart && rangeEnd;
  const p = canPlay ? progress(asOf!, rangeStart!, rangeEnd!) : 1;

  const presetBtn = (key: TimelinePresetKey, label: string, onClick: () => void) => (
    <button key={key} type="button" role="radio" aria-checked={preset === key} onClick={onClick} className={cn("px-2.5 py-1 text-[11px] font-medium transition-colors", preset === key ? "bg-raised text-ink" : "text-ink-dim hover:text-ink")}>
      {label}
    </button>
  );

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="timeline-controls">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow flex items-center gap-1"><History className="h-3 w-3" /> Playback</span>
        <div role="radiogroup" aria-label="Playback range" className="flex overflow-hidden rounded-md border border-line-strong">
          {presetBtn("live", "Live", onLive)}
          {TIMELINE_PRESETS.map((r) => presetBtn(r, r, () => onPreset(r)))}
          {presetBtn("custom", "Custom", () => setCustomOpen((v) => !v))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn px-1.5 py-1" onClick={() => onStep(-1)} disabled={!canPlay || p <= 0} aria-label="Step back"><SkipBack className="h-3.5 w-3.5" /></button>
          {playing ? (
            <button type="button" className="btn btn-accent px-1.5 py-1" onClick={onPause} aria-label="Pause"><Pause className="h-3.5 w-3.5" /></button>
          ) : (
            <button type="button" className="btn px-1.5 py-1" onClick={onPlay} disabled={!canPlay} aria-label="Play"><Play className="h-3.5 w-3.5" /></button>
          )}
          <button type="button" className="btn px-1.5 py-1" onClick={() => onStep(1)} disabled={!canPlay || p >= 1} aria-label="Step forward"><SkipForward className="h-3.5 w-3.5" /></button>
          <div role="radiogroup" aria-label="Playback speed" className="ml-1 flex overflow-hidden rounded-md border border-line-strong">
            {PLAYBACK_SPEEDS.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => onSpeed(s)} className={cn("px-1.5 py-1 text-[11px] num", speed === s ? "bg-raised text-ink" : "text-ink-dim hover:text-ink")}>{s}×</button>
            ))}
          </div>
          {historical && (
            <button type="button" className="btn btn-accent ml-1 py-1" onClick={onLive} data-testid="return-to-live"><RotateCcw className="h-3 w-3" /> Live</button>
          )}
        </div>
      </div>
      {customOpen && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const d = new Date(customValue + "Z"); if (!Number.isNaN(d.getTime())) { onCustom(d); setCustomOpen(false); } }}>
          <label className="text-[11px] text-ink-dim" htmlFor="custom-asof">View as of (UTC)</label>
          <input id="custom-asof" type="datetime-local" className="field w-auto" value={customValue} onChange={(e) => setCustomValue(e.target.value)} max={new Date().toISOString().slice(0, 16)} required />
          <button className="btn" type="submit">Apply</button>
        </form>
      )}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={RES}
          value={Math.round(p * RES)}
          disabled={!canPlay}
          onChange={(e) => onScrub(Number(e.target.value) / RES)}
          aria-label="Scrub timeline"
          data-testid="timeline-scrubber"
          className="h-1 flex-1 cursor-pointer accent-[var(--color-accent)] disabled:cursor-default disabled:opacity-40"
        />
        <span className={cn("shrink-0 text-[11px] num", historical ? "text-warn" : "text-ok")} data-testid="timeline-asof">
          {historical ? `Viewing ${fmtUtc(asOf)}` : "Live"}
        </span>
      </div>
    </div>
  );
}
