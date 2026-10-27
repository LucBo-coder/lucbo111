// Dev tool (npx tsx scripts/gen-legend-planes.ts): hides the legendary shrines (LEGENDARY_SHRINES.md mục 8).
// - Every tier-1 legendary gets a dimension of its own (DIMS); the other shrines of a map go into that map's hidden
//   sanctum (HOLLOWS), one walled pocket per shrine. Planes are void regions (ValleyMap `void`): outside the shrine's
//   footprint and its path there is only wall / sea.
// - On the overworld no shrine is stamped any more: each one has a concealed entrance (region `secrets`) near where the
//   shrine stood — behind a thicket / cracked rock (a field obstacle) or invisible until its clues are read.
// - legends.json sites follow their shrine; clues that now stand on water / in a wall move to the nearest open tile.
// Idempotent: sites are collected wherever they are now; an entrance keeps its spot once placed.
import { readFileSync, writeFileSync } from 'node:fs';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap, type LegendSite, type RegionDef, type PortalDef } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';
import { nookRing, type FieldDef } from '../src/core/field';
import { SHRINES, shrineCells, shrineFind, shrineBounds } from '../src/core/shrines';
import type { SecretDef } from '../src/core/secrets';

type Reveal = 'cut' | 'smash' | 'clues';
interface Entrance { name: string; look: SecretDef['look']; reveal: Reveal; color: number; requires?: string[]; weather?: string[]; hint?: string }
interface Plane { id: string; name: string; theme: RegionDef['theme']; void: 'Wall' | 'Water'; weather?: RegionDef['weather']; from: string; sites: string[]; decor?: RegionDef['decor'] }

