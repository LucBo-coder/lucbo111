import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { GameServer } from '../server/gameServer';
import type { ClientMsg, ServerMsg } from '../src/net/serverProtocol';
import { TILE_PX } from '../src/core/map/tiles';

let server: GameServer | undefined;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await server?.close(); server = undefined;
});

async function client() {
  if (!server) server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', verbose: false, switchCooldownMs: 0, summonMs: 0 });
  const port = await server.ready;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
  const inbox: ServerMsg[] = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())));
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return {
    send: (msg: ClientMsg) => ws.send(JSON.stringify(msg)),
    next: async <T extends ServerMsg['t']>(t: T): Promise<Extract<ServerMsg, { t: T }>> => {
      let i = -1;
      await expect.poll(() => { i = inbox.findIndex((m) => m.t === t); return i; }, { timeout: 3000, interval: 15 }).toBeGreaterThanOrEqual(0);
      return inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>;
    },
  };
}

describe('authoritative server', () => {
  it('runs separate regional event schedules and Alpha spawns', async () => {
    server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', verbose: false, enabledRegions: ['ca-mau', 'an-giang'], eventIntervalMs: 0 });
    await server.ready;
    (server as unknown as { tickWorld(): void }).tickWorld();
    expect(server.db.all('SELECT id FROM world_events WHERE status = ?', 'active')).toHaveLength(2);
    expect(server.db.all('SELECT id FROM alpha_spawns WHERE status = ?', 'active')).toHaveLength(2);
  });

  it('counts accepted event hits, records contributions and synchronizes rewards once', async () => {
    const a = await client();
    a.send({ t: 'register', username: 'event_a', password: 'secret123' });
    const w = await a.next('welcome');
    const pos = w.save.adventure!.pos, now = Date.now();
    server!.db.run("UPDATE alpha_spawns SET x = ?, y = ? WHERE status = 'active'", pos.x, pos.y);
    server!.db.run("INSERT INTO world_events (id,type,name,region,starts_at,ends_at,goal,progress,status) VALUES ('test-event','storm-surge','Bão','ca-mau',?,?,1,0,'active')", now, now + 60000);
    a.send({ t: 'alpha.attack', actionId: 'event_hit_01' });
    const synced = await a.next('saveSync');
    expect(synced.save.currency).toBeGreaterThan(w.save.currency);
    expect(server!.db.one<{ status: string; progress: number }>("SELECT status,progress FROM world_events WHERE id='test-event'")).toMatchObject({ status: 'completed', progress: 1 });
    expect(server!.db.one<{ rewarded: number }>("SELECT rewarded FROM event_participants WHERE event_id='test-event'")!.rewarded).toBe(1);
    (server as unknown as { finishEvent(id: string, status: string): void }).finishEvent('test-event', 'completed');
    expect(server!.db.all("SELECT id FROM audit_log WHERE action='event.reward'")).toHaveLength(1);
  });
  it('corrects rejected teleports and restores the current position on another login', async () => {
    const a = await client();
    a.send({ t: 'register', username: 'trainer_a', password: 'secret123' });
    const w = await a.next('welcome');
    expect(w.save.adventure!.pos).toEqual({ x: 72 * TILE_PX, y: 94 * TILE_PX });
    const pos = w.save.adventure!.pos;
    a.send({ t: 'move', x: pos.x + 2000, y: pos.y });
    expect(await a.next('position')).toMatchObject(pos);
    // Persisted position is independent of save_json; reconnect must use the players row.
    server!.db.run('UPDATE players SET x = ?, y = ? WHERE account_id = ?', pos.x + 10, pos.y + 12, w.account.id);
    const b = await client();
    b.send({ t: 'login', username: 'trainer_a', password: 'secret123' });
    expect((await b.next('welcome')).save.adventure!.pos).toEqual({ x: pos.x + 10, y: pos.y + 12 });
    await new Promise((r) => setTimeout(r, 50));
    expect(server!.db.one<{ x: number }>('SELECT x FROM players WHERE account_id = ?', w.account.id)!.x).toBe(pos.x + 10);
  });

  it('replaying an older action cannot revert a newer candy level or active Pokémon', async () => {
    const a = await client();
    a.send({ t: 'register', username: 'trainer_b', password: 'secret123' });
    const w = await a.next('welcome');
    const uid = w.save.adventure!.activeUid!;
    const recall: ClientMsg = { t: 'action', actionId: 'recall_001', type: 'party.recall' };
    a.send(recall); await a.next('actionResult');
    a.send({ t: 'action', actionId: 'candy_001', type: 'candy.use', data: { uid, candy: 'rare-candy', qty: 1 } });
    await a.next('actionResult');
    a.send({ t: 'action', actionId: 'summon_001', type: 'party.setActive', data: { uid } });
    await a.next('actionResult');
    a.send(recall);
    const replay = await a.next('actionResult');
    expect(replay.save.adventure!.activeUid).toBe(uid);
    expect(replay.save.collection.find((p) => p.uid === uid)!.level).toBe(6);
    expect(replay.save.inventory['rare-candy']).toBe(2);
  });

  it('shares Alpha damage and gives each contributor a persistent reward once', async () => {
    const a = await client(), b = await client();
    a.send({ t: 'register', username: 'alpha_a', password: 'secret123' });
    b.send({ t: 'register', username: 'alpha_b', password: 'secret123' });
    const wa = await a.next('welcome'), wb = await b.next('welcome');
    const pos = wa.save.adventure!.pos;
    server!.db.run("UPDATE alpha_spawns SET x = ?, y = ?, hp = 1000 WHERE status = 'active'", pos.x, pos.y);
    a.send({ t: 'alpha.attack', actionId: 'alpha_a_01' });
    const hitA = await a.next('alphaHit'), hitB = await b.next('alphaHit');
    expect(hitA.alpha.hp).toBe(hitB.alpha.hp);
    expect(hitA.alpha.hp).toBeLessThan(1000);
    server!.db.run("UPDATE alpha_spawns SET hp = 1 WHERE status = 'active'");
    b.send({ t: 'alpha.attack', actionId: 'alpha_b_01' });
    const defeated = await b.next('alphaDefeated');
    expect(defeated.rewards.map((r) => r.accountId).sort()).toEqual([wa.account.id, wb.account.id].sort());
    const current = () => server!.db.all<{ save_json: string }>('SELECT save_json FROM players ORDER BY account_id').map((r) => JSON.parse(r.save_json).currency);
    const balances = current();
    expect(balances.every((money) => money > 1500)).toBe(true);
    b.send({ t: 'alpha.attack', actionId: 'alpha_b_01' });
    await b.next('actionError');
    expect(current()).toEqual(balances);
  });
});
