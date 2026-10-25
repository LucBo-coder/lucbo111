import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { GameServer, GameServerConfig } from '../server/gameServer';
import { pickEvent, regionPool, REGION_EVENT_POOLS } from '../server/eventCatalog';
import type { ClientMsg, ServerMsg } from '../src/net/serverProtocol';
import { expForLevel } from '../src/core/progression';
import { TILE_PX } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';
import { regionDef } from '../src/core/map/regionDefs';
import { login, recover, resume } from '../server/auth';

let server: GameServer | undefined;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await server?.close(); server = undefined;
});

function boot(cfg: Partial<GameServerConfig> = {}): GameServer {
  server = new GameServer({ port: 0, host: '127.0.0.1', dbPath: ':memory:', verbose: false, ...cfg });
  return server;
}

async function client(username: string) {
  if (!server) boot();
  const port = await server!.ready;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
  const inbox: ServerMsg[] = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())));
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const c = {
    inbox,
    send: (msg: ClientMsg) => ws.send(JSON.stringify(msg)),
    next: async <T extends ServerMsg['t']>(t: T, where: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true): Promise<Extract<ServerMsg, { t: T }>> => {
      let i = -1;
      await expect.poll(() => { i = inbox.findIndex((m) => m.t === t && where(m as Extract<ServerMsg, { t: T }>)); return i; }, { timeout: 3000, interval: 10 }).toBeGreaterThanOrEqual(0);
      return inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>;
    },
    none: async (t: ServerMsg['t'], ms = 200) => { await new Promise((r) => setTimeout(r, ms)); return !inbox.some((m) => m.t === t); },
    welcome: undefined as unknown as Extract<ServerMsg, { t: 'welcome' }>,
  };
  c.send({ t: 'register', username, password: 'secret123' });
  c.welcome = await c.next('welcome');
  return c;
}

const internal = () => server as unknown as {
  byAccount: Map<string, { x: number; y: number; channel: number }>;
  tickWorld(): void;
  lastEventStart: Map<string, number>;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Puts a connected player next to a tile position (server-side, as if they had walked there). */
function placeAt(accountId: string, tx: number, ty: number): void {
  const c = internal().byAccount.get(accountId)!;
  c.x = tx * TILE_PX; c.y = ty * TILE_PX + 40;
}
function toPc(accountId: string, region = 'ca-mau'): void {
  const t = new ValleyMap(regionDef(region)).pcTerminalTiles()[0];
  placeAt(accountId, t.x, t.y);
}

async function rawSocket() {
  const port = await server!.ready;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
  const inbox: ServerMsg[] = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())));
  await new Promise((r) => ws.once('open', r));
  return { send: (m: ClientMsg) => ws.send(JSON.stringify(m)), inbox };
}

describe('V7 single active Pokémon (server-enforced)', () => {
  it('summon/recall/switch obey the cooldown, broadcast effects and block attacks while summoning', async () => {
    boot({ switchCooldownMs: 300, summonMs: 120 });
    const a = await client('sw_a'), b = await client('sw_b');
    const uid = a.welcome.save.adventure!.activeUid!;
    // withdraw the gift Pidgey so a real switch is possible (not a field change → no cooldown)
    const gift = a.welcome.save.collection.find((p) => p.species === 'pidgey')!.uid;
    toPc(a.welcome.account.id);
    a.send({ t: 'action', actionId: 'sw_withdraw', type: 'party.withdraw', data: { uid: gift } });
    await a.next('actionResult');

    a.send({ t: 'action', actionId: 'sw_switch_1', type: 'party.switch', data: { uid: gift } });
    const sw = await a.next('actionResult');
    expect(sw.save.adventure!.activeUid).toBe(gift);
    expect(sw.save.adventure!.recalled).toContain(uid);
    // the observer sees the recall of the old partner, then the summon of the new one
    expect((await b.next('petFx', (m) => m.kind === 'recall')).species).toBe('charmander');
    expect((await b.next('petFx', (m) => m.kind === 'summon')).species).toBe('pidgey');

    a.send({ t: 'action', actionId: 'sw_switch_2', type: 'party.switch', data: { uid } });
    expect((await a.next('actionError')).code).toBe('SWITCH_COOLDOWN');
    // a replay of an earlier actionId is not a new switch: it returns the cached result, no cooldown error
    a.send({ t: 'action', actionId: 'sw_switch_1', type: 'party.switch', data: { uid: gift } });
    expect((await a.next('actionResult')).save.adventure!.activeUid).toBe(gift);

    const me = internal().byAccount.get(a.welcome.account.id)!;
    server!.db.run("UPDATE alpha_spawns SET x = ?, y = ? WHERE status = 'active'", me.x, me.y);
    await wait(320);
    a.send({ t: 'action', actionId: 'sw_switch_3', type: 'party.switch', data: { uid } });
    expect((await a.next('actionResult')).save.adventure!.activeUid).toBe(uid);
    // still materialising → cannot attack yet
    a.send({ t: 'alpha.attack', actionId: 'sw_attack_1' });
    expect((await a.next('actionError')).code).toBe('SUMMONING');
    const pres = await b.next('presence', (m) => m.players.some((p) => p.accountId === a.welcome.account.id && p.petState === 'summoning' && p.species === 'charmander'));
    expect(pres.players[0].species).toBe('charmander');
    await wait(260);
    const row = server!.db.one<{ active_uid: string }>('SELECT active_uid FROM players WHERE account_id = ?', a.welcome.account.id)!;
    expect(row.active_uid).toBe(uid);
  });
});

