import { describe, expect, it } from 'vitest';
import { beatBossTo } from './bossHelpers';
import { BOSSES, validateData } from '../src/core/data';
import { STEP, World } from '../src/core/world';
import valleyJson from '../src/data/world/starter-valley.json';
import { RegionDef, ValleyMap } from '../src/core/map/valley';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import questsJson from '../src/data/world/quests.json';
import { QuestDef, QuestManager } from '../src/core/quests';

const LEGENDS = ['articuno', 'zapdos', 'moltres', 'mewtwo', 'mew'];

function arena(id: string, level = 38) {
  const w = new World({ mode: 'adventure', seed: 11, width: 6000, height: 6000 });
  w.addPokemon('caterpie', { level: 5 });
  const t = w.trainer;
  const b = w.spawnBoss(id, level, false, { x: t.x + 260, y: t.y });
  t.maxHp = 1e9; t.hp = 1e9;
  return { w, b };
}
/** Steps with an invulnerable trainer (the test drives phases, not survival) */
function run(w: World, secs: number, until?: () => boolean) {
  for (let i = 0; i < 60 * secs; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); if (until?.()) return true; }
  return false;
}

describe('legendary world bosses', () => {
  it('data: five Gen 1 legendaries with the legendary AI, never in Survivor', () => {
    expect(validateData()).toEqual([]);
    for (const id of LEGENDS) {
      const d = BOSSES.get(id)!;
      expect(d.ai, id).toBe('legendary');
      expect(d.survivor).toBe(false);
      expect(d.legend).toBeTruthy();
    }
  });

  it('every legendary attacks with telegraphed zones and goes through 3 phases', () => {
    for (const id of LEGENDS) {
      const { w, b } = arena(id);
      expect(run(w, 12, () => w.zones.some((z) => z.active && z.owner === b)), id).toBe(true);
      w.applyDamage(b, Math.ceil(b.hp - b.maxHp * 0.45), null);
      w.step(STEP);
      expect(b.boss!.phase, id).toBe(2);
      // invulnerable during the phase-2 transition: a hit there changes nothing
      const hp = b.hp;
      w.applyDamage(b, b.maxHp, null);
      expect(b.hp, id).toBe(hp);
      beatBossTo(w, b, 0.2);
      expect(b.boss!.phase, id).toBe(3);
      expect(run(w, 40, () => b.lastSkill === 'ultimate'), `${id} ultimate`).toBe(true);
    }
  });

  it('ultimates have their signature shapes', () => {
    const ult = (id: string) => {
      const { w, b } = arena(id);
      beatBossTo(w, b, 0.2);
      run(w, 40, () => b.lastSkill === 'ultimate');
      return w.zones.filter((z) => z.active && z.owner === b);
    };
    expect(ult('articuno').some((z) => z.safe && z.safe.length === 3)).toBe(true);
    expect(ult('zapdos').filter((z) => z.shape === 'circle').length).toBeGreaterThanOrEqual(12);
    expect(ult('moltres').filter((z) => z.shape === 'line').length).toBeGreaterThanOrEqual(16);
  });

  it('Mewtwo teleports around its arena', () => {
    const { w, b } = arena('mewtwo', 50);
    const home = { x: b.boss!.homeX, y: b.boss!.homeY };
    let jumps = 0, last = { x: b.x, y: b.y };
    for (let i = 0; i < 60 * 20; i++) {
      w.trainer.hp = w.trainer.maxHp; w.step(STEP);
      if (Math.hypot(b.x - last.x, b.y - last.y) > 60) jumps++;
      last = { x: b.x, y: b.y };
      expect(Math.hypot(b.x - home.x, b.y - home.y)).toBeLessThan(400);
    }
    expect(jumps).toBeGreaterThanOrEqual(2);
  });

  it('a strong Lv40 party can beat Articuno, but not instantly', () => {
    // trainer level 9 ≈ world level 3 (after Mega Venusaur); the trainer dodges (kept alive), the party fights for real
    const w = new World({ mode: 'adventure', seed: 3, width: 6000, height: 6000, trainerLevel: 9 });
    for (const sp of ['charizard', 'blastoise', 'venusaur', 'pikachu', 'gyarados', 'alakazam']) w.addPokemon(sp, { level: 40 });
    const t = w.trainer;
    const b = w.spawnBoss('articuno', 40, false, { x: t.x + 260, y: t.y });
    t.maxHp = 1e9; t.hp = 1e9;
    let time = 0;
    // legendaries end WEAKENED (capture window) instead of dying
    for (let i = 0; i < 60 * 300 && !b.boss!.weakened; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); time += STEP; }
    console.info(`[balance] Articuno Lv40 vs 6×Lv40: ${b.boss!.weakened ? 'weakened' : 'survived'} after ${time.toFixed(0)} s, fainted ${w.allies.filter((a) => a.fainted).length}`);
    expect(b.boss!.weakened).toBe(true);
    expect(b.alive).toBe(true);
    expect(time).toBeGreaterThan(30);
  });

  it('shrines are open ground at the heart of their designed shrine, outside other landmarks', () => {
    const d = valleyJson as unknown as RegionDef;
    // since 0.17 the themed regions hold their own shrines; since the V22 shrine redesign the valley keeps only
    // Mewtwo's psychic cave and Mew's silent ruins (+ Mesprit's Emotion Stone, a roaming trigger) — and since the
    // hidden shrines (LEGENDARY_SHRINES.md mục 8) only their concealed entrances (Mewtwo's dimension, the valley sanctum)
    expect(d.legendaries ?? []).toEqual([]);
    expect(d.secrets!.map((s) => s.id)).toEqual(['to-mewtwo', 'to-mew', 'to-mesprit']);
    for (const s of d.secrets!.filter((x) => x.id !== 'to-mesprit')) {
      const p = REGION_DEFS[s.to], l = p.legendaries!.find((x) => 'to-' + x.id === s.id)!;
      const m = new ValleyMap(p);
      expect(l.shrine, l.id).toBe(l.id);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 9) expect(m.solidAt(l.x + dx, l.y + dy), `${l.id} ${dx},${dy}`).toBe(false);
      expect(BOSSES.has(l.id)).toBe(true);
    }
  });

  it('quest chain: three bird quests after Mega Venusaur (any order), then Mewtwo, then Mew', () => {
    const defs = ((questsJson as unknown as { quests?: QuestDef[] }).quests ?? (questsJson as unknown as QuestDef[]));
    const q = new QuestManager(defs);
    q.refresh();
    expect(q.states['q-legend-articuno'].status).toBe('locked');
    q.states['q-main-4'].status = 'completed';
    expect(q.refresh()).toEqual(expect.arrayContaining(['q-legend-articuno', 'q-legend-zapdos', 'q-legend-moltres']));
    for (const id of ['moltres', 'articuno', 'zapdos']) q.notify({ type: 'boss', target: id });
    for (const id of ['moltres', 'articuno', 'zapdos']) expect(q.states['q-legend-' + id].status).toBe('completed');
    q.refresh();
    expect(q.states['q-legend-mewtwo'].status).toBe('active');
    expect(q.states['q-legend-mew'].status).toBe('locked');
    q.notify({ type: 'boss', target: 'mewtwo' });
    q.refresh();
    expect(q.states['q-legend-mew'].status).toBe('active');
  });
});
