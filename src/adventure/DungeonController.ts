import { DungeonDef, DungeonMap } from '../core/map/dungeonMap';
import { TILE_PX } from '../core/map/tiles';
import { makeWildState } from '../core/wildAI';
import type { Unit, World } from '../core/world';
import type { Difficulty } from '../systems/saveSchema';
import type { PokeType } from '../core/types';

// Dungeon run state machine on top of the shared combat World:
//   entrance → waves (doors lock, 3 waves, elites in the last) → hazard corridor (falling rocks)
//   → rune-plate puzzle (memorise the lit order) → boss room (door locks, Onix) → reward chest → exit.

export type DungeonPhase = 'entrance' | 'waves' | 'hazard' | 'puzzle' | 'bossWait' | 'boss' | 'reward' | 'done';

export interface DungeonHooks {
  banner(text: string, color?: string): void;
  doorsChanged(): void;
  bossDefeated(): void;
  /** Challenge time ran out */
  timeUp?(): void;
}

export class DungeonController {
  phase: DungeonPhase = 'entrance';
  wave = -1;
  waveUnits: Unit[] = [];
  /** Puzzle: plate index currently lit by the demonstration (-1 none) */
  showing = -1;
  litPlates = new Set<number>();
  progress = 0;
  boss: Unit | null = null;
  chestOpened = false;
  private t = 0;
  private hazardT = 0;
  private demoStep = -1;
  private onPlate = -1;
  readonly cfg: DungeonDef['difficulties'][string];
  /** Challenge: seconds left (null = no time limit); counts from the first wave until the boss falls */
  timeLeft: number | null = null;
  private get hazardType(): PokeType { return this.map.def.hazardType ?? 'rock'; }

  constructor(private world: World, readonly map: DungeonMap, readonly difficulty: Difficulty, private hooks: DungeonHooks) {
    this.cfg = map.def.difficulties[difficulty];
    this.timeLeft = this.cfg.timeLimit ?? null;
    map.setDoor('D', true);
    map.setDoor('Q', false);
  }

  private trainerTile(): { tx: number; ty: number } {
    return { tx: Math.floor(this.world.trainer.x / TILE_PX), ty: Math.floor(this.world.trainer.y / TILE_PX) };
  }

  private center(tx: number, ty: number): { x: number; y: number } {
    return { x: (tx + 0.5) * TILE_PX, y: (ty + 0.5) * TILE_PX };
  }

  private spawn(species: string, level: number, x: number, y: number, elite: boolean): Unit {
    return this.world.spawnWild(species, level, x, y, {
      wild: makeWildState(x, y, 'aggressive', { aggroR: 900, leash: 2000, homeR: 60 }),
      hostile: true, tag: 'dungeon', noCapture: true, elite, hpMult: this.cfg.hpMult,
    });
  }

  private startWave(i: number): void {
    this.wave = i;
    const [x0, y0, x1] = this.map.def.rooms.wave;
    const list = this.map.def.waves[i];
    const last = i === this.map.def.waves.length - 1;
    let eliteLeft = last ? this.cfg.elites : 0;
    this.waveUnits = [];
    for (const [species, count] of list) {
      for (let k = 0; k < count; k++) {
        const tx = this.world.rng.int(x0 + 1, x1 - 1), ty = this.world.rng.int(y0 + 1, y0 + 4);
        const p = this.center(tx, ty);
        this.waveUnits.push(this.spawn(species, this.cfg.level + i, p.x, p.y, eliteLeft-- > 0));
      }
    }
    this.hooks.banner(`Đợt ${i + 1}/${this.map.def.waves.length}`, '#ffcc44');
  }

