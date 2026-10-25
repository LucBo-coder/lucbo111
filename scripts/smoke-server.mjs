// Manual smoke client for the authoritative server. Usage:
//   node scripts/smoke-server.mjs ws://127.0.0.1:8787/ws
// Registers two throwaway accounts, then exercises presence, movement, actions, party and chat.
import WebSocket from 'ws';

const URL = process.argv[2] || 'ws://127.0.0.1:8787/ws';
const suffix = Math.random().toString(36).slice(2, 8);
const clients = [];

function connect(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, inbox: [], waiters: [], save: null, account: null };
  clients.push(c);
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const i = c.waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) c.waiters.splice(i, 1)[0].resolve(msg);
    else c.inbox.push(msg);
  });
  c.send = (msg) => ws.send(JSON.stringify(msg));
  c.next = (pred, timeout = 6000) => {
    const i = c.inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(c.inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      c.waiters.push(w);
      setTimeout(() => {
        const j = c.waiters.indexOf(w);
        if (j >= 0) { c.waiters.splice(j, 1); reject(new Error(`${name}: timeout waiting for message`)); }
      }, timeout);
    });
  };
  return c;
}

function ok(cond, label) {
  if (!cond) throw new Error('FAILED: ' + label);
  console.log('ok -', label);
}

const a = connect('A');
await new Promise((r) => a.ws.once('open', r));
a.send({ t: 'register', username: 'smoke_a_' + suffix, password: 'secret123', displayName: 'An', starter: 'charmander' });
const wa = await a.next((m) => m.t === 'welcome');
a.save = wa.save; a.account = wa.account; a.token = wa.token;
ok(wa.protocol === 1, 'protocol 1');
ok(wa.save.adventure.party.length === 1, 'starter party of one');
ok(wa.save.adventure.activeUid === wa.save.adventure.party[0], 'starter is active');

const b = connect('B');
await new Promise((r) => b.ws.once('open', r));
b.send({ t: 'register', username: 'smoke_b_' + suffix, password: 'secret123', displayName: 'Binh', starter: 'squirtle' });
const wb = await b.next((m) => m.t === 'welcome');
b.save = wb.save; b.account = wb.account; b.token = wb.token;

const presA = await a.next((m) => m.t === 'presence' && m.players.some((p) => p.accountId === b.account.id));
ok(presA.players.length >= 1, 'presence lists the other player');
const pv = presA.players.find((p) => p.accountId === b.account.id);
ok(pv.species === 'squirtle' && pv.level === 5, 'presence shows active species/level');
ok(pv.activeUid === wb.save.adventure.activeUid, 'presence activeUid matches canonical save');

// movement: a single jump far beyond the speed budget is rejected, a normal step is accepted
const start = wa.save.adventure.pos;
a.send({ t: 'move', x: start.x + 400, y: start.y, facing: 0, moving: true });
const reject = await a.next((m) => m.t === 'notice' && /di chuyển/.test(m.message));
ok(!!reject, 'teleport rejected');

a.send({ t: 'move', x: start.x + 24, y: start.y, facing: 0, moving: true });
const presMoved = await b.next((m) => m.t === 'presence' && m.players.some((p) => p.accountId === a.account.id && p.x === Math.round(start.x + 24)));
ok(!!presMoved, 'normal move visible to the other client');

// authoritative single-active: recall then summon via action ids
const activeUid = a.save.adventure.activeUid;
const rec = { t: 'action', actionId: 'recall' + suffix, type: 'party.recall' };
a.send(rec);
const recalled = await a.next((m) => m.t === 'actionResult' && m.actionId === rec.actionId);
ok(recalled.save.adventure.activeUid === null, 'recall leaves an empty field');
a.send(rec); // replay: must be idempotent
const replay = await a.next((m) => m.t === 'actionResult' && m.actionId === rec.actionId);
ok(replay.save.adventure.activeUid === null, 'idempotent replay of recall');
a.send({ t: 'action', actionId: 'summon' + suffix, type: 'party.setActive', data: { uid: activeUid } });
const summoned = await a.next((m) => m.t === 'actionResult' && m.actionId === 'summon' + suffix);
ok(summoned.save.adventure.activeUid === activeUid, 'summon restores the single active Pokémon');

// candy is server-computed and consumes the bag exactly once
const before = { level: summoned.save.collection.find((p) => p.uid === activeUid).level, candy: summoned.save.inventory['rare-candy'] };
a.send({ t: 'action', actionId: 'candy' + suffix, type: 'candy.use', data: { uid: activeUid, candy: 'rare-candy', qty: 2 } });
const candied = await a.next((m) => m.t === 'actionResult' && m.actionId === 'candy' + suffix);
const after = candied.save.collection.find((p) => p.uid === activeUid);
ok(after.level === before.level + 2, 'rare candy +1 level per candy');
ok(candied.save.inventory['rare-candy'] === before.candy - 2, 'rare candy removed from bag');
a.send({ t: 'action', actionId: 'candy' + suffix, type: 'candy.use', data: { uid: activeUid, candy: 'rare-candy', qty: 2 } });
const candyReplay = await a.next((m) => m.t === 'actionResult' && m.actionId === 'candy' + suffix);
ok(candyReplay.save.inventory['rare-candy'] === before.candy - 2, 'replayed candy use is idempotent');

