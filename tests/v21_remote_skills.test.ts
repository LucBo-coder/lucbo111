import { afterEach, describe, expect, it, vi } from 'vitest';
import { STEP, World } from '../src/core/world';
import { makeWildState } from '../src/core/wildAI';
import { buildDuel, DuelMirror, packSnapshot, RENTAL_TEAMS, RULESETS } from '../src/net/duel';
import { CoopHost, CoopMirror, coopSession, packCoop } from '../src/net/coop';
import { net } from '../src/net/session';
import { applySkills, packSkills, remoteSlot, skillFailText } from '../src/net/skillWire';
import type { NetMsg } from '../src/net/protocol';

afterEach(() => { vi.restoreAllMocks(); coopSession.active = false; net.role = null; net.status = 'idle'; });

const wire = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('active skills over the network — helpers', () => {
  it('skill bar state survives the wire and rebuilds the skills of a render-only unit', () => {
    const w = new World({ mode: 'adventure', seed: 3, width: 2000, height: 2000 });
    const a = w.addPokemon('charmander', { level: 25 });
    a.skills[0].cd = 3.25; a.skills[0].cdMax = 4; a.reserved = 0b10; a.queuedSlot = 1;
    const m = new World({ mode: 'adventure', seed: 3, width: 2000, height: 2000 });
    const b = m.visualUnit({ ...a, skills: undefined } as never);
    b.skills = [];
    applySkills(b, wire(packSkills(a)));
    expect(b.skills.map((s) => s.def.id)).toEqual(a.skills.map((s) => s.def.id));
    expect(b.skills[0].cd).toBeCloseTo(3.3, 5);
    expect(b.skills[0].cdMax).toBe(4);
    expect(b.reserved).toBe(0b10);
    expect(b.queuedSlot).toBe(1);
  });

  it('remote slots are validated, failure messages are Vietnamese', () => {
    const w = new World({ mode: 'adventure', seed: 3, width: 2000, height: 2000 });
    const a = w.addPokemon('charmander', { level: 25 });
    expect(remoteSlot(a, 'best')).toBe('best');
    expect(remoteSlot(a, 0)).toBe(0);
    for (const bad of [-1, a.skills.length, 1.5, '0', null, {}]) expect(remoteSlot(a, bad)).toBeNull();
    expect(skillFailText('cooldown', 'Charmander', 'Ember')).toBe('Ember đang hồi');
    expect(skillFailText('cast', 'Charmander', 'Ember')).toBeNull();
    expect(skillFailText('queued', 'Charmander', 'Ember')).toBeNull();
  });
});

describe('PvP: guest-triggered skills', () => {
  const host = RENTAL_TEAMS[0].party, guest = RENTAL_TEAMS[1].party;

  it('the host casts for the rival side; the guest mirror shows real cooldowns, kept slots and global cooldown', () => {
    const b = buildDuel(5, RULESETS.standard, host, guest);
    const w = b.world;
    for (let i = 0; i < 90; i++) w.step(STEP);
    w.drainEvents();
    const u = w.rival!.allies.find((x) => !x.fainted)!;
    for (const s of u.skills) s.cd = 0;
    u.energy = u.maxEnergy;
    const r = w.requestSkill(u, 'best', w.rival!);
    expect(['cast', 'queued']).toContain(r);
    w.setReserved(u, 2, true);
    const mirror = new DuelMirror(5, RULESETS.standard, host, guest, b.roster);
    mirror.push(wire(packSnapshot(w, 1)), 0);
    expect(mirror.world.home.manualCd).toBeGreaterThan(0); // the guest's own side is home in its mirror
    // a queued move walks in and goes off within its window
    for (let i = 0; i < 180 && !u.skills.some((s) => s.cd > 0); i++) w.step(STEP);
    const snap = wire(packSnapshot(w, 2));
    expect(snap.skl?.length).toBe(w.rival!.allies.length);
    mirror.push(snap, 50);
    const mu = mirror.unit(u.id)!;
    expect(mu.skills.map((s) => s.def.id)).toEqual(u.skills.map((s) => s.def.id));
    expect(mu.skills.some((s) => s.cd > 0)).toBe(true);
    expect(mu.reserved & 0b100).toBe(0b100);
  });

  it('the host side is not sent (the guest only draws its own bar), and old snapshots without it still apply', () => {
    const b = buildDuel(6, RULESETS.standard, host, guest);
    const snap = wire(packSnapshot(b.world, 1));
    const ids = new Set(b.world.rival!.allies.map((u) => u.id));
    expect(snap.skl!.every((k) => ids.has(k[0]))).toBe(true);
    const mirror = new DuelMirror(6, RULESETS.standard, host, guest, b.roster);
    delete snap.skl; delete snap.gcd;
    expect(() => mirror.push(snap, 0)).not.toThrow();
    expect(mirror.world.home.manualCd).toBe(0);
  });
});

