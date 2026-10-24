import { describe, expect, it } from 'vitest';
import { beatBossTo } from './bossHelpers';
import valleyJson from '../src/data/world/starter-valley.json';
import questsJson from '../src/data/world/quests.json';
import { BOSSES, POKEMON, validateData } from '../src/core/data';
import { ECOLOGY } from '../src/core/encounters';
import { LEGENDS, legendQuests, legendState, missingConditions, timeOk } from '../src/core/legends';
import { QuestDef, QuestManager } from '../src/core/quests';
import { RegionDef } from '../src/core/map/valley';
import { REGION_DEFS } from '../src/core/map/regionDefs';
void ({} as RegionDef);
import { AdventureState } from '../src/adventure/AdventureState';
import { defaultSave, migrate } from '../src/systems/saveSchema';
import { STEP, World } from '../src/core/world';

// Gen 1–4 legends have encounters (Gen 5–9 legends are data only for now: placed by later Vietnam provinces, never random spawns)
const legendIds = [...ECOLOGY.values()].filter((e) => (e.legendary || e.mythical) && e.dex <= 493).map((e) => e.id);

describe('LegendaryEncounterManager data (V3 §VII)', () => {
  it('all 35 Gen 1–4 legendary/mythical species have a unique encounter', () => {
    expect(legendIds.length).toBe(35);
    for (const id of legendIds) {
      const l = LEGENDS.get(id);
      expect(l, id).toBeTruthy();
      expect(l!.lore.length, id).toBeGreaterThan(10);
      if (l!.kind === 'shrine' || l!.kind === 'roaming') expect(BOSSES.get(id)?.ai, id).toBe('legendary');
      expect(POKEMON.has(id), id).toBe(true);
    }
    expect(validateData()).toEqual([]);
    // not every mythical is a fight
    const kinds = new Set(legendIds.map((id) => LEGENDS.get(id)!.kind));
    expect([...kinds].sort()).toEqual(['egg', 'gift', 'roaming', 'shrine']);
  });
  it('every shrine / gift legend has a site on the map; roamers have regions', () => {
    // shrines live on the valley or on another region map (Arceus: Legendary Sanctuary)
    const sites = new Map(Object.values(REGION_DEFS).flatMap((d) => d.legendaries ?? []).map((l) => [l.id, l]));
    void valleyJson;
    for (const l of LEGENDS.values()) {
      if (l.kind === 'shrine' || l.kind === 'gift') expect(sites.has(l.id), l.id).toBe(true);
      if (l.kind === 'roaming') expect(l.regions!.length, l.id).toBeGreaterThan(0);
    }
  });
  it('Arceus is endgame only: needs the creation trio, Mewtwo and Rayquaza', () => {
    const a = LEGENDS.get('arceus')!;
    expect(a.requires).toEqual(expect.arrayContaining(['boss:dialga', 'boss:palkia', 'boss:giratina', 'boss:mewtwo', 'boss:rayquaza']));
    expect(ECOLOGY.get('arceus')!.method).toBe('mythical');
  });
});

describe('legend state machine & quest chains', () => {
  it('locked → available → active → caught, never backwards from caught', () => {
    const l = LEGENDS.get('lugia')!;
    const flags = new Set<string>();
    const has = (f: string) => flags.has(f);
    expect(legendState(undefined, l, has)).toBe('locked');
    ['boss:articuno', 'boss:zapdos', 'boss:moltres'].forEach((f) => flags.add(f));
    expect(legendState(undefined, l, has)).toBe('available');
    expect(legendState('active', l, has)).toBe('active');
    expect(legendState('caught', l, () => false)).toBe('caught');
  });
  it('conditions: time, weather, friendship', () => {
    expect(timeOk('night', 23 * 60)).toBe(true);
    expect(timeOk('night', 12 * 60)).toBe(false);
    expect(timeOk('dawn', 6 * 60)).toBe(true);
    const jirachi = LEGENDS.get('jirachi')!;
    expect(missingConditions(jirachi, { clock: 23 * 60, weather: 'clear', leadFriendship: 200 })).toEqual([]);
    expect(missingConditions(jirachi, { clock: 23 * 60, weather: 'rain', leadFriendship: 200 }).length).toBe(1);
    expect(missingConditions(jirachi, { clock: 12 * 60, weather: 'clear', leadFriendship: 100 }).length).toBe(2);
  });
  it('quest chains unlock in order (birds → Lugia; beasts → Ho-Oh; both → weather trio → … → Arceus)', () => {
    const authored = questsJson as QuestDef[];
    const all = [...authored, ...legendQuests(authored)];
    const ids = new Set(all.map((q) => q.id));
    for (const id of legendIds) expect(ids.has('q-legend-' + id), id).toBe(true);
    const q = new QuestManager(all);
    const done = (id: string) => { q.states[id].status = 'completed'; q.refresh(); };
    q.refresh();
    expect(q.states['q-legend-lugia'].status).toBe('locked');
    done('q-main-4');
    expect(q.states['q-legend-raikou'].status).toBe('active');
    ['articuno', 'zapdos', 'moltres'].forEach((b) => done('q-legend-' + b));
    expect(q.states['q-legend-lugia'].status).toBe('active');
    expect(q.states['q-legend-ho-oh'].status).toBe('locked');
    ['raikou', 'entei', 'suicune'].forEach((b) => done('q-legend-' + b));
    expect(q.states['q-legend-ho-oh'].status).toBe('active');
    expect(q.states['q-legend-kyogre'].status).toBe('locked');
    done('q-legend-lugia'); done('q-legend-ho-oh');
    expect(q.states['q-legend-kyogre'].status).toBe('active');
    expect(q.states['q-legend-arceus'].status).toBe('locked');
    for (const b of ['kyogre', 'groudon', 'rayquaza', 'mewtwo', 'uxie', 'mesprit', 'azelf', 'dialga', 'palkia', 'giratina']) done('q-legend-' + b);
    expect(q.states['q-legend-arceus'].status).toBe('active');
  });
  it('a legend that joined is saved as caught and survives save/load (no duplicate on reload)', () => {
    const st = new AdventureState(defaultSave());
    st.adv.legends.lugia = 'caught';
    st.addPokemon('lugia', 37, 'gift');
    st.setFlag('boss:lugia');
    const back = migrate(JSON.parse(JSON.stringify(st.save)));
    expect(back.adventure!.legends.lugia).toBe('caught');
    expect(back.collection.filter((c) => c.species === 'lugia').length).toBe(1);
  });
});

describe('generated legendary bosses fight with the legendary AI', () => {
  it('Dialga time-stop slows the party; Arceus chains all ultimates', () => {
    for (const [id, check] of [['dialga', 'slow'], ['arceus', 'zones']] as const) {
      const w = new World({ mode: 'adventure', seed: 4, width: 6000, height: 6000 });
      const a = w.addPokemon('pikachu', { level: 50 });
      const t = w.trainer; t.maxHp = t.hp = 1e9;
      const b = w.spawnBoss(id, 55, false, { x: t.x + 260, y: t.y });
      beatBossTo(w, b, 0.2);
      let slowed = false, maxZones = 0;
      for (let i = 0; i < 60 * 45; i++) {
        a.hp = a.maxHp; w.step(STEP);
        if (w.hasStatus(t, 'slow')) slowed = true;
        maxZones = Math.max(maxZones, w.zones.filter((z) => z.active && z.owner === b).length);
      }
      if (check === 'slow') expect(slowed, id).toBe(true);
      else expect(maxZones, id).toBeGreaterThanOrEqual(30);
    }
  });
});
