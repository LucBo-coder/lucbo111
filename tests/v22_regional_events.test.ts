import { describe, expect, it } from 'vitest';
import { REGIONAL_CHANCE, REGIONAL_VARIANTS, pickVariant, variantById, variantsFor } from '../src/core/regionalEvents';
import { ECOLOGY, REGIONS } from '../src/core/encounters';
import { ANOMALIES } from '../src/core/worldEvents';
import { ITEMS } from '../src/adventure/AdventureState';
import { shopCatalogue } from '../src/core/shop';
import { Rng } from '../src/core/rng';

describe('V22 regional events: data', () => {
  it('every variant points at real regions, species, weather and goods', () => {
    const cat = new Set(shopCatalogue().map((e) => e.id));
    const ids = new Set<string>();
    for (const v of REGIONAL_VARIANTS) {
      expect(ids.has(v.id), v.id).toBe(false); ids.add(v.id);
      expect(v.regions.length, v.id).toBeGreaterThan(0);
      for (const r of v.regions) expect(REGIONS.has(r), `${v.id} ${r}`).toBe(true);
      for (const s of v.species ?? []) {
        const e = ECOLOGY.get(s);
        expect(e, `${v.id} ${s}`).toBeTruthy();
        expect(e!.legendary || e!.mythical, s).toBe(false);
      }
      if (v.type === 'outbreak' || v.type === 'migration') expect(v.species?.length, v.id).toBeGreaterThan(0);
      if (v.type === 'weather') expect(v.weather && v.weather in ANOMALIES, v.id).toBe(true);
      if (v.type === 'merchant') {
        expect(v.offers?.length, v.id).toBeGreaterThan(0);
        for (const o of v.offers!) { expect(cat.has(o.id), o.id).toBe(true); expect(o.stock).toBeGreaterThan(0); }
      }
      for (const id of Object.keys(v.bonus ?? {})) expect(ITEMS[id], id).toBeTruthy();
      expect(v.name.length && v.intro.length).toBeTruthy();
    }
  });

  it('each Vietnam province has its own flavours', () => {
    const prov = (p: string) => REGIONAL_VARIANTS.filter((v) => v.regions.some((r) => r.startsWith(`vn-${p}-`)));
    for (const p of ['cm', 'ag', 'ct']) expect(prov(p).length, p).toBeGreaterThan(0);
  });
});

describe('V22 regional events: picking', () => {
  it('only in its own region and type; usually but not always', () => {
    expect(variantsFor('outbreak', 'vn-ag-wetland').map((v) => v.id)).toEqual(['mua-ca-linh']);
    expect(variantsFor('merchant', 'vn-ag-wetland')).toEqual([]);
    const rng = new Rng(7);
    let hit = 0;
    for (let i = 0; i < 1000; i++) {
      expect(pickVariant(rng, 'outbreak', 'vn-cm-cape')).toBeNull();
      if (pickVariant(rng, 'weather', 'vn-cm-cape')?.id === 'trieu-cuong') hit++;
    }
    expect(hit / 1000).toBeGreaterThan(REGIONAL_CHANCE - 0.06);
    expect(hit / 1000).toBeLessThan(REGIONAL_CHANCE + 0.06);
  });

  it('variantById survives a save (plain id) and rejects junk', () => {
    expect(variantById('dom-dom')?.type).toBe('outbreak');
    expect(variantById(undefined)).toBeNull();
    expect(variantById('nope')).toBeNull();
  });
});