const STORM = ['rain', 'heavyRain', 'thunderstorm'];
// tier 1: a dimension each (Kyogre's and the Temple's planes already exist and keep their own layout)
const DIMS: Plane[] = [
  { id: 'psychic-rift', name: 'Khe Nứt Tâm Linh', theme: 'sanctuary', void: 'Wall', from: 'starter-valley', sites: ['mewtwo'], decor: { small: ['crystal', 'runeStone', 'sanctum2'], big: ['crystal', 'brokenPillar'], density: 0.09 } },
  { id: 'rainbow-sky', name: 'Thiên Đài Cầu Vồng', theme: 'sanctuary', void: 'Wall', from: 'emerald-woods', sites: ['ho-oh'], decor: { small: ['flowerBloom', 'sprout', 'flowerBloom', 'mushrooms'], big: ['whitePillar', 'crystal'], density: 0.08 } },
  { id: 'silver-maelstrom', name: 'Biển Xoáy Bạc', theme: 'coast', void: 'Water', weather: 'rain', from: 'coral-coast', sites: ['lugia'], decor: { small: ['reeds', 'rocky2', 'sand2'], big: ['palm', 'brokenPillar'], density: 0.08 } },
  { id: 'magma-core', name: 'Lõi Dung Nham', theme: 'volcanic', void: 'Wall', weather: 'heatwave', from: 'volcanic-lands', sites: ['groudon'], decor: { small: ['ashRock', 'ash2', 'rocky'], big: ['deadTree', 'brokenPillar'], density: 0.09 } },
  { id: 'sky-pillar', name: 'Tầng Trời', theme: 'sanctuary', void: 'Wall', from: 'frozen-mountains', sites: ['rayquaza'], decor: { small: ['starStone', 'crystal', 'sanctum2'], big: ['whitePillar', 'brokenPillar'], density: 0.07 } },
  { id: 'distortion-world', name: 'Thế Giới Đảo Ngược', theme: 'swamp', void: 'Wall', weather: 'fog', from: 'misty-swamp', sites: ['giratina'], decor: { small: ['flowerWilt', 'ruin2', 'mud2', 'reeds'], big: ['deadTree', 'brokenPillar'], density: 0.1 } },
];
// the rest: one hidden sanctum per map
const HOLLOWS: Plane[] = [
  { id: 'valley-hollow', name: 'Bí Cảnh Thung Lũng', theme: 'sanctuary', void: 'Wall', from: 'starter-valley', sites: ['mew', 'mesprit'], decor: { small: ['flowerBloom', 'mushrooms', 'sprout', 'bush'], big: ['round', 'pine'], density: 0.09 } },
  { id: 'emerald-hollow', name: 'Bí Cảnh Rừng Ngọc', theme: 'sanctuary', void: 'Wall', from: 'emerald-woods', sites: ['celebi', 'cresselia', 'lati'], decor: { small: ['mushrooms', 'sprout', 'bush', 'flowerBloom'], big: ['round', 'tall', 'pine'], density: 0.1 } },
  { id: 'coral-hollow', name: 'Bí Cảnh Bờ Biển', theme: 'coast', void: 'Water', from: 'coral-coast', sites: ['zapdos', 'regirock', 'manaphy'], decor: { small: ['reeds', 'rocky2', 'sand2'], big: ['palm'], density: 0.08 } },
  { id: 'frozen-hollow', name: 'Bí Cảnh Núi Tuyết', theme: 'frozen', void: 'Wall', from: 'frozen-mountains', sites: ['articuno', 'regice', 'jirachi'], decor: { small: ['crystal', 'runeStone', 'crystal'], big: ['snowPine', 'icePillar'], density: 0.08 } },
  { id: 'volcanic-hollow', name: 'Bí Cảnh Núi Lửa', theme: 'volcanic', void: 'Wall', from: 'volcanic-lands', sites: ['moltres', 'heatran', 'shaymin'], decor: { small: ['ashRock', 'ash2', 'rocky'], big: ['deadTree'], density: 0.08 } },
  { id: 'sanctuary-hollow', name: 'Bí Cảnh Thánh Địa', theme: 'sanctuary', void: 'Wall', from: 'legendary-sanctuary', sites: ['uxie', 'regigigas', 'deoxys'], decor: { small: ['runeStone', 'crystal', 'starStone', 'sanctum2'], big: ['whitePillar', 'crystal'], density: 0.08 } },
  { id: 'swamp-hollow', name: 'Bí Cảnh Đầm Lầy', theme: 'swamp', void: 'Wall', from: 'misty-swamp', sites: ['azelf', 'registeel', 'darkrai'], decor: { small: ['reeds', 'mushrooms', 'swampGrass', 'mud2'], big: ['deadTree', 'tall'], density: 0.09 } },
];
// existing planes: only their entrance is new (it replaces the shrine gates kyogre-gate / arceus-gate)
const FIXED: { plane: string; from: string; key: string; old: string }[] = [
  { plane: 'abyssal-depths', from: 'coral-coast', key: 'kyogre', old: 'kyogre-gate' },
  { plane: 'origin-temple', from: 'legendary-sanctuary', key: 'origin', old: 'arceus-gate' },
];

