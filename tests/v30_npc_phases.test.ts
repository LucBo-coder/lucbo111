import { describe, expect, it } from 'vitest';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { VN_PROVINCES } from '../src/adventure/passport';
import { npcLines } from '../src/core/story';
import peace from '../src/data/vietnam/peace.json';
import phases from '../src/data/story/npc-phases.json';
import classic from '../src/data/story/classic.json';

// V30: villagers stop talking about a province's trouble once its guardian is calmed (data/vietnam/peace.json)
const PEACE = peace as Record<string, { guide: string[]; town: string[] }>;
const PROVINCES = VN_PROVINCES.filter((p) => REGION_DEFS[p.id]?.worldBoss).map((p) => p.id);

describe('NPC lines follow the story', () => {
  it('npcLines: the last phase whose flags are all set wins, else the plain lines', () => {
    const npc = { lines: ['a'], phases: [{ if: ['x'], lines: ['b'] }, { if: ['x', 'y'], lines: ['c'] }] };
    const has = (set: string[]) => (f: string) => set.includes(f);
    expect(npcLines(npc, has([]))).toEqual(['a']);
    expect(npcLines(npc, has(['x']))).toEqual(['b']);
    expect(npcLines(npc, has(['y']))).toEqual(['a']);
    expect(npcLines(npc, has(['x', 'y']))).toEqual(['c']);
    expect(npcLines({ lines: ['a'] }, has(['x']))).toEqual(['a']);
  });

  it('every Vietnam province has its peace lines', () => {
    expect(PROVINCES.length).toBe(36);
    for (const id of PROVINCES) {
      const p = PEACE[id];
      expect(p, id).toBeDefined();
      expect(p.guide.length, id).toBeGreaterThanOrEqual(1);
      expect(p.town.length, id).toBeGreaterThanOrEqual(3);
      for (const l of [...p.guide, ...p.town]) expect(l.trim().length, id).toBeGreaterThan(10);
    }
    expect(Object.keys(PEACE).sort()).toEqual([...PROVINCES].sort());
  });

  it('after the guardian, the guide says its own words and every villager a line of the province', () => {
    for (const id of PROVINCES) {
      const d = REGION_DEFS[id];
      const flag = `boss:${d.worldBoss!.id}`;
      const before = () => false;
      const after = (f: string) => f === flag;
      const villagers = d.npcs.filter((n) => !n.role && n.id !== 'shopkeeper' && !n.id.startsWith('mn-'));
      expect(villagers.length, id).toBeGreaterThan(2);
      for (const n of villagers) {
        expect(npcLines(n, before), n.id).toEqual(n.lines);
        const now = npcLines(n, after);
        if (n.id.endsWith('-guide')) expect(now, n.id).toEqual(PEACE[id].guide);
        else expect(PEACE[id].town, n.id).toContain(now[0]);
      }
    }
  });

  it('story people (Linh, Khải…) keep their own gated lines', () => {
    const linh = REGION_DEFS['ca-mau'].npcs.find((n) => n.id === 'mn-linh-ca-mau')!;
    expect(linh.phases).toBeUndefined();
  });
});


describe('chapter lines of single people (data/story/npc-phases.json)', () => {
  it('point at real people and at flags the story sets', () => {
    const flags = new Set(classic.quests.flatMap((q) => (q.rewards as { flags?: string[] }).flags ?? []));
    for (const p of phases) {
      expect(REGION_DEFS[p.region]?.npcs.some((n) => n.id === p.npc), `${p.region} ${p.npc}`).toBe(true);
      for (const f of p.if) expect(flags.has(f), `${p.npc} ${f}`).toBe(true);
      expect(p.lines.length).toBeGreaterThan(0);
    }
  });
  it('the lighthouse keeper moves on with the story', () => {
    const k = REGION_DEFS['coral-coast'].npcs.find((n) => n.id === 'lighthouse-keeper')!;
    const at = (set: string[]) => npcLines(k, (f) => set.includes(f))[0];
    expect(at([])).toBe(k.lines[0]);
    expect(at(['ck:shard-4'])).toContain('bảy mảnh Lõi');
    expect(at(['ck:shard-4', 'ck:end'])).toContain('chân trời');
  });
});