// PC: withdraw the professor's gift, then deposit the (active) starter and withdraw it again
const giftUid = wa.save.adventure.pc.boxes.flatMap((box) => box.slots).find(Boolean);
ok(!!giftUid, 'new account has a Pokémon waiting in the PC');
a.send({ t: 'action', actionId: 'wdgift' + suffix, type: 'party.withdraw', data: { uid: giftUid } });
const wg = await a.next((m) => m.t === 'actionResult' && m.actionId === 'wdgift' + suffix);
ok(wg.save.adventure.party.includes(giftUid) && wg.save.adventure.party.length === 2, 'gift withdrawn into the party');
a.send({ t: 'action', actionId: 'dep' + suffix, type: 'party.deposit', data: { uid: activeUid } });
const dep = await a.next((m) => m.t === 'actionResult' && m.actionId === 'dep' + suffix);
ok(!dep.save.adventure.party.includes(activeUid), 'deposit removes from party');
ok(dep.save.adventure.pc.boxes.some((box) => box.slots.includes(activeUid)), 'deposit places it in a PC box');
a.send({ t: 'action', actionId: 'wd' + suffix, type: 'party.withdraw', data: { uid: activeUid } });
const wd = await a.next((m) => m.t === 'actionResult' && m.actionId === 'wd' + suffix);
ok(wd.save.adventure.party.includes(activeUid), 'withdraw returns it to the party');
a.send({ t: 'action', actionId: 'summon2' + suffix, type: 'party.setActive', data: { uid: activeUid } });
const activeAgain = await a.next((m) => m.t === 'actionResult' && m.actionId === 'summon2' + suffix);
ok(activeAgain.save.adventure.activeUid === activeUid, 'summon after PC withdraw');

// chat
a.send({ t: 'chat', actionId: 'chat' + suffix, channel: 'region:ca-mau', body: 'Xin chào từ smoke test' });
const chatA = await a.next((m) => m.t === 'chat' && m.message.body.includes('smoke test'));
const chatB = await b.next((m) => m.t === 'chat' && m.message.body.includes('smoke test'));
ok(chatA.message.from === a.account.id && chatB.message.from === a.account.id, 'region chat delivered to both');
a.send({ t: 'chat', actionId: 'chat2' + suffix, channel: 'region:ca-mau', body: 'spam' });
const limited = await a.next((m) => m.t === 'actionError' && m.code === 'CHAT_RATE_LIMIT');
ok(!!limited, 'chat rate limit enforced');

// friends + party of 2
a.send({ t: 'friend', actionId: 'fr' + suffix, op: 'request', target: b.account.username });
await a.next((m) => m.t === 'actionResult' && m.actionId === 'fr' + suffix);
b.send({ t: 'friend', actionId: 'fa' + suffix, op: 'accept', target: a.account.username });
const fa = await b.next((m) => m.t === 'actionResult' && m.actionId === 'fa' + suffix);
const friendsA = await a.next((m) => m.t === 'friends' && m.friends.some((f) => f.accountId === b.account.id) && !m.requests.some((r) => r.accountId === b.account.id));
ok(!!fa && !!friendsA && friendsA.friends.find((f) => f.accountId === b.account.id).online, 'friends accepted and online');
a.send({ t: 'party', actionId: 'pc' + suffix, op: 'create' });
const created = await a.next((m) => m.t === 'party' && m.party && m.party.leaderId === a.account.id);
ok(!!created, 'party created');
a.send({ t: 'party', actionId: 'pi' + suffix, op: 'invite', target: b.account.username });
const invited = await b.next((m) => m.t === 'notice' && /mời bạn/.test(m.message));
ok(!!invited, 'invite delivered');
b.send({ t: 'party', actionId: 'pa' + suffix, op: 'accept' });
const joined = await b.next((m) => m.t === 'party' && m.party && m.party.members.length === 2);
ok(!!joined, 'party of two independent accounts');

// shared alpha: first move is now anti-cheat checked, approach in steps
const alphaMsg = await a.next((m) => m.t === 'alpha' || m.t === 'alphaHit', 8000);
const alpha = alphaMsg.alpha;
ok(!!alpha, 'alpha present in region');
const pos = { x: start.x + 24, y: start.y };
for (let i = 1; i <= 30; i++) {
  const nx = pos.x + ((alpha.x - pos.x) * i) / 30;
  const ny = pos.y + ((alpha.y - pos.y) * i) / 30;
  a.send({ t: 'move', x: nx, y: ny, facing: 0, moving: true });
  await new Promise((r) => setTimeout(r, 60));
}
a.send({ t: 'alpha.attack', actionId: 'atk' + suffix });
const hit = await a.next((m) => m.t === 'alphaHit' || (m.t === 'actionError' && m.actionId === 'atk' + suffix), 8000);
ok(hit.t === 'alphaHit', 'alpha hit accepted (contribution ' + (hit.t === 'alphaHit' ? hit.contribution : hit.message) + ')');
const hitB = await b.next((m) => m.t === 'alphaHit', 8000);
ok(hitB.alpha.hp < hitB.alpha.maxHp, 'alpha HP shared with the second client');

for (const c of clients) c.ws.close();
console.log('\nSMOKE PASS');
process.exit(0);
