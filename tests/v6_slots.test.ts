import { describe, expect, it } from 'vitest';
import { saveStore, SLOT_COUNT } from '../src/systems/save';
import { defaultSave, freshSave, isEmptySave, newAdventure, slotSummary } from '../src/systems/saveSchema';
import { makeOwned } from '../src/core/progression';

// IndexedDB does not exist under Vitest (node) → SaveStore runs on its in-memory fallback, same code paths.
function progressed() {
  const d = defaultSave();
  d.adventure = { ...newAdventure(), started: true, playTime: 321, region: 'frozen-mountains', legends: { mewtwo: 'caught', lugia: 'defeated' } };
  const p = makeOwned('pikachu', 12, 'wild');
  d.collection.push(p);
  d.adventure.party = [p.uid];
  d.pokedex = { seen: ['pikachu', 'pidgey'], caught: ['pikachu'], shiny: ['pikachu'] };
  d.inventory = { pokeball: 9, potion: 3 };
  d.currency = 777;
  d.stats.runs = 4;
  d.unlockedPokemon.push('pikachu');
  d.permanentUpgrades = { hp: 2 };
  d.achievements = ['first-catch'];
  return d;
}

describe('save slots', () => {
  it('freshSave keeps only settings — nothing else carries over', () => {
    const old = progressed();
    old.settings.quality = 'low';
    old.settings.sfx = false;
    const f = freshSave(old.settings);
    expect(f.settings.quality).toBe('low');
    expect(f.settings.sfx).toBe(false);
    expect({ ...f, settings: null }).toEqual({ ...defaultSave(), settings: null });
  });

  it('isEmptySave / slotSummary', () => {
    expect(isEmptySave(defaultSave())).toBe(true);
    const d = progressed();
    expect(isEmptySave(d)).toBe(false);
    const s = slotSummary(d);
    expect(s).toMatchObject({ playTime: 321, region: 'frozen-mountains', party: ['pikachu'], collection: 1, caught: 1, badges: 1, money: 777, runs: 4, adventureStarted: true });
  });

  it('settings-only changes never fill an empty slot', async () => {
    await saveStore.load();
    await saveStore.newGame(2);
    saveStore.data.settings.showFps = true;
    await saveStore.save();
    expect((await saveStore.listSlots())[1]).toBeNull();
  });

  it('slots are independent; NEW GAME wipes the slot completely', async () => {
    await saveStore.load();
    expect(SLOT_COUNT).toBe(3);
    await saveStore.newGame(1);
    await saveStore.save(progressed());
    await saveStore.newGame(3);
    const other = progressed();
    other.currency = 5;
    await saveStore.save(other);

    let list = await saveStore.listSlots();
    expect(list[0]?.money).toBe(777);
    expect(list[2]?.money).toBe(5);

    const back = await saveStore.loadSlot(1);
    expect(back.collection.map((c) => c.species)).toEqual(['pikachu']);
    expect(saveStore.slot).toBe(1);

    // new game in slot 1: collection, pokédex, bag, money, stats, unlocks, upgrades, legends… all gone
    const n = await saveStore.newGame(1);
    expect(n.collection).toEqual([]);
    expect(n.pokedex).toEqual({ seen: [], caught: [] });
    expect(n.inventory).toEqual({});
    expect(n.currency).toBe(0);
    expect(n.stats.runs).toBe(0);
    expect(n.unlockedPokemon).toEqual(defaultSave().unlockedPokemon);
    expect(n.permanentUpgrades).toEqual({});
    expect(n.achievements).toEqual([]);
    expect(n.adventure).toBeNull();
    list = await saveStore.listSlots();
    expect(list[0]).toBeNull();
    expect(list[2]?.money).toBe(5); // the other slot is untouched

    await saveStore.deleteSlot(3);
    expect((await saveStore.listSlots())[2]).toBeNull();
  });
});

describe('save migration', () => {
  it('v5 → latest: savedAt, boss fight checkpoints and recalled list added, progress kept', async () => {
    const { migrate, SAVE_VERSION } = await import('../src/systems/saveSchema');
    const v5 = { version: 5, currency: 12, collection: [], pokedex: { seen: ['pidgey'], caught: [], shiny: [] }, adventure: { ...newAdventure(), started: true, legends: { lugia: 'caught' } } } as Record<string, unknown>;
    delete (v5.adventure as Record<string, unknown>).bossFights;
    delete (v5.adventure as Record<string, unknown>).recalled;
    const m = migrate(v5);
    expect(m.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(7);
    expect(m.savedAt).toBe(0);
    expect(m.adventure!.bossFights).toEqual({});
    expect(m.adventure!.recalled).toEqual([]);
    expect(m.adventure!.legends.lugia).toBe('caught');
    expect(m.currency).toBe(12);
    expect(m.adventure!.activeUid).toBeNull();
    expect(m.adventure!.pc.boxes.length).toBeGreaterThan(0);
  });
});
