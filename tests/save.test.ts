import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, recordRun, SAVE_VERSION } from '../src/systems/saveSchema';

describe('save schema', () => {
  it('returns defaults for empty/corrupt data', () => {
    expect(migrate(undefined)).toEqual(defaultSave());
    expect(migrate('garbage')).toEqual(defaultSave());
  });
  it('migrates v1 (flat muted flag) to current', () => {
    const v1 = { version: 1, muted: true, unlockedPokemon: ['charmander'], currency: 30, achievements: [], permanentUpgrades: {}, stats: { runs: 2, victories: 0, bestTime: 120, totalKills: 50, bossesDefeated: 0 } };
    const m = migrate(v1);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.settings.sfx).toBe(false);
    expect(m.stats.bestLevel).toBe(0);
    expect(m.stats.runs).toBe(2);
    expect(m.currency).toBe(30);
    expect((m as unknown as Record<string, unknown>).muted).toBeUndefined();
  });
  it('fills new fields on current-version saves', () => {
    const partial = { version: SAVE_VERSION, settings: { sfx: false }, stats: { runs: 1 } };
    const m = migrate(partial);
    expect(m.settings.showFps).toBe(false);
    expect(m.stats.totalKills).toBe(0);
    expect(m.unlockedPokemon.length).toBe(3);
  });
  it('records run stats and currency', () => {
    const s = recordRun(defaultSave(), { victory: true, time: 930.5, kills: 1000, level: 40, bosses: 3 });
    expect(s.stats.runs).toBe(1);
    expect(s.stats.victories).toBe(1);
    expect(s.stats.bestTime).toBe(930);
    expect(s.currency).toBe(100 + 150 + 200);
  });
});
