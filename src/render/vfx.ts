import Phaser from 'phaser';
import { PokeType } from '../core/types';

// Reusable, pooled VFX library covering all 18 types.
// One particle emitter per preset (created lazily), pooled flash/ring/slash/beam images,
// and a global particle budget scaled by the quality setting.

export type Quality = 'low' | 'medium' | 'high';

export const QUALITY_PROFILE: Record<Quality, { particles: number; maxAlive: number; trails: boolean; weather: number; sway: boolean; ambient: number; lights: boolean }> = {
  low: { particles: 0.35, maxAlive: 350, trails: false, weather: 0.3, sway: false, ambient: 0, lights: false },
  medium: { particles: 0.7, maxAlive: 900, trails: false, weather: 0.6, sway: true, ambient: 0.5, lights: true },
  high: { particles: 1, maxAlive: 1600, trails: true, weather: 1, sway: true, ambient: 1, lights: true },
};

interface Preset {
  tex: string;
  tints: number[];
  speed: [number, number];
  life: [number, number];
  gravityY?: number;
  scale?: [number, number];
  add?: boolean;
  rotate?: boolean;
}

const PRESETS: Record<string, Preset> = {
  normal: { tex: 'p_star', tints: [0xffffff, 0xe8e0c8], speed: [60, 170], life: [180, 380], scale: [1.4, 0] },
  fire: { tex: 'px4', tints: [0xff4010, 0xff9020, 0xffe060], speed: [40, 180], life: [250, 550], gravityY: -160, add: true },
  water: { tex: 'p_drop', tints: [0x3888f0, 0x80c8ff, 0xffffff], speed: [60, 200], life: [250, 500], gravityY: 380 },
  electric: { tex: 'p_star', tints: [0xffe040, 0xffffff, 0xfff6a0], speed: [100, 300], life: [100, 260], add: true },
  grass: { tex: 'p_leaf', tints: [0x2a8a30, 0x70d050, 0xb0f080], speed: [40, 160], life: [350, 700], gravityY: 60, rotate: true },
  ice: { tex: 'p_shard', tints: [0xa0e8ff, 0xffffff, 0x70c0f0], speed: [60, 200], life: [250, 500], rotate: true },
  fighting: { tex: 'px4', tints: [0xc03028, 0xffb090, 0xffffff], speed: [120, 260], life: [120, 260] },
  poison: { tex: 'p_smoke', tints: [0xa040c0, 0xd080ff, 0x702090], speed: [15, 70], life: [450, 900], gravityY: -40, scale: [1.6, 2.6] },
  ground: { tex: 'px4', tints: [0xc0a050, 0x8a7040, 0xe0d0a0], speed: [60, 200], life: [300, 600], gravityY: 380 },
  flying: { tex: 'p_wind', tints: [0xffffff, 0xd0e8ff], speed: [80, 220], life: [200, 400], rotate: true },
  psychic: { tex: 'p_psychic', tints: [0xf85888, 0xffb0d0, 0xffffff], speed: [30, 120], life: [300, 600], add: true },
  bug: { tex: 'px4', tints: [0xa8b820, 0xe0f060, 0xffffff], speed: [60, 180], life: [200, 420] },
  rock: { tex: 'px4', tints: [0x7a7060, 0xa09880, 0x5a5244], speed: [80, 260], life: [300, 600], gravityY: 420 },
  ghost: { tex: 'p_shadow', tints: [0x705898, 0x403050, 0xc0a0ff], speed: [20, 90], life: [400, 800], gravityY: -60, scale: [1.6, 0.2] },
  dragon: { tex: 'p_dragon', tints: [0x7038f8, 0xc0a0ff, 0xff6080], speed: [80, 240], life: [250, 520], add: true },
  dark: { tex: 'p_shadow', tints: [0x302030, 0x705848, 0x000000], speed: [40, 150], life: [250, 500], scale: [1.6, 0] },
  steel: { tex: 'p_star', tints: [0xd0d8f0, 0xffffff, 0x8890a8], speed: [100, 260], life: [150, 320] },
  fairy: { tex: 'p_star', tints: [0xffb0d0, 0xffffff, 0xffe0f0], speed: [30, 120], life: [400, 700], gravityY: -50, add: true },
  // utility presets
  dust: { tex: 'px4', tints: [0xe8e0d0, 0xc8c0b0], speed: [20, 90], life: [250, 550], scale: [1.6, 0] },
  heal: { tex: 'p_star', tints: [0x80ff90, 0xffffff], speed: [10, 50], life: [500, 800], gravityY: -120 },
  gold: { tex: 'px4', tints: [0xffe060, 0xffffff, 0xffa020], speed: [60, 300], life: [400, 900], add: true },
  hit: { tex: 'px4', tints: [0xffffff], speed: [60, 160], life: [80, 200] },
  rain: { tex: 'px', tints: [0xa0c8ff], speed: [0, 0], life: [500, 700] },
};

