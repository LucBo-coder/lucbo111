import { describe, expect, it } from 'vitest';
import { ITEM_DEFS, evolutionsOf, megaFormsOf } from '../src/core/evolution';
import { POKEMON } from '../src/core/data';
import { categoryOf, MAX_STACK, maxBuy, megaOf, MERCHANT_DISCOUNT, merchantStock, SHOP_CATEGORIES, shopCatalogue, evolutionUsersOf } from '../src/core/shop';
import { AdventureState } from '../src/adventure/AdventureState';
import { defaultSave } from '../src/systems/saveSchema';
import { EVENT_DEFS } from '../src/core/worldEvents';
import { Rng } from '../src/core/rng';
import { ITEM_SHAPE } from '../src/render/icons';

const NEW_STONES = ['ice-stone', 'sun-stone', 'shiny-stone', 'dusk-stone', 'dawn-stone', 'tart-apple', 'sweet-apple', 'syrupy-apple',
  'cracked-pot', 'chipped-pot', 'unremarkable-teacup', 'masterpiece-teacup', 'metal-alloy', 'galarica-cuff', 'galarica-wreath',
  'black-augurite', 'peat-block', 'auspicious-armor', 'malicious-armor', 'scroll-of-darkness', 'scroll-of-waters'];
const NEW_HELD = ['protector', 'electirizer', 'magmarizer', 'up-grade', 'dubious-disc', 'razor-claw', 'razor-fang', 'prism-scale',
  'reaper-cloth', 'deep-sea-tooth', 'deep-sea-scale', 'sachet', 'whipped-dream', 'oval-stone'];

describe('Poké Mart catalogue (0.18)', () => {
  const cat = shopCatalogue();
  it('every sold item sits on exactly one known shelf, with a price', () => {
    const ids = new Set<string>();
    for (const e of cat) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(e.price, e.id).toBeGreaterThan(0);
      expect(SHOP_CATEGORIES.map((c) => c.id)).toContain(e.category);
      expect(categoryOf(e.id)).toBe(e.category);
    }
    for (const c of SHOP_CATEGORIES) expect(cat.filter((e) => e.category === c.id).length, c.id).toBeGreaterThan(0);
    // old prices kept, story rewards never sold
    expect(cat.find((e) => e.id === 'pokeball')?.price).toBe(200);
    expect(cat.find((e) => e.id === 'rare-candy')?.price).toBe(10_000);
    expect(ids.has('key-stone')).toBe(false);
  });
  it('new evolution stones / held items are sold on the evolution shelf and evolve something', () => {
    for (const id of [...NEW_STONES, ...NEW_HELD]) {
      expect(ITEM_DEFS.has(id), id).toBe(true);
      expect(categoryOf(id), id).toBe('evolution');
      expect(evolutionUsersOf(id).length, id).toBeGreaterThan(0);
    }
    expect(evolutionUsersOf('dawn-stone').join(' ')).toMatch(/Gallade/);
    expect(evolutionUsersOf('metal-coat').join(' ')).toMatch(/Scizor/);
  });
  it('32 new Mega Stones lead to valid Mega forms', () => {
    const megas = cat.filter((e) => e.category === 'mega');
    expect(megas.length).toBeGreaterThanOrEqual(42);
    for (const e of megas) {
      const m = megaOf(e.id);
      expect(m, e.id).not.toBeNull();
      const form = POKEMON.get(m!.form)!;
      expect(form?.mega?.base, e.id).toBe(m!.base);
      expect(megaFormsOf(m!.base).map((f) => f.stone)).toContain(e.id);
      expect(form.skills.length, e.id).toBeGreaterThan(0);
    }
    for (const sp of ['garchomp', 'lucario', 'scizor', 'tyranitar', 'gardevoir', 'gallade', 'diancie']) expect(megaFormsOf(sp).length, sp).toBeGreaterThan(0);
    // new mega forms are never evolution targets of their own
    for (const p of POKEMON.values()) if (p.mega) expect(evolutionsOf(p.id).length).toBe(0);
  });
  it('item icon shapes are 10×10', () => {
    for (const [k, rows] of Object.entries(ITEM_SHAPE)) {
      expect(rows.length, k).toBe(10);
      for (const r of rows) expect(r.length, k).toBe(10);
    }
    for (const d of ITEM_DEFS.values()) if (d.icon) expect(ITEM_SHAPE[d.icon], d.id).toBeDefined();
  });
});

describe('buying in bulk', () => {
  it('quantity purchase is all-or-nothing and capped by the stack', () => {
    const st = new AdventureState(defaultSave());
    st.earn(1000);
    expect(st.buy('pokeball', 200, 3)).toBe(true);
    expect(st.item('pokeball')).toBe(3);
    expect(st.money).toBe(400);
    expect(st.buy('pokeball', 200, 3)).toBe(false); // 600 > 400: nothing bought
    expect(st.item('pokeball')).toBe(3);
    expect(st.money).toBe(400);
    expect(st.buy('pokeball', 200, 0)).toBe(false);
    st.addItems({ potion: MAX_STACK - 1 });
    st.earn(10_000);
    expect(st.buy('potion', 300, 2)).toBe(false);
    expect(st.buy('potion', 300, 1)).toBe(true);
    expect(st.item('potion')).toBe(MAX_STACK);
  });
  it('maxBuy respects money, stack and stock', () => {
    expect(maxBuy(1000, 200, 0)).toBe(5);
    expect(maxBuy(1_000_000, 200, 990)).toBe(9);
    expect(maxBuy(1_000_000, 200, 0, 3)).toBe(3);
    expect(maxBuy(100, 200, 0)).toBe(0);
    expect(maxBuy(100, 0, 0)).toBe(0);
  });
});

describe('Travelling Merchant & Meteor Shower events', () => {
  it('both events are defined with an end', () => {
    for (const t of ['merchant', 'meteor'] as const) {
      expect(EVENT_DEFS[t].duration).toBeGreaterThan(0);
      expect(EVENT_DEFS[t].cooldown).toBeGreaterThan(0);
    }
    expect(EVENT_DEFS.meteor.major).toBe(true);
    expect(EVENT_DEFS.merchant.major).toBe(false);
  });
  it('merchant stock: rare goods, 30 % off, limited units, no duplicates', () => {
    for (let seed = 1; seed < 30; seed++) {
      const rng = new Rng(seed);
      const stock = merchantStock((l) => rng.pick(l), (a, b) => rng.int(a, b));
      expect(stock.length).toBe(6);
      expect(new Set(stock.map((o) => o.id)).size).toBe(6);
      expect(stock.filter((o) => o.category === 'mega').length).toBe(2);
      for (const o of stock) {
        expect(o.price).toBeLessThan(o.was);
        expect(Math.abs(o.price - o.was * (1 - MERCHANT_DISCOUNT))).toBeLessThanOrEqual(25);
        expect(o.stock).toBeGreaterThanOrEqual(1);
        expect(o.stock).toBeLessThanOrEqual(4);
      }
    }
  });
});
