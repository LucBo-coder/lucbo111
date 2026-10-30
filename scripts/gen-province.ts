// Turns a province story spec (scripts/provinces/<id>.ts) + its authored map (src/data/vietnam/<id>.json) into game
// data: passport page, encounter regions, boss, reputation, quests (markers placed from the map), conservation sites,
// the gate on the previous province's map, the "what's new" entry and the map's import in regionDefs.ts.
// Usage: npx tsx scripts/gen-province.ts <id> [<id> …]   (idempotent: running it again replaces the province's data)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { ValleyMap, type RegionDef } from '../src/core/map/valley';
import type { ProvinceSpec, QuestSpec } from './provinces/types';

const VN = 'src/data/vietnam/';
// files keep their line endings (some are CRLF); the generator works on LF text
const eol = new Map<string, string>();
const read = (f: string) => { const t = readFileSync(f, 'utf8'); eol.set(f, t.includes('\r\n') ? '\r\n' : '\n'); return t.replace(/\r\n/g, '\n'); };
const write = (f: string, t: string) => writeFileSync(f, eol.get(f) === '\r\n' ? t.replace(/\r?\n/g, '\r\n') : t);
const json = <T>(f: string): T => JSON.parse(read(f)) as T;
const camel = (id: string) => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

interface Passport { id: string; name: string; need: string[]; hint: string; questPrefix: string; badge: { flag: string; name: string } | null; landmarks: { flag: string; name: string }[] }