const NAMED_TYPE: Record<string, PokeType> = {
  ember: 'fire', explosion_fire: 'fire', fire_field: 'fire', water: 'water', bubble: 'water', leaf: 'grass', vine: 'grass', seed: 'grass',
  spore: 'grass', spark: 'electric', lightning: 'electric', rock: 'rock', rock_field: 'rock', quake: 'ground', sand: 'ground',
  poison: 'poison', poison_field: 'poison', wind: 'flying', string: 'bug', bite: 'dark', sonic: 'normal',
  flame_beam: 'fire', water_beam: 'water', solar_beam: 'grass', psy_beam: 'psychic', psychic: 'psychic', shadow: 'dark', steel: 'steel',
  thunder: 'electric', petals: 'grass', wind_burst: 'flying', mud: 'ground',
};

export class VfxLibrary {
  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private imgPool: Phaser.GameObjects.Image[] = [];
  private gfxPool: Phaser.GameObjects.Graphics[] = [];
  private profile = QUALITY_PROFILE.high;

  constructor(private scene: Phaser.Scene, quality: Quality = 'high') {
    this.setQuality(quality);
  }

  setQuality(q: Quality): void {
    this.profile = QUALITY_PROFILE[q];
  }

  get quality() {
    return this.profile;
  }

  private emitter(name: string): Phaser.GameObjects.Particles.ParticleEmitter {
    let e = this.emitters.get(name);
    if (e) return e;
    const p = PRESETS[name] ?? PRESETS.normal;
    e = this.scene.add.particles(0, 0, p.tex, {
      speed: { min: p.speed[0], max: p.speed[1] },
      lifespan: { min: p.life[0], max: p.life[1] },
      scale: { start: p.scale?.[0] ?? 1.2, end: p.scale?.[1] ?? 0 },
      tint: p.tints,
      gravityY: p.gravityY ?? 0,
      rotate: p.rotate ? { min: 0, max: 360 } : 0,
      blendMode: p.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
      emitting: false,
      maxParticles: 400,
    }).setDepth(8000);
    this.emitters.set(name, e);
    return e;
  }

  aliveParticles(): number {
    let n = 0;
    for (const e of this.emitters.values()) n += e.getAliveParticleCount();
    return n;
  }

  /** Emit n particles of a preset, scaled by quality and the global budget. */
  emit(name: string, x: number, y: number, n: number): void {
    const alive = this.aliveParticles();
    if (alive > this.profile.maxAlive) return;
    const pressure = alive > this.profile.maxAlive * 0.6 ? 0.5 : 1; // degrade gracefully under load
    const count = Math.round(n * this.profile.particles * pressure);
    if (count > 0) this.emitter(name).explode(count, x, y);
  }

  hit(type: string, x: number, y: number, n = 6): void {
    this.emit(PRESETS[type] ? type : 'hit', x, y, n);
  }

  trail(type: string, x: number, y: number): void {
    if (this.profile.trails) this.emit(type, x, y, 1);
  }

