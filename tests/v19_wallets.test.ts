import { describe, expect, it } from 'vitest';
import { balance, campaignWallet, earnTo, fmtCoins, spendFrom, WALLETS } from '../src/core/wallet';
import { defaultSave, migrate, newAdventure, recordRun, SAVE_VERSION, slotSummary } from '../src/systems/saveSchema';
import { AdventureState } from '../src/adventure/AdventureState';
import { buyUpgrade, PERM_UPGRADES } from '../src/core/permanentUpgrades';
import { applyCoopLoot } from '../src/net/coopRewards';
import { coopEventLabel, CoopEventDirector } from '../src/core/coopEvents';

describe('three wallets, one per mode', () => {
  it('distinct names and units', () => {
    expect(new Set(Object.values(WALLETS).map((w) => w.unit)).size).toBe(3);
    expect(fmtCoins(1500, 'adventure')).toMatch(/^1[.,]500 xu$/);
    expect(fmtCoins(20, 'survivor')).toBe('20 ngọc');
    expect(fmtCoins(800, 'vietnam')).toBe('800 đồng');
    expect(campaignWallet('vietnam')).toBe('vietnam');
    expect(campaignWallet('classic')).toBe('adventure');
    expect(campaignWallet(undefined)).toBe('adventure');
  });
  it('earning in one wallet never changes the others; spending is all-or-nothing', () => {
    const s = defaultSave();
    earnTo(s, 'survivor', 100); earnTo(s, 'adventure', 50); earnTo(s, 'vietnam', 7);
    expect([s.survivorCoins, s.currency, s.vnCoins]).toEqual([100, 50, 7]);
    expect(spendFrom(s, 'vietnam', 8)).toBe(false);
    expect(s.vnCoins).toBe(7);
    expect(spendFrom(s, 'adventure', 50)).toBe(true);
    expect([s.survivorCoins, s.currency, s.vnCoins]).toEqual([100, 0, 7]);
    earnTo(s, 'adventure', -30);
    expect(balance(s, 'adventure')).toBe(0);
  });
  it('Survivor runs pay ngọc and Permanent Upgrades spend ngọc only', () => {
    let s = defaultSave();
    s.currency = 999_999; s.vnCoins = 999_999;
    expect(buyUpgrade(s, PERM_UPGRADES[0].id)).toBe(false); // adventure / VN money cannot buy upgrades
    s = recordRun(s, { victory: true, time: 900, kills: 1000, level: 40, bosses: 3 });
    expect(s.survivorCoins).toBe(450);
    expect(s.currency).toBe(999_999);
    expect(buyUpgrade(s, PERM_UPGRADES[0].id)).toBe(true);
    expect(s.survivorCoins).toBeLessThan(450);
    expect(s.currency).toBe(999_999);
  });
  it('Adventure spends xu, Vietnam Odyssey spends đồng', () => {
    const a = defaultSave(); a.adventure = newAdventure('classic');
    a.currency = 1000; a.vnCoins = 5000; a.survivorCoins = 5000;
    const st = new AdventureState(a);
    expect(st.wallet).toBe('adventure');
    expect(st.unit).toBe('xu');
    expect(st.buy('pokeball', 200, 5)).toBe(true);
    expect(st.buy('pokeball', 200, 1)).toBe(false);
    expect([a.currency, a.vnCoins, a.survivorCoins]).toEqual([0, 5000, 5000]);

    const v = defaultSave(); v.adventure = newAdventure('vietnam');
    v.currency = 5000; v.vnCoins = 300; v.survivorCoins = 5000;
    const vs = new AdventureState(v);
    expect(vs.unit).toBe('đồng');
    expect(vs.money).toBe(300);
    vs.earn(200);
    expect(vs.buy('potion', 300, 2)).toBe(false);
    expect(vs.buy('pokeball', 250, 2)).toBe(true);
    expect([v.currency, v.vnCoins, v.survivorCoins]).toEqual([5000, 0, 5000]);
    expect(slotSummary(v).money).toBe(0);
    expect(slotSummary(v).survivorCoins).toBe(5000);
  });
  it('co-op loot pays the host mode wallet', () => {
    const s = defaultSave();
    expect(applyCoopLoot(s, { currency: 40, wallet: 'survivor' })).toEqual(['+40 ngọc']);
    applyCoopLoot(s, { currency: 30, wallet: 'vietnam' });
    applyCoopLoot(s, { currency: 20 });
    applyCoopLoot(s, { currency: 10, wallet: 'bogus' as never });
    expect([s.survivorCoins, s.vnCoins, s.currency]).toEqual([40, 30, 30]);
    const d = new CoopEventDirector();
    d.unit = 'ngọc';
    d.update({ dt: 0.1, kills: 0, elites: 0, bosses: 0, healing: 0, bothAlive: true, distance: 0 });
    expect(coopEventLabel(d.view)).toMatch(/ngọc\/người/);
  });
  it('v7 saves migrate without losing coins (every wallet starts with the old balance)', () => {
    const v7 = { ...defaultSave(), version: 7, currency: 1234 } as Record<string, unknown>;
    delete v7.survivorCoins; delete v7.vnCoins;
    const m = migrate(v7);
    expect(m.version).toBe(SAVE_VERSION);
    expect([m.currency, m.survivorCoins, m.vnCoins]).toEqual([1234, 1234, 1234]);
    const fresh = migrate(defaultSave());
    expect([fresh.currency, fresh.survivorCoins, fresh.vnCoins]).toEqual([0, 0, 0]);
  });
});