const ENTRANCES: Record<string, Entrance> = {
  mewtwo: { name: 'Vết nứt đá lạ', look: 'cave', reveal: 'smash', color: 0xc080ff },
  'ho-oh': { name: 'Lối mòn sau bụi rậm', look: 'rift', reveal: 'cut', color: 0xffb040, requires: ['boss:mega-venusaur'], hint: 'Ánh cầu vồng lóe lên rồi tắt. Ba bức tượng Thú bên trong đang chờ người đã hạ Thần Rừng (Mega Venusaur).' },
  lugia: { name: 'Xoáy nước bạc', look: 'whirlpool', reveal: 'clues', color: 0xc8e0ff, weather: STORM },
  groudon: { name: 'Khe nứt dung nham', look: 'cave', reveal: 'clues', color: 0xff6030 },
  rayquaza: { name: 'Khe gió trời', look: 'rift', reveal: 'clues', color: 0x60e0a0 },
  giratina: { name: 'Vết rách không gian', look: 'rift', reveal: 'clues', color: 0x9040c0 },
  kyogre: { name: 'Xoáy Nước Sâu', look: 'whirlpool', reveal: 'clues', color: 0x4080ff, requires: ['boss:lugia', 'boss:ho-oh'], weather: STORM, hint: 'Mặt nước ở đây sẫm lại một cách lạ thường... (cần hạ Lugia và Ho-Oh)' },
  origin: { name: 'Cổng Thần Điện', look: 'rift', reveal: 'smash', color: 0xf0e8b0, requires: ['boss:uxie', 'boss:mesprit', 'boss:azelf'], hint: 'Sau bức tường đổ là một cánh cổng đá khắc ba hộ thần hồ. Nó chỉ mở cho người được cả ba công nhận.' },
  mew: { name: 'Tường nứt Tàn Tích', look: 'cave', reveal: 'smash', color: 0xff90d0 },
  mesprit: { name: 'Bụi lau ven hồ', look: 'rift', reveal: 'cut', color: 0xff90c0 },
  celebi: { name: 'Lùm cây cổ thụ', look: 'rift', reveal: 'cut', color: 0x80e080 },
  cresselia: { name: 'Bụi cây ánh trăng', look: 'rift', reveal: 'cut', color: 0xd0c8ff },
  lati: { name: 'Vách đá gió', look: 'rift', reveal: 'smash', color: 0xff8080 },
  zapdos: { name: 'Tảng đá sét đánh', look: 'cave', reveal: 'smash', color: 0xfff060 },
  regirock: { name: 'Cửa đá đỏ', look: 'cave', reveal: 'clues', color: 0xd08050 },
  manaphy: { name: 'Hang san hô', look: 'cave', reveal: 'smash', color: 0x60c0ff },
  articuno: { name: 'Khe băng', look: 'cave', reveal: 'smash', color: 0xa0e0ff },
  regice: { name: 'Cửa băng cổ', look: 'cave', reveal: 'clues', color: 0xc0f0ff },
  jirachi: { name: 'Đá sao rơi', look: 'rift', reveal: 'smash', color: 0xfff0a0 },
  moltres: { name: 'Khe đá cháy', look: 'cave', reveal: 'smash', color: 0xff8040 },
  heatran: { name: 'Miệng hang nóng', look: 'cave', reveal: 'clues', color: 0xff6020 },
  shaymin: { name: 'Bụi hoa dại', look: 'rift', reveal: 'cut', color: 0xa0ff90 },
  uxie: { name: 'Tấm bia nứt', look: 'rift', reveal: 'smash', color: 0xffe070 },
  regigigas: { name: 'Cổng đá khổng lồ', look: 'cave', reveal: 'smash', color: 0xe0e0c0 },
  deoxys: { name: 'Hố thiên thạch nhỏ', look: 'cave', reveal: 'smash', color: 0xff6080 },
  azelf: { name: 'Bụi sậy', look: 'rift', reveal: 'cut', color: 0x80a0ff },
  registeel: { name: 'Cửa thép chìm', look: 'cave', reveal: 'clues', color: 0xb0b8c8 },
  darkrai: { name: 'Bóng tối giữa đầm', look: 'rift', reveal: 'clues', color: 0x8060c0 },
};

const DIR = 'src/data/world/';
const read = (f: string) => JSON.parse(readFileSync(DIR + f, 'utf8'));
const write = (f: string, d: unknown) => writeFileSync(DIR + f, JSON.stringify(d, null, 1) + '\n');
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

// ── load every map (overworld + planes) and collect every shrine site wherever it is now ──
const PLANES = [...DIMS, ...HOLLOWS];
const regions = new Map<string, RegionDef>();
for (const id of Object.keys(REGION_DEFS)) if (!PLANES.some((p) => p.id === id)) regions.set(id, read(`${id}.json`.replace(/^(ca-mau|an-giang|can-tho)/, '../vietnam/$1')));
for (const p of PLANES) { try { regions.set(p.id, read(`${p.id}.json`)); } catch { /* new plane */ } }
const sites = new Map<string, { site: LegendSite; region: string }>();
for (const [id, d] of regions) for (const l of d.legendaries ?? []) if (l.shrine) sites.set(l.id, { site: l, region: id });
const oldSecrets = new Map<string, SecretDef>();
for (const d of regions.values()) for (const s of d.secrets ?? []) oldSecrets.set(s.id, s);

