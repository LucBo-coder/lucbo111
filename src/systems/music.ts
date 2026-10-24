// Background music: small original chiptune loops synthesised with WebAudio (no audio files, nothing copied).
// One loop per mood (menu, each region, dungeon, Survivor battle, boss, legendary boss). A look-ahead scheduler
// queues notes ~0.4 s ahead; changing mood cross-fades. Off with Settings → "Nhạc nền".

import { audio } from './audio';

export type Mood = 'menu' | 'valley' | 'frozen' | 'volcanic' | 'sanctuary' | 'swamp' | 'coast' | 'dungeon' | 'battle' | 'boss' | 'legend';

interface Track {
  bpm: number;
  /** space-separated 8th notes: C4, D#5, Bb3… or '-' (rest) / '.' (hold previous) */
  lead: string;
  bass: string;
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  /** optional off-beat noise hat */
  hat?: boolean;
}

// Original melodies (written for this project).
const TRACKS: Record<Mood, Track> = {
  menu: { bpm: 96, leadWave: 'square', bassWave: 'triangle',
    lead: 'E5 - G5 - A5 . G5 E5 D5 - E5 - G5 . - - C5 - D5 - E5 . D5 C5 A4 - C5 - D5 . - -',
    bass: 'A2 - E3 - A2 - E3 - F2 - C3 - F2 - C3 - C3 - G3 - C3 - G3 - G2 - D3 - G2 - D3 -' },
  valley: { bpm: 112, leadWave: 'square', bassWave: 'triangle', hat: true,
    lead: 'G4 B4 D5 . B4 D5 E5 . D5 B4 G4 . A4 B4 A4 . G4 B4 D5 . G5 F#5 E5 . D5 B4 A4 . G4 - - -',
    bass: 'G2 - D3 - G2 - D3 - C3 - G3 - C3 - G3 - G2 - D3 - G2 - D3 - D3 - A3 - D3 - A3 -' },
  frozen: { bpm: 84, leadWave: 'triangle', bassWave: 'sine',
    lead: 'E5 . B4 . G5 . F#5 E5 D5 . B4 . A4 . - - E5 . B4 . G5 . A5 . B5 . A5 G5 F#5 . - -',
    bass: 'E2 . . . B2 . . . C3 . . . G2 . . . E2 . . . B2 . . . A2 . . . B2 . . .' },
  volcanic: { bpm: 132, leadWave: 'sawtooth', bassWave: 'square', hat: true,
    lead: 'D5 D5 F5 D5 G5 F5 D5 C5 D5 - A4 C5 D5 - - - D5 D5 F5 D5 A5 G5 F5 E5 F5 - D5 E5 C5 - - -',
    bass: 'D2 D3 D2 D3 D2 D3 D2 D3 Bb1 Bb2 Bb1 Bb2 C2 C3 C2 C3 D2 D3 D2 D3 D2 D3 D2 D3 Bb1 Bb2 C2 C3 A1 A2 A1 A2' },
  sanctuary: { bpm: 76, leadWave: 'triangle', bassWave: 'sine',
    lead: 'C5 . E5 . G5 . . . B5 . A5 . G5 . . . F5 . A5 . C6 . . . B5 . G5 . D5 . . .',
    bass: 'C3 . . . G2 . . . A2 . . . E2 . . . F2 . . . C3 . . . G2 . . . G2 . . .' },
  swamp: { bpm: 80, leadWave: 'triangle', bassWave: 'triangle',
    lead: 'D5 - F5 - E5 . C#5 - D5 - A4 - - - Bb4 - D5 - C#5 - A4 - E5 . D5 . - - - - - -',
    bass: 'D2 . . . A1 . . . Bb1 . . . A1 . . . D2 . . . F2 . . . E2 . . . A1 . . .' },
  coast: { bpm: 104, leadWave: 'square', bassWave: 'sine', hat: true,
    lead: 'C5 E5 G5 . A5 G5 E5 . F5 A5 C6 . B5 G5 D5 . C5 E5 G5 . A5 . G5 E5 D5 . E5 . C5 - - -',
    bass: 'C3 . G2 . C3 . G2 . F2 . C3 . G2 . D3 . A2 . E3 . A2 . E3 . F2 . G2 . C3 . G2 .' },
  dungeon: { bpm: 90, leadWave: 'square', bassWave: 'triangle',
    lead: 'A4 - C5 - B4 - G#4 - A4 - E4 - - - F4 - A4 - G#4 - E4 - A4 - - - - - - - - -',
    bass: 'A1 . A1 . A1 . A1 . F1 . F1 . E1 . E1 . A1 . A1 . A1 . A1 . D2 . D2 . E1 . E1 .' },
  battle: { bpm: 140, leadWave: 'square', bassWave: 'triangle', hat: true,
    lead: 'E5 E5 - E5 D5 E5 G5 - E5 D5 C5 - D5 - - - C5 C5 - C5 B4 C5 E5 - D5 C5 B4 - G4 - - -',
    bass: 'A2 A3 A2 A3 A2 A3 A2 A3 F2 F3 F2 F3 G2 G3 G2 G3 A2 A3 A2 A3 A2 A3 A2 A3 E2 E3 E2 E3 E2 E3 E2 E3' },
  boss: { bpm: 152, leadWave: 'sawtooth', bassWave: 'square', hat: true,
    lead: 'B4 - B4 C5 B4 - A4 - G4 - A4 B4 F#4 - - - B4 - B4 D5 C#5 - B4 - E5 - D5 C#5 B4 - - -',
    bass: 'E2 E3 E2 E3 E2 E3 E2 E3 C2 C3 C2 C3 D2 D3 D2 D3 E2 E3 E2 E3 E2 E3 E2 E3 G2 G3 F#2 F#3 B1 B2 B1 B2' },
  legend: { bpm: 144, leadWave: 'sawtooth', bassWave: 'square', hat: true,
    lead: 'D5 - A4 - D5 E5 F5 - E5 - C5 - A4 - - - D5 - A4 - D5 E5 F5 G5 A5 - G5 F5 E5 - C#5 -',
    bass: 'D2 D3 D2 D3 D2 D3 D2 D3 C2 C3 C2 C3 A1 A2 A1 A2 Bb1 Bb2 Bb1 Bb2 G1 G2 G1 G2 A1 A2 A1 A2 A1 A2 C#2 C#3' },
};

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** '-' rest → null, '.' hold → 'hold', else frequency in Hz. Exported for tests. */
export function parseNote(tok: string): number | null | 'hold' {
  if (tok === '-') return null;
  if (tok === '.') return 'hold';
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(tok);
  if (!m) throw new Error('bad note ' + tok);
  const midi = (Number(m[2]) + 1) * 12 + NOTE[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function trackSteps(mood: Mood): { lead: (number | null | 'hold')[]; bass: (number | null | 'hold')[] } {
  const t = TRACKS[mood];
  return { lead: t.lead.split(/\s+/).map(parseNote), bass: t.bass.split(/\s+/).map(parseNote) };
}

export const MOODS = Object.keys(TRACKS) as Mood[];

class MusicSystem {
  enabled = true;
  private mood: Mood | null = null;
  private wanted: Mood | null = null;
  private gain: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextAt = 0;
  private steps: ReturnType<typeof trackSteps> | null = null;

  /** Plays a mood (idempotent — safe to call every frame). Starts once audio is unlocked by a gesture. */
  play(mood: Mood): void {
    this.wanted = mood;
    if (!this.enabled) return;
    const c = audio.context();
    if (!c || c.ctx.state !== 'running') return;
    if (this.mood === mood && this.timer != null) return;
    this.start(mood, c.ctx, c.master);
  }

  stop(): void {
    if (this.timer != null) { clearInterval(this.timer); this.timer = null; }
    const c = audio.context();
    if (this.gain && c) { this.gain.gain.setTargetAtTime(0, c.ctx.currentTime, 0.15); const g = this.gain; setTimeout(() => g.disconnect(), 800); }
    this.gain = null;
    this.mood = null;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stop();
    else if (this.wanted) this.play(this.wanted);
  }

  current(): Mood | null { return this.mood; }

  private start(mood: Mood, ctx: AudioContext, master: GainNode): void {
    this.stop();
    this.mood = mood;
    this.steps = trackSteps(mood);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.setTargetAtTime(0.16, ctx.currentTime, 0.4);
    g.connect(master);
    this.gain = g;
    this.step = 0;
    this.nextAt = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(ctx), 100);
  }

  private schedule(ctx: AudioContext): void {
    const g = this.gain, st = this.steps, mood = this.mood;
    if (!g || !st || !mood) return;
    if (ctx.state !== 'running') { this.nextAt = ctx.currentTime + 0.1; return; }
    const tr = TRACKS[mood];
    const dur = 60 / tr.bpm / 2; // one 8th note
    while (this.nextAt < ctx.currentTime + 0.4) {
      const i = this.step % st.lead.length;
      this.voice(ctx, g, st.lead, i, tr.leadWave, 0.22, dur);
      this.voice(ctx, g, st.bass, this.step % st.bass.length, tr.bassWave, 0.3, dur);
      if (tr.hat && this.step % 2 === 1) this.hat(ctx, g, this.nextAt);
      this.nextAt += dur;
      this.step++;
    }
  }

  /** A note lasts through the '.' holds that follow it. */
  private voice(ctx: AudioContext, out: GainNode, seq: (number | null | 'hold')[], i: number, wave: OscillatorType, vol: number, dur: number): void {
    const f = seq[i];
    if (f == null || f === 'hold') return;
    let len = 1;
    while (seq[(i + len) % seq.length] === 'hold' && len < seq.length) len++;
    const t0 = this.nextAt, t1 = t0 + dur * len * 0.92;
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f, t0);
    e.gain.setValueAtTime(0.0001, t0);
    e.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    e.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + Math.min(0.12, (t1 - t0) * 0.5));
    e.gain.exponentialRampToValueAtTime(0.0001, t1);
    o.connect(e); e.connect(out);
    o.start(t0); o.stop(t1 + 0.02);
  }

  private hat(ctx: AudioContext, out: GainNode, t: number): void {
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const e = ctx.createGain();
    e.gain.value = 0.05;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 6000;
    src.connect(hp); hp.connect(e); e.connect(out);
    src.start(t);
  }
}

export const music = new MusicSystem();
