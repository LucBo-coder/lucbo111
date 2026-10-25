// Load test for the authoritative server (V7 Test 7). Usage:
//   node scripts/load-server.mjs [counts=10,20,30,50] [seconds=20]
// Starts its own server (temporary on-disk SQLite, port 8795), then for each player count connects that
// many bot accounts that walk at 10 Hz, chat, attack the Alpha and switch Pokémon (DB transactions).
// Measures server CPU / RSS / tick lag, traffic per client, ping RTT and action round-trip latency.
// Results are measured on THIS machine only — they are not a capacity claim for other hardware.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const counts = (process.argv[2] || '10,20,30,50').split(',').map(Number).filter((n) => n > 0);
const seconds = Number(process.argv[3] || 20);
const PORT = 8795;
const URL = `ws://127.0.0.1:${PORT}/ws`;
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-load-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB_PATH: path.join(dbDir, 'load.db'), VERBOSE: 'false', AUTH_PER_MINUTE: '100000' },
  stdio: ['ignore', 'inherit', 'inherit'],
});

async function health() {
  const r = await fetch(`http://127.0.0.1:${PORT}/healthz`);
  return r.json();
}

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try { await health(); return; } catch { await sleep(200); }
  }
  throw new Error('server did not start');
}

function pct(list, p) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

function bot(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const b = { ws, bytes: 0, msgs: 0, rtts: [], actionMs: [], pending: new Map(), timers: [], save: null, errors: 0 };
    ws.on('message', (raw) => {
      b.bytes += raw.length; b.msgs++;
      const m = JSON.parse(raw.toString());
      if (m.t === 'welcome') { b.save = m.save; resolve(b); }
      else if (m.t === 'error' && !b.save) reject(new Error(m.message));
      else if (m.t === 'pong' && m.at) b.rtts.push(performance.now() - m.at);
      else if ((m.t === 'actionResult' || m.t === 'actionError') && b.pending.has(m.actionId)) {
        b.actionMs.push(performance.now() - b.pending.get(m.actionId));
        b.pending.delete(m.actionId);
        if (m.t === 'actionResult') b.save = m.save;
      }
    });
    ws.on('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'register', username: name, password: 'secret123' })));
  });
}

function drive(b, i) {
  const send = (m) => { if (b.ws.readyState === WebSocket.OPEN) b.ws.send(JSON.stringify(m)); };
  const home = b.save.adventure.pos;
  let t = Math.random() * Math.PI * 2;
  // walk a small circle around the spawn at ~120 px/s (well under the 420 px/s server limit)
  b.timers.push(setInterval(() => {
    t += 0.12;
    send({ t: 'move', x: home.x + Math.cos(t) * 90, y: home.y + Math.sin(t) * 90, facing: t, moving: true });
  }, 100));
  b.timers.push(setInterval(() => send({ t: 'ping', at: performance.now() }), 2000));
  b.timers.push(setInterval(() => send({ t: 'alpha.attack', actionId: `atk_${i}_${Date.now()}` }), 1000));
  b.timers.push(setInterval(() => send({ t: 'chat', actionId: `c_${i}_${Date.now()}`, channel: 'region:ca-mau', body: `bot ${i} xin chào` }), 6000 + i * 37));
  let flip = false;
  b.timers.push(setInterval(() => {
    const uid = b.save.collection[0].uid;
    const id = `sw_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    b.pending.set(id, performance.now());
    flip = !flip;
    send(flip ? { t: 'action', actionId: id, type: 'party.recall' } : { t: 'action', actionId: id, type: 'party.setActive', data: { uid } });
  }, 3000 + (i % 7) * 50));
}

async function round(n, tag) {
  const bots = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) bots.push(await bot(`ld${tag}_${i}`));
  const loginMs = performance.now() - t0;
  bots.forEach(drive);
  await sleep(3000); // warm-up
  for (const b of bots) { b.bytes = 0; b.msgs = 0; b.rtts = []; b.actionMs = []; }
  const h0 = await health();
  const w0 = performance.now();
  let lagMax = 0;
  const lagTimer = setInterval(async () => { try { lagMax = Math.max(lagMax, (await health()).tickLagMs); } catch { /* ignore */ } }, 1000);
  await sleep(seconds * 1000);
  clearInterval(lagTimer);
  const h1 = await health();
  const wall = (performance.now() - w0) / 1000;
  const cpuMs = (h1.cpu.user + h1.cpu.system - h0.cpu.user - h0.cpu.system) / 1000;
  const rtts = bots.flatMap((b) => b.rtts), acts = bots.flatMap((b) => b.actionMs);
  const result = {
    players: n,
    channels: h1.channels,
    loginMsPerPlayer: Math.round(loginMs / n),
    serverCpuPct: Math.round(cpuMs / (wall * 1000) * 1000) / 10,
    rssMB: Math.round(h1.memory.rss / 1048576),
    heapMB: Math.round(h1.memory.heapUsed / 1048576),
    tickLagMaxMs: lagMax,
    downKBpsPerClient: Math.round(bots.reduce((s, b) => s + b.bytes, 0) / n / wall / 102.4) / 10,
    msgsPerSecPerClient: Math.round(bots.reduce((s, b) => s + b.msgs, 0) / n / wall),
    rttP50: Math.round(pct(rtts, 0.5) * 10) / 10,
    rttP95: Math.round(pct(rtts, 0.95) * 10) / 10,
    actionP50: Math.round(pct(acts, 0.5) * 10) / 10,
    actionP95: Math.round(pct(acts, 0.95) * 10) / 10,
  };
  for (const b of bots) { b.timers.forEach(clearInterval); b.ws.close(); }
  await sleep(1500);
  return result;
}

const results = [];
try {
  await waitReady();
  for (const n of counts) {
    const r = await round(n, `${n}_${Date.now().toString(36)}`);
    results.push(r);
    console.log(JSON.stringify(r));
  }
  const env = { node: process.version, cpu: os.cpus()[0]?.model, cores: os.cpus().length, ramGB: Math.round(os.totalmem() / 1073741824), platform: `${os.platform()} ${os.release()}`, seconds };
  fs.mkdirSync('reports', { recursive: true });
  const file = path.join('reports', 'load-test.json');
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), env, results }, null, 2));
  console.log('\n| Người chơi | CPU server | RSS | Tick lag max | Tải xuống / client | RTT p50 / p95 | Thao tác DB p50 / p95 |');
  console.log('|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of results) console.log(`| ${r.players} | ${r.serverCpuPct}% | ${r.rssMB} MB | ${r.tickLagMaxMs} ms | ${r.downKBpsPerClient} KB/s | ${r.rttP50} / ${r.rttP95} ms | ${r.actionP50} / ${r.actionP95} ms |`);
  console.log(`\n${env.cpu} · ${env.cores} luồng · ${env.ramGB} GB · Node ${env.node} · ${seconds}s mỗi mức → ${file}`);
} finally {
  server.kill();
  await sleep(300);
  fs.rmSync(dbDir, { recursive: true, force: true });
}