describe('V7 Alpha EXP + party bonus', () => {
  it('gives EXP to the Pokémon that fought, a capped bonus only for party mates who hit, once', async () => {
    boot({ switchCooldownMs: 0, summonMs: 0 });
    const a = await client('xp_a'), b = await client('xp_b'), c = await client('xp_c');
    a.send({ t: 'party', actionId: 'xp_party_1', op: 'create' }); await a.next('actionResult');
    a.send({ t: 'party', actionId: 'xp_party_2', op: 'invite', target: 'xp_b' }); await a.next('actionResult');
    expect((await b.next('party', (m) => !!m.invite)).invite!.fromName).toBe('xp_a');
    b.send({ t: 'party', actionId: 'xp_party_3', op: 'accept' }); await b.next('actionResult');
    const pos = a.welcome.save.adventure!.pos;
    server!.db.run("UPDATE alpha_spawns SET x = ?, y = ?, hp = 100000, max_hp = 100000 WHERE status = 'active'", pos.x, pos.y);
    // wait for *each* player's own hit (alphaHit is broadcast, so match on the participant list)
    for (const [who, id] of [[a, 'xp_hit_a'], [b, 'xp_hit_b'], [c, 'xp_hit_c']] as const) {
      who.send({ t: 'alpha.attack', actionId: id });
      await who.next('alphaHit', (m) => m.alpha.participants.some((p) => p.accountId === who.welcome.account.id));
    }
    server!.db.run("UPDATE alpha_spawns SET hp = 1 WHERE status = 'active'");
    await wait(950); // per-player attack cooldown (900 ms)
    a.send({ t: 'alpha.attack', actionId: 'xp_kill' });
    await expect.poll(() => a.inbox.some((m) => m.t === 'alphaDefeated' && !!m.save)).toBe(true);
    const done = a.inbox.find((m) => m.t === 'alphaDefeated' && !!m.save) as Extract<ServerMsg, { t: 'alphaDefeated' }>;
    const by = new Map(done.rewards.map((r) => [r.accountId, r]));
    const ra = by.get(a.welcome.account.id)!, rb = by.get(b.welcome.account.id)!, rc = by.get(c.welcome.account.id)!;
    expect(ra.exp).toBeGreaterThan(0);
    expect(ra.partyBonus).toBeCloseTo(0.1);
    expect(rb.partyBonus).toBeCloseTo(0.1);
    expect(rc.partyBonus).toBe(0);
    expect(ra.exp).toBeGreaterThan(rc.exp!);
    const starter = done.save!.collection.find((p) => p.uid === a.welcome.save.adventure!.activeUid)!;
    expect(starter.exp).toBe(a.welcome.save.collection.find((p) => p.uid === starter.uid)!.exp + ra.exp!);
    expect(starter.exp).toBeLessThanOrEqual(expForLevel(starter.species, 100));
    expect(server!.db.all("SELECT id FROM audit_log WHERE action = 'alpha.reward'")).toHaveLength(3);
  });
});

