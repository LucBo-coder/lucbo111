import { afterEach, describe, expect, it } from 'vitest';
import { World, STEP, type NetHit, type WorldEvent } from '../src/core/world';
import { applyTrade, emptyOffer, itemBlock, monBlock, sanitizeItems, sanitizeMon, tradeCopy, type TradeOffer } from '../src/core/trade';
import { TradeSession } from '../src/net/tradeSession';
import { PartySession, PARTY_MAX, type PartyMsg } from '../src/net/party';
import { freshSave, newAdventure, type SaveData } from '../src/systems/saveSchema';
import { makeOwned } from '../src/core/progression';

const world = () => new World({ mode: 'adventure', seed: 7, obstacles: false, width: 1600, height: 1200 });

describe('shared world: units of another player in my World', () => {
  it('a remote enemy is never stepped and a hit on it goes to netHit, HP unchanged', () => {
    const w = world();
    const hits: NetHit[] = [];
    w.netHit = (h) => hits.push(h);
    const mon = w.addPokemon('pikachu', { level: 40 });
    const e = w.spawnWild('snorlax', 20, w.trainer.x + 60, w.trainer.y, { hostile: true });
    e.net = { owner: 'm002', rid: 99 };
    const x = e.x, hp = e.hp;
    w.setCommand('attack', e);
    for (let i = 0; i < 400; i++) w.step(STEP);
    expect(e.x).toBe(x); // no AI, no separation: positions come from its owner
    expect(e.hp).toBe(hp);
    expect(e.alive).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.dst === e && (h.amount > 0 || h.status))).toBe(true);
    expect(mon.damageDealt).toBeGreaterThan(0);
  });

  it('records who landed the last hit, and the death event carries it', () => {
    const w = world();
    const e = w.spawnWild('rattata', 3, 500, 500, { hostile: true });
    const puppet = w.visualUnit({ team: 'ally', kind: 'pokemon', defId: 'pikachu', name: 'Pikachu', level: 30 });
    puppet.net = { owner: 'm003', rid: 5 };
    w.applyDamage(e, 1, puppet);
    expect(e.lastHitBy).toBe('m003');
    w.applyDamage(e, e.hp + 10, puppet);
    const death = w.drainEvents().find((ev): ev is Extract<WorldEvent, { t: 'death' }> => ev.t === 'death');
    expect(death?.by).toBe('m003');
    const e2 = w.spawnWild('rattata', 3, 500, 500, { hostile: true });
    w.applyDamage(e2, e2.hp + 10, w.trainer);
    expect(w.drainEvents().find((ev) => ev.t === 'death')).toMatchObject({ by: '' });
  });

  it('my enemies target other players (puppets) and their hits are forwarded, never applied here', () => {
    const w = world();
    const hits: NetHit[] = [];
    w.netHit = (h) => hits.push(h);
    w.trainer.x = 100; w.trainer.y = 100;
    const p = w.visualUnit({ team: 'ally', kind: 'trainer', defId: 'trainer', name: 'Bạn', level: 10, x: 800, y: 600 });
    p.net = { owner: 'm002', rid: 1 };
    w.puppets.push(p);
    const e = w.spawnWild('rattata', 10, 820, 600, { hostile: true });
    e.target = p;
    expect(w.friendlyUnits()).toContain(p);
    const hp = p.hp;
    for (let i = 0; i < 300; i++) w.step(STEP);
    expect(hits.some((h) => h.dst === p)).toBe(true);
    expect(p.hp).toBe(hp);
  });

  it('remote statuses do not tick damage here (their game ticks them)', () => {
    const w = world();
    let n = 0;
    w.netHit = () => n++;
    const e = w.spawnWild('rattata', 10, 400, 400, { hostile: false });
    e.net = { owner: 'm002', rid: 3 };
    e.statuses.push({ kind: 'burn', t: 5, magnitude: 0.1, source: null, tick: 0, age: 0 });
    for (let i = 0; i < 120; i++) w.step(STEP);
    expect(n).toBe(0);
  });

  it('a projectile without owner / slot (another player\'s shot) is drawn but hits nothing', () => {
    const w = world();
    const e = w.spawnWild('rattata', 10, 400, 400, { hostile: true });
    const hp = e.hp;
    const p = w.projectiles.find((q) => !q.active)!;
    Object.assign(p, { active: true, team: 'ally', owner: null, slot: null, skill: w.allies[0]?.skills[0]?.def ?? { id: 'x', vfx: 'spark', type: 'normal' }, x: 390, y: 400, vx: 100, vy: 0, r: 10, life: 0.5, pierce: 0 });
    p.hit.clear();
    for (let i = 0; i < 20; i++) w.step(STEP);
    expect(e.hp).toBe(hp);
  });
});

