import { beforeEach, describe, expect, it } from 'vitest';
import { cleanPlayerName, DEFAULT_PLAYER_NAME, PLAYER_NAME_MAX, saveStore } from '../src/systems/save';
import { defaultSave, newAdventure } from '../src/systems/saveSchema';

// The profile lives in the `meta` record (device-wide), not in a slot — the key property is that a
// NEW GAME or an empty slot never wipes the player's name.
type Internals = { mem: Map<string, unknown> };

beforeEach(async () => {
  await saveStore.load();
  await saveStore.newGame(1);
  await saveStore.setPlayerName(DEFAULT_PLAYER_NAME);
});

describe('player profile', () => {
  it('cleans single-line names and caps the length', () => {
    expect(cleanPlayerName('  Bo   Hồng  ')).toBe('Bo Hồng');
    expect(cleanPlayerName('Bo\nHồng\t2')).toBe('Bo Hồng 2');
    expect(cleanPlayerName('')).toBe(DEFAULT_PLAYER_NAME);
    expect(cleanPlayerName('   ')).toBe(DEFAULT_PLAYER_NAME);
    expect(cleanPlayerName(null)).toBe(DEFAULT_PLAYER_NAME);
    expect(cleanPlayerName(42)).toBe(DEFAULT_PLAYER_NAME);
    expect(cleanPlayerName('x'.repeat(40))).toHaveLength(PLAYER_NAME_MAX);
  });

  it('keeps the name device-wide across new games, slots and reloads', async () => {
    await saveStore.newGame(1);
    expect(saveStore.playerName).toBe(DEFAULT_PLAYER_NAME);

    const saved = await saveStore.setPlayerName('  Bo   Hồng ');
    expect(saved).toBe('Bo Hồng');
    expect(saveStore.data.playerName).toBe('Bo Hồng');

    await saveStore.newGame(2);
    expect(saveStore.playerName).toBe('Bo Hồng');
    expect(saveStore.data.playerName).toBe('Bo Hồng');

    // reload reads the device profile from `meta`
    await saveStore.load();
    expect(saveStore.playerName).toBe('Bo Hồng');
  });

  it('mirrors the name into a progressed slot', async () => {
    await saveStore.setPlayerName('Minh');
    const d = defaultSave();
    d.adventure = { ...newAdventure(), started: true };
    d.currency = 5;
    await saveStore.save(d);
    expect(d.playerName).toBe('Minh');

    const back = await saveStore.loadSlot(1);
    expect(back.playerName).toBe('Minh');
    expect(saveStore.playerName).toBe('Minh');
  });

  it('migrates the name of an older per-slot save when meta has no profile', async () => {
    const mem = (saveStore as unknown as Internals).mem;
    const old = defaultSave();
    old.adventure = { ...newAdventure(), started: true };
    old.playerName = 'Tên Cũ';
    mem.set('meta', { activeSlot: 1, settings: defaultSave().settings, legacyMigrated: true });
    mem.set('slot-1', old);

    await saveStore.load();
    expect(saveStore.playerName).toBe('Tên Cũ');
    expect(saveStore.data.playerName).toBe('Tên Cũ');

    // the next write stores it as the device profile, so switching slots keeps it
    await saveStore.save();
    await saveStore.newGame(3);
    expect(saveStore.playerName).toBe('Tên Cũ');
  });
});
