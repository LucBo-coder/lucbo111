import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emergencySave, installCrashGuard, noteFrameError, onEmergencySave, resetFrameErrors } from '../src/systems/crashGuard';
import { saveStore } from '../src/systems/save';
import { defaultSave } from '../src/systems/saveSchema';
import { moveAssets } from '../src/render/moveAssets';
import { SKILLS } from '../src/core/data';

// a small localStorage for node
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;
const RESCUE = 'pokemon-survivor-rescue';

describe('crash guard: one failing frame never stops the game loop', () => {
  beforeEach(() => resetFrameErrors());

  it('a throwing step is caught and the next step runs', () => {
    vi.useFakeTimers();
    let calls = 0;
    const game = { step: (_t: number, _d: number) => { calls++; if (calls === 1) throw new Error('boom'); } };
    installCrashGuard(game);
    expect(() => game.step(0, 16)).not.toThrow();
    game.step(16, 16);
    expect(calls).toBe(2);
    // the error is still reported (asynchronously) so error handlers / test runners see it
    expect(() => vi.runAllTimers()).toThrow('boom');
    vi.useRealTimers();
  });

  it('an error in every frame for a moment counts as stuck; a single one does not', () => {
    expect(noteFrameError(0)).toBe(false);
    resetFrameErrors();
    let stuck = false;
    for (let i = 0; i < 40; i++) stuck = noteFrameError(i * 16);
    expect(stuck).toBe(true);
    resetFrameErrors();
    // spread out over minutes: never "stuck"
    for (let i = 0; i < 100; i++) expect(noteFrameError(i * 5000)).toBe(false);
  });

  it('emergency savers all run, even when one fails, and can be removed', () => {
    const seen: string[] = [];
    const offA = onEmergencySave(() => { seen.push('a'); throw new Error('x'); });
    const offB = onEmergencySave(() => seen.push('b'));
    emergencySave();
    expect(seen).toEqual(['a', 'b']);
    offA(); offB();
    emergencySave();
    expect(seen).toEqual(['a', 'b']);
  });
});

describe('rescue copy: progress survives a reload', () => {
  it('rescue() writes a synchronous copy; a newer rescue copy wins over the stored slot on load', async () => {
    await saveStore.load();
    await saveStore.loadSlot(1);
    const s = defaultSave();
    s.currency = 111;
    s.collection.push({ uid: 'u1', species: 'pikachu', level: 5 } as never);
    await saveStore.save(s);
    // more progress, then the page goes away before the async write
    saveStore.data.currency = 222;
    saveStore.rescue();
    const copy = JSON.parse(mem.get(RESCUE)!);
    expect(copy.slot).toBe(1);
    expect(copy.save.currency).toBe(222);
    // simulate the IndexedDB write never finishing: the slot still holds 111, the rescue copy is newer
    mem.set(RESCUE, JSON.stringify({ slot: 1, save: { ...copy.save, savedAt: Date.now() + 60_000 } }));
    const loaded = await saveStore.loadSlot(1);
    expect(loaded.currency).toBe(222);
    expect(mem.has(RESCUE)).toBe(false);
  });

  it('an older rescue copy is ignored; a new game in that slot drops it', async () => {
    await saveStore.loadSlot(1);
    const s = defaultSave();
    s.currency = 500;
    s.collection.push({ uid: 'u2', species: 'eevee', level: 5 } as never);
    await saveStore.save(s);
    mem.set(RESCUE, JSON.stringify({ slot: 1, save: { ...s, currency: 1, savedAt: 1 } }));
    expect((await saveStore.loadSlot(1)).currency).toBe(500);
    mem.set(RESCUE, JSON.stringify({ slot: 1, save: { ...s, currency: 9, savedAt: Date.now() + 60_000 } }));
    await saveStore.newGame(1);
    expect(mem.has(RESCUE)).toBe(false);
  });
});

describe('start-up: skill icons are drawn on first use', () => {
  it('moveAssets still names the icon of every move (drawn lazily once a scene is known)', () => {
    const s = [...SKILLS.values()][0];
    expect(moveAssets(s).icon).toBe('skill-' + s.id);
  });
});
