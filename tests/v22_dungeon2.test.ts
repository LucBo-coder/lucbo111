import { describe, expect, it } from 'vitest';
import { DUNGEON_MODS, modsFor, modsLabel, placeTraps, rewardMult, scaleReward, secretLoot, trapCount, type DungeonMod } from '../src/core/dungeonMods';
import { DUNGEONS, dungeonDef } from '../src/core/map/dungeons';
import { DungeonMap } from '../src/core/map/dungeonMap';
import { TILE_PX } from '../src/core/map/tiles';
import { canUse, FIELD_ABILITIES, fieldUser } from '../src/core/field';
import { STEP, World } from '../src/core/world';
import { DungeonController } from '../src/adventure/DungeonController';

function setup(id = 'ancient-cave', difficulty: 'normal' | 'hard' | 'expert' = 'normal', mods: DungeonMod[] = [], seed = 1) {
  const map = new DungeonMap(dungeonDef(id));
  const w = new World({
    mode: 'adventure', seed: 5, width: map.widthTiles * TILE_PX, height: map.heightTiles * TILE_PX,
    terrain: {
      blocksMove: (x, y) => map.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
      blocksShot: (x, y) => map.shotSolidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
    },
  });
  w.addPokemon('geodude', { level: 30 });
  let doors = 0;
  const sprung: number[] = [];
  const dc = new DungeonController(w, map, difficulty, { banner: () => {}, doorsChanged: () => doors++, bossDefeated: () => {}, trapSprung: (i) => sprung.push(i) }, mods, seed);
  const go = (tx: number, ty: number) => { w.teleport((tx + 0.5) * TILE_PX, (ty + 0.5) * TILE_PX); dc.update(STEP); w.step(STEP); };
  return { map, w, dc, go, sprung, doors: () => doors };
}
const mod = (id: DungeonMod['id']) => DUNGEON_MODS.find((m) => m.id === id)!;

describe('V22 Dungeon 2.0: variant of the day', () => {
  it('deterministic per dungeon / day / difficulty, 1 on normal, 2 on expert, never duplicated; changes across days', () => {
    for (const id of Object.keys(DUNGEONS)) for (let day = 0; day < 30; day++) {
      expect(modsFor(id, day, 'normal').length).toBe(1);
      const h = modsFor(id, day, 'hard').length;
      expect(h === 1 || h === 2).toBe(true);
      const e = modsFor(id, day, 'expert');
      expect(e.length).toBe(2);
      expect(new Set(e.map((m) => m.id)).size).toBe(2);
      expect(modsFor(id, day, 'expert').map((m) => m.id)).toEqual(e.map((m) => m.id));
    }
    const seen = new Set<string>();
    for (let day = 0; day < 30; day++) seen.add(modsFor('ancient-cave', day, 'normal')[0].id);
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('reward: EXP / world EXP scale with the variant, reputation does not, Mạch quặng adds items', () => {
    const base = { items: { pokeball: 3 }, exp: 400, worldExp: 300, reputation: 10 };
    const r = scaleReward(base, [mod('dark'), mod('swarm')]);
    expect(rewardMult([mod('dark'), mod('swarm')])).toBeCloseTo(1.45);
    expect(r).toEqual({ items: { pokeball: 3 }, exp: 580, worldExp: 435, reputation: 10 });
    const rich = scaleReward(base, [mod('rich')]);
    expect(rich.exp).toBe(400);
    expect(rich.items).toEqual({ pokeball: 3, 'exp-candy-s': 1, duskball: 2 });
    expect(base.items).toEqual({ pokeball: 3 }); // the dungeon's own table is never mutated
    expect(modsLabel([mod('dark'), mod('swarm')])).toBe('Hang tối + Bầy đàn (+45% EXP)');
    expect(modsLabel([])).toBe('Không có');
  });

  it('swarm adds enemies, elite adds an elite per wave, quake makes rocks fall more often', () => {
    const plain = setup();
    plain.go(15, 60);
    const n0 = plain.dc.waveUnits.length, e0 = plain.dc.waveUnits.filter((u) => u.elite).length;
    const sw = setup('ancient-cave', 'normal', [mod('swarm'), mod('elite')]);
    sw.go(15, 60);
    expect(sw.dc.waveUnits.length).toBe(n0 + 2);
    expect(sw.dc.waveUnits.filter((u) => u.elite).length).toBe(e0 + 1);

    const countRocks = (mods: DungeonMod[]) => {
      const s = setup('ancient-cave', 'normal', mods);
      s.dc.phase = 'hazard';
      s.w.trainer.maxHp = s.w.trainer.hp = 1e9;
      let zones = 0;
      for (let i = 0; i < 60 * 10; i++) { s.w.teleport(15.5 * TILE_PX, 45.5 * TILE_PX); const before = s.w.zones.length; s.dc.update(STEP); zones += Math.max(0, s.w.zones.length - before); s.w.step(STEP); }
      return zones;
    };
    expect(countRocks([mod('quake')])).toBeGreaterThan(countRocks([]) * 1.4);
  });
});

describe('V22 Dungeon 2.0: traps', () => {
  it('trap count by difficulty + Bẫy ngầm; placed on free floor of the wave / puzzle rooms, away from doors, plates and each other', () => {
    expect(trapCount('normal', [])).toBe(2);
    expect(trapCount('expert', [mod('traps')])).toBe(11);
    const def = dungeonDef('ancient-cave');
    const traps = placeTraps(def.rows, [def.rooms.wave, def.rooms.puzzle], 11, 42);
    expect(traps.length).toBe(11);
    expect(placeTraps(def.rows, [def.rooms.wave, def.rooms.puzzle], 11, 42)).toEqual(traps);
    for (const t of traps) {
      expect(def.rows[t.y][t.x]).toBe('.');
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect('pPDQSEtkg').not.toContain(def.rows[t.y + dy]?.[t.x + dx] ?? '#');
      const inRoom = [def.rooms.wave, def.rooms.puzzle].some(([x0, y0, x1, y1]) => t.x > x0 && t.x < x1 && t.y > y0 && t.y < y1);
      expect(inRoom).toBe(true);
      for (const o of traps) if (o !== t) expect(Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y))).toBeGreaterThanOrEqual(2);
    }
  });

  it('stepping on a trap fires it once (delayed hazard where it is), then it stays spent', () => {
    const s = setup('ancient-cave', 'hard');
    expect(s.dc.traps.length).toBe(4);
    const t = s.dc.traps[0];
    const zones = s.w.zones.length;
    s.go(t.x, t.y);
    expect(s.sprung).toEqual([0]);
    expect(t.armed).toBe(false);
    expect(s.w.zones.length).toBe(zones + 1);
    s.go(t.x, t.y);
    expect(s.sprung).toEqual([0]);
  });
});

