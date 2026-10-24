// Tiny WebAudio synth: every SFX is generated, no audio files needed.

type Tone = { f: number; f2?: number; d: number; type: OscillatorType; v: number; noise?: boolean; delay?: number };

const SFX: Record<string, Tone[]> = {
  shoot: [{ f: 520, f2: 260, d: 0.08, type: 'square', v: 0.05 }],
  hit: [{ f: 180, f2: 90, d: 0.06, type: 'square', v: 0.06 }],
  whip: [{ f: 900, f2: 300, d: 0.07, type: 'sawtooth', v: 0.04 }],
  hurt: [{ f: 140, f2: 70, d: 0.12, type: 'sawtooth', v: 0.08 }],
  boom: [{ f: 120, f2: 40, d: 0.25, type: 'sawtooth', v: 0.08, noise: true }],
  quake: [{ f: 60, f2: 30, d: 0.6, type: 'sawtooth', v: 0.12, noise: true }],
  fire: [{ f: 300, f2: 120, d: 0.3, type: 'sawtooth', v: 0.05, noise: true }],
  bubble: [{ f: 400, f2: 900, d: 0.1, type: 'sine', v: 0.06 }, { f: 500, f2: 1000, d: 0.08, type: 'sine', v: 0.05, delay: 0.06 }],
  zap: [{ f: 1200, f2: 400, d: 0.1, type: 'square', v: 0.04 }],
  dash: [{ f: 200, f2: 600, d: 0.18, type: 'sawtooth', v: 0.05 }],
  shield: [{ f: 600, f2: 900, d: 0.2, type: 'triangle', v: 0.06 }],
  heal: [{ f: 660, d: 0.08, type: 'triangle', v: 0.05 }, { f: 880, d: 0.12, type: 'triangle', v: 0.05, delay: 0.08 }],
  seed: [{ f: 300, f2: 500, d: 0.08, type: 'triangle', v: 0.05 }],
  gem: [{ f: 1320, f2: 1760, d: 0.04, type: 'square', v: 0.025 }],
  levelup: [523, 659, 784, 1046].map((f, i) => ({ f, d: 0.1, type: 'square' as const, v: 0.06, delay: i * 0.08 })),
  boss: [{ f: 110, f2: 55, d: 0.8, type: 'sawtooth', v: 0.1 }, { f: 82, f2: 41, d: 0.9, type: 'square', v: 0.06, delay: 0.2 }],
  victory: [523, 659, 784, 659, 784, 1046].map((f, i) => ({ f, d: 0.14, type: 'square' as const, v: 0.06, delay: i * 0.12 })),
  gameover: [392, 330, 262, 196].map((f, i) => ({ f, d: 0.25, type: 'triangle' as const, v: 0.07, delay: i * 0.2 })),
  click: [{ f: 800, d: 0.04, type: 'square', v: 0.04 }],
};

class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<string, number>();
  enabled = true;

  /** Shared context + master gain (background music plays through the same output). */
  context(): { ctx: AudioContext; master: GainNode } | null {
    return this.ctx && this.master ? { ctx: this.ctx, master: this.master } : null;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(name: string): void {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    const tones = SFX[name];
    if (!tones) return;
    const now = this.ctx.currentTime;
    // throttle: identical sounds at most every 45ms so mass hits don't clip
    if (now - (this.last.get(name) ?? -1) < 0.045) return;
    this.last.set(name, now);
    for (const t of tones) {
      const start = now + (t.delay ?? 0);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(t.v, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + t.d);
      g.connect(this.master);
      const o = this.ctx.createOscillator();
      o.type = t.type;
      o.frequency.setValueAtTime(t.f, start);
      if (t.f2) o.frequency.exponentialRampToValueAtTime(t.f2, start + t.d);
      o.connect(g);
      o.start(start);
      o.stop(start + t.d + 0.02);
      if (t.noise) {
        const len = Math.floor(this.ctx.sampleRate * t.d);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const ng = this.ctx.createGain();
        ng.gain.value = t.v * 0.8;
        src.connect(ng);
        ng.connect(this.master);
        src.start(start);
      }
    }
  }
}

export const audio = new AudioSystem();
