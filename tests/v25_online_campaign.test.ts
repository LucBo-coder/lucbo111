import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { GameServer } from '../server/gameServer';
import { checkClientSave, freshOnlineSave, inflateSave, SaveRejected } from '../server/advSave';
import { readSave } from '../server/playerSave';
import type { ClientMsg, ServerMsg } from '../src/net/serverProtocol';
import { deflateToBase64, saveFrames } from '../src/net/worldSession';
import { AdventureState } from '../src/adventure/AdventureState';
import { MAX_FRAME } from '../server/world';
import type { SaveData } from '../src/systems/saveSchema';

// Thế giới online = the Vietnam Odyssey campaign with the account's save on the server: compressed uploads in
// parts, checked before storing; players report which map they are on and see the others there.

let server: GameServer | undefined;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await server?.close(); server = undefined;
});

async function client(username: string, register = true) {
  server ??= new GameServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', verbose: false, presenceIntervalMs: 30 });
  const port = await server.ready;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
  const inbox: ServerMsg[] = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())));
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const c = {
    inbox,
    send: (msg: ClientMsg) => ws.send(JSON.stringify(msg)),
    next: async <T extends ServerMsg['t']>(t: T, where: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true): Promise<Extract<ServerMsg, { t: T }>> => {
      let i = -1;
      await expect.poll(() => { i = inbox.findIndex((m) => m.t === t && where(m as Extract<ServerMsg, { t: T }>)); return i; }, { timeout: 4000, interval: 10 }).toBeGreaterThanOrEqual(0);
      return inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>;
    },
    welcome: undefined as unknown as Extract<ServerMsg, { t: 'welcome' }>,
  };
  c.send(register ? { t: 'register', username, password: 'secret123', starter: 'pick' } : { t: 'login', username, password: 'secret123' });
  c.welcome = await c.next('welcome');
  return c;
}

const db = () => server!.db;

async function upload(c: Awaited<ReturnType<typeof client>>, save: SaveData, seq: number) {
  for (const f of saveFrames(await deflateToBase64(JSON.stringify(save)), seq)) c.send(f);
  return c.next('saved', (m) => m.seq === seq);
}

/** A campaign some way in: starter picked, more Pokémon, money, a later province. */
function progressed(base: SaveData, extra = 0): SaveData {
  const st = new AdventureState(structuredClone(base), 'adventure');
  st.adv.started = true;
  st.addPokemon('fuecoco', 12, 'starter');
  for (let i = 0; i < extra; i++) st.addPokemon(i % 2 ? 'pikachu' : 'eevee', 5 + (i % 40), 'wild');
  st.save.vnCoins = 4321;
  st.adv.region = 'can-tho';
  st.adv.pos = { x: 1000, y: 1200 };
  st.adv.flags.push('badge:ca-mau');
  return st.save;
}

describe('online campaign save', () => {
  it('a new account starts the Vietnam Odyssey before the starter (picked in game)', async () => {
    const a = await client('camp_new');
    const s = a.welcome.save;
    expect(s.adventure?.campaign).toBe('vietnam');
    expect(s.adventure?.started).toBe(false);
    expect(s.collection).toEqual([]);
    expect(freshOnlineSave().adventure?.campaign).toBe('vietnam');
  });

  it('a large save goes up in parts under the frame limit, is stored and comes back on the next sign-in', async () => {
    const a = await client('camp_big');
    const save = progressed(a.welcome.save, 400);
    const b64 = await deflateToBase64(JSON.stringify(save));
    const frames = saveFrames(b64, 1);
    expect(frames.every((f) => JSON.stringify(f).length <= MAX_FRAME)).toBe(true);
    const r = await upload(a, save, 1);
    expect(r.ok).toBe(true);
    const stored = readSave(db(), a.welcome.account.id);
    expect(stored.collection.length).toBe(401);
    expect(stored.vnCoins).toBe(4321);
    expect(stored.adventure?.flags).toContain('badge:ca-mau');
    a.send({ t: 'logout' });
    const again = await client('camp_big', false);
    expect(again.welcome.save.collection.length).toBe(401);
    expect(again.welcome.save.adventure?.region).toBe('can-tho');
  });

  it('an older upload arriving late never replaces a newer one', async () => {
    const a = await client('camp_order');
    const newer = progressed(a.welcome.save);
    newer.vnCoins = 999;
    expect((await upload(a, newer, 20)).ok).toBe(true);
    const older = progressed(a.welcome.save);
    older.vnCoins = 1;
    for (const f of saveFrames(await deflateToBase64(JSON.stringify(older)), 10)) a.send(f);
    await new Promise((r) => setTimeout(r, 250));
    expect(readSave(db(), a.welcome.account.id).vnCoins).toBe(999);
  });

  it('invalid saves are rejected and the stored one stays', async () => {
    const a = await client('camp_bad');
    const good = progressed(a.welcome.save);
    expect((await upload(a, good, 1)).ok).toBe(true);
    const bad1 = structuredClone(good); bad1.collection[0].level = 500;
    const bad2 = structuredClone(good); bad2.collection[0].species = 'mewthree';
    const bad3 = structuredClone(good); bad3.vnCoins = -5;
    const bad4 = structuredClone(good); bad4.adventure!.campaign = 'classic';
    let seq = 2;
    for (const bad of [bad1, bad2, bad3, bad4]) {
      const r = await upload(a, bad, seq++);
      expect(r.ok).toBe(false);
      expect(r.code).toMatch(/^SAVE_/);
    }
    // broken compression / garbage
    a.send({ t: 'adv.save', seq: 50, part: 0, parts: 1, data: 'bm90IGRlZmxhdGU=' });
    expect((await a.next('saved', (m) => m.seq === 50)).ok).toBe(false);
    expect(readSave(db(), a.welcome.account.id).collection[0].level).toBe(12);
    // the checks themselves
    expect(() => checkClientSave('{')).toThrow(SaveRejected);
    await expect(inflateSave('x'.repeat(500_000))).rejects.toThrow(SaveRejected);
  });

  it('players on the same campaign map see each other (any province / dungeon), not those elsewhere', async () => {
    const a = await client('camp_a'), b = await client('camp_b'), c = await client('camp_c');
    a.send({ t: 'adv.where', region: 'vinh-long', x: 500, y: 600 });
    b.send({ t: 'adv.where', region: 'vinh-long', x: 700, y: 600 });
    c.send({ t: 'adv.where', region: 'hang-ancient-cave', x: 100, y: 100 });
    const seen = await a.next('presence', (m) => m.region === 'vinh-long' && m.players.some((p) => p.username === 'camp_b'));
    expect(seen.players.some((p) => p.username === 'camp_c')).toBe(false);
    // free movement in the campaign (boats, waypoints): no speed correction
    a.send({ t: 'move', x: 1500, y: 1300, facing: 1, moving: true }); // 1000 px in one step: a boat / waypoint
    await b.next('presence', (m) => m.players.some((p) => p.username === 'camp_a' && p.x === 1500));
    expect(a.inbox.some((m) => m.t === 'position')).toBe(false);
    // local chat follows the map
    a.send({ t: 'chat', actionId: 'chat_camp_1', channel: 'region:vinh-long', body: 'xin chào Vĩnh Long' });
    expect((await b.next('chat')).message.body).toBe('xin chào Vĩnh Long');
    // a bad place name is refused
    a.send({ t: 'adv.where', region: '../etc', x: 1, y: 1 });
    expect((await a.next('error')).code).toBe('BAD_PLACE');
  });
});
