import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/core/world';
import { CoopHost, coopSession } from '../src/net/coop';
import { applyCoopLoot, lootSeen, LootLedger, markLootSeen } from '../src/net/coopRewards';
import { net } from '../src/net/session';
import { trimQueue } from '../src/net/transport';
import type { NetMsg } from '../src/net/protocol';
import { defaultSave } from '../src/systems/saveSchema';

afterEach(() => { vi.restoreAllMocks(); coopSession.active = false; net.role = null; net.status = 'idle'; });

describe('relay send queue during a drop', () => {
  it('drops superseded snapshots / pings first, so a loot grant queued early survives', () => {
    const q: NetMsg[] = [{ t: 'coopLoot', reward: { currency: 500 }, id: 'e:1' }];
    for (let i = 0; i < 450; i++) q.push({ t: 'coopSnap', s: { n: i } as never });
    q.push({ t: 'coopEnd', reason: 'x' });
    trimQueue(q, 400);
    expect(q).toHaveLength(400);
    expect(q[0].t).toBe('coopLoot');
    expect(q[q.length - 1].t).toBe('coopEnd');
    // the newest snapshots are the ones kept
    const snaps = q.filter((m) => m.t === 'coopSnap') as { s: { n: number } }[];
    expect(snaps[snaps.length - 1].s.n).toBe(449);
  });
  it('a queue of one-off messages still keeps its newest', () => {
    const q: NetMsg[] = [];
    for (let i = 0; i < 5; i++) q.push({ t: 'coopEnd', reason: String(i) });
    trimQueue(q, 3);
    expect(q.map((m) => (m as { reason: string }).reason)).toEqual(['2', '3', '4']);
  });
});

describe('co-op loot delivery is acknowledged and applied once', () => {
  it('ledger re-sends only to guests that acknowledge, until acked, and gives up eventually', () => {
    const l = new LootLedger(3000, 20_000);
    l.track('a', { currency: 1 }, 0);
    expect(l.due(5000)).toEqual([]); // an older guest build never acks: no re-sends (no duplicates for it)
    l.track('b', { currency: 2 }, 0);
    l.ack('a');
    expect(l.due(3000).map((x) => x.id)).toEqual(['b']);
    expect(l.due(4000)).toEqual([]); // not again before resendMs
    expect(l.due(6000).map((x) => x.id)).toEqual(['b']);
    expect(l.due(21_000)).toEqual([]); // gave up
    expect(l.size).toBe(0);
  });

  it('guest dedupes a re-sent grant by id, even after a reload of the save', () => {
    const save = defaultSave();
    const loot = { currency: 300, items: { potion: 2 } };
    expect(lootSeen(save, 'e:1')).toBe(false);
    applyCoopLoot(save, loot); markLootSeen(save, 'e:1');
    const reloaded = JSON.parse(JSON.stringify(save));
    expect(lootSeen(reloaded, 'e:1')).toBe(true);
    expect(reloaded.currency).toBe(300);
    for (let i = 2; i < 260; i++) markLootSeen(save, `e:${i}`);
    expect(save.coopLootIds!.length).toBeLessThanOrEqual(200);
  });

  it('host: lost grant is re-sent after the guest proves it acks; acked grants stop', () => {
    const w = new World({ mode: 'adventure', seed: 1, obstacles: false, width: 1600, height: 1200 });
    w.addCompanion();
    w.addPokemon('pikachu', { companion: true, level: 30 });
    coopSession.active = true; net.role = 'host'; net.status = 'connected';
    const sent: NetMsg[] = [];
    vi.spyOn(net, 'send').mockImplementation((m: NetMsg) => { sent.push(m); });
    let handler: ((m: NetMsg) => void) | null = null;
    vi.spyOn(net, 'on').mockImplementation((fn: (m: NetMsg) => void) => { handler = fn; return () => {}; });
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const host = new CoopHost(w, () => ({ kind: 'region', id: 'starter-valley', width: 1600, height: 1200 }));
    host.grant({ currency: 100, note: 'A' });
    host.grant({ currency: 200, note: 'B' });
    const [a, b] = sent.filter((m) => m.t === 'coopLoot') as Extract<NetMsg, { t: 'coopLoot' }>[];
    expect(a.id).not.toBe(b.id);
    handler!({ t: 'coopLootAck', id: a.id! }); // A arrived, B was lost in the drop
    sent.length = 0;
    clock += 3500;
    host.update(clock, false, []);
    const resent = sent.filter((m) => m.t === 'coopLoot') as Extract<NetMsg, { t: 'coopLoot' }>[];
    expect(resent.map((m) => m.id)).toEqual([b.id]);
    handler!({ t: 'coopLootAck', id: b.id! });
    sent.length = 0;
    clock += 3500;
    host.update(clock, false, []);
    expect(sent.filter((m) => m.t === 'coopLoot')).toEqual([]);
    host.destroy();
  });
});
