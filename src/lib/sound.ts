"use client";

/**
 * Procedural UI sound. No audio files, no network, nothing to load. Every cue
 * is a couple of oscillators with a short envelope, which keeps the whole thing
 * under a kilobyte and always in tune with itself.
 */

type Cue = "tick" | "step" | "lock" | "thunk" | "chime" | "error";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

const STORAGE_KEY = "monolith:sound";

export function initSound(): void {
  if (typeof window === "undefined") return;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored !== null) enabled = stored === "on";
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(next: boolean): void {
  enabled = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  }
  if (next) play("tick");
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface Voice {
  freq: number;
  to?: number;
  type: OscillatorType;
  gain: number;
  attack: number;
  decay: number;
  delay?: number;
}

const CUES: Record<Cue, Voice[]> = {
  tick: [{ freq: 2100, type: "square", gain: 0.035, attack: 0.001, decay: 0.028 }],
  step: [{ freq: 880, to: 960, type: "triangle", gain: 0.05, attack: 0.002, decay: 0.06 }],
  lock: [
    { freq: 520, to: 700, type: "triangle", gain: 0.07, attack: 0.002, decay: 0.09 },
    { freq: 1560, type: "sine", gain: 0.03, attack: 0.002, decay: 0.07, delay: 0.02 },
  ],
  thunk: [
    { freq: 128, to: 62, type: "sine", gain: 0.34, attack: 0.004, decay: 0.44 },
    { freq: 320, to: 190, type: "triangle", gain: 0.08, attack: 0.002, decay: 0.2 },
  ],
  chime: [
    { freq: 587.33, type: "sine", gain: 0.09, attack: 0.006, decay: 0.5 },
    { freq: 880, type: "sine", gain: 0.07, attack: 0.006, decay: 0.5, delay: 0.07 },
    { freq: 1174.66, type: "sine", gain: 0.05, attack: 0.006, decay: 0.7, delay: 0.14 },
  ],
  error: [{ freq: 190, to: 120, type: "sawtooth", gain: 0.06, attack: 0.003, decay: 0.16 }],
};

export function play(cue: Cue): void {
  if (!enabled) return;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const ac = audio();
  if (!ac || !master) return;
  const now = ac.currentTime;
  for (const v of CUES[cue]) {
    const t0 = now + (v.delay ?? 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(v.freq, t0);
    if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, t0 + v.decay);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v.gain, t0 + v.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + v.attack + v.decay);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + v.attack + v.decay + 0.02);
  }
}
