import { describe, expect, it } from 'vitest';
import { RARE_RULES, rareRows } from '../src/core/ecologyRules';
import { REGIONS } from '../src/core/encounters';

// V30: the Pokédex lists every rare condition (T22-5 had only the pop-up when one happened).
const rows = rareRows((id) => REGIONS.get(id)?.name);

describe('Pokédex table of rare conditions', () => {
  it('one row per rule, in Vietnamese, with the hint', () => {
    expect(rows).toHaveLength(RARE_RULES.length);
    for (const r of rows) {
      expect(r.where.length, r.id).toBeGreaterThan(2);
      expect(r.when, r.id).toMatch(/ban đêm|ban ngày|mọi lúc|^\d\d:\d\d–\d\d:\d\d$/);
      expect(r.weather, r.id).not.toMatch(/[A-Z]/); // no raw weather ids (heavyRain…)
      expect(r.hint.length).toBeGreaterThan(10);
    }
  });

  it('clock windows, water and named encounter regions read as they should', () => {
    const chatot = rows.find((r) => r.id === 'chatot-dawn')!;
    expect(chatot.when).toBe('05:00–08:00');
    expect(chatot.weather).toBe('trời quang');
    expect(rows.find((r) => r.id === 'relicanth-dawn')!.where).toContain('(dưới nước)');
    const seviper = rows.find((r) => r.id === 'seviper-uminh')!;
    expect(seviper.where).toContain('Rừng Tràm U Minh Hạ');
    expect(seviper.when).toBe('ban đêm');
    expect(seviper.weather).toBe('mưa / mưa xối xả / sương mù');
  });
});