describe('V7 world event scheduler', () => {
  it('announces WORLD EVENT INCOMING before the cycle starts, then runs exactly one event', async () => {
    boot({ eventIntervalMs: 400, eventAnnounceMs: 250 });
    const a = await client('ev_a');
    internal().lastEventStart.set('ca-mau', Date.now());
    internal().tickWorld();
    expect(server!.db.all("SELECT id FROM world_events WHERE status = 'active'")).toHaveLength(0);
    await wait(180);
    internal().tickWorld();
    const inc = await a.next('eventIncoming', (m) => !!m.incoming);
    expect(regionPool('ca-mau').map((d) => d.type)).toContain(inc.incoming!.type);
    expect(inc.incoming!.startsAt).toBeGreaterThan(Date.now());
    expect(inc.incoming!.difficulty).toBeTruthy();
    expect(server!.db.all("SELECT id FROM world_events WHERE status = 'active'")).toHaveLength(0);
    await wait(260);
    internal().tickWorld(); internal().tickWorld();
    const ev = await a.next('event', (m) => m.event?.status === 'active');
    expect(ev.event!.type).toBe(inc.incoming!.type);
    expect(ev.event!.myContribution).toBe(0);
    expect((await a.next('eventIncoming', (m) => m.incoming === null)).incoming).toBeNull();
    expect(server!.db.all("SELECT id FROM world_events WHERE status = 'active'")).toHaveLength(1);
  });

  it('two players join the same event; it ends once and rewards each participant exactly once', async () => {
    boot();
    const a = await client('ev2_a'), b = await client('ev2_b');
    const pos = a.welcome.save.adventure!.pos, now = Date.now();
    server!.db.run("UPDATE alpha_spawns SET x = ?, y = ?, hp = 100000, max_hp = 100000 WHERE status = 'active'", pos.x, pos.y);
    server!.db.run("INSERT INTO world_events (id,type,name,region,starts_at,ends_at,goal,progress,status) VALUES ('ev2','storm-surge','Bão','ca-mau',?,?,2,0,'active')", now, now + 60000);
    a.send({ t: 'alpha.attack', actionId: 'ev2_hit_a' });
    await a.next('event', (m) => m.event?.progress === 1);
    b.send({ t: 'alpha.attack', actionId: 'ev2_hit_b' });
    const done = await b.next('event', (m) => m.event?.status === 'completed');
    expect(done.event!.participants).toBe(2);
    expect(done.event!.myContribution).toBeGreaterThan(0);
    const syncA = await a.next('saveSync'), syncB = await b.next('saveSync');
    expect(syncA.save.currency).toBeGreaterThan(a.welcome.save.currency);
    expect(syncB.save.currency).toBeGreaterThan(b.welcome.save.currency);
    // late hits / a second finish never pay again
    (server as unknown as { finishEvent(id: string, s: string): void }).finishEvent('ev2', 'expired');
    await wait(950);
    a.send({ t: 'alpha.attack', actionId: 'ev2_hit_a2' });
    await a.next('alphaHit', (m) => m.contribution > 0);
    expect(server!.db.all("SELECT id FROM audit_log WHERE action = 'event.reward'")).toHaveLength(2);
    expect(server!.db.one<{ status: string }>("SELECT status FROM world_events WHERE id = 'ev2'")!.status).toBe('completed');
  });

  it('regional pools are distinct, weighted, never repeat back-to-back and gate legendary omens', () => {
    const types = Object.values(REGION_EVENT_POOLS).map((p) => new Set(p.map((d) => d.type)));
    for (let i = 0; i < types.length; i++) for (let j = i + 1; j < types.length; j++) {
      expect([...types[i]].some((t) => types[j].has(t))).toBe(false);
    }
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const counts = new Map<string, number>();
    let last: string | undefined;
    for (let i = 0; i < 2000; i++) {
      const d = pickEvent('an-giang', { lastType: last, maxPlayerLevel: 5, rand });
      expect(d.type).not.toBe(last);
      expect(d.legendary).toBe(false);
      expect(regionPool('an-giang')).toContain(d);
      counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
      last = d.type;
    }
    expect(counts.get('flood-season')!).toBeGreaterThan(counts.get('stork-alpha')!);
    const legend = Array.from({ length: 400 }, () => pickEvent('ca-mau', { maxPlayerLevel: 30, rand })).filter((d) => d.legendary);
    expect(legend.length).toBeGreaterThan(0);
  });
});

