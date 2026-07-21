"use client";

/**
 * Procedural UI sound. No audio files, no network, nothing to load. Every cue
 * is a couple of oscillators with a short envelope, which keeps the whole thing
 * under a kilobyte and always in tune with itself.
 */

type Cue = "tick" | "step" | "lock" | "thunk" | "error";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

const STORAGE_KEY = "monolith:sound";

const listeners = new Set<() => void>();
let hydrated = false;

/**
 * The preference lives in localStorage, which React cannot see. Exposing it as
 * a subscribable store lets a component read it with useSyncExternalStore
 * instead of setting state from an effect and re-rendering to correct itself.
 */
export function subscribeSound(listener: () => void): () => void {
  if (!hydrated && typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // A stated preference wins. With nothing stored, a machine asking for
    // reduced motion gets silence as its default, which is the polite reading
    // of that setting for an interface that makes noise on every keystroke.
    enabled =
      stored !== null
        ? stored === "on"
        : !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    hydrated = true;
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function soundEnabled(): boolean {
  return enabled;
}

/** Sound is on by default, and the server has no localStorage to say otherwise. */
export function soundServerSnapshot(): boolean {
  return true;
}

export function setSoundEnabled(next: boolean): void {
  enabled = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  }
  for (const listener of listeners) listener();
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
  error: [{ freq: 190, to: 120, type: "sawtooth", gain: 0.06, attack: 0.003, decay: 0.16 }],
};

export function play(cue: Cue): void {
  // Reduced motion decides the default above, not this. Silencing here as well
  // meant the sound toggle appeared to do nothing at all on those machines:
  // the glyph changed, the preference was written, and no sound ever followed.
  if (!enabled) return;
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