describe('co-op: guest-triggered skills', () => {
  const map = { kind: 'region' as const, id: 'starter-valley', width: 4000, height: 4000 };

  function setup() {
    const w = new World({ mode: 'adventure', seed: 11, obstacles: false, width: map.width, height: map.height });
    const side = w.addCompanion();
    const g = w.addPokemon('charmander', { companion: true, level: 25 });
    g.x = side.trainer.x + 20; g.y = side.trainer.y;
    const foe = w.spawnWild('bulbasaur', 20, g.x + 110, g.y, { wild: makeWildState(g.x + 110, g.y, 'aggressive', { homeR: 40, aggroR: 600, leash: 900 }), hostile: true });
    w.step(STEP); w.drainEvents();
    for (const s of g.skills) s.cd = 0;
    g.energy = g.maxEnergy;
    coopSession.active = true; net.role = 'host'; net.status = 'connected';
    const sent: NetMsg[] = [];
    vi.spyOn(net, 'send').mockImplementation((m: NetMsg) => { sent.push(m); });
    let handler: ((m: NetMsg) => void) | null = null;
    vi.spyOn(net, 'on').mockImplementation((fn: (m: NetMsg) => void) => { handler = fn; return () => {}; });
    const host = new CoopHost(w, () => map);
    return { w, g, foe, host, sent, recv: (m: NetMsg) => handler!(m) };
  }

  it('coopSkill casts on the host for the guest side; failures come back as skillRes; other epochs are ignored', () => {
    const { w, g, host, sent, recv } = setup();
    recv({ t: 'coopSkill', epoch: 'stale', unit: g.id, slot: 'best' });
    expect(w.companion!.manualCd).toBe(0);
    recv({ t: 'coopSkill', epoch: host.epoch, unit: g.id, slot: 'best' });
    expect(w.companion!.manualCd).toBeGreaterThan(0);
    expect(g.castSlot >= 0 || g.queuedSlot >= 0).toBe(true);
    expect(sent.filter((m) => m.t === 'skillRes')).toEqual([]);
    recv({ t: 'coopSkill', epoch: host.epoch, unit: g.id, slot: 0 }); // spam: global cooldown
    expect(sent.filter((m) => m.t === 'skillRes')).toEqual([{ t: 'skillRes', r: 'global', unit: g.id, slot: 0 }]);
    // a host Pokémon or a made-up slot is never commanded by the guest
    const mine = w.addPokemon('pikachu', { level: 25 });
    w.companion!.manualCd = 0;
    recv({ t: 'coopSkill', epoch: host.epoch, unit: mine.id, slot: 'best' });
    recv({ t: 'coopSkill', epoch: host.epoch, unit: g.id, slot: 9 });
    expect(w.companion!.manualCd).toBe(0);
    host.destroy();
  });

  it('coopReserve keeps slots away from the host AI, and the guest mirror sees bars, kept slots and global cooldown', () => {
    const { w, g, host, recv } = setup();
    recv({ t: 'coopReserve', epoch: host.epoch, unit: g.id, mask: 0b11 });
    expect(g.reserved).toBe(0b11);
    recv({ t: 'coopSkill', epoch: host.epoch, unit: g.id, slot: 0 });
    const s = wire(packCoop(w, map, host.epoch, 1, false));
    expect(s.skl?.map((k) => k[0])).toEqual([g.id]);
    const m = new CoopMirror(map);
    m.apply(s);
    const mg = m.world.allies.find((a) => a.id === g.id)!;
    expect(mg.skills.map((x) => x.def.id)).toEqual(g.skills.map((x) => x.def.id));
    expect(mg.reserved).toBe(0b11);
    expect(m.world.home.manualCd).toBeGreaterThan(0);
    host.destroy();
  });
});

describe('kept skills are saved with the Pokémon', () => {
  it('by skill id: survive a reload, a new move in front, and are dropped when all are handed back', async () => {
    const { keptMask, setKept } = await import('../src/core/keptSkills');
    const { defaultSave, migrate } = await import('../src/systems/saveSchema');
    const { AdventureState } = await import('../src/adventure/AdventureState');
    const st = new AdventureState(defaultSave());
    st.addPokemon('charmander', 20, 'starter');
    const p = st.save.collection[0];
    const w = new World({ mode: 'adventure', seed: 1, width: 2000, height: 2000 });
    const u = w.addPokemon('charmander', { level: 20 });
    expect(keptMask(p, u.skills)).toBe(0);
    setKept(p, u.skills[1].def.id, true);
    expect(keptMask(p, u.skills)).toBe(0b10);
    const reloaded = migrate(JSON.parse(JSON.stringify(st.save)));
    const q = reloaded.collection[0];
    expect(keptMask(q, u.skills)).toBe(0b10);
    // a move learned / reordered in front: still the same skill kept
    const shifted = [{ def: { id: 'tackle-new' } }, ...u.skills];
    expect(keptMask(q, shifted)).toBe(0b100);
    setKept(q, u.skills[1].def.id, false);
    expect(q.keptSkills).toBeUndefined();
  });
});