  private img(tex: string): Phaser.GameObjects.Image {
    const i = this.imgPool.pop() ?? this.scene.add.image(0, 0, tex);
    i.setTexture(tex).setActive(true).setVisible(true).setAlpha(1).setAngle(0).setScale(1).clearTint().setOrigin(0.5);
    return i;
  }

  private release(i: Phaser.GameObjects.Image): void {
    i.setActive(false).setVisible(false);
    if (this.imgPool.length < 64) this.imgPool.push(i);
    else i.destroy();
  }

  flash(x: number, y: number, r: number, tint: number, ms = 260, additive = true): void {
    const c = this.img('circle').setPosition(x, y).setTint(tint).setDepth(7900).setScale(((r * 2) / 64) * 0.4).setAlpha(additive ? 0.7 : 0.45)
      .setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.scene.tweens.add({ targets: c, scale: (r * 2) / 64, alpha: 0, duration: ms, onComplete: () => this.release(c) });
  }

  ring(x: number, y: number, r: number, tint: number, ms = 450): void {
    const c = this.img('ringTex').setPosition(x, y).setTint(tint).setDepth(7900).setScale(0.2).setBlendMode(Phaser.BlendModes.NORMAL);
    this.scene.tweens.add({ targets: c, scale: (r * 2) / 64, alpha: 0, duration: ms, onComplete: () => this.release(c) });
  }