describe('V7 social: whisper, emotes, party management, channels', () => {
  it('private messages only reach accepted friends', async () => {
    boot();
    const a = await client('dm_a'), b = await client('dm_b');
    a.send({ t: 'whisper', actionId: 'dm_1', target: 'dm_b', body: 'hi' });
    expect((await a.next('actionError')).code).toBe('NOT_FRIENDS');
    a.send({ t: 'friend', actionId: 'dm_f1', op: 'request', target: 'dm_b' }); await a.next('actionResult');
    b.send({ t: 'friend', actionId: 'dm_f2', op: 'accept', target: 'dm_a' }); await b.next('actionResult');
    await wait(2_050); // chat rate limit
    a.send({ t: 'whisper', actionId: 'dm_2', target: 'dm_b', body: '<b>gặp ở PC nhé</b>' });
    const got = await b.next('whisper');
    expect(got.body).toBe('gặp ở PC nhé');
    expect(got.fromName).toBe('dm_a');
    expect((await a.next('whisper')).toName).toBe('dm_b');
  });

  it('emotes and presence only reach nearby players on the same channel', async () => {
    boot({ relevanceRadius: 500 });
    const a = await client('em_a'), near = await client('em_b'), far = await client('em_c');
    await far.next('presence', (m) => m.players.some((x) => x.accountId === a.welcome.account.id));
    internal().byAccount.get(far.welcome.account.id)!.x += 3000;
    a.send({ t: 'emote', kind: 'wave' });
    expect((await near.next('emote')).kind).toBe('wave');
    expect(await far.none('emote')).toBe(true);
    a.send({ t: 'emote', kind: 'cheer' }); // inside the 1.5 s emote cooldown → dropped
    expect(await near.none('emote')).toBe(true);
    // delta presence: the far player is told once that A left the view, and is not resent A afterwards
    await far.next('presence', (m) => !!m.gone?.includes(a.welcome.account.id));
    far.inbox.length = 0;
    await wait(250);
    expect(far.inbox.some((m) => m.t === 'presence' && m.players.some((x) => x.accountId === a.welcome.account.id))).toBe(false);
    a.send({ t: 'emote', kind: 'dance' as never });
  });

  it('full channel opens a second one: players and local chat are separated, Alpha is shared', async () => {
    boot({ maxPerChannel: 1 });
    const a = await client('ch_a'), b = await client('ch_b');
    expect(internal().byAccount.get(a.welcome.account.id)!.channel).toBe(1);
    expect(internal().byAccount.get(b.welcome.account.id)!.channel).toBe(2);
    const pres = await b.next('presence');
    expect(pres.players).toHaveLength(0);
    a.send({ t: 'chat', actionId: 'ch_chat', channel: 'region:ca-mau', body: 'kênh 1' });
    await a.next('chat');
    expect(await b.none('chat')).toBe(true);
    const pos = a.welcome.save.adventure!.pos;
    server!.db.run("UPDATE alpha_spawns SET x = ?, y = ? WHERE status = 'active'", pos.x, pos.y);
    a.send({ t: 'alpha.attack', actionId: 'ch_hit' });
    expect((await b.next('alphaHit')).damage).toBeGreaterThan(0);
  });

  it('party: decline, promote, leader leaving hands over, disband', async () => {
    boot();
    const a = await client('pt_a'), b = await client('pt_b'), c = await client('pt_c');
    a.send({ t: 'party', actionId: 'pt_1', op: 'create' }); await a.next('actionResult');
    a.send({ t: 'party', actionId: 'pt_2', op: 'invite', target: 'pt_c' }); await a.next('actionResult');
    a.send({ t: 'party', actionId: 'pt_2b', op: 'invite', target: 'pt_c' });
    expect((await a.next('actionError')).code).toBe('INVITE_SPAM');
    c.send({ t: 'party', actionId: 'pt_3', op: 'decline' }); await c.next('actionResult');
    c.send({ t: 'party', actionId: 'pt_3b', op: 'accept' });
    expect((await c.next('actionError')).code).toBe('NO_INVITE');
    a.send({ t: 'party', actionId: 'pt_4', op: 'invite', target: 'pt_b' }); await a.next('actionResult');
    b.send({ t: 'party', actionId: 'pt_5', op: 'accept' }); await b.next('actionResult');
    a.send({ t: 'party', actionId: 'pt_6', op: 'promote', target: 'pt_b' }); await a.next('actionResult');
    const leader = () => server!.db.one<{ leader_id: string }>('SELECT leader_id FROM parties')?.leader_id;
    expect(leader()).toBe(b.welcome.account.id);
    b.send({ t: 'party', actionId: 'pt_7', op: 'leave' }); await b.next('actionResult');
    expect(leader()).toBe(a.welcome.account.id);
    const view = await a.next('party', (m) => m.party?.leaderId === a.welcome.account.id && m.party.members.length === 1);
    expect(view.party!.members[0].username).toBe('pt_a');
    a.send({ t: 'party', actionId: 'pt_8', op: 'disband' }); await a.next('actionResult');
    expect(server!.db.all('SELECT id FROM parties')).toHaveLength(0);
  });
});