// ── 1. strip the overworld maps: no stamped shrine, no shrine gate, no shrine crack, no old entrance ──
const OVER = [...new Set([...PLANES.map((p) => p.from), ...FIXED.map((f) => f.from)])];
const moving = new Set([...PLANES.flatMap((p) => p.sites), ...FIXED.map((f) => f.old)]);
const gates = new Map<string, LegendSite>();
for (const id of OVER) {
  const d = regions.get(id)!;
  for (const l of d.legendaries ?? []) if (FIXED.some((f) => f.old === l.id)) gates.set(l.id, l);
  d.legendaries = (d.legendaries ?? []).filter((l) => !moving.has(l.id));
  d.field = (d.field ?? []).filter((f) => f.id !== 'sv-mew-crack' && !f.id.startsWith('secret-'));
  d.secrets = [];
}

// ── 2. build the planes: a pocket per shrine, path out of the footprint to the arrival + the way back ──
const M = 8;
interface Pocket { key: string; plane: string; arrive: [number, number]; back: PortalDef }
const pockets: Pocket[] = [];
const WALKABLE = new Set([...',.:=xwP+&12%^']);
function exitOf(l: LegendSite, ox: number, oy: number, pw: number, ph: number): { n: [number, number]; dir: [number, number] } {
  const sh = SHRINES.get(l.shrine!)!;
  const cells = new Map<string, string>();
  for (const c of shrineCells(sh, l.x, l.y)) cells.set(`${c.tx},${c.ty}`, c.ch);
  const [x0, y0] = shrineBounds(sh, l.x, l.y), p = shrineFind(sh, 'P')!;
  const start = `${x0 + p[0]},${y0 + p[1]}`, seen = new Set([start]), q = [start];
  const exits: { n: [number, number]; dir: [number, number] }[] = [];
  while (q.length) {
    const [x, y] = q.pop()!.split(',').map(Number);
    for (const [dx, dy] of N4) {
      const k = `${x + dx},${y + dy}`, ch = cells.get(k);
      if (ch === undefined) { exits.push({ n: [x + dx, y + dy], dir: [dx, dy] }); continue; }
      if (seen.has(k) || !WALKABLE.has(ch)) continue;
      seen.add(k); q.push(k);
    }
  }
  if (!exits.length) throw new Error(`${l.id}: no way out of the shrine`);
  // the opening nearest the pocket's bottom centre
  const bx = ox + pw / 2, by = oy + ph;
  exits.sort((a, b) => Math.hypot(a.n[0] - bx, a.n[1] - by) - Math.hypot(b.n[0] - bx, b.n[1] - by));
  return exits[0];
}

