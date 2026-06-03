/**
 * Tomsgarden — sound-cue specs + zero-dependency Web Audio synthesis.
 *
 * No audio files required: every cue is synthesized on the fly with the
 * standard Web Audio API (works in all evergreen browsers). If you later add
 * recorded SFX, the SPEC table below documents the intended character so they
 * stay consistent.
 *
 * Usage:
 *   import { playCue } from '@/design/sound-cues';
 *   playCue('place');          // on tile placement
 *   playCue('score', { n: 3 }); // n score ticks
 *
 * Honor a user mute toggle by calling setSoundEnabled(false).
 */

export type CueName = 'draft' | 'place' | 'score' | 'roundEnd' | 'win';

export interface CueSpec {
  name: CueName;
  when: string;
  character: string;
  /** Rough duration (ms) and dominant pitches (Hz) for reference / recordings. */
  durationMs: number;
  pitchesHz: number[];
}

export const CUE_SPECS: Record<CueName, CueSpec> = {
  draft: {
    name: 'draft',
    when: 'Player takes tiles from the display (acquire action).',
    character:
      'Short soft "pluck" / leaf-rustle — a quick triangle blip, gentle attack. Friendly, low-key.',
    durationMs: 120,
    pitchesHz: [523.25], // C5
  },
  place: {
    name: 'place',
    when: 'A plant tile is placed into the garden plot.',
    character:
      'Satisfying woody "tok" with a tiny pitch drop — like setting a wooden piece on a board. A touch of body.',
    durationMs: 160,
    pitchesHz: [392.0, 261.63], // G4 -> C4 quick fall
  },
  score: {
    name: 'score',
    when: 'Each point/hexagon counted during scoring (call once per tick).',
    character:
      'Bright ascending "ting" — a clean sine/triangle bell. Stacking ticks should feel like a rising tally.',
    durationMs: 90,
    pitchesHz: [659.25], // E5 (caller may transpose up per tick index)
  },
  roundEnd: {
    name: 'roundEnd',
    when: 'A round finishes (after Phase 2 scoring).',
    character:
      'Gentle two-note "wind-chime" resolve. Calm, signals a breather before the next round.',
    durationMs: 600,
    pitchesHz: [587.33, 880.0], // D5 -> A5
  },
  win: {
    name: 'win',
    when: 'Game over / winner declared.',
    character:
      'Warm 3-note major arpeggio flourish with a soft shimmer tail. Celebratory but not loud.',
    durationMs: 900,
    pitchesHz: [523.25, 659.25, 783.99], // C5 E5 G5
  },
};

/* --------------------------------------------------------------------------
   Synthesis engine
   -------------------------------------------------------------------------- */

let ctx: AudioContext | null = null;
let enabled = true;
let master = 0.18; // overall gain ceiling

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}
export function setMasterVolume(v: number): void {
  master = Math.max(0, Math.min(1, v));
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers suspend until a user gesture; resume opportunistically.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One enveloped oscillator note. */
function note(
  freq: number,
  startMs: number,
  durMs: number,
  type: OscillatorType,
  gain: number,
  bendTo?: number,
): void {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + startMs / 1000;
  const t1 = t0 + durMs / 1000;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (bendTo) osc.frequency.exponentialRampToValueAtTime(bendTo, t1);
  // pluck envelope
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain * master, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

/**
 * Play a cue. For 'score', pass { n } to play n rising ticks (pitch climbs).
 */
export function playCue(name: CueName, opts?: { n?: number }): void {
  if (!enabled || typeof window === 'undefined') return;
  switch (name) {
    case 'draft':
      note(523.25, 0, 120, 'triangle', 0.8);
      break;
    case 'place':
      note(392.0, 0, 160, 'triangle', 1.0, 261.63);
      note(196.0, 0, 90, 'sine', 0.5); // low woody body
      break;
    case 'score': {
      const n = Math.max(1, opts?.n ?? 1);
      for (let i = 0; i < n; i++) {
        const f = 659.25 * Math.pow(2, (i % 8) / 12); // climb a semitone/tick
        note(f, i * 70, 90, 'sine', 0.7);
      }
      break;
    }
    case 'roundEnd':
      note(587.33, 0, 320, 'sine', 0.7);
      note(880.0, 120, 480, 'sine', 0.6);
      break;
    case 'win': {
      const arp = [523.25, 659.25, 783.99];
      arp.forEach((f, i) => note(f, i * 110, 500, 'triangle', 0.8));
      note(1046.5, 360, 540, 'sine', 0.4); // shimmer tail
      break;
    }
  }
}
