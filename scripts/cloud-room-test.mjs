// Protocol test of the Cloudflare room relay (RoomDO) with two independent WebSocket clients.
// Usage: node scripts/cloud-room-test.mjs [ws://127.0.0.1:8790]
import WebSocket from 'ws';

const BASE = (process.argv[2] || 'ws://127.0.0.1:8790').replace(/\/+$/, '');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; };

/** Socket with a frame inbox: `next(pred)` waits for the first matching frame. */
function open(path, headers = {}) {
  const ws = new WebSocket(BASE + path, { headers });
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const f = JSON.parse(String(d));
    const w = waiters.findIndex((x) => x.pred(f));
    if (w >= 0) waiters.splice(w, 1)[0].resolve(f); else inbox.push(f);
  });
  const next = (pred = () => true, ms = 5000) => {
    const i = inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for frame')), ms);
      waiters.push({ pred, resolve: (f) => { clearTimeout(t); resolve(f); } });
    });
  };
  const closed = new Promise((r) => ws.on('close', (c) => r(c)));
  const opened = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); ws.on('unexpected-response', (_q, res) => j(new Error('HTTP ' + res.statusCode))); });
  return { ws, next, closed, opened, send: (o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o)) };
}
const msgs = (f) => Array.isArray(f.m);

const c = code();
const host = open(`/room/${c}?role=host`);
const hr = await host.next((f) => f.r === 'ready');
check(hr.role === 'host' && hr.code === c && /^[0-9a-f]{32}$/.test(hr.token), 'host creates the room and gets a reconnect token');

const dup = open(`/room/${c}?role=host`);
check((await dup.next()).code === 'TAKEN', 'a second host with the same code is refused (TAKEN)');

const ghost = open(`/room/${code()}?role=guest`);
check((await ghost.next()).code === 'NOT_FOUND', 'joining an unknown code is refused (NOT_FOUND)');

const guest = open(`/room/${c}?role=guest`);
const gr = await guest.next((f) => f.r === 'ready');
check(gr.role === 'guest', 'guest joins with the code');
check((await host.next((f) => f.r === 'peer')).on === true, 'host is told the guest arrived');

const third = open(`/room/${c}?role=guest`);
check((await third.next()).code === 'FULL', 'a third player is refused (FULL)');

guest.send({ m: [{ t: 'hello', v: 2, name: 'B' }, { t: 'coopInput', seq: 1, x: 1, y: 0 }] });
const toHost = await host.next(msgs);
check(toHost.m.length === 2 && toHost.m[0].name === 'B' && toHost.m[1].t === 'coopInput', 'guest → host: a batch arrives intact and in order');
host.send({ m: [{ t: 'snap', s: { n: 7 } }] });
check((await guest.next(msgs)).m[0].s.n === 7, 'host → guest relay');
guest.send({ m: [{ nope: 1 }, 'x', { t: 'ping', at: 1 }] });
check((await host.next(msgs)).m.length === 1, 'malformed messages are dropped, valid ones forwarded');

// network drop: the guest's slot is kept, messages sent meanwhile are buffered and delivered on reconnect
guest.ws.terminate();
check((await host.next((f) => f.r === 'peer')).on === false, 'host is told the guest dropped');
host.send({ m: [{ t: 'snap', s: { n: 8 } }, { t: 'coopLoot', reward: { currency: 5 } }] });
await new Promise((r) => setTimeout(r, 300));
const back = open(`/room/${c}?role=guest&token=${gr.token}`);
check((await back.next((f) => f.r === 'ready')).token === gr.token, 'guest reconnects into the same slot with its token');
const flushed = await back.next(msgs);
check(flushed.m.length === 2 && flushed.m[1].t === 'coopLoot', 'messages sent during the drop are delivered after reconnecting');
check((await host.next((f) => f.r === 'peer')).on === true, 'host is told the guest is back');

const thief = open(`/room/${c}?role=guest&token=deadbeef`);
check((await thief.next()).code === 'ROOM_CLOSED', 'a wrong reconnect token is refused');

const big = open(`/room/${code()}?role=host`);
await big.next((f) => f.r === 'ready');
big.send({ m: [{ t: 'x', pad: 'a'.repeat(1_100_000) }] });
check((await big.next((f) => f.r === 'error')).code === 'TOO_LARGE', 'oversized frames are rejected');

// leaving for good closes the room for both
back.send({ bye: 1 });
check((await host.next((f) => f.r === 'gone')).reason.length > 0, 'guest leaves → host gets "gone"');
await host.closed;
const after = open(`/room/${c}?role=guest`);
check((await after.next()).code === 'NOT_FOUND', 'the room is gone afterwards');

// origin allowlist
const evil = open(`/room/${code()}?role=host`, { Origin: 'https://evil.example' });
check(await evil.opened.then(() => false, (e) => /403/.test(e.message)), 'foreign web origins are blocked (403)');
const pages = open(`/room/${code()}?role=host`, { Origin: 'https://lucbo-coder.github.io' });
check((await pages.next()).r === 'ready', 'the GitHub Pages origin is allowed');

for (const s of [host, dup, ghost, third, back, thief, big, after, pages]) { try { s.ws.close(); } catch { /* */ } }
console.log(failures ? `\n${failures} FAILED` : '\nall room relay checks passed');
process.exit(failures ? 1 : 0);