describe('V7 candy → evolution on the server', () => {
  it('level-up evolution is offered after candy, validated and applied once', async () => {
    boot();
    const a = await client('evo_a');
    const uid = a.welcome.save.adventure!.activeUid!;
    const row = server!.db.one<{ save_json: string }>('SELECT save_json FROM players WHERE account_id = ?', a.welcome.account.id)!;
    const save = JSON.parse(row.save_json);
    const p = save.collection.find((x: { uid: string }) => x.uid === uid);
    p.level = 15; p.exp = expForLevel('charmander', 15);
    server!.db.run('UPDATE players SET save_json = ? WHERE account_id = ?', JSON.stringify(save), a.welcome.account.id);
    a.send({ t: 'action', actionId: 'evo_early', type: 'pokemon.evolve', data: { uid, to: 'charmeleon' } });
    expect((await a.next('actionError')).code).toBe('CANNOT_EVOLVE');
    a.send({ t: 'action', actionId: 'evo_candy', type: 'candy.use', data: { uid, candy: 'rare-candy', qty: 1 } });
    const used = await a.next('actionResult');
    expect(used.result!.evolutions).toEqual(['charmeleon']);
    a.send({ t: 'action', actionId: 'evo_go', type: 'pokemon.evolve', data: { uid, to: 'charmeleon' } });
    const evo = await a.next('actionResult');
    expect(evo.save.collection.find((x) => x.uid === uid)!.species).toBe('charmeleon');
    a.send({ t: 'action', actionId: 'evo_again', type: 'pokemon.evolve', data: { uid, to: 'charizard' } });
    expect((await a.next('actionError')).code).toBe('CANNOT_EVOLVE');
  });
});

