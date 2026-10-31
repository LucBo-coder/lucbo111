import { describe, expect, it } from 'vitest';
import { SpawnManager } from '../src/adventure/SpawnManager';
import { World } from '../src/core/world';
import { ValleyMap } from '../src/core/map/valley';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { TILE_PX } from '../src/core/map/tiles';
import type { ObjectiveDef } from '../src/core/quests';
import vnQuests from '../src/data/vietnam/quests.json';
import quests from '../src/data/world/quests.json';

function setup(target = 'rattata') {
  const map = new ValleyMap(REGION_DEFS['starter-valley']);
  const world = new World({ mode: 'adventure', seed: 5, width: map.widthTiles * TILE_PX, height: map.heightTiles * TILE_PX });
  world.teleport(50 * TILE_PX, 105 * TILE_PX);
  const objectives: ObjectiveDef[] = [{ type: 'defeat', target, count: 5, text: '', marker: { x: 50, y: 105 } }];
  const spawns = new SpawnManager(world, map, { maxActive: 0, objectives: () => objectives, isNight: () => false, weather: () => 'clear', loaded: () => true });
  return { world, objectives, spawns };
}
describe('quest hunting spawns', () => {
  it('supplies Rattata at its farm marker even when ambient slots are full, and replenishes kills', () => {
    const { world, spawns, objectives } = setup();
    spawns.update(2);
    expect(spawns.wildUnits().map(u => u.defId)).toEqual(['rattata']);
    spawns.update(2);
    expect(spawns.wildUnits()).toHaveLength(1);
    world.removeEnemy(spawns.wildUnits()[0]);
    spawns.update(2);
    expect(spawns.wildUnits().map(u => u.defId)).toEqual(['rattata']);
    world.removeEnemy(spawns.wildUnits()[0]);
    objectives.length = 0;
    spawns.update(2);
    expect(spawns.wildUnits()).toHaveLength(0);
  });
  it('does not supply targets on another map or legendary targets', () => {
    const a = setup();
    a.objectives[0].marker!.region = 'misty-swamp';
    a.spawns.update(2);
    expect(a.spawns.wildUnits()).toHaveLength(0);
    const b = setup('mewtwo');
    b.spawns.update(2);
    expect(b.spawns.wildUnits()).toHaveLength(0);
  });
  it('every authored hunt/capture target has a usable spawn tile at its marker', () => {
    for (const q of [...quests, ...vnQuests]) for (const obj of q.objectives as ObjectiveDef[]) {
      if (!['defeat', 'capture'].includes(obj.type) || !obj.target || obj.target === '*' || !obj.marker) continue;
      const m = obj.marker, map = new ValleyMap(REGION_DEFS[m.region ?? 'starter-valley']);
      const world = new World({ mode: 'adventure', seed: 5, width: map.widthTiles * TILE_PX, height: map.heightTiles * TILE_PX });
      world.teleport(m.x * TILE_PX, m.y * TILE_PX);
      const spawns = new SpawnManager(world, map, { maxActive: 0, objectives: () => [obj], isNight: () => false, weather: () => 'clear', loaded: () => true,
        onScreen: (x, y) => Math.abs(x - world.trainer.x) < 500 && Math.abs(y - world.trainer.y) < 300 });
      for (let i = 0; i < 20; i++) spawns.update(2);
      expect(spawns.wildUnits().some(u => u.defId === obj.target), q.id + ':' + obj.target).toBe(true);
    }
  });
  it('legacy swamp and coast markers name their actual maps', () => {
    for (const q of quests) {
      const region = q.id.startsWith('q-swamp') ? 'misty-swamp' : q.id.startsWith('q-coast') ? 'coral-coast' : null;
      if (region) for (const o of q.objectives as ObjectiveDef[]) if (o.marker && ['defeat', 'capture'].includes(o.type)) expect((o.marker as { region?: string }).region, q.id).toBe(region);
    }
  });
});