function buildPlane(p: Plane): void {
  const list = p.sites.map((id) => { const s = sites.get(id); if (!s) throw new Error(`no site ${id}`); return s.site; });
  const dims = list.map((l) => { const sh = SHRINES.get(l.shrine!)!; return { l, sh, pw: sh.rows[0].length + 2 * M, ph: sh.rows.length + 2 * M }; });
  const W = dims.reduce((a, d) => a + d.pw, 0) + 4, H = Math.max(...dims.map((d) => d.ph)) + 4;
  const d: RegionDef = {
    id: p.id, name: p.name, width: W, height: H, chunk: 16, theme: p.theme, void: p.void, ...(p.weather ? { weather: p.weather } : {}), ...(p.decor ? { decor: p.decor } : {}),
    spawn: { x: 0, y: 0 }, areas: [], paths: [], plaza: [0, 0, 0, 0], lake: { cx: -50, cy: -50, rx: 1, ry: 1 },
    buildings: [], fences: [], props: [], signs: [], npcs: [], trainers: [], rescue: { id: 'none', x: -99, y: -99, species: 'pidgey', level: 1, guards: [] },
    chests: [], waypoints: [], puzzles: [], dungeons: [], pillars: [], spawns: {}, legendaries: [], portals: [], field: [],
  };
  let ox = 2;
  const rituals = JSON.parse(readFileSync(DIR + 'rituals.json', 'utf8')) as { shrine: string; title?: string }[];
  for (const { l, sh, pw, ph } of dims) {
    const oy = 2 + Math.floor((H - 4 - ph) / 2);
    const old = { x: l.x, y: l.y };
    const site: LegendSite = { ...l, x: ox + M + sh.anchor[0], y: oy + M + sh.anchor[1] };
    d.legendaries!.push(site);
    const title = rituals.find((r) => r.shrine === sh.id)?.title || l.name;
    d.areas.push({ id: `${p.id}-${l.id}`, name: title, rect: [ox, oy, ox + pw - 1, oy + ph - 1], habitat: 'sanctuary', level: [l.level, l.level + 10] } as never);
    // the shrine's own cracked wall (Mew's ruins): a smash obstacle on each `%`
    [...shrineCells(sh, site.x, site.y)].filter((c) => c.ch === '%').forEach((c, i) => d.field!.push({ id: `crack-${l.id}${i ? '-' + i : ''}`, ability: 'smash', x: c.tx, y: c.ty, look: 'crack' }));
    const { n, dir } = exitOf(site, ox, oy, pw, ph);
    const end: [number, number] = [n[0] + dir[0] * 6, n[1] + dir[1] * 6];
    d.paths.push({ w: 3, pts: [[n[0] + 0.5, n[1] + 0.5], [end[0] + 0.5, end[1] + 0.5]] });
    const arrive: [number, number] = [n[0] + dir[0] * 3, n[1] + dir[1] * 3];
    const back: PortalDef = { id: `back-${l.id}`, name: '', x: end[0], y: end[1], to: p.from, toX: 0, toY: 0 };
    d.portals!.push(back);
    pockets.push({ key: l.id, plane: p.id, arrive, back });
    sites.set(l.id, { site, region: p.id });
    void old;
    ox += pw;
  }
  d.spawn = { x: pockets.find((k) => k.plane === p.id)!.arrive[0], y: pockets.find((k) => k.plane === p.id)!.arrive[1] };
  regions.set(p.id, d);
}
PLANES.forEach(buildPlane);
// existing planes: their single way back
for (const f of FIXED) {
  const d = regions.get(f.plane)!;
  const back = d.portals![0];
  pockets.push({ key: f.key, plane: f.plane, arrive: [d.spawn.x, d.spawn.y], back });
}

