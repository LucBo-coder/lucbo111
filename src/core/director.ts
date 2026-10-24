import { ENEMIES, BOSSES } from './data';
import { Rng } from './rng';
import { EnemyDef } from './types';

export interface SpawnRequest {
  enemyId: string;
  level: number;
  elite: boolean;
  /** 'edge' = random point off-screen; 'ring' = part of a ring around the trainer */
  placement: 'edge' | 'ring';
  ringIndex?: number;
  ringCount?: number;
}

export type DirectorEvent =
  | { kind: 'boss'; bossId: string; level: number; final: boolean; index: number }
  | { kind: 'swarm'; enemyId: string; count: number };

export interface DirectorConfig {
  bossTimes: number[];
  swarmTimes: number[];
  maxEnemiesCap: number;
}

export const DEFAULT_DIRECTOR: DirectorConfig = {
  bossTimes: [300, 600, 900],
  swarmTimes: [150, 450, 750],
  maxEnemiesCap: 260,
};

/** Difficulty curves. Exported individually so balancing can be unit-tested. */
export const curves = {
  minutes: (t: number) => t / 60,
  spawnRate: (t: number) => {
    const m = t / 60;
    return 0.6 + 0.5 * m + 0.012 * m * m; // enemies per second
  },
  maxEnemies: (t: number, cap: number) => Math.min(cap, Math.floor(16 + 13 * (t / 60))),
  enemyLevel: (t: number) => Math.floor(3 + 2.6 * (t / 60) + 0.12 * (t / 60) ** 2), // late game accounts for evolutions/Mega
  eliteChance: (t: number) => Math.min(0.07, 0.004 + 0.004 * (t / 60)),
  /** Enemies also get faster and their ranged units fire more, not only tankier */
  speedMult: (t: number) => 1 + 0.018 * (t / 60),
  aggression: (t: number) => Math.min(1.6, 1 + 0.04 * (t / 60)),
};

export class EnemyDirector {
  private budget = 0;
  private bossIdx = 0;
  private swarmIdx = 0;
  private readonly pool: EnemyDef[];

  constructor(private rng: Rng, readonly cfg: DirectorConfig = DEFAULT_DIRECTOR, enemyPool?: EnemyDef[]) {
    this.pool = enemyPool ?? [...ENEMIES.values()];
  }

  get bossesTriggered(): number {
    return this.bossIdx;
  }

  pickEnemy(t: number): EnemyDef {
    const unlocked = this.pool.filter((e) => t >= e.unlockAt);
    // Newly unlocked enemies ramp in over 60s instead of appearing at full weight.
    const pick = this.rng.weighted(unlocked, (e) => e.weight * Math.min(1, 0.25 + (t - e.unlockAt) / 60));
    return pick ?? this.pool[0];
  }

  update(t: number, dt: number, alive: number, bossAlive: boolean): { spawns: SpawnRequest[]; events: DirectorEvent[] } {
    const spawns: SpawnRequest[] = [];
    const events: DirectorEvent[] = [];
    const level = curves.enemyLevel(t);

    if (this.bossIdx < this.cfg.bossTimes.length && t >= this.cfg.bossTimes[this.bossIdx]) {
      const bossIds = [...BOSSES.values()].filter((b) => b.survivor !== false).map((b) => b.id);
      const final = this.bossIdx === this.cfg.bossTimes.length - 1;
      events.push({ kind: 'boss', bossId: bossIds[this.bossIdx % bossIds.length], level: level + 3, final, index: this.bossIdx });
      this.bossIdx++;
    }
    if (this.swarmIdx < this.cfg.swarmTimes.length && t >= this.cfg.swarmTimes[this.swarmIdx]) {
      const count = 18 + this.swarmIdx * 8;
      events.push({ kind: 'swarm', enemyId: 'rattata', count });
      // Leave a ~20% gap in the ring so the player always has an escape route
      const gapStart = this.rng.int(0, count - 1), gapLen = Math.ceil(count * 0.2);
      for (let i = 0; i < count; i++) {
        if ((i - gapStart + count) % count < gapLen) continue;
        spawns.push({ enemyId: 'rattata', level: Math.max(1, level - 2), elite: false, placement: 'ring', ringIndex: i, ringCount: count });
      }
      this.swarmIdx++;
    }

    const max = curves.maxEnemies(t, this.cfg.maxEnemiesCap);
    const rate = curves.spawnRate(t) * (bossAlive ? 0.35 : 1);
    this.budget = Math.min(this.budget + rate * dt, 12);
    let room = max - alive - spawns.length;
    while (this.budget >= 1 && room > 0) {
      this.budget -= 1;
      room--;
      const def = this.pickEnemy(t);
      const elite = this.rng.chance(curves.eliteChance(t));
      spawns.push({ enemyId: def.id, level: level + (elite ? 2 : 0), elite, placement: 'edge' });
    }
    if (room <= 0) this.budget = Math.min(this.budget, 1);
    return { spawns, events };
  }
}
