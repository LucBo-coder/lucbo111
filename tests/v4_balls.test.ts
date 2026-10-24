import { describe, expect, it } from 'vitest';
import { BALL_ORDER, ballMultiplier, captureChance, BallContext } from '../src/core/capture';
import { ITEMS, SHOP } from '../src/adventure/AdventureState';
import { ICON_DATA } from '../src/render/icons';

const ctx = (o: Partial<BallContext>): BallContext => ({ types: ['normal'], dark: false, untouched: false, battleSeconds: 0, ...o });

describe('special Poké Balls (Gen IV values, real-time conditions)', () => {
  it('Net Ball ×3.5 only vs Bug / Water', () => {
    expect(ballMultiplier('netball', ctx({ types: ['bug'] }))).toBe(3.5);
    expect(ballMultiplier('netball', ctx({ types: ['grass', 'water'] }))).toBe(3.5);
    expect(ballMultiplier('netball', ctx({ types: ['fire'] }))).toBe(1);
  });
  it('Dusk Ball ×3.5 at night / in caves', () => {
    expect(ballMultiplier('duskball', ctx({ dark: true }))).toBe(3.5);
    expect(ballMultiplier('duskball', ctx({ dark: false }))).toBe(1);
  });
  it('Quick Ball ×4 before the target fights; Timer Ball grows with battle time (cap ×4)', () => {
    expect(ballMultiplier('quickball', ctx({ untouched: true }))).toBe(4);
    expect(ballMultiplier('quickball', ctx({ untouched: false }))).toBe(1);
    expect(ballMultiplier('timerball', ctx({ battleSeconds: 0 }))).toBe(1);
    expect(ballMultiplier('timerball', ctx({ battleSeconds: 15 }))).toBeCloseTo(2.5);
    expect(ballMultiplier('timerball', ctx({ battleSeconds: 999 }))).toBe(4);
  });
  it('base balls keep their multipliers and better balls really raise the chance', () => {
    expect(ballMultiplier('pokeball', ctx({}))).toBe(1);
    expect(ballMultiplier('greatball', ctx({}))).toBe(1.5);
    expect(ballMultiplier('ultraball', ctx({}))).toBe(2);
    const p1 = captureChance(100, 40, 45, ballMultiplier('pokeball', ctx({ types: ['water'] })), 1);
    const p2 = captureChance(100, 40, 45, ballMultiplier('netball', ctx({ types: ['water'] })), 1);
    expect(p2).toBeGreaterThan(p1 * 2);
  });
  it('every ball is an item, sold in the shop and has a pixel icon', () => {
    for (const b of BALL_ORDER) {
      expect(ITEMS[b]?.kind, b).toBe('ball');
      expect(SHOP.some((s) => s.id === b), b).toBe(true);
      expect(ICON_DATA.ITEM_ART[b], b).toBeTruthy();
      for (const row of ICON_DATA.ITEM_ART[b].rows) expect(row.length, b).toBe(10);
    }
  });
});
