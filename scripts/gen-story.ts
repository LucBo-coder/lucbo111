// Generates src/data/story/{vietnam,classic}.json from scripts/story/*.ts: resolves every anchor ("near this NPC /
// waypoint / area / boss arena") to a free walkable tile of the real map, fills the objective markers, and checks
// species / items / ids. Run: npx tsx scripts/gen-story.ts
import { writeFileSync } from 'node:fs';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap, type RegionDef } from '../src/core/map/valley';
import { POKEMON } from '../src/core/data';
import { isAquatic } from '../src/core/encounters';
import { ITEMS } from '../src/adventure/AdventureState';
import { validateStory, type StoryDef, type StoryNpc, type StoryTrainer, type EncounterDef } from '../src/core/story';
import type { ObjectiveDef, QuestDef } from '../src/core/quests';
import type { Spot, StoryIn } from './story/lib';
import { vietnam } from './story/vietnam';
import { stageFor } from './story/stage';
import { classic } from './story/classic';
import provincesJson from '../src/data/vietnam/provinces.json';

const STORY_ID = /^(mn|ck)-/;
const errors: string[] = [];

/** The map without any story NPC / trainer (the output of an earlier run) */
function baseDef(region: string): RegionDef {
  const d = REGION_DEFS[region];
  if (!d) throw new Error(`unknown region ${region}`);
  return { ...d, npcs: d.npcs.filter((n) => !STORY_ID.test(n.id)), trainers: d.trainers.filter((t) => !STORY_ID.test(t.id)) };
}

interface MapInfo { def: RegionDef; map: ValleyMap; busy: Set<string>; reach: Set<string> }
const maps = new Map<string, MapInfo>();
const key = (x: number, y: number) => `${x},${y}`;

function info(region: string): MapInfo {
  let m = maps.get(region);
  if (m) return m;
  const def = baseDef(region);
  const map = new ValleyMap(def);
  // tiles taken by things other than trees (people, houses, signs, chests…) and a ring around them
  const busy = new Set<string>();
  const cols = Math.ceil(map.widthTiles / map.chunk), rows = Math.ceil(map.heightTiles / map.chunk);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) for (const o of map.objectsInChunk(cx, cy)) {
    if (o.kind === 'tree' || o.kind === 'boulder') { busy.add(key(o.x, o.y)); continue; }
    const w = o.w ?? 1, h = o.h ?? 1, ring = o.kind === 'npc' || o.kind === 'trainer' ? 2 : 1;
    for (let y = o.y - ring; y < o.y + h + ring; y++) for (let x = o.x - ring; x < o.x + w + ring; x++) busy.add(key(x, y));
  }
  // land reachable on foot from the first waypoint (trees are walked around)
  const reach = new Set<string>();
  const start = def.waypoints[0];
  const q: [number, number][] = start ? [[start.x, start.y + 1]] : [];
  while (q.length) {
    const [x, y] = q.pop()!;
    const k = key(x, y);
    if (reach.has(k) || map.solidAt(x, y)) continue;
    reach.add(k);
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  m = { def, map, busy, reach };
  maps.set(region, m);
  return m;
}

const placed = new Map<string, { region: string; x: number; y: number }>();

/** Raw position of an anchor (before looking for a free tile) and, for areas, the tiles that belong to it. */
function anchor(s: Spot): { x: number; y: number; area?: string } {
  const { def, map } = info(s.region);
  const [kind, rest] = [s.at.slice(0, s.at.indexOf(':') < 0 ? s.at.length : s.at.indexOf(':')), s.at.slice(s.at.indexOf(':') + 1)];
  const off = (p: { x: number; y: number }) => ({ x: Math.round(p.x + (s.dx ?? 0)), y: Math.round(p.y + (s.dy ?? 0)) });
  switch (kind) {
    case 'wp': { const w = def.waypoints.find((w) => w.id === rest); if (!w) throw new Error(`${s.region}: no waypoint ${rest}`); return off(w); }
    case 'npc': {
      const n = placed.get(rest) ?? def.npcs.find((n) => n.id === rest);
      if (!n) throw new Error(`${s.region}: no npc ${rest}`);
      return off(n);
    }
    case 'trainer': { const t = def.trainers.find((t) => t.id === rest); if (!t) throw new Error(`${s.region}: no trainer ${rest}`); return off(t); }
    case 'boss': { const b = def.worldBoss; if (!b) throw new Error(`${s.region}: no world boss`); return off(b); }
    case 'xy': { const [x, y] = rest.split(',').map(Number); return off({ x, y }); }
    case 'area': {
      // centroid of the walkable tiles that really belong to the area (areas overlap: the first listed wins)
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < map.heightTiles; y++) for (let x = 0; x < map.widthTiles; x++) {
        if (map.areaAt(x, y)?.id !== rest || map.solidAt(x, y)) continue;
        sx += x; sy += y; n++;
      }
      if (!n) throw new Error(`${s.region}: no area ${rest}`);
      return { ...off({ x: sx / n, y: sy / n }), area: rest };
    }
  }
  throw new Error(`bad anchor ${s.at}`);
}

