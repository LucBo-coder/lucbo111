import { describe, expect, it } from 'vitest';
import { ICON_DATA, SkillIconRegistry, TypeIconRegistry, StatusIconRegistry } from '../src/render/icons';
import { SKILLS } from '../src/core/data';
import type { StatusKind } from '../src/core/types';

// Graphics tests that don't need a browser: every asset map is complete and well-formed.
describe('icon library (Part VIII / IX)', () => {
  it('all 18 types have a 7×7 glyph, a projectile sprite and a registry key', () => {
    expect(TypeIconRegistry.all.length).toBe(18);
    for (const t of TypeIconRegistry.all) {
      const g = ICON_DATA.TYPE_GLYPH[t];
      expect(g.length, t).toBe(7);
      for (const row of g) expect(row.length, t).toBe(7);
      expect(ICON_DATA.PROJ[t].rows.length, t).toBe(10);
      for (const row of ICON_DATA.PROJ[t].rows) expect(row.length, t).toBe(10);
    }
  });
  it('every status kind has an icon', () => {
    const kinds: StatusKind[] = ['burn', 'poison', 'badPoison', 'paralysis', 'sleep', 'freeze', 'confusion', 'flinch', 'slow', 'stun', 'atkUp', 'defDown', 'leech', 'taunt'];
    for (const k of kinds) {
      expect(StatusIconRegistry.kinds).toContain(k);
      for (const row of ICON_DATA.STATUS_ICON[k].rows) expect(row.length).toBe(7);
    }
  });
  it('bespoke skill art is 12×12, uses only its palette, and exists for the signature moves', () => {
    for (const [id, b] of Object.entries(ICON_DATA.BESPOKE)) {
      expect(SKILLS.has(id), id).toBe(true);
      expect(b.rows.length, id).toBe(12);
      for (const row of b.rows) {
        expect(row.length, id).toBe(12);
        for (const ch of row) if (ch !== '.') expect(b.pal[ch], `${id} '${ch}'`).toBeTruthy();
      }
    }
    for (const id of ['ember', 'flamethrower', 'fire_blast', 'thunderbolt', 'thunder_wave', 'water_gun', 'hydro_pump', 'razor_leaf', 'solar_beam', 'shadow_ball', 'ice_beam']) {
      expect(SkillIconRegistry.hasBespoke(id), id).toBe(true);
    }
  });
  it('every skill kind used by the data has a composed glyph (no generic fallback icon)', () => {
    for (const s of SKILLS.values()) expect(ICON_DATA.KIND_GLYPH[s.kind], `${s.id} kind ${s.kind}`).toBeTruthy();
  });
});
