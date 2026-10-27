import { describe, expect, it } from 'vitest';
import { POKEMON } from '../src/core/data';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { genderOf, NPC_BODIES, npcLook, randomLook } from '../src/core/npcLooks';
import { ALL_STARTERS, STARTER_GENS, starterTabs } from '../src/core/starters';
import { STARTERS } from '../src/adventure/AdventureState';
import vnQuests from '../src/data/vietnam/quests.json';

const people = () => Object.values(REGION_DEFS).flatMap((d) => [...d.npcs, ...d.trainers].map((n) => ({ d, n: n as typeof n & { role?: string } })))
  .filter(({ n }) => n.sprite !== 'board' && n.sprite !== 'light');

describe('NPC looks: animated pixel characters, varied', () => {
  it('every body is a clean 16×16 drawing using only role letters', () => {
    for (const b of NPC_BODIES.values()) {
      expect(b.rows.length, b.id).toBe(16);
      for (const r of b.rows) {
        expect(r.length, `${b.id} "${r}"`).toBe(16);
        expect(r, b.id).toMatch(/^[.kwWshHaAcCpPyr]+$/);
      }
    }
  });

  it('every person on every map gets a look; the same NPC always looks the same', () => {
    for (const { d, n } of people()) {
      const l = npcLook(n.id, n.sprite, n.name, { mekong: d.theme === 'mekong', role: n.role });
      expect(l, `${d.id} ${n.id} (${n.sprite})`).not.toBeNull();
      expect(npcLook(n.id, n.sprite, n.name, { mekong: d.theme === 'mekong', role: n.role })).toEqual(l);
      for (const r of l!.rows) for (const ch of r) if (ch !== '.') expect(l!.pal[ch], `${n.id} ${ch}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(npcLook('x', 'board')).toBeNull();
    expect(npcLook('x', 'light')).toBeNull();
  });

  it('variety: many bodies and colour sets, neighbours on a map rarely share a look', () => {
    const looks = people().map(({ d, n }) => npcLook(n.id, n.sprite, n.name, { mekong: d.theme === 'mekong', role: n.role })!);
    expect(new Set(looks.map((l) => l.body)).size).toBeGreaterThanOrEqual(12);
    // nearly every NPC has its own texture (same body + same colours is rare)
    expect(new Set(looks.map((l) => l.key)).size).toBeGreaterThan(looks.length * 0.9);
    for (const d of Object.values(REGION_DEFS)) {
      const ks = [...d.npcs, ...d.trainers].map((n) => npcLook(n.id, n.sprite, n.name, { mekong: d.theme === 'mekong' })?.key).filter(Boolean);
      expect(new Set(ks).size, d.id).toBeGreaterThanOrEqual(ks.length - 1);
    }
  });

  it('the Vietnamese title picks a matching body; Mekong farmers wear the nón lá', () => {
    expect(genderOf('Cô Năm ngắm cò')).toBe('f');
    expect(genderOf('Bà Tư')).toBe('f');
    expect(genderOf('Ông Ba Thạch')).toBe('m');
    expect(genderOf('Chú Sáu leo dừa')).toBe('m');
    expect(genderOf('Bác Hai nhà vườn')).toBeNull();
    for (const { d, n } of people()) {
      const g = genderOf(n.name);
      const b = NPC_BODIES.get(npcLook(n.id, n.sprite, n.name, { mekong: d.theme === 'mekong', role: n.role })!.body)!;
      if (g && n.role !== 'nurse') expect([g, 'any'], `${n.id} "${n.name}" → ${b.id}`).toContain(b.gender);
    }
    for (let i = 0; i < 20; i++) expect(npcLook('farmer-' + i, 'farmer', '', { mekong: true })!.body).toMatch(/^nonla-/);
    // age from the title: children and grandmothers
    expect(npcLook('a', 'villager', 'Bé Na')!.body).toBe('kid');
    expect(npcLook('b', 'girl', 'Cô bé Lan')!.body).toBe('kid');
    expect(npcLook('c', 'villager', 'Bà Tư bán xôi')!.body).toBe('grandma');
    const nurse = npcLook('nurse', 'girl', 'Y tá', { role: 'nurse' })!;
    expect(nurse.pal.c).toBe('#f8f8f8');
    expect(randomLook('ambush-1', ['veteran']).body).toBe('veteran');
  });
});

describe('Starters: generations 1–9 in Adventure and Vietnam Odyssey', () => {
  it('27 real starters, three per generation (grass, fire, water)', () => {
    expect(STARTER_GENS.map((g) => g.gen)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ALL_STARTERS.length).toBe(27);
    expect(new Set(ALL_STARTERS).size).toBe(27);
    for (const g of STARTER_GENS) {
      expect(g.species.map((s) => POKEMON.get(s)?.types[0]), `gen ${g.gen}`).toEqual(['grass', 'fire', 'water']);
    }
  });

  it("the campaign's own trio opens first, in its own order (key 1 = the first one the professor names)", () => {
    const classic = starterTabs(STARTERS);
    expect(classic.tabs.length).toBe(9);
    expect(classic.tabs[classic.first].gen).toBe(1);
    expect(classic.tabs[classic.first].species).toEqual(STARTERS);
    const vn = (vnQuests as { id: string; starter?: string[] }[]).find((q) => q.id === 'vn-cm-1')!.starter!;
    const v = starterTabs(vn);
    expect(v.tabs[v.first].gen).toBe(3);
    expect(v.tabs[v.first].species).toEqual(['treecko', 'torchic', 'mudkip']);
    // every generation is still offered
    expect(v.tabs.flatMap((t) => t.species).sort()).toEqual([...ALL_STARTERS].sort());
    // a trio outside the nine generations gets its own first tab
    const odd = starterTabs(['pikachu', 'eevee', 'togepi']);
    expect(odd.tabs.length).toBe(10);
    expect(odd.tabs[0].species).toEqual(['pikachu', 'eevee', 'togepi']);
  });
});
