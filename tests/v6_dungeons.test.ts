import { describe, expect, it } from 'vitest';
import { DungeonController } from '../src/adventure/DungeonController';
import { BOSSES, POKEMON, validateData } from '../src/core/data';
import { DungeonMap } from '../src/core/map/dungeonMap';
import { DUNGEONS } from '../src/core/map/dungeons';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { TILE_PX } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';
import { STEP, World } from '../src/core/world';
import { beatBossTo } from './bossHelpers';

function world(map: DungeonMap) {
  return new World({
    mode: 'adventure', seed: 5, width: map.widthTiles * TILE_PX, height: map.heightTiles * TILE_PX,
    terrain: {
      blocksMove: (x, y) => map.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
      blocksShot: (x, y) => map.shotSolidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
    },
  });
}

describe('dungeons: elemental + challenge', () => {
  it('registry: 4 dungeons, valid waves / bosses / rewards, each entrance on open ground of its region', () => {
    expect(validateData()).toEqual([]);
    expect(Object.keys(DUNGEONS).sort()).toEqual(['ancient-cave', 'ice-cave', 'magma-cave', 'trial-tower']);
    for (const d of Object.values(DUNGEONS)) {
      expect(BOSSES.has(d.boss.id), d.id).toBe(true);
      for (const wave of d.waves) for (const [sp] of wave) expect(POKEMON.has(sp), `${d.id} ${sp}`).toBe(true);
      expect(Object.keys(d.difficulties)).toEqual(['normal', 'hard', 'expert']);
      const region = REGION_DEFS[d.region!];
      const g = region.dungeons.find((x) => x.id === d.id)!;
      expect(g, d.id).toBeTruthy();
      const m = new ValleyMap(region);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(m.solidAt(g.x + dx, g.y + 2 + dy), `${d.id} ${dx},${dy}`).toBe(false);
    }
    expect(DUNGEONS['ice-cave'].hazardType).toBe('ice');
    expect(DUNGEONS['magma-cave'].hazardType).toBe('fire');
    expect(DUNGEONS['trial-tower'].difficulties.expert.timeLimit).toBeGreaterThan(0);
  });

  it('dungeon bosses use the phase machine but never open a capture window', () => {
    for (const id of ['mamoswine', 'magmortar', 'tyranitar']) {
      const w = new World({ mode: 'adventure', seed: 2, width: 6000, height: 6000 });
      w.addPokemon('caterpie', { level: 5 });
      w.trainer.maxHp = w.trainer.hp = 1e9; // the boss mechanics are tested, not the trainer's survival
      const b = w.spawnBoss(id, 40, false, { x: w.trainer.x + 260, y: w.trainer.y });
      expect(b.boss!.pm.count, id).toBe(3);
      expect(b.boss!.pm.cfg.weakened, id).toBeUndefined();
      beatBossTo(w, b, 0);
      expect(b.alive, id).toBe(false);
    }
  });

  it('elemental hazards carry their type; the challenge clock ends the run when it runs out', () => {
    const map = new DungeonMap(DUNGEONS['magma-cave']);
    const w = world(map);
    w.addPokemon('squirtle', { level: 40 });
    const dc = new DungeonController(w, map, 'normal', { banner: () => {}, doorsChanged: () => {}, bossDefeated: () => {} });
    expect(dc.timeLeft).toBeNull();
    const go = (tx: number, ty: number) => { w.teleport((tx + 0.5) * TILE_PX, (ty + 0.5) * TILE_PX); dc.update(STEP); w.step(STEP); };
    // into the hazard corridor: falling hazards are fire
    dc.phase = 'hazard';
    for (let i = 0; i < 60 * 3; i++) go(15, 44);
    expect(w.zones.some((z) => z.slot.def.type === 'fire')).toBe(true);

    const tmap = new DungeonMap(DUNGEONS['trial-tower']);
    const tw = world(tmap);
    tw.addPokemon('squirtle', { level: 40 });
    let up = false;
    const tc = new DungeonController(tw, tmap, 'normal', { banner: () => {}, doorsChanged: () => {}, bossDefeated: () => {}, timeUp: () => (up = true) });
    expect(tc.timeLeft).toBe(300);
    tc.update(10);
    expect(tc.timeLeft).toBe(300); // clock starts with the first wave
    tc.phase = 'waves';
    tc.update(299);
    expect(up).toBe(false);
    tc.update(2);
    expect(up).toBe(true);
    expect(tc.phase).toBe('done');
  });
});