function save(): SaveData {
  const s = freshSave();
  s.adventure = newAdventure('classic');
  return s;
}
function give(s: SaveData, species: string, level: number, party = true) {
  const p = makeOwned(species, level, 'wild');
  s.collection.push(p);
  if (party) s.adventure!.party.push(p.uid);
  return p;
}
const kindOf = (id: string) => (id === 'pokeball' || id === 'greatball' ? 'ball' : id === 'potion' ? 'heal' : id === 'map' ? 'key' : undefined);

describe('trade rules (pure)', () => {
  it('keeps at least one Pokémon in the party and refuses locked ones', () => {
    const s = save();
    const a = give(s, 'pikachu', 10);
    expect(monBlock(s, a.uid)).toMatch(/ít nhất 1/);
    const b = give(s, 'eevee', 12);
    expect(monBlock(s, a.uid)).toBe('');
    b.favorite = true;
    expect(monBlock(s, b.uid)).toMatch(/khóa/);
  });
  it('items: key items, missing stock and bad quantities are refused', () => {
    const s = save();
    s.inventory.pokeball = 5; s.inventory.map = 1;
    expect(itemBlock(s, 'pokeball', 5, 'ball')).toBe('');
    expect(itemBlock(s, 'pokeball', 6, 'ball')).toMatch(/Không đủ/);
    expect(itemBlock(s, 'map', 1, 'key')).toMatch(/quan trọng/);
    expect(itemBlock(s, 'pokeball', 0, 'ball')).toMatch(/không hợp lệ/);
    expect(sanitizeItems({ pokeball: 3, map: 1, nope: 2, greatball: -1 }, kindOf)).toEqual({ pokeball: 3 });
  });
  it('sanitizes a received Pokémon (unknown species / level out of range refused)', () => {
    expect(sanitizeMon({ species: 'missingno', level: 5 })).toBeNull();
    expect(sanitizeMon({ species: 'pikachu', level: 101 })).toBeNull();
    const p = sanitizeMon({ species: 'pikachu', level: 30, ivs: { hp: 31, atk: 99, def: 0, spa: 0, spd: 0, spe: 0 }, nature: 'adamant', shiny: true, favorite: true, hpFrac: 0 });
    expect(p).toMatchObject({ species: 'pikachu', level: 30, shiny: true, hpFrac: 1 });
    expect(p!.ivs).toBeUndefined(); // an IV above 31 is not trusted
    expect((p as { favorite?: boolean }).favorite).toBeUndefined();
  });
  it('applying a trade moves the Pokémon and the items, with a fresh uid', () => {
    const a = save(), b = save();
    const pa = give(a, 'pikachu', 20); give(a, 'eevee', 5);
    give(b, 'bulbasaur', 8);
    a.inventory.pokeball = 10; b.inventory.potion = 3;
    const offerA: TradeOffer = { mon: tradeCopy(pa), items: { pokeball: 4 } };
    const offerB: TradeOffer = { mon: null, items: { potion: 2 } };
    expect(applyTrade(a, offerA, offerB, kindOf)).toBeNull();
    const got = applyTrade(b, offerB, offerA, kindOf);
    expect(got).toMatchObject({ species: 'pikachu', level: 20 });
    expect((got as { uid: string }).uid).not.toBe(pa.uid);
    expect(a.collection.some((c) => c.uid === pa.uid)).toBe(false);
    expect(a.adventure!.party).not.toContain(pa.uid);
    expect(b.adventure!.party).toContain((got as { uid: string }).uid);
    expect([a.inventory.pokeball, a.inventory.potion, b.inventory.pokeball, b.inventory.potion]).toEqual([6, 2, 4, 1]);
  });
  it('refuses to apply when my half is gone', () => {
    const a = save();
    give(a, 'pikachu', 20);
    a.inventory.pokeball = 1;
    expect(applyTrade(a, { mon: null, items: { pokeball: 3 } }, emptyOffer(), kindOf)).toBe('unavailable');
    expect(a.inventory.pokeball).toBe(1);
  });
});

/** Two trade sessions wired together; messages are delivered when `flush` runs (in order). */
function pair() {
  const sa = save(), sb = save();
  give(sa, 'pikachu', 20); const mon = give(sa, 'eevee', 15);
  give(sb, 'bulbasaur', 8);
  sa.inventory.pokeball = 5; sb.inventory.potion = 4;
  const queue: { to: 'a' | 'b'; m: PartyMsg }[] = [];
  const applied = { a: 0, b: 0 };
  const io = (me: 'a' | 'b', s: SaveData) => ({
    send: (m: PartyMsg) => queue.push({ to: me === 'a' ? 'b' : 'a', m }),
    save: () => s, kindOf, changed: () => {},
    applied: () => { applied[me]++; },
  });
  const A = new TradeSession('t1', 'B', true, io('a', sa));
  let B: TradeSession | null = null;
  const flush = () => {
    while (queue.length) {
      const { to, m } = queue.shift()!;
      if (to === 'b') { if (m.t === 'trReq') B = new TradeSession('t1', 'A', false, io('b', sb)); else B?.receive(m, 'A'); }
      else A.receive(m, 'B');
    }
  };
  flush();
  return { A, B: () => B!, flush, sa, sb, mon, applied, queue };
}