// ── 3. the hidden entrances on the overworld ──
function points(d: RegionDef): [number, number, number][] {
  const p: [number, number, number][] = [];
  const add = (x: number, y: number, r = 1) => p.push([x, y, r]);
  d.npcs.forEach((o) => add(o.x, o.y, 2)); d.trainers.forEach((o) => add(o.x, o.y, 3)); d.chests.forEach((o) => add(o.x, o.y));
  d.waypoints.forEach((o) => add(o.x, o.y, 2)); d.signs.forEach((o) => add(o.x, o.y)); d.props.forEach((o) => add(o.x, o.y));
  (d.portals ?? []).forEach((o) => add(o.x, o.y, 3)); d.dungeons.forEach((o) => add(o.x, o.y, 3)); (d.nodes ?? []).forEach((o) => add(o.x, o.y, 2));
  (d.field ?? []).forEach((o) => { add(o.x, o.y, 2); if (o.nook) add(o.nook.cx, o.nook.cy, o.nook.r + 2); for (const q of nookRing(o)) add(Math.floor(q.x), Math.floor(q.y)); });
  (d.docks ?? []).forEach((o) => add(o.x, o.y, 2)); d.pillars.forEach(([x, y]) => add(x, y));
  for (const b of d.buildings) add(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2 + 2);
  if (d.worldBoss) add(d.worldBoss.x, d.worldBoss.y, 11);
  if (d.rescue.x >= 0) add(d.rescue.x, d.rescue.y, 6);
  for (const pz of d.puzzles) pz.plates.forEach(([x, y]) => add(x, y, 2));
  for (const l of d.legendaries ?? []) add(l.x, l.y, 10);
  for (const [x, y] of [[d.spawn.x, d.spawn.y]]) add(x, y, 4);
  return p;
}
function reachOf(m: ValleyMap, d: RegionDef): Set<string> {
  const b = new Set<string>();
  for (const f of d.field ?? []) b.add(`${f.x},${f.y}`);
  for (let cy = 0; cy < Math.ceil(m.heightTiles / m.chunk); cy++) for (let cx = 0; cx < Math.ceil(m.widthTiles / m.chunk); cx++)
    for (const o of m.objectsInChunk(cx, cy)) if (o.collideR || o.kind === 'tree' || o.kind === 'boulder') b.add(`${Math.floor(o.x)},${Math.floor(o.y)}`);
  const sp = d.spawn, seen = new Set([`${sp.x},${sp.y}`]), q = [[sp.x, sp.y]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || m.solidAt(nx, ny) || b.has(k) || m.terrainAt(nx, ny) === T.Water || m.terrainAt(nx, ny) === T.Lava) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

const entranceKeys: { key: string; from: string; target: [number, number]; requires: string[]; hint?: string }[] = [];
for (const p of PLANES) for (const id of p.sites) {
  const old = oldSecrets.get(`to-${id}`), s = sites.get(id)!;
  // first run: the shrine's old spot on the overworld (read before it was moved)
  const prev = REGION_DEFS[p.from].legendaries?.find((l) => l.id === id);
  const target: [number, number] = old ? [old.stand?.[0] ?? old.x, old.stand?.[1] ?? old.y] : prev ? [prev.x, prev.y] : [Math.floor(REGION_DEFS[p.from].width / 2), Math.floor(REGION_DEFS[p.from].height / 2)];
  entranceKeys.push({ key: id, from: p.from, target, requires: s.site.requires, hint: s.site.hint });
}
for (const f of FIXED) {
  const old = oldSecrets.get(`to-${f.key}`), g = gates.get(f.old) ?? REGION_DEFS[f.from].legendaries?.find((l) => l.id === f.old);
  const target: [number, number] = old ? [old.stand?.[0] ?? old.x, old.stand?.[1] ?? old.y] : [g!.x, g!.y];
  entranceKeys.push({ key: f.key, from: f.from, target, requires: g?.requires ?? [], hint: g?.hint });
}

const clueData = read('legend-clues.json') as { legend: string; clues: { id: string; region: string; x: number; y: number; text: string }[] }[];
const report: string[] = [];
for (const over of OVER) {
  const d = regions.get(over)!;
  // field obstacles of the entrances go in first so the map knows them; positions are found one by one
  const mine = entranceKeys.filter((e) => e.from === over);
  for (const e of mine) {
    const en = ENTRANCES[e.key];
    const m = new ValleyMap(d), reach = reachOf(m, d), pts = points(d);
    const water = (x: number, y: number) => m.terrainAt(x, y) === T.Water;
    const free = (x: number, y: number) => reach.has(`${x},${y}`) && pts.every(([px, py, r]) => Math.hypot(px - x, py - y) > r + 1.5);
    const others = (d.secrets ?? []).map((s) => [s.x, s.y]);
    let best: { x: number; y: number; stand: [number, number] } | null = null, bestScore = Infinity;
    for (let dy = -30; dy <= 30; dy++) for (let dx = -30; dx <= 30; dx++) {
      const x = e.target[0] + dx, y = e.target[1] + dy;
      if (x < 4 || y < 4 || x >= d.width - 4 || y >= d.height - 4) continue;
      if (others.some(([ox, oy]) => Math.hypot(ox - x, oy - y) < 8)) continue;
      let stand: [number, number];
      if (en.look === 'whirlpool') {
        if (!water(x, y) || !N8.every(([ax, ay]) => water(x + ax, y + ay) || reach.has(`${x + ax},${y + ay}`))) continue;
        const s = N4.map(([ax, ay]) => [x + ax, y + ay] as [number, number]).find(([sx, sy]) => free(sx, sy) && free(sx, sy + 1));
        if (!s || N8.filter(([ax, ay]) => water(x + ax, y + ay)).length < 5) continue;
        stand = s;
      } else {
        if (!free(x, y) || !N8.every(([ax, ay]) => free(x + ax, y + ay)) || !free(x, y + 2)) continue;
        stand = [x, y];
      }
      const t = m.terrainAt(x, y);
      // off the beaten track: a secret is not on a road
      const score = Math.hypot(dx, dy) + (t === T.Path || t === T.Plaza || t === T.Bridge ? 12 : 0);
      if (score < bestScore) { bestScore = score; best = { x, y, stand }; }
    }
    if (!best) throw new Error(`${over}: no spot for the entrance to ${e.key}`);
    const pocket = pockets.find((k) => k.key === e.key)!;
    const fieldId = `secret-${e.key}`;
    const back: [number, number] = en.look === 'whirlpool' ? best.stand : [best.x, best.y + 2];
    const sec: SecretDef = {
      id: `to-${e.key}`, name: en.name, x: best.x, y: best.y, ...(en.look === 'whirlpool' ? { stand: best.stand } : {}),
      to: pocket.plane, toX: pocket.arrive[0], toY: pocket.arrive[1], look: en.look,
      reveal: en.reveal === 'clues' ? { clues: e.key === 'origin' ? 'arceus' : e.key } : { field: fieldId },
      requires: en.requires ?? e.requires.filter((f) => !f.startsWith('roam:')), ...(en.weather ? { weather: en.weather } : {}),
      hint: en.hint ?? e.hint, color: en.color,
    };
    d.secrets!.push(sec);
    if (en.reveal !== 'clues') d.field!.push({ id: fieldId, ability: en.reveal, x: best.x, y: best.y } as FieldDef);
    pocket.back.name = `Trở về ${d.name}`;
    pocket.back.to = over;
    pocket.back.toX = back[0];
    pocket.back.toY = back[1];
    report.push(`${over}: ${sec.id} (${en.reveal}) at ${best.x},${best.y} [target ${e.target}] → ${pocket.plane}`);
  }
  // clues on this map that now stand where nobody can read them (a shrine island turned back into sea…)
  const m = new ValleyMap(d), reach = reachOf(m, d), pts = points(d);
  for (const c of clueData.flatMap((x) => x.clues)) {
    if (c.region !== over || reach.has(`${c.x},${c.y}`)) continue;
    let best: [number, number] | null = null, bd = Infinity;
    for (const k of reach) {
      const [x, y] = k.split(',').map(Number);
      const dd = Math.hypot(x - c.x, y - c.y);
      if (dd < bd && m.terrainAt(x, y) !== T.Path && pts.every(([px, py, r]) => Math.hypot(px - x, py - y) > r) && !clueData.some((q) => q.clues.some((o) => o.region === over && o.x === x && o.y === y))) { bd = dd; best = [x, y]; }
    }
    report.push(`clue ${c.id}: ${c.x},${c.y} → ${best}`);
    [c.x, c.y] = best!;
  }
}
// the rituals of the old gates go; the planes' gates are the secrets now
const rituals = read('rituals.json') as { shrine: string }[];
write('rituals.json', rituals.filter((r) => !FIXED.some((f) => f.old === r.shrine)));

// ── 4. write everything ──
const files = (id: string) => (['ca-mau', 'an-giang', 'can-tho'].includes(id) ? `../vietnam/${id}.json` : `${id}.json`);
for (const id of [...OVER, ...PLANES.map((p) => p.id), ...FIXED.map((f) => f.plane)]) write(files(id), regions.get(id));
write('legend-clues.json', clueData);
const legends = read('legends.json') as { id: string; site?: { x: number; y: number; region?: string } }[];
for (const l of legends) {
  const s = sites.get(l.id);
  if (l.site && s) l.site = { x: s.site.x, y: s.site.y, region: s.region };
}
write('legends.json', legends);
console.log(report.join('\n'));