  update(dt: number): void {
    const { tx, ty } = this.trainerTile();
    const room = this.map.roomAt(tx, ty);
    this.t -= dt;
    // Challenge clock: runs from the first wave until the boss is down
    if (this.timeLeft != null && this.phase !== 'entrance' && this.phase !== 'reward' && this.phase !== 'done') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.phase = 'done'; this.hooks.timeUp?.(); return; }
    }
    switch (this.phase) {
      case 'entrance':
        if (room === 'wave' && ty < this.map.def.rooms.wave[3] - 1) {
          this.map.setDoor('D', false);
          this.hooks.doorsChanged();
          this.hooks.banner('Cửa đã khóa! Đánh bại toàn bộ kẻ địch', '#ff7050');
          this.startWave(0);
          this.phase = 'waves';
        }
        break;
      case 'waves':
        if (this.waveUnits.every((u) => !u.alive)) {
          // short breather between waves (t counts down once the room is clear)
          if (this.t > 0) break;
          if (this.wave + 1 < this.map.def.waves.length) {
            this.t = 1.2;
            this.startWave(this.wave + 1);
          } else {
            this.map.setDoor('D', true);
            this.hooks.doorsChanged();
            this.hooks.banner('Cửa đã mở! Coi chừng đá rơi phía trước', '#80ff90');
            this.phase = 'hazard';
          }
        } else this.t = 1.2;
        break;
      case 'hazard':
        if (room === 'hazard') {
          this.hazardT -= dt;
          if (this.hazardT <= 0) {
            this.hazardT = this.cfg.hazardEvery;
            const tr = this.world.trainer;
            this.world.addHazard(tr.x + tr.vx * 0.6, tr.y + tr.vy * 0.6, 60, 1.0, 45, this.hazardType, this.cfg.level, this.map.def.hazardStatus);
            const [x0, y0, x1, y1] = this.map.def.rooms.hazard;
            const p = this.center(this.world.rng.int(x0, x1), this.world.rng.int(Math.max(y0, ty - 4), Math.min(y1, ty + 2)));
            this.world.addHazard(p.x, p.y, 55, 1.2, 45, this.hazardType, this.cfg.level, this.map.def.hazardStatus);
          }
        }
        if (room === 'puzzle') {
          this.phase = 'puzzle';
          this.startDemo();
          this.hooks.banner('Ghi nhớ thứ tự các phiến đá sáng lên!', '#c0a0ff');
        }
        break;
      case 'puzzle':
        this.updatePuzzle(dt);
        break;
      case 'bossWait':
        if (room === 'boss' && ty < this.map.def.rooms.boss[3] - 1) {
          this.map.setDoor('Q', false);
          this.hooks.doorsChanged();
          const b = this.map.bossSpawn;
          this.boss = this.world.spawnBoss(this.map.def.boss.id, this.cfg.level + this.map.def.boss.levelOffset, false, this.center(b.x, b.y));
          this.boss.maxHp = Math.floor(this.boss.maxHp * this.cfg.bossHp);
          this.boss.hp = this.boss.maxHp;
          this.boss.tag = 'dungeon';
          this.phase = 'boss';
        }
        break;
      case 'boss':
        if (this.boss && !this.boss.alive) {
          this.map.setDoor('Q', true);
          this.hooks.doorsChanged();
          this.hooks.bossDefeated();
          this.phase = 'reward';
        }
        break;
    }
  }

  private startDemo(): void {
    this.progress = 0;
    this.litPlates.clear();
    this.demoStep = 0;
    this.t = 0.9;
    this.showing = this.map.def.plateOrder[0];
  }

  private updatePuzzle(dt: number): void {
    void dt;
    if (this.demoStep >= 0) {
      if (this.t > 0) return;
      this.demoStep++;
      const order = this.map.def.plateOrder;
      if (this.demoStep >= order.length) { this.demoStep = -1; this.showing = -1; return; }
      this.showing = order[this.demoStep];
      this.t = 0.9;
      return;
    }
    const tr = this.world.trainer;
    const idx = this.map.plates.findIndex((p) => Math.hypot((p.x + 0.5) * TILE_PX - tr.x, (p.y + 0.5) * TILE_PX - tr.y) < 30);
    if (idx === this.onPlate) return;
    this.onPlate = idx;
    if (idx < 0 || this.litPlates.has(idx)) return;
    if (idx === this.map.def.plateOrder[this.progress]) {
      this.litPlates.add(idx);
      this.progress++;
      if (this.progress >= this.map.def.plateOrder.length) {
        this.map.setDoor('Q', true);
        this.hooks.doorsChanged();
        this.hooks.banner('Phong ấn đã mở! Boss đang chờ phía trước', '#ffd040');
        this.phase = 'bossWait';
      }
    } else {
      // Wrong plate: a rock falls on the trainer and the sequence is shown again
      this.world.addHazard(tr.x, tr.y, 50, 0.7, 30, this.hazardType, this.cfg.level);
      this.hooks.banner('Sai thứ tự! Xem lại nhé', '#ff7050');
      this.startDemo();
    }
  }

  /** Puzzle step used by tests/e2e to inspect state. */
  get demoRunning(): boolean {
    return this.demoStep >= 0;
  }

  openChest(): DungeonDef['difficulties'][string]['rewards'] | null {
    if (this.phase !== 'reward' || this.chestOpened) return null;
    this.chestOpened = true;
    this.phase = 'done';
    return this.cfg.rewards;
  }
}