describe('trade handshake', () => {
  it('both confirm the same pair → each applies its half once', () => {
    const t = pair();
    t.B().accept(); t.flush();
    expect(t.A.state).toBe('open');
    expect(t.A.setOffer({ mon: t.mon, items: { pokeball: 2 } })).toBe('');
    expect(t.B().setOffer({ mon: null, items: { potion: 3 } })).toBe('');
    t.flush();
    t.A.confirm(); t.B().confirm(); t.flush();
    expect(t.A.state).toBe('done');
    expect(t.B().state).toBe('done');
    expect(t.applied).toEqual({ a: 1, b: 1 });
    expect(t.sb.collection.some((c) => c.species === 'eevee')).toBe(true);
    expect(t.sa.collection.some((c) => c.species === 'eevee')).toBe(false);
    expect([t.sa.inventory.pokeball, t.sa.inventory.potion, t.sb.inventory.pokeball, t.sb.inventory.potion]).toEqual([3, 3, 2, 1]);
  });
  it('changing an offer after the other side confirmed: nobody applies the old deal', () => {
    const t = pair();
    t.B().accept(); t.flush();
    t.A.setOffer({ mon: t.mon, items: {} }); t.B().setOffer({ mon: null, items: { potion: 1 } }); t.flush();
    t.A.confirm(); t.flush();              // A agrees to (eevee ↔ 1 potion)
    t.B().setOffer({ mon: null, items: {} }); // B takes the potion back before confirming…
    t.B().confirm();                       // …and confirms its new (empty) side
    t.flush();
    expect(t.applied).toEqual({ a: 0, b: 0 });
    expect(t.A.myReady).toBe(false);
    expect(t.sa.collection.some((c) => c.species === 'eevee')).toBe(true);
  });
  it('a cancel closes both sides without changes', () => {
    const t = pair();
    t.B().accept(); t.flush();
    t.A.setOffer({ mon: t.mon, items: {} }); t.flush();
    t.B().cancel(); t.flush();
    expect(t.A.state).toBe('closed');
    expect(t.applied).toEqual({ a: 0, b: 0 });
  });
  it('refuses an offer that breaks the rules', () => {
    const t = pair();
    t.B().accept(); t.flush();
    expect(t.A.setOffer({ mon: null, items: { pokeball: 50 } })).toMatch(/Không đủ/);
    const only = t.sb.collection[0];
    expect(t.B().setOffer({ mon: only, items: {} })).toMatch(/ít nhất 1/);
  });
});

describe('party room over BroadcastChannel (tabs)', () => {
  const sessions: PartySession[] = [];
  const make = () => { const s = new PartySession(); s.linkKind = 'local'; sessions.push(s); return s; };
  afterEach(() => { for (const s of sessions.splice(0)) s.leave(); });

  it('up to 4 members, everyone hears broadcasts, `to` reaches one member', async () => {
    const a = make();
    const code = await a.create();
    const b = make(), c = make();
    await b.join(code); await c.join(code);
    await new Promise((r) => setTimeout(r, 200));
    expect(a.members.size).toBe(2);
    expect(b.members.size).toBe(2);
    const got: Record<string, string[]> = { a: [], b: [], c: [] };
    a.on((m) => got.a.push(m.t)); b.on((m) => got.b.push(m.t)); c.on((m) => got.c.push(m.t));
    a.send({ t: 'ping-all' });
    a.send({ t: 'only-c' }, c.me);
    await new Promise((r) => setTimeout(r, 100));
    expect(got.b).toContain('ping-all');
    expect(got.c).toEqual(expect.arrayContaining(['ping-all', 'only-c']));
    expect(got.b).not.toContain('only-c');
    // hi carries the profile
    b.setProfile({ name: 'Bích', campaign: 'vietnam', map: 'can-tho' });
    await new Promise((r) => setTimeout(r, 100));
    expect(a.members.get(b.me)).toMatchObject({ name: 'Bích', campaign: 'vietnam', map: 'can-tho' });
    a.setProfile({ campaign: 'vietnam', map: 'can-tho' });
    expect(a.sameMap().map((m) => m.id)).toEqual([b.me]);
    // a fourth fits, a fifth does not
    const d = make();
    await d.join(code);
    const e = make();
    await expect(e.join(code)).rejects.toThrow(new RegExp(`${PARTY_MAX} người`));
    }, 20000);

  it('the room outlives its creator, and a joiner without a room gets an error', async () => {
    const a = make();
    const code = await a.create();
    const b = make(), c = make();
    await b.join(code); await c.join(code);
    a.leave();
    await new Promise((r) => setTimeout(r, 150));
    expect(b.members.has(c.me)).toBe(true);
    expect(b.active).toBe(true);
    await expect(make().join('ZZZZZZ')).rejects.toThrow(/Không tìm thấy/);
    }, 20000);
});