describe('V22 Dungeon 2.0: secret room and Flash', () => {
  it('every dungeon layout has the cracked wall and secret chest; the wall is solid until Rock Smash opens it', () => {
    for (const id of Object.keys(DUNGEONS)) {
      const m = new DungeonMap(dungeonDef(id));
      expect(m.crack, id).toEqual({ x: 7, y: 28 });
      expect(m.secretChest, id).toEqual({ x: 4, y: 28 });
    }
    const s = setup('ancient-cave', 'expert');
    expect(s.map.solidAt(7, 28)).toBe(true);
    expect(s.dc.takeSecret()).toBeNull();
    expect(s.dc.openSecret()).toBe(true);
    expect(s.doors()).toBeGreaterThan(0);
    expect(s.map.solidAt(7, 28)).toBe(false);
    expect(s.dc.openSecret()).toBe(false);
    expect(s.dc.takeSecret()).toEqual(secretLoot('expert'));
    expect(s.dc.takeSecret()).toBeNull();
    // a fresh run closes it again
    const again = setup('ancient-cave', 'expert');
    expect(again.map.solidAt(7, 28)).toBe(true);
    // the secret room is reachable from the puzzle room once open
    for (let x = 2; x <= 7; x++) expect(s.map.solidAt(x, 28), `x=${x}`).toBe(false);
    expect(s.map.solidAt(8, 28)).toBe(false);
  });

  it('Flash: Electric / Fire / Fairy Lv 10+, any party member', () => {
    expect(FIELD_ABILITIES.flash.minLevel).toBe(10);
    const p = (species: string, level: number, types: string[]) => ({ species, name: species, level, types: types as never });
    expect(fieldUser('flash', [p('mudkip', 20, ['water']), p('pikachu', 12, ['electric'])])?.species).toBe('pikachu');
    expect(fieldUser('flash', [p('pikachu', 9, ['electric'])])).toBeNull();
    expect(fieldUser('flash', [p('clefairy', 10, ['fairy'])])?.species).toBe('clefairy');
    expect(canUse('flash', [p('charmander', 10, ['fire'])], { has: () => false }).ok).toBe(true);
  });

  it('a modified run still completes and pays the scaled reward', () => {
    const s = setup('ancient-cave', 'normal', [mod('dark')]);
    s.dc.phase = 'reward';
    const r = s.dc.openChest()!;
    const base = dungeonDef('ancient-cave').difficulties.normal.rewards;
    expect(r.exp).toBe(Math.round(base.exp * 1.25));
    expect(r.reputation).toBe(base.reputation);
  });
});