  slash(x: number, y: number, angle: number, r: number, tint = 0xffffff): void {
    const s = this.img('slash').setPosition(x, y).setRotation(angle).setDepth(7500).setScale((r / 16) * 0.8).setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: s, alpha: 0, scale: (r / 16) * 1.1, duration: 160, onComplete: () => this.release(s) });
  }

  beam(x: number, y: number, angle: number, len: number, width: number, tint: number): void {
    const b = this.img('px4').setOrigin(0, 0.5).setPosition(x, y).setRotation(angle).setDepth(7800).setTint(tint)
      .setScale(len / 4, (width * 2) / 4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85);
    this.scene.tweens.add({ targets: b, scaleY: 0.2, alpha: 0, duration: 220, onComplete: () => this.release(b) });
  }

  /** Cone spray (breath / wind / powder): a fading fan + type particles along it (pooled Graphics). */
  cone(x: number, y: number, angle: number, len: number, spread: number, type: string): void {
    const g = this.gfxPool.pop() ?? this.scene.add.graphics();
    const col = TYPE_TINT[type] ?? 0xffffff;
    g.clear().setVisible(true).setAlpha(0.75).setDepth(7800).setBlendMode(Phaser.BlendModes.ADD);
    for (const [f, a] of [[1, 0.25], [0.7, 0.35], [0.4, 0.5]] as const) {
      g.fillStyle(col, a).beginPath().moveTo(x, y);
      g.arc(x, y, len * f, angle - spread, angle + spread, false).closePath().fillPath();
    }
    for (let i = 0; i < 5; i++) {
      const a = angle + (Math.random() * 2 - 1) * spread, d = len * (0.3 + Math.random() * 0.7);
      this.emit(type, x + Math.cos(a) * d, y + Math.sin(a) * d, 2);
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => { g.setVisible(false); this.gfxPool.push(g); } });
  }

  /** Jagged lightning bolt between two points (pooled Graphics). */
  lightning(x1: number, y1: number, x2: number, y2: number, color = 0xfff080): void {
    const g = this.gfxPool.pop() ?? this.scene.add.graphics();
    g.clear().setVisible(true).setAlpha(1).setDepth(7850).setBlendMode(Phaser.BlendModes.ADD);
    const segs = 9;
    const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;
    for (const [w, c] of [[5, color], [2, 0xffffff]] as const) {
      g.lineStyle(w, c, 1).beginPath().moveTo(x1, y1);
      for (let i = 1; i < segs; i++) {
        const t = i / segs, j = (Math.random() - 0.5) * 26;
        g.lineTo(x1 + (x2 - x1) * t + (nx / nl) * j, y1 + (y2 - y1) * t + (ny / nl) * j);
      }
      g.lineTo(x2, y2).strokePath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => { g.setVisible(false); this.gfxPool.push(g); } });
  }

  /**
   * Per-type impact where a hit lands — each type has its own composition (not just a tint):
   * explosion, splash ring, spark burst, leaf burst, frost shards, toxic splash, ground crack, stone shockwave,
   * feather swirl, psychic rings, spectral wisps, dragon pulse, dark burst, metal sparks, fairy sparkle,
   * punch shockwave, swarm, neutral star.
   */
  impact(type: string, x: number, y: number, r = 22): void {
    const col = TYPE_TINT[type] ?? 0xffffff;
    switch (type) {
      case 'fire': this.flash(x, y, r * 1.2, 0xff7020, 220); this.emit('fire', x, y, 10); return;
      case 'water': this.ring(x, y, r * 1.4, 0x80c8ff, 300); this.emit('water', x, y, 9); return;
      case 'electric': this.flash(x, y, r, 0xfff080, 140); this.emit('electric', x, y, 10); if (this.profile.trails) this.lightning(x - 12, y - 16, x + 10, y + 8); return;
      case 'grass': this.emit('grass', x, y, 9); this.ring(x, y, r, 0x70d050, 260); return;
      case 'ice': this.emit('ice', x, y, 10); this.flash(x, y, r, 0xc8f0ff, 260, false); return;
      case 'poison': this.emit('poison', x, y, 7); this.flash(x, y, r, 0xb050d0, 300, false); return;
      case 'ground': this.emit('ground', x, y, 9); this.emit('dust', x, y + 6, 6); this.slash(x, y + 6, 0, r * 0.8, 0x8a7040); return;
      case 'rock': this.emit('rock', x, y, 9); this.ring(x, y, r * 1.3, 0xa09880, 260); return;
      case 'flying': this.emit('flying', x, y, 8); this.slash(x, y, Math.random() * Math.PI, r, 0xe0f0ff); return;
      case 'psychic': this.ring(x, y, r, 0xff70b0, 260); this.ring(x, y, r * 1.8, 0xffb0d0, 420); this.emit('psychic', x, y, 6); return;
      case 'ghost': this.emit('ghost', x, y, 8); this.flash(x, y, r, 0x8060b0, 360, false); return;
      case 'dragon': this.ring(x, y, r * 1.5, 0x8050ff, 320); this.emit('dragon', x, y, 9); return;
      case 'dark': this.flash(x, y, r * 1.2, 0x302030, 260, false); this.emit('dark', x, y, 8); return;
      case 'steel': this.emit('steel', x, y, 10); this.slash(x, y, Math.PI / 4, r, 0xe0e8ff); return;
      case 'fairy': this.emit('fairy', x, y, 10); this.ring(x, y, r, 0xffc0e0, 360); return;
      case 'fighting': this.ring(x, y, r * 1.2, 0xffb090, 200); this.emit('fighting', x, y, 7); return;
      case 'bug': this.emit('bug', x, y, 10); return;
      default: this.emit('normal', x, y, 6); this.flash(x, y, r * 0.8, col, 160); return;
    }
  }

  /** Named VFX dispatched by skills/world events. `type` overrides the default type for a name. */
  named(name: string, x: number, y: number, r = 40, angle = 0, type?: string, len?: number): void {
    const base = name.replace(/_(hit|start)$/, '');
    const t = type ?? NAMED_TYPE[base] ?? 'normal';
    const col = TYPE_TINT[t] ?? 0xffffff;
    if (name.endsWith('_hit')) return this.impact(t, x, y);
    if (name === 'impact_type') return this.impact(t, x, y, r);
    if (name.endsWith('_start')) { this.flash(x, y, r, col, 380, t !== 'rock'); this.emit(t, x, y, 14); return; }
    switch (name) {
      case 'slash': case 'impact': case 'vine': case 'bite':
        this.slash(x, y, angle, r, name === 'vine' ? 0x70e060 : name === 'bite' ? 0xffd0d0 : col);
        this.hit(t, x, y, 4);
        return;
      case 'explosion_fire': this.flash(x, y, r, 0xff7020); this.emit('fire', x, y, 22); return;
      case 'rock': this.flash(x, y, r, 0x8a7a60, 200, false); this.emit('rock', x, y, 14); this.emit('dust', x, y, 8); return;
      case 'quake': this.ring(x, y, r, 0xd0b070); this.emit('rock', x, y, 30); this.emit('dust', x, y, 20); return;
      case 'lightning': {
        const l = len ?? 300;
        this.lightning(x, y, x + Math.cos(angle) * l, y + Math.sin(angle) * l);
        this.emit('electric', x + Math.cos(angle) * l, y + Math.sin(angle) * l, 10);
        return;
      }
      case 'beam': this.beam(x, y, angle, len ?? 300, r, col); return;
      case 'heal': this.emit('heal', x, y, 10); return;
      case 'shield': this.flash(x, y, r, 0x60d0ff, 300); return;
      case 'buff': this.ring(x, y, 50, 0xffd040, 400); this.emit('gold', x, y, 8); return;
      case 'poof': this.emit('dust', x, y, 12); return;
      case 'puff': this.emit('dust', x, y, 3); return;
      case 'capture': this.ring(x, y, 60, 0xff4040, 500); this.emit('gold', x, y, 30); return;
      case 'evolve': this.flash(x, y, 90, 0xffffff, 600); this.ring(x, y, 110, 0xa0ffb0, 700); this.emit('heal', x, y, 30); return;
      case 'mega':
        this.flash(x, y, 120, 0xffffff, 700);
        [0xff4060, 0xffc040, 0x60ff80, 0x40a0ff, 0xc060ff].forEach((c, i) => this.scene.time.delayedCall(i * 90, () => this.ring(x, y, 80 + i * 30, c, 600)));
        this.emit('fairy', x, y, 40);
        return;
      case 'flame_beam': case 'water_beam': case 'solar_beam': case 'psy_beam': {
        const tint = name === 'flame_beam' ? 0xff7020 : name === 'water_beam' ? 0x60b0ff : name === 'solar_beam' ? 0xfff080 : 0xff70c0;
        this.beam(x, y, angle, len ?? 300, r, tint);
        this.emit(t, x + Math.cos(angle) * (len ?? 300), y + Math.sin(angle) * (len ?? 300), 10);
        return;
      }
      case 'thunder': this.lightning(x, y - 260, x, y); this.flash(x, y, r, 0xfff080, 300); this.emit('electric', x, y, 16); return;
      case 'petals': this.ring(x, y, r, 0xf8a0c0, 450); this.emit('fairy', x, y, 24); this.emit('grass', x, y, 12); return;
      case 'wind_burst': this.ring(x, y, r, 0xd0e8ff, 400); this.emit('flying', x, y, 18); return;
      case 'cone': this.cone(x, y, angle, len ?? 200, r, t); return;
      default: this.hit(t, x, y, 8);
    }
  }

  destroy(): void {
    for (const e of this.emitters.values()) e.destroy();
    this.emitters.clear();
    this.imgPool.forEach((i) => i.destroy());
    this.gfxPool.forEach((g) => g.destroy());
    this.imgPool = [];
    this.gfxPool = [];
  }
}

export const TYPE_TINT: Record<string, number> = {
  normal: 0xe8e0c8, fire: 0xff6020, water: 0x4090ff, electric: 0xffe040, grass: 0x60c850, ice: 0xa0e8ff,
  fighting: 0xe04030, poison: 0xb050d0, ground: 0xd0b060, flying: 0xc0d8ff, psychic: 0xff6090, bug: 0xb8c830,
  rock: 0x9a8060, ghost: 0x8060b0, dragon: 0x8050ff, dark: 0x504040, steel: 0xc0c8e0, fairy: 0xffb0d0,
};
