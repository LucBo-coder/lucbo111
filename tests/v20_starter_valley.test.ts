import { describe, expect, it } from 'vitest';
import valleyJson from '../src/data/world/starter-valley.json';
import { AdventureState } from '../src/adventure/AdventureState';
import { ValleyMap, type RegionDef } from '../src/core/map/valley';
import { POKEMON } from '../src/core/data';
import { defaultSave } from '../src/systems/saveSchema';

const def = valleyJson as unknown as RegionDef;

/** Plays the starter quest through so the village quests unlock. */
function afterStarter(): AdventureState {
  const st = new AdventureState(defaultSave());
  st.addPokemon('charmander', 8, 'starter');
  st.notify({ type: 'talk', target: 'prof' });
  st.notify({ type: 'capture', target: 'pidgey' });
  for (const q of st.notify({ type: 'talk', target: 'prof' })) st.grant(q.rewards);
  return st;
}

/** Completes the current quest objective chain the way AdventureScene does (rewards applied on completion). */
function feed(st: AdventureState, ev: Parameters<AdventureState['notify']>[0]): string[] {
  const done = st.notify(ev);
  for (const q of done) st.grant(q.rewards);
  return done.map((q) => q.id);
}

describe('Starter Valley — village services (V20)', () => {
  it('has a Pokémon Center (PC terminal + nurse), a quest board and walking villagers', () => {
    expect(def.buildings.some((b) => /center/.test(b.id))).toBe(true);
    const nurse = def.npcs.find((n) => n.role === 'nurse');
    expect(nurse?.id).toBe('nurse');
    expect(def.npcs.find((n) => n.id === 'sv-board')?.sprite).toBe('board');
    expect(def.npcs.filter((n) => (n.wander ?? 0) > 0).length).toBeGreaterThanOrEqual(3);
  });

  it('walkers have open ground around their home spot to stroll on', () => {
    const m = new ValleyMap(def);
    for (const n of def.npcs.filter((x) => x.wander)) {
      let open = 0, total = 0;
      for (let dy = -n.wander!; dy <= n.wander!; dy++) for (let dx = -n.wander!; dx <= n.wander!; dx++) {
        total++;
        if (!m.solidAt(n.x + dx, n.y + dy)) open++;
      }
      expect(open / total, n.id).toBeGreaterThan(0.6);
    }
  });

  it('Training Camp: its own area, three trainers with different teams, inside the fence', () => {
    const m = new ValleyMap(def);
    expect(m.areaAt(45, 83)?.id).toBe('camp');
    expect(m.areaAt(30, 60)?.id).toBe('meadow');
    const camp = def.trainers.filter((t) => t.id.startsWith('camp-'));
    expect(camp.map((t) => t.id).sort()).toEqual(['camp-mage', 'camp-speed', 'camp-tank']);
    const teams = camp.map((t) => t.team.map(([s]) => s).sort().join());
    expect(new Set(teams).size).toBe(3);
    for (const t of camp) {
      for (const [s, lv] of t.team) { expect(POKEMON.has(s), s).toBe(true); expect(lv).toBeGreaterThanOrEqual(5); expect(lv).toBeLessThanOrEqual(12); }
      expect(m.areaAt(t.x, t.y)?.id).toBe('camp');
    }
  });
});

describe('Starter Valley — Training Camp quest chain, end to end (V20)', () => {
  it('locked before the starter quest, then three lessons in order, rewards granted exactly once', () => {
    const fresh = new AdventureState(defaultSave());
    expect(fresh.quests.states['q-camp-1'].status).toBe('locked');

    const st = afterStarter();
    expect(st.quests.states['q-camp-1'].status).toBe('available');
    expect(st.quests.states['q-camp-2'].status).toBe('locked');

    // lesson 1
    st.startQuest('q-camp-1');
    expect(feed(st, { type: 'trainer', target: 'camp-speed' })).toEqual([]); // wrong trainer: no progress
    expect(st.quests.states['q-camp-1'].step).toBe(0);
    feed(st, { type: 'trainer', target: 'camp-tank' });
    const potions = st.item('potion');
    expect(feed(st, { type: 'talk', target: 'camp-coach' })).toEqual(['q-camp-1']);
    expect(st.item('potion')).toBe(potions + 3);
    // talking again never pays twice
    feed(st, { type: 'talk', target: 'camp-coach' });
    expect(st.item('potion')).toBe(potions + 3);
    expect(st.quests.states['q-camp-1'].status).toBe('completed');

    // lesson 2
    expect(st.quests.states['q-camp-2'].status).toBe('available');
    st.startQuest('q-camp-2');
    feed(st, { type: 'trainer', target: 'camp-speed' });
    expect(feed(st, { type: 'talk', target: 'camp-coach' })).toEqual(['q-camp-2']);
    expect(st.item('quick-claw')).toBe(1);

    // graduation unlocks the sealed camp chest
    expect(st.hasFlag('camp:graduate')).toBe(false);
    st.startQuest('q-camp-3');
    feed(st, { type: 'trainer', target: 'camp-mage' });
    expect(feed(st, { type: 'talk', target: 'camp-coach' })).toEqual(['q-camp-3']);
    expect(st.hasFlag('camp:graduate')).toBe(true);
    expect(st.item('scope-lens')).toBe(1);
    const chest = def.chests.find((c) => c.id === 'chest-camp');
    expect(chest?.requiresFlag).toBe('camp:graduate');
  });

  it('quest board: Rattata hunt counts defeats, camp visit needs the area then the coach', () => {
    const st = afterStarter();
    st.startQuest('q-board-rattata');
    for (let i = 0; i < 4; i++) expect(feed(st, { type: 'defeat', target: 'rattata' })).toEqual([]);
    feed(st, { type: 'defeat', target: 'pidgey' });
    expect(feed(st, { type: 'defeat', target: 'rattata' })).toEqual(['q-board-rattata']);

    st.startQuest('q-board-camp');
    expect(feed(st, { type: 'talk', target: 'camp-coach' })).toEqual([]); // must reach the camp first
    feed(st, { type: 'explore', target: 'camp' });
    expect(feed(st, { type: 'talk', target: 'camp-coach' })).toEqual(['q-board-camp']);
  });

  it('every new quest points at real NPCs / trainers / areas of the valley', () => {
    const st = new AdventureState(defaultSave());
    const ids = new Set([...def.npcs.map((n) => n.id), ...def.trainers.map((t) => t.id), ...def.areas.map((a) => a.id)]);
    for (const id of ['q-camp-1', 'q-camp-2', 'q-camp-3', 'q-board-rattata', 'q-board-camp']) {
      const q = st.quests.def(id)!;
      expect(q, id).toBeTruthy();
      expect(ids.has(q.giver!), `${id} giver`).toBe(true);
      for (const o of q.objectives) if (o.type !== 'defeat') expect(ids.has(o.target!), `${id} → ${o.target}`).toBe(true);
    }
  });
});
