import { describe, expect, it } from 'vitest';
import { repShop, shopCatalogue, specialtiesFor, REP_DISCOUNT, SPECIALTY_TIER } from '../src/core/shop';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { REP_REGIONS } from '../src/core/reputation';
import { VN_PROVINCES } from '../src/adventure/passport';
import { POKEMON } from '../src/core/data';

// V30: the mart follows the player's reputation in its region (Được tin cậy −10 %, Người nhà −15 % and a specialty
// shelf with the guardian's type items), and every province has someone behind the counter.
const price = (id: string) => shopCatalogue().find((e) => e.id === id)!.price;
const PROVINCES = VN_PROVINCES.filter((p) => REGION_DEFS[p.id]?.worldBoss).map((p) => p.id);

describe('the mart and the region\'s reputation', () => {
  it('strangers and acquaintances pay the usual price; trusted ones get 10 %, family 15 %', () => {
    for (const tier of [0, 1]) expect(repShop(tier, ['fire']).find((e) => e.id === 'potion')!.price).toBe(price('potion'));
    expect(REP_DISCOUNT).toEqual([0, 0, 0.1, 0.15]);
    const trusted = repShop(2, ['fire']).find((e) => e.id === 'ultraball')!;
    expect(trusted).toMatchObject({ price: 1100, was: 1200 }); // 1200 −10 %, rounded to 50
    expect(repShop(3, ['fire']).find((e) => e.id === 'ultraball' && e.category !== 'local')!.price).toBe(1000);
  });

  it('the specialty shelf opens at Người nhà: the guardian\'s type items and stone at 20 % off, nowhere else', () => {
    expect(specialtiesFor(['fire'])).toEqual(expect.arrayContaining(['charcoal', 'fire-stone']));
    expect(specialtiesFor(['grass', 'ground'])).toEqual(expect.arrayContaining(['miracle-seed', 'leaf-stone', 'soft-sand']));
    expect(repShop(SPECIALTY_TIER - 1, ['fire']).some((e) => e.category === 'local')).toBe(false);
    const shop = repShop(SPECIALTY_TIER, ['fire']);
    const charcoal = shop.filter((e) => e.id === 'charcoal');
    expect(charcoal).toHaveLength(1); // it leaves its usual shelf
    expect(charcoal[0]).toMatchObject({ category: 'local', was: price('charcoal'), price: Math.round((price('charcoal') * 0.8) / 50) * 50 });
    // ids stay unique (the shop window selects by id)
    expect(new Set(shop.map((e) => e.id)).size).toBe(shop.length);
  });

  it('a guardian with no item of its types still gets a shop (no specialty shelf)', () => {
    expect(repShop(SPECIALTY_TIER, []).some((e) => e.category === 'local')).toBe(false);
  });

  it('every province has someone behind the counter, on open ground, with reputation and specialties', () => {
    expect(PROVINCES).toHaveLength(36);
    for (const id of PROVINCES) {
      const d = REGION_DEFS[id];
      const s = d.npcs.find((n) => n.id === 'shopkeeper');
      expect(s, id).toBeDefined();
      expect(new ValleyMap(d).solidAt(s!.x, s!.y), `${id} shopkeeper (${s!.x},${s!.y})`).toBe(false);
      expect(REP_REGIONS[id]?.name, id).toBeDefined();
      expect(specialtiesFor(POKEMON.get(d.worldBoss!.id)!.types).length, `${id} specialties`).toBeGreaterThan(0);
    }
  });
});
