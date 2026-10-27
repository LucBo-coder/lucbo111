import { describe, expect, it } from 'vitest';
import questsJson from '../src/data/world/quests.json';
import { fieldFlag } from '../src/core/field';
import { questInRegion } from '../src/core/journal';
import { clueFlag, LEGEND_CLUES } from '../src/core/legendClues';
import { LEGENDS, legendQuests } from '../src/core/legends';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { APPROX_R, entranceOf, entranceRumor, guideObjective } from '../src/core/questGuide';
import type { ObjectiveDef, QuestDef } from '../src/core/quests';
import { secretFlag } from '../src/core/secrets';

// Quests follow the hidden shrines (LEGENDARY_SHRINES.md mục 8): a legendary's fight objective guides the player
// through the step they are on — clues / the obstacle's area → the entrance → the shrine inside its plane.

const authored = questsJson as unknown as QuestDef[];
const ALL = [...authored, ...legendQuests(authored)];
const fight = (id: string): ObjectiveDef => ALL.find((q) => q.objectives.some((o) => o.type === 'boss' && o.target === id))!.objectives.find((o) => o.target === id)!;
const ctx = (region: string, flags: string[] = []) => ({ region, hasFlag: (f: string) => flags.includes(f) });

describe('V22 quests follow the hidden shrines', () => {
  it('every shrine in a plane has its hidden entrance on an ordinary map; quest markers point at the real shrine', () => {
    for (const l of LEGENDS.values()) {
      if (!l.site?.region || !REGION_DEFS[l.site.region].void) continue;
      const e = entranceOf(l.id);
      expect(e, l.id).toBeDefined();
      expect(REGION_DEFS[e!.region].void, l.id).toBeFalsy();
      expect(e!.secret.to).toBe(l.site.region);
    }
    expect(entranceOf('dialga')!.secret.id).toBe('to-origin');
    // the authored Gen 1 quests no longer point at the old overworld spots
    for (const q of authored) for (const o of q.objectives) {
      if (o.type !== 'boss' || !LEGENDS.get(o.target!)?.site) continue;
      expect(o.marker, q.id).toEqual(LEGENDS.get(o.target!)!.site);
    }
  });

  it('obstacle-hidden entrance: only an approximate ring on the right map, then the entrance, then the shrine', () => {
    const o = fight('zapdos'), e = entranceOf('zapdos')!, f = REGION_DEFS[e.region].field!.find((x) => x.id === e.secret.reveal.field)!;
    const a = guideObjective(o, ctx('starter-valley'));
    expect(a.marker!.region).toBe('coral-coast');
    expect(a.marker!.approx).toBe(APPROX_R);
    expect(Math.hypot(a.marker!.x - f.x, a.marker!.y - f.y)).toBeLessThan(APPROX_R);
    expect(a.text).toMatch(/lối vào bí mật ở Bờ Biển San Hô/);
    expect(a.text).toMatch(/Đập đá/);
    // the obstacle smashed but the entrance not yet registered: no ring any more
    expect(guideObjective(o, ctx('coral-coast', [fieldFlag(e.region, f.id)])).marker).toBeUndefined();
    const b = guideObjective(o, ctx('coral-coast', [secretFlag(e.region, e.secret.id)]));
    expect(b.marker).toEqual({ x: e.secret.x, y: e.secret.y, region: 'coral-coast' });
    expect(b.text).toMatch(/Bí Cảnh Bờ Biển/);
    const c = guideObjective(o, ctx('coral-hollow', [secretFlag(e.region, e.secret.id)]));
    expect(c.marker).toEqual({ ...LEGENDS.get('zapdos')!.site });
    expect(c.text).toBe('Đánh bại Zapdos (Bí Cảnh Bờ Biển)');
  });

  it('clue-revealed entrance: the next clue to read, the count, then the whirlpool (only in the rain)', () => {
    const o = fight('lugia'), clues = LEGEND_CLUES.get('lugia')!, e = entranceOf('lugia')!;
    const a = guideObjective(o, ctx('starter-valley'));
    expect(a.text).toMatch(/điều tra manh mối 0\/3/);
    expect(a.marker).toEqual({ x: clues[0].x, y: clues[0].y, region: clues[0].region });
    const b = guideObjective(o, ctx('coral-coast', [clueFlag(clues[0].id)]));
    expect(b.text).toMatch(/1\/3/);
    expect(b.marker).toMatchObject({ x: clues[1].x, y: clues[1].y });
    const c = guideObjective(o, ctx('coral-coast', [secretFlag(e.region, e.secret.id)]));
    expect(c.marker).toEqual({ x: e.secret.stand![0], y: e.secret.stand![1], region: 'coral-coast' });
    expect(c.text).toMatch(/Biển Xoáy Bạc/);
    expect(c.text).toMatch(/chỉ mở khi trời mưa/);
    // the tracker strips "(n/m)" counters: the guide's own count must survive that
    expect(a.text.replace(/\(\d+\/\d+\)/, '')).toMatch(/0\/3/);
  });

  it('other objectives are untouched; the journal files a hidden shrine under its entrance map', () => {
    const talk = authored[0].objectives[0];
    expect(guideObjective(talk, ctx('starter-valley'))).toBe(talk);
    const roaming = fight('raikou');
    expect(guideObjective(roaming, ctx('starter-valley'))).toBe(roaming);
    const zap = ALL.find((q) => q.id === 'q-legend-zapdos')!;
    expect(questInRegion(zap, 'coral-coast')).toBe(true);
    expect(questInRegion(zap, 'coral-hollow')).toBe(true);
    expect(questInRegion(zap, 'starter-valley')).toBe(false);
    expect(questInRegion(ALL.find((q) => q.id === 'q-legend-arceus')!, 'legendary-sanctuary')).toBe(true);
  });

  it('villager rumours: the area of an entrance an active legend quest needs, never once it is found', () => {
    const none = () => false;
    const zap = entranceRumor('coral-coast', ['zapdos'], none, 0)!;
    expect(zap).toMatch(/tảng đá nứt/);
    expect(zap).toMatch(/Zapdos/);
    expect(zap).not.toMatch(/\d/); // no coordinates
    // clue-revealed: where the next clue lies; the whirlpool only in the rain
    const lugia = entranceRumor('coral-coast', ['lugia'], none, 0)!;
    expect(lugia).toMatch(/dấu vết lạ/);
    expect(lugia).toMatch(/mưa bão/);
    // wrong map, found already, obstacle cleared, no quest → nothing
    expect(entranceRumor('starter-valley', ['zapdos'], none, 0)).toBeNull();
    const e = entranceOf('zapdos')!;
    expect(entranceRumor('coral-coast', ['zapdos'], (f) => f === secretFlag(e.region, e.secret.id), 0)).toBeNull();
    expect(entranceRumor('coral-coast', ['zapdos'], (f) => f === fieldFlag(e.region, e.secret.reveal.field!), 0)).toBeNull();
    expect(entranceRumor('coral-coast', [], none, 0)).toBeNull();
    // several: rotates
    const two = new Set([0, 1, 2, 3].map((n) => entranceRumor('coral-coast', ['zapdos', 'lugia'], none, n)));
    expect(two.size).toBe(2);
    // Dialga / Palkia / Arceus share one gate: one rumour
    expect(new Set([0, 1, 2].map((n) => entranceRumor('legendary-sanctuary', ['dialga', 'palkia'], none, n))).size).toBe(1);
  });
});
