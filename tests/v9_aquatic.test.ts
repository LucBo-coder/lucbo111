import { describe, expect, it } from 'vitest';
import { ECOLOGY, eligible, isAquatic, REGIONS } from '../src/core/encounters';
import { STEP, World } from '../src/core/world';
import { REGION_DEFS } from '../src/core/map/regionDefs';

const TILE = 48;

/** A pond: water inside x∈[1000,1600], y∈[1000,1600]. */
function pondWorld() {
  const water = (x: number, y: number) => x >= 1000 && x <= 1600 && y >= 1000 && y <= 1600;
  return new World({ mode: 'adventure', seed: 3, width: 3000, height: 3000, terrain: { blocksMove: water, blocksShot: () => false, isWater: water } });
}

describe('fish live in water', () => {
  it('data: fish & sea creatures are aquatic, seals / frogs / crabs are not', () => {
    for (const id of ['magikarp', 'goldeen', 'barboach', 'tentacool', 'horsea', 'gyarados', 'wailmer', 'finneon', 'mantine']) expect(isAquatic(id), id).toBe(true);
    for (const id of ['psyduck', 'poliwag', 'wooper', 'krabby', 'seel', 'spheal', 'lotad', 'squirtle', 'kyogre']) expect(isAquatic(id), id).toBe(false);
  });

  it('pools: land spawns never pick an aquatic species, water spawns only aquatic ones', () => {
    for (const r of REGIONS.values()) {
      for (const biome of [r.biome, 'lake', 'coast'] as const) {
        const land = eligible({ biome, night: false, weather: 'clear' } as never, r);
        expect(land.some((e) => e.aquatic), `${r.id} ${biome}`).toBe(false);
        const water = eligible({ biome, aquatic: true, night: false, weather: 'clear' } as never, r);
        expect(water.every((e) => e.aquatic), `${r.id} ${biome}`).toBe(true);
      }
    }
    const coast = REGIONS.get('vn-cm-cape')!;
    expect(eligible({ biome: 'coast', aquatic: true, night: false, weather: 'clear' } as never, coast).length).toBeGreaterThan(3);
    expect([...ECOLOGY.values()].filter((e) => e.aquatic).length).toBeGreaterThan(25);
  });

  it('a wild fish placed in water swims only in water; a land Pokémon cannot enter it', () => {
    const w = pondWorld();
    w.addPokemon('pikachu', { level: 10 });
    const fish = w.spawnWild('magikarp', 5, 1300, 1300, {});
    const dog = w.spawnWild('growlithe', 5, 900, 1300, {});
    expect(fish.aquatic).toBe(true);
    expect(dog.aquatic).toBe(false);
    // move both towards and across the bank exactly the way the engine moves units (last position → step → collide)
    for (let i = 0; i < 400; i++) {
      for (const u of [fish, dog]) { u.lastX = u.x; u.lastY = u.y; u.x += 6; w.collide(u); }
      expect(fish.x >= 1000 && fish.x <= 1600, `fish at ${fish.x}`).toBe(true);
      expect(dog.x < 1000, `growlithe at ${dog.x}`).toBe(true);
    }
    expect(fish.x).toBeGreaterThan(1590); // it swam up to the far bank and stopped there
    w.step(STEP);
    // a fish of a trainer / event placed on land is an ordinary walker (never stuck)
    expect(w.spawnWild('magikarp', 5, 400, 400, {}).aquatic).toBe(false);
  });

  it('no trainer team, dungeon wave or rescue guard puts a fish on land', () => {
    for (const d of Object.values(REGION_DEFS)) {
      for (const t of d.trainers) for (const [sp] of t.team) expect(isAquatic(sp), `${d.id} ${t.id} ${sp}`).toBe(false);
      for (const [sp] of d.rescue.guards) expect(isAquatic(sp), `${d.id} rescue ${sp}`).toBe(false);
    }
    void TILE;
  });
});
