import { bogPoisonChance, ENV, EnvCycle, heatDamage, stepCycle, terrainSlow } from '../core/environment';
import { T, TILE_PX } from '../core/map/tiles';
import type { Unit } from '../core/world';
import type { AdventureScene } from '../scenes/AdventureScene';

// Applies the regional environment rules (core/environment.ts) to the player's side in the Adventure:
// ice / deep-snow footing and blizzards in Núi Tuyết, lava heat and eruptions in Vùng Núi Lửa.
// Region maps only (dungeons have their own hazards). Everything it sets is reset when it leaves a region.

export class EnvironmentController {
  readonly cycle: EnvCycle = { event: null, t: 25 };
  private tick = 0;
  private heatT = 0;
  private emberT = 0;
  private bogT = 0;

  constructor(private scene: AdventureScene) {}

  private get theme(): string | undefined {
    return this.scene.mapKind === 'dungeon' ? undefined : this.scene.regionDef?.theme;
  }

  /** Player side currently on the field. */
  private side(): Unit[] {
    const w = this.scene.world;
    return [w.trainer, ...w.allies.filter((a) => !a.fainted)];
  }

  private terrainUnder(u: Unit): number {
    return this.scene.map.terrainAt(Math.floor(u.x / TILE_PX), Math.floor((u.y + 6) / TILE_PX));
  }

  private nearLava(u: Unit): boolean {
    const tx = Math.floor(u.x / TILE_PX), ty = Math.floor(u.y / TILE_PX), r = ENV.heatRangeTiles;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.scene.map.terrainAt(tx + dx, ty + dy) === T.Lava) return true;
    return false;
  }

  update(dt: number): void {
    const w = this.scene.world;
    const theme = this.theme;
    const started = stepCycle(this.cycle, theme, dt, () => w.rng.next());
    if (started === 'blizzard') this.scene.ui?.eventAlert('BÃO TUYẾT! Cả đội bị chậm — đứng gần Pokémon hệ Lửa để sưởi ấm. Hệ Băng không bị ảnh hưởng.', '#c8e8ff');
    if (started === 'eruption') this.scene.ui?.eventAlert('NÚI LỬA PHUN TRÀO! Tàn lửa rơi quanh bạn — tránh các vòng đỏ.', '#ff9060');

    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.25;
      const blizzard = this.cycle.event === 'blizzard';
      const fire = w.allies.filter((a) => !a.fainted && a.types.includes('fire'));
      for (const u of this.side()) {
        if (theme !== 'frozen') { u.envSlow = 0; continue; }
        const t = this.terrainUnder(u);
        const warm = fire.some((f) => f !== u && Math.hypot(f.x - u.x, f.y - u.y) <= ENV.warmthRange) || u.types.includes('fire');
        u.envSlow = terrainSlow(t === T.Ice ? 'ice' : t === T.SnowDeep ? 'snowDeep' : 'other', u.types, blizzard, warm);
      }
      // reset anything left from a region change
      if (theme !== 'frozen') for (const a of w.allies) a.envSlow = 0;
    }

    if (theme === 'swamp') {
      this.bogT -= dt;
      if (this.bogT <= 0) {
        this.bogT = ENV.bogTick;
        for (const u of this.side()) {
          if (this.terrainUnder(u) !== T.Bog || w.hasStatus(u, 'poison') || w.hasStatus(u, 'badPoison')) continue;
          if (w.rng.chance(bogPoisonChance(u.types))) w.applyStatus(u, { kind: 'poison', chance: 1, duration: 4, magnitude: 0.03 }, null);
        }
      }
    }
    if (theme === 'volcanic') {
      this.heatT -= dt;
      if (this.heatT <= 0) {
        this.heatT = ENV.heatTick;
        for (const u of this.side()) {
          if (!this.nearLava(u)) continue;
          const d = heatDamage(u.types, u.hp, u.maxHp);
          if (d > 0) w.applyDamage(u, d, null, false, 1, true);
        }
      }
      if (this.cycle.event === 'eruption') {
        this.emberT -= dt;
        if (this.emberT <= 0) {
          this.emberT = ENV.emberEvery;
          const t = w.trainer;
          const a = w.rng.range(0, Math.PI * 2), r = w.rng.range(0, 160);
          // embers scale with the party (average level), like the region's wild Pokémon
          const lv = Math.round(w.allies.reduce((s, x) => s + x.level, 0) / Math.max(1, w.allies.length)) || 20;
          w.addHazard(t.x + t.vx * 0.6 + Math.cos(a) * r, t.y + t.vy * 0.6 + Math.sin(a) * r, 55, 1.1, 35, 'fire', lv,
            { kind: 'burn', chance: 0.25, duration: 3, magnitude: 0.04 });
        }
      }
    }
  }
}