/** Nearest good tile to an anchor: walkable, reachable, free; `open` = radius that should be mostly walkable. */
function resolve(s: Spot, open = 1, what = '', reserve = true): { x: number; y: number } {
  const { map, busy, reach } = info(s.region);
  const a = anchor(s);
  let best: { x: number; y: number; score: number } | null = null;
  for (let r = 0; r <= 26 && !(best && best.score < r); r++) {
    for (let y = a.y - r; y <= a.y + r; y++) for (let x = a.x - r; x <= a.x + r; x++) {
      if (Math.max(Math.abs(x - a.x), Math.abs(y - a.y)) !== r) continue;
      if (map.solidAt(x, y) || busy.has(key(x, y))) continue;
      if (a.area && map.areaAt(x, y)?.id !== a.area) continue;
      let blocked = 0, total = 0;
      for (let oy = -open; oy <= open; oy++) for (let ox = -open; ox <= open; ox++) {
        if (ox * ox + oy * oy > open * open) continue;
        total++;
        if (map.solidAt(x + ox, y + oy) || (open <= 1 && busy.has(key(x + ox, y + oy)) && (ox || oy))) blocked++;
      }
      if (blocked / total > (open > 1 ? 0.25 : 0)) continue;
      // islands (reached by boat) are fine, but land reachable on foot is preferred
      const score = Math.hypot(x - a.x, y - a.y) + blocked + (reach.has(key(x, y)) ? 0 : 40);
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  if (!best) throw new Error(`${what}: no free tile near ${s.region} ${s.at}`);
  if (!reach.has(key(best.x, best.y))) console.log(`note: ${what} (${s.region} ${s.at}) is off the walking network (boat / island)`);
  // later placements keep clear of this one
  const m = info(s.region);
  if (reserve) for (let y = best.y - 2; y <= best.y + 2; y++) for (let x = best.x - 2; x <= best.x + 2; x++) m.busy.add(key(x, y));
  return { x: best.x, y: best.y };
}

function build(src: StoryIn, regions: string[]): StoryDef & { npcs: StoryNpc[]; trainers: StoryTrainer[] } {
  placed.clear();
  const npcs: StoryNpc[] = src.npcs.map((n) => {
    const p = resolve(n.at, 1, n.id);
    placed.set(n.id, { region: n.at.region, ...p });
    return { region: n.at.region, id: n.id, name: n.name, sprite: n.sprite, ...(n.look ? { look: n.look } : {}), x: p.x, y: p.y, lines: n.lines,
      ...(n.showIf ? { showIf: n.showIf } : {}), ...(n.hideIf ? { hideIf: n.hideIf } : {}) };
  });
  const trainers: StoryTrainer[] = src.trainers.map((t) => {
    const p = resolve(t.at, 1, t.id);
    placed.set(t.id, { region: t.at.region, ...p });
    for (const [sp] of t.team) if (!POKEMON.has(sp) || isAquatic(sp)) errors.push(`${t.id}: unknown or aquatic species ${sp}`);
    return { region: t.at.region, id: t.id, name: t.name, sprite: t.sprite, ...(t.look ? { look: t.look } : {}), x: p.x, y: p.y, team: t.team.map(([sp, lv]) => [stageFor(sp, lv), lv] as [string, number]),
      challenge: t.challenge, win: t.win, lose: t.lose, rewards: t.rewards, ...(t.showIf ? { showIf: t.showIf } : {}), ...(t.hideIf ? { hideIf: t.hideIf } : {}) };
  });

  /** where an NPC / trainer / area / boss of the campaign is (story ones first) */
  const findTarget = (type: string, target: string, prefer: string): { x: number; y: number; region: string } | null => {
    const order = [prefer, ...regions.filter((r) => r !== prefer)];
    if (type === 'talk' || type === 'choose' || type === 'trainer') {
      const p = placed.get(target);
      if (p) return p;
      for (const r of order) {
        const d = info(r).def;
        const n = [...d.npcs, ...d.trainers].find((n) => n.id === target);
        if (n) return { x: n.x, y: n.y, region: r };
      }
    }
    if (type === 'explore') {
      for (const r of order) if (info(r).def.areas.some((a) => a.id === target)) { const p = resolve({ region: r, at: `area:${target}` }, 1, target, false); return { ...p, region: r }; }
    }
    if (type === 'boss') {
      for (const r of order) { const b = info(r).def.worldBoss; if (b?.id === target) return { x: b.x, y: b.y, region: r }; }
    }
    return null;
  };

  const quests: QuestDef[] = src.quests.map((q) => {
    const objectives: ObjectiveDef[] = q.objectives.map((o) => {
      const { encounter, marker, count, ...rest } = o;
      const out: ObjectiveDef = { ...rest, count: count ?? 1 };
      if (encounter) {
        const p = resolve(encounter.at, encounter.kind === 'escort' ? 1 : Math.min(3, encounter.radius ?? 4), `${q.id} ${o.type}`);
        const e: EncounterDef = { kind: encounter.kind, x: p.x, y: p.y, region: encounter.at.region };
        if (encounter.radius) e.radius = encounter.radius;
        if (encounter.seconds) e.seconds = encounter.seconds;
        if (encounter.secondsIf) e.secondsIf = encounter.secondsIf;
        if (encounter.ally) { e.ally = encounter.ally; if (!POKEMON.has(encounter.ally.species)) errors.push(`${q.id}: unknown ally species ${encounter.ally.species}`); }
        if (encounter.waves) { e.waves = encounter.waves.map((w) => w.map(([sp, lv]) => [stageFor(sp, lv), lv] as [string, number])); for (const w of encounter.waves) for (const [sp] of w) if (!POKEMON.has(sp) || isAquatic(sp)) errors.push(`${q.id}: unknown or aquatic (fights on land) species ${sp}`); }
        if (encounter.every) e.every = encounter.every;
        if (encounter.device) { e.device = encounter.device; if (!POKEMON.has(encounter.device.species)) errors.push(`${q.id}: unknown device species ${encounter.device.species}`); }
        if (encounter.npc) {
          const f = resolve(encounter.npc.from, 1, `${q.id} escort`);
          e.npc = { name: encounter.npc.name, ...(encounter.npc.sprite ? { sprite: encounter.npc.sprite } : {}), ...(encounter.npc.look ? { look: encounter.npc.look } : {}), fromX: f.x, fromY: f.y };
          if (Math.hypot(f.x - p.x, f.y - p.y) < 12) errors.push(`${q.id}: escort too short`);
        }
        out.encounter = e;
        out.marker = e.npc ? { x: e.npc.fromX, y: e.npc.fromY, region: e.region } : { x: p.x, y: p.y, region: e.region };
      } else if (marker) {
        const p = resolve(marker, 0, `${q.id} marker`, false);
        out.marker = { x: p.x, y: p.y, region: marker.region };
      } else if (marker !== false && o.target) {
        const p = findTarget(o.type, o.target, q.region);
        if (p) out.marker = { x: p.x, y: p.y, region: p.region };
        else if (['talk', 'choose', 'trainer', 'explore', 'boss'].includes(o.type)) errors.push(`${q.id}: cannot place ${o.type}:${o.target}`);
      }
      return out;
    });
    const { region: _r, ...rest } = q;
    void _r;
    for (const [it] of Object.entries({ ...(q.rewards.items ?? {}), ...Object.assign({}, ...(q.objectives.flatMap((o) => o.options ?? []).map((op) => op.rewards?.items ?? {}))) })) if (!ITEMS[it]) errors.push(`${q.id}: unknown item ${it}`);
    return { ...rest, objectives } as QuestDef;
  });
  for (const t of src.trainers) for (const it of Object.keys(t.rewards.items ?? {})) if (!ITEMS[it]) errors.push(`${t.id}: unknown item ${it}`);

  const story: StoryDef = { id: src.id, campaign: src.campaign, title: src.title, premise: src.premise, characters: src.characters, chapters: src.chapters, cutscenes: src.cutscenes, quests, npcs, trainers };
  errors.push(...validateStory(story).map((e) => `${src.id}: ${e}`));
  // every story person must stand on a free tile of the final map (with all story people added)
  for (const r of regions) {
    const extra = { n: npcs.filter((n) => n.region === r), t: trainers.filter((t) => t.region === r) };
    if (!extra.n.length && !extra.t.length) continue;
    const d = baseDef(r);
    const full = new ValleyMap({ ...d, npcs: [...d.npcs, ...extra.n], trainers: [...d.trainers, ...extra.t] } as RegionDef);
    for (const p of [...extra.n, ...extra.t]) if (full.solidAt(p.x, p.y)) errors.push(`${p.id}: solid tile ${r} ${p.x},${p.y}`);
  }
  return story;
}

const vnRegions = (provincesJson as { id: string }[]).map((p) => p.id).filter((r) => REGION_DEFS[r]);
const ckRegions = ['starter-valley', 'emerald-woods', 'misty-swamp', 'coral-coast', 'frozen-mountains', 'volcanic-lands', 'legendary-sanctuary'];

const out = { vietnam: build(vietnam, vnRegions), classic: build(classic, ckRegions) };
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
for (const [name, s] of Object.entries(out)) {
  writeFileSync(`src/data/story/${name}.json`, JSON.stringify(s, null, 1) + '\n');
  console.log(`${name}: ${s.quests.length} quests, ${s.cutscenes.length} cutscenes, ${s.npcs.length} NPCs, ${s.trainers.length} trainers`);
}