describe('V7 PC terminal, accounts and portals', () => {
  it('PC storage only works at a Pokémon Center / lab terminal', async () => {
    boot();
    const a = await client('pc_a');
    const gift = a.welcome.save.collection.find((p) => p.species === 'pidgey')!.uid;
    placeAt(a.welcome.account.id, 10, 10);
    a.send({ t: 'action', actionId: 'pc_far', type: 'party.withdraw', data: { uid: gift } });
    expect((await a.next('actionError')).code).toBe('NOT_AT_PC');
    toPc(a.welcome.account.id);
    a.send({ t: 'action', actionId: 'pc_near', type: 'party.withdraw', data: { uid: gift } });
    expect((await a.next('actionResult')).save.adventure!.party).toContain(gift);
    a.send({ t: 'action', actionId: 'pc_box', type: 'pc.boxName', data: { box: 0, name: 'Đầm lầy' } });
    expect((await a.next('actionResult')).save.adventure!.pc.boxes[0].name).toBe('Đầm lầy');
    // candy / summon are not PC actions and work anywhere
    placeAt(a.welcome.account.id, 10, 10);
    a.send({ t: 'action', actionId: 'pc_candy', type: 'candy.use', data: { uid: gift, candy: 'exp-candy-xs', qty: 1 } });
    expect((await a.next('actionResult')).result!.used).toBe(1);
  });

  it('recovery code resets the password once, revokes sessions and rotates the code', async () => {
    boot();
    const a = await client('rc_a');
    const code = a.welcome.recoveryCode!;
    expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(JSON.stringify(server!.db.all('SELECT * FROM accounts'))).not.toContain(code);
    const oldToken = a.welcome.token;
    const bad = await rawSocket();
    bad.send({ t: 'recover', username: 'rc_a', code: 'AAAA-BBBB-CCCC-DDDD', newPassword: 'newpass1' });
    await expect.poll(() => bad.inbox.some((m) => m.t === 'error')).toBe(true);
    expect((bad.inbox.find((m) => m.t === 'error') as { code: string }).code).toBe('BAD_RECOVERY');
    const good = await rawSocket();
    // case and separators do not matter when typing the code
    good.send({ t: 'recover', username: 'rc_a', code: code.toLowerCase().replace(/-/g, ' '), newPassword: 'newpass1' });
    await expect.poll(() => good.inbox.some((m) => m.t === 'welcome')).toBe(true);
    const w = good.inbox.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    expect(w.recoveryCode).toBeTruthy();
    expect(w.recoveryCode).not.toBe(code);
    expect(w.save.collection.length).toBe(a.welcome.save.collection.length);
    expect(server!.db.one<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?', a.welcome.account.id)!.n).toBe(1);
    expect(() => resume(server!.db, oldToken)).toThrow();
    expect(() => login(server!.db, 'rc_a', 'secret123')).toThrow();
    expect(login(server!.db, 'rc_a', 'newpass1').account.username).toBe('rc_a');
    expect(() => recover(server!.db, 'rc_a', code, 'another1')).toThrow();
  });

  it('changing the password needs the current one and signs out other devices', async () => {
    boot();
    const a = await client('cp_a');
    const other = login(server!.db, 'cp_a', 'secret123').token;
    a.send({ t: 'account', actionId: 'cp_bad', op: 'changePassword', password: 'wrong', newPassword: 'newpass1' });
    expect((await a.next('actionError')).code).toBe('BAD_CREDENTIALS');
    a.send({ t: 'account', actionId: 'cp_ok', op: 'changePassword', password: 'secret123', newPassword: 'newpass1' });
    await a.next('actionResult');
    expect(() => resume(server!.db, other)).toThrow();
    expect(resume(server!.db, a.welcome.token).account.username).toBe('cp_a');
    a.send({ t: 'account', actionId: 'cp_code', op: 'recoveryCode', password: 'newpass1' });
    expect((await a.next('recoveryCode')).code).not.toBe(a.welcome.recoveryCode);
  });

  it('regions change only through a portal, gated by story flag or the online level', async () => {
    boot({ enabledRegions: ['ca-mau', 'an-giang'] });
    const a = await client('tr_a'), b = await client('tr_b');
    a.send({ t: 'enter', region: 'an-giang' });
    expect((await a.next('error')).code).toBe('USE_PORTAL');
    a.send({ t: 'travel', portal: 'portal-cm-ag' });
    expect((await a.next('error')).code).toBe('TOO_FAR');
    placeAt(a.welcome.account.id, 62.5, 5);
    a.send({ t: 'travel', portal: 'portal-cm-ag' });
    expect((await a.next('error')).message).toContain('Lv12');
    // party trained to Lv12 (written into the live session save, as rewards/candy would) → the gate opens
    const live = internal().byAccount.get(a.welcome.account.id) as unknown as { save: { collection: { species: string; level: number; exp: number }[] } };
    for (const p of live.save.collection) { p.level = 12; p.exp = expForLevel(p.species, 12); }
    a.send({ t: 'travel', portal: 'portal-cm-ag' });
    const moved = await a.next('region');
    expect(moved.region).toBe('an-giang');
    expect(moved.x).toBe((86 + 0.5) * TILE_PX);
    expect(server!.db.one<{ region: string }>('SELECT region FROM players WHERE account_id = ?', a.welcome.account.id)!.region).toBe('an-giang');
    expect((await a.next('alpha', (m) => m.alpha?.region === 'an-giang')).alpha!.level).toBe(18);
    // the Cà Mau player no longer sees them
    await b.next('presence', (m) => !!m.gone?.includes(a.welcome.account.id));
    expect(server!.db.all("SELECT id FROM audit_log WHERE action = 'world.travel'")).toHaveLength(1);
  });
});