function reachable(m: ValleyMap, d: RegionDef): Set<number> {
  const W = m.widthTiles, seen = new Set([d.spawn.y * W + d.spawn.x]), q = [[d.spawn.x, d.spawn.y]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= m.heightTiles || seen.has(k) || m.solidAt(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

async function gen(id: string): Promise<void> {
  const spec = (await import(`./provinces/${id}.ts`)).default as ProvinceSpec;
  const mapFile = `${VN}${id}.json`;
  const d = json<RegionDef>(mapFile);
  const m = new ValleyMap(d), land = reachable(m, d), W = m.widthTiles;
  const pre = `vn-${spec.prefix}-`;
  const errors: string[] = [];

  // --- regionDefs.ts: import the map
  let rd = read('src/core/map/regionDefs.ts');
  const imp = `${camel(id)}Json`;
  if (!rd.includes(`/vietnam/${id}.json'`)) {
    rd = rd.replace(/(import \w+ from '\.\.\/\.\.\/data\/vietnam\/[\w-]+\.json';\n)(?!import \w+ from '\.\.\/\.\.\/data\/vietnam)/, `$1import ${imp} from '../../data/vietnam/${id}.json';\n`);
    rd = rd.replace(/(  '[\w-]+': \w+Json as unknown as RegionDef,\n)(\};)/, `$1  '${id}': ${imp} as unknown as RegionDef,\n$2`);
    write('src/core/map/regionDefs.ts', rd);
  }
  // conservation sites first (the eco quest points at the first one); provinces already placed keep theirs
  execSync('npx tsx scripts/gen-conservation.ts', { stdio: 'inherit' });
  const ecoSite = (json<{ provinces: Record<string, { sites: { x: number; y: number }[] }> }>(`${VN}conservation.json`)).provinces[id]?.sites[0];
  if (!ecoSite) errors.push('no conservation sites');

  // --- passport page, right after the previous province
  const pass = json<Passport[]>(`${VN}provinces.json`).filter((p) => p.id !== id);
  const prev = pass.find((p) => p.id === spec.prev.id);
  if (!prev?.badge) throw new Error(`${id}: previous province ${spec.prev.id} has no passport page / badge`);
  pass.splice(pass.indexOf(prev) + 1, 0, {
    id, name: spec.name, need: [prev.badge.flag], hint: `Cần ${prev.badge.name} (${prev.name})`, questPrefix: pre,
    badge: { flag: `badge:${id}`, name: spec.badge }, landmarks: spec.landmarks.map(([flag, name]) => ({ flag, name })),
  });
  write(`${VN}provinces.json`, '[\n' + pass.map((p) => ' ' + JSON.stringify(p)).join(',\n') + '\n]\n');

  // --- encounter regions (one per wild area)
  const regions = json<Record<string, unknown>[]>('src/data/world/regions.json').filter((r) => !String(r.id).startsWith(pre));
  for (const [area, biome] of Object.entries(spec.biomes)) {
    const a = d.areas.find((x) => x.id === area);
    if (!a) { errors.push(`biome of unknown area ${area}`); continue; }
    const [lo, hi] = a.level;
    regions.push({ id: `vn-${area}`, name: a.name, areas: [area], biome, level: [lo, hi], elite: [hi + 1, hi + 3], boss: null,
      recommended: Math.round((lo + hi) / 2), danger: Math.min(5, 3 + Math.floor((hi - lo) / 3)), unlock: null, ...(spec.noIce === false && biome === 'snow' ? {} : { excludeTypes: ['ice'] }) });
  }
  write('src/data/world/regions.json', JSON.stringify(regions, null, 1) + '\n');

  // --- boss
  const b = spec.boss;
  const bosses = json<Record<string, unknown>[]>('src/data/bosses.json').filter((x) => x.id !== b.id);
  bosses.push({
    id: b.id, name: b.name, types: b.types, baseStats: b.baseStats, hpMult: b.hpMult ?? 40, moveSpeed: 70, radius: 32, contactPower: 40, segments: 0,
    skills: b.skills, phase2Threshold: 0.5, phase2Summon: { enemy: b.summon, count: 2 }, phase3Threshold: 0.25, phase3Banner: b.banner,
    exp: 150, sprite: b.id, ai: 'legendary', scale: 3.2, survivor: false, capture: false,
    legend: { beam: b.legend.beam, volley: b.legend.volley, nova: b.legend.nova, field: b.legend.field,
      fieldStatus: b.legend.fieldStatus ?? { kind: 'slow', chance: 0.5, duration: 2, magnitude: 0.3 },
      ultimate: b.legend.ultimate, ultimateName: b.legend.ultimateName, ultimateStyle: b.legend.ultimateStyle, power: 0.33 },
  });
  write('src/data/bosses.json', JSON.stringify(bosses, null, 1) + '\n');
  if (d.worldBoss?.id !== b.id) errors.push(`map boss ${d.worldBoss?.id} ≠ spec boss ${b.id}`);
  if (d.worldBoss?.rewards?.flag !== `badge:${id}`) errors.push(`boss reward flag must be badge:${id}`);

  // --- reputation (hand-formatted file: replace / insert the province's block as text)
  let rep = read('src/data/world/reputation.json');
  const g = spec.rep.greet;
  const block = `    "${id}": {\n      "name": "${spec.name}",\n      "rewards": ${JSON.stringify(spec.rep.rewards).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/\{"/g, '{ "').replace(/\}/g, ' }')},\n      "greet": {\n${g.map((s, i) => `        "${i}": ${JSON.stringify(s)}`).join(',\n')}\n      }\n    },\n`;
  const old = new RegExp(`    "${id}": \\{\\n[\\s\\S]*?\\n    \\},\\n`);
  rep = old.test(rep) ? rep.replace(old, block) : rep.replace('    "starter-valley": {', block + '    "starter-valley": {');
  JSON.parse(rep);
  write('src/data/world/reputation.json', rep);

  // --- quests (markers from the map)
  const people = [...d.npcs, ...d.trainers] as { id: string; x: number; y: number }[];
  const areaSpot = (area: string) => {
    const a = d.areas.find((x) => x.id === area);
    if (!a) { errors.push(`unknown area ${area}`); return { x: 0, y: 0 }; }
    const [x0, y0, x1, y1] = a.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let best = { x: Math.round(cx), y: Math.round(cy) }, bd = Infinity;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!land.has(y * W + x)) continue;
      const dd = Math.hypot(x - cx, y - cy);
      if (dd < bd) { bd = dd; best = { x, y }; }
    }
    return best;
  };
  const marker = (type: string, target: string): { x: number; y: number } | null => {
    const at = (o: { x: number; y: number } | undefined, what: string) => { if (!o) errors.push(`${type} target ${target} (${what}) not on the map`); return o ? { x: o.x, y: o.y } : null; };
    switch (type) {
      case 'talk': return at(people.find((p) => p.id === target), 'npc');
      case 'trainer': return at(d.trainers.find((p) => p.id === target), 'trainer');
      case 'explore': return areaSpot(target);
      case 'activate': return target.startsWith('eco:') ? (ecoSite ? { x: ecoSite.x, y: ecoSite.y } : null) : at(d.waypoints.find((w) => w.id === target), 'waypoint');
      case 'boss': return at(d.worldBoss?.id === target ? d.worldBoss : undefined, 'boss');
      case 'rescue': return at(d.rescue?.id === target ? d.rescue : undefined, 'rescue');
      default: return null;
    }
  };
  const quest = (q: QuestSpec, i: number) => {
    if (!people.some((p) => p.id === q.giver)) errors.push(`quest ${q.id}: giver ${q.giver} not on the map`);
    return {
      id: pre + q.id, kind: q.kind, title: q.title, giver: q.giver,
      ...(i === 0 ? { autoStart: true, requiresFlags: [prev.badge!.flag] } : {}),
      ...(q.req?.length ? { requires: q.req.map((r) => pre + r) } : {}),
      description: q.description,
      objectives: q.obj.map(([type, target, text, count]) => {
        const mk = marker(type, target);
        return { type, target, count: count ?? 1, text, ...(mk ? { marker: { ...mk, region: id } } : {}) };
      }),
      rewards: { items: q.items, worldExp: q.exp, reputation: q.rep, ...(q.flags?.length ? { flags: q.flags } : {}) },
      dialogue: { offer: q.offer, ...(q.progress ? { progress: q.progress } : {}), complete: q.complete },
    };
  };
  const quests = json<{ id: string }[]>(`${VN}quests.json`).filter((q) => !q.id.startsWith(pre));
  const after = quests.map((q) => q.id).lastIndexOf(quests.filter((q) => q.id.startsWith(prev.questPrefix)).pop()?.id ?? '');
  quests.splice(after < 0 ? quests.length : after + 1, 0, ...spec.quests.map(quest));
  write(`${VN}quests.json`, JSON.stringify(quests, null, 1) + '\n');

  // --- the gate on the previous province's map (one JSON line per portal) and its boss message
  const prevFile = `${VN}${spec.prev.id}.json`;
  let pm = read(prevFile);
  const P = spec.prev.portal;
  const line = `  ${JSON.stringify({ id: P.id, name: P.name, x: P.x, y: P.y, to: id, toX: spec.entry.x, toY: spec.entry.y, requires: [prev.badge.flag], hint: `Đường tới ${spec.name} mở cho người có ${prev.badge.name} — hạ boss ${prev.name} trước.` }).replace(/,"/g, ', "').replace(/":/g, '": ')}`;
  const lineRe = new RegExp(`^ *\\{ ?"id": ?"${P.id}"[^\\n]*$`, 'm');
  if (lineRe.test(pm)) pm = pm.replace(lineRe, line.replace(/,$/, '') + (pm.match(lineRe)![0].trimEnd().endsWith(',') ? ',' : ''));
  else pm = pm.replace(/("portals": \[\n)/, `$1${line},\n`);
  pm = pm.replace(/("message": ")[^"]*(")/, `$1Nhận ${prev.badge.name} (${prev.name})! Đường tới ${spec.name} đã mở: ${P.name.replace(/ — .*/, '')}.$2`);
  JSON.parse(pm);
  write(prevFile, pm);
  const pd = JSON.parse(pm) as RegionDef;
  if (new ValleyMap(pd).solidAt(P.x, P.y)) errors.push(`gate ${P.id} on ${spec.prev.id} stands on solid ground`);
  if (m.solidAt(spec.entry.x, spec.entry.y)) errors.push(`landing ${spec.entry.x},${spec.entry.y} is solid`);

  // --- what's new
  const news = json<{ id: string }[]>('src/data/whatsnew.json').filter((n) => n.id !== `vn-${id}`);
  news.unshift({ id: `vn-${id}`, ...spec.news });
  write('src/data/whatsnew.json', JSON.stringify(news, null, 2) + '\n');

  if (errors.length) throw new Error(`${id}:\n  ${errors.join('\n  ')}`);
  console.log(`${id}: ${spec.quests.length} quests, ${Object.keys(spec.biomes).length} encounter regions, boss ${b.id}`);
}

const ids = process.argv.slice(2);
if (!ids.length) { console.error('usage: npx tsx scripts/gen-province.ts <id> [<id> …]'); process.exit(1); }
for (const id of ids) await gen(id);
