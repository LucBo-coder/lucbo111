import Phaser from 'phaser';
import { CoopHost, coopSession } from '../net/coop';
import { net } from '../net/session';
import { music } from '../systems/music';
import { individualOf, makeOwned } from '../core/progression';
import { playableSpecies } from '../core/data';
import { Rng } from '../core/rng';
import { STEP, World, WORLD_H, WORLD_W } from '../core/world';
import { WorldRenderer } from '../render/WorldRenderer';
import { pixelPerfectZoom } from '../render/pixelZoom';
import { saveStore } from '../systems/save';
import { recordRun, RunSummary, starterEntry, survivorPool } from '../systems/saveSchema';
import type { UIScene } from './UIScene';
import { addCoopHud, rewardCoopHost } from './coopHud';
import { DPR } from './ui';

const SCALE = 3;
const MAX_SIM_STEPS_PER_FRAME = 6;

export interface PerfStats {
  fps: number;
  frameMs: number;
  simMs: number;
  entities: number;
  particles: number;
}

/** SURVIVOR mode. Run-only data (levels, cards, mods) lives in its World and is never saved. */
export class GameScene extends Phaser.Scene {
  coopHost: CoopHost | null = null;
  private clearCoopHud?: () => void;
  startCoopHost(): void {
    coopSession.active = true;
    this.coopHost?.destroy();
    this.clearCoopHud?.();
    this.coopHost = new CoopHost(this.world, () => ({ kind: 'survivor', id: 'survivor', width: this.world.width, height: this.world.height }), rewardCoopHost);
    this.clearCoopHud = addCoopHud(this, this.coopHost);
  }
  world!: World;
  starter = 'charmander';
  paused = false;
  joystick = { x: 0, y: 0 };
  perf: PerfStats = { fps: 0, frameMs: 0, simMs: 0, entities: 0, particles: 0 };
  renderer_!: WorldRenderer;
  private acc = 0;
  private ended = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('Game');
  }

  init(data: { starter?: string }): void {
    this.starter = data.starter ?? 'charmander';
    this.acc = 0;
    this.ended = false;
    this.paused = false;
    this.joystick = { x: 0, y: 0 };
  }

  create(): void {
    // equipment works in Survivor too: the starter's Collection entry (highest level) brings its held item
    const owned = starterEntry(saveStore.data, this.starter);
    this.world = new World({
      starter: this.starter, recruitPool: survivorPool(saveStore.data, playableSpecies()),
      starterHeld: owned?.held ?? null, starterInd: owned ? individualOf(owned) : null, upgrades: saveStore.data.permanentUpgrades,
    });
    (window as unknown as { __game: GameScene }).__game = this; // e2e/debug hook
    this.world.trainer.avatar = saveStore.avatar;
    net.setProfile(saveStore.playerName, saveStore.avatar);

    this.buildMap();
    this.renderer_ = new WorldRenderer(this, this.world, { banner: (t, c) => this.ui.banner(t, c), names: 'notable' }, saveStore.data.settings.quality);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor(0x1a3a1c);
    cam.startFollow(this.renderer_.trainerSprite(), true, 0.15, 0.15);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-ESC', () => this.togglePause());
    kb.on('keydown-P', () => this.togglePause());
    kb.on('keydown-F', () => {
      saveStore.data.settings.showFps = !saveStore.data.settings.showFps;
      void saveStore.save();
    });
    if (new URLSearchParams(location.search).has('debug')) {
      kb.on('keydown-B', () => { if (!this.world.boss) this.world.spawnBoss('onix', this.world.level + 6, false); });
      kb.on('keydown-K', () => this.world.gainExp(this.world.expNext));
    }
    this.game.events.on('blur', this.onBlur, this);

    this.scene.launch('UI', { game: this });
    if (coopSession.active && net.role === 'host') this.startCoopHost();
    this.events.once('shutdown', () => {
      this.coopHost?.destroy(); this.coopHost = null;
      this.scale.off('resize', this.applyZoom, this);
      this.game.events.off('blur', this.onBlur, this);
      this.renderer_.destroy();
    });
  }

  private onBlur(): void {
    if (coopSession.active) return;
    if (!this.ended && this.world.state === 'playing') this.setPaused(true);
  }

  get ui(): UIScene {
    return this.scene.get('UI') as UIScene;
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setPaused(p: boolean): void {
    if (this.ended || this.world.state !== 'playing') return;
    this.paused = p;
    this.ui.showPause(p);
  }

  private applyZoom(): void {
    const { width, height } = this.scale;
    this.cameras.main.setZoom(DPR * pixelPerfectZoom(Math.min(width, height) / DPR / 640, 0.6, 1.5));
  }

  private buildMap(): void {
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'grass').setOrigin(0).setTileScale(2).setDepth(-10);
    const rng = new Rng(1234);
    for (let i = 0; i < 520; i++) {
      const x = rng.range(20, WORLD_W - 20), y = rng.range(20, WORLD_H - 20);
      const isFlower = rng.chance(0.55);
      const img = this.add.image(x, y, isFlower ? 'flower' : 'bush').setScale(isFlower ? 2 : 3).setDepth(isFlower ? -5 : y - 10);
      if (isFlower) img.setTint(rng.pick([0xffffff, 0xffa0c0, 0xa0c0ff, 0xfff080]));
    }
    for (const o of this.world.obstacles) {
      this.add.image(o.x, o.y + 8, 'shadow').setScale(o.r / 5, 3).setDepth(o.y - 1);
      this.add.image(o.x, o.y + o.r * 0.4, 'tree').setOrigin(0.5, 0.92).setScale((SCALE * o.r) / 26).setDepth(o.y);
    }
    const edge = this.add.graphics().setDepth(-4);
    edge.fillStyle(0x1c4020, 1);
    edge.fillRect(0, 0, WORLD_W, 14).fillRect(0, WORLD_H - 14, WORLD_W, 14).fillRect(0, 0, 14, WORLD_H).fillRect(WORLD_W - 14, 0, 14, WORLD_H);
    for (let x = 0; x < WORLD_W; x += 40) {
      this.add.image(x, 10, 'bush').setScale(3.5).setDepth(10);
      this.add.image(x, WORLD_H - 4, 'bush').setScale(3.5).setDepth(WORLD_H);
    }
    for (let y = 0; y < WORLD_H; y += 30) {
      this.add.image(8, y, 'bush').setScale(3.5).setDepth(y);
      this.add.image(WORLD_W - 8, y, 'bush').setScale(3.5).setDepth(y);
    }
  }

  update(_time: number, delta: number): void {
    music.play(this.world.boss?.alive ? 'boss' : 'battle');
    const t0 = performance.now();
    const w = this.world;
    const k = this.keys;
    let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (!ix && !iy) { ix = this.joystick.x; iy = this.joystick.y; }
    w.input.x = ix; w.input.y = iy;

    let simMs = 0;
    if (!this.paused && w.state === 'playing') {
      // Fixed-timestep simulation: gameplay is identical at 30, 60 or 144 FPS
      this.acc += Math.min(delta, 100) / 1000;
      let n = 0;
      const s0 = performance.now();
      while (this.acc >= STEP && n < MAX_SIM_STEPS_PER_FRAME) {
        w.step(STEP);
        this.acc -= STEP;
        n++;
        if (w.state !== 'playing') { this.acc = 0; break; }
      }
      if (n === MAX_SIM_STEPS_PER_FRAME) this.acc = 0; // spiral-of-death guard
      simMs = performance.now() - s0;
    }

    const events = w.drainEvents();
    this.coopHost?.update(performance.now(), this.paused, events);
    this.renderer_.handle(events);
    this.renderer_.render(delta);

    if ((w.state === 'gameover' || w.state === 'victory') && !this.ended) this.endRun();

    const p = this.perf;
    p.fps = this.game.loop.actualFps;
    p.frameMs = p.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    p.simMs = p.simMs * 0.9 + simMs * 0.1;
    p.entities = w.enemies.length + w.allies.length + 1 + w.projectiles.filter((q) => q.active).length;
    p.particles = this.renderer_.vfx.aliveParticles();
  }

  private endRun(): void {
    if (coopSession.active) {
      const w = this.world;
      // the guest played support: pay a share of the run's earnings into its own save
      this.coopHost?.grant({ currency: Math.max(10, Math.floor(w.kills / 10) + w.level * 2 + w.bossesDefeated * 50), note: 'Thưởng hỗ trợ sinh tồn' });
      net.send({ t: 'coopEnd', reason: this.world.state === 'victory' ? 'Cả đội đã chiến thắng!' : 'Lượt sinh tồn đã kết thúc.' });
    }
    this.ended = true;
    const w = this.world;
    const summary: RunSummary = {
      victory: w.state === 'victory', time: w.time, kills: w.kills, level: w.level, bosses: w.bossesDefeated,
      recruited: w.allies.map((a) => a.defId),
    };
    const prevBest = saveStore.data.stats.bestTime;
    const ownedBefore = new Set(saveStore.data.collection.map((c) => c.species));
    const next = recordRun(saveStore.data, summary, (sp) => makeOwned(sp, 5, 'survivor'));
    const unlocked = next.collection.filter((c) => !ownedBefore.has(c.species)).map((c) => c.species);
    void saveStore.save(next);
    this.time.delayedCall(1600, () => {
      this.scene.stop('UI');
      this.scene.start('Result', {
        ...summary, starter: this.starter, newRecord: summary.time > prevBest, unlocked,
        party: w.allies.map((a) => ({ name: a.name, sprite: a.defId, level: a.level, damage: Math.round(a.damageDealt) })),
      });
    });
  }
}
