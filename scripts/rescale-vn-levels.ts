// Việt Nam Odyssey level bands (V30, spec of T29-4): provinces 1–7 Lv 1–25 · 8–15 Lv 25–45 · 16–24 Lv 45–65 ·
// 25–32 Lv 65–85 · 33–36 Lv 85–100. Each province's guardian gets its target level (BOSS_LEVEL); every level of the
// province map moves by the same amount (areas, trainers, the rescue and its guards, the guardian), so the spread
// inside a province stays as authored. A trainer's Pokémon that falls under its evolution stage goes back to the
// earlier form. The encounter regions (data/world/regions.json) follow their areas.
// Idempotent: the shift is target − current guardian level. Run: npx tsx scripts/rescale-vn-levels.ts
// The story (scripts/story/vietnam.ts ROUTE) reads the same table; regenerate it after: npx tsx scripts/gen-story.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { BOSS_LEVEL } from './story/levels';
import { stageFor } from './story/stage';

const read = (f: string) => readFileSync(f, 'utf8');
const crlf = (t: string) => t.includes(String.fromCharCode(13, 10));

const clamp = (v: number) => Math.max(2, Math.min(100, v));

const changed: string[] = [];
const areasOf = new Map<string, [number, number]>();
for (const [p, target] of Object.entries(BOSS_LEVEL)) {
  const f = `src/data/vietnam/${p}.json`;
  const raw = read(f);
  const d = JSON.parse(raw) as { worldBoss: { level: number }; areas: { id: string; level: [number, number] }[] };
  const shift = target - d.worldBoss.level;
  if (shift !== 0) {
    let t = raw;
    // every "level" of the province map: [lo, hi] ranges (areas) and single values (rescue, guardian)
    t = t.replace(/"level": \[(\s*)(\d+),(\s*)(\d+)(\s*)\]/g, (_, w1, a, w2, b, w3) => `"level": [${w1}${clamp(+a + shift)},${w2}${clamp(+b + shift)}${w3}]`);
    t = t.replace(/"level": (\d+)/g, (_, a) => `"level": ${clamp(+a + shift)}`);
    // team / guard entries ["species", level]
    // (inline or one value per line; the layout is kept)
    t = t.replace(/\[(\s*)"([a-z0-9-]+)",(\s*)(\d+)(\s*)\]/g, (_, w1, sp, w2, lv, w3) => { const n = clamp(+lv + shift); return `[${w1}"${stageFor(sp, n)}",${w2}${n}${w3}]`; });
    JSON.parse(t);
    writeFileSync(f, t);
    changed.push(`${p}: ${d.worldBoss.level} → ${target} (${shift > 0 ? '+' : ''}${shift})`);
  }
  for (const a of (JSON.parse(read(f)) as typeof d).areas) areasOf.set(a.id, a.level);
}

// encounter regions follow their areas (same formula as scripts/gen-province.ts)
const RF = 'src/data/world/regions.json';
const rraw = read(RF);
const regions = JSON.parse(rraw) as { areas: string[]; level: [number, number]; elite?: [number, number]; recommended?: number; danger?: number }[];
for (const r of regions) {
  const lv = r.areas.map((a) => areasOf.get(a)).filter((x): x is [number, number] => !!x);
  if (!lv.length || lv.length !== r.areas.length) continue;
  const lo = Math.min(...lv.map((x) => x[0])), hi = Math.max(...lv.map((x) => x[1]));
  r.level = [lo, hi];
  if (r.elite) r.elite = [Math.min(100, hi + 1), Math.min(100, hi + 3)];
  if (r.recommended != null) r.recommended = Math.round((lo + hi) / 2);
}
const out = JSON.stringify(regions, null, 1) + '\n';
writeFileSync(RF, crlf(rraw) ? out.replace(/\n/g, '\r\n') : out);
console.log(changed.length ? changed.join('\n') : 'levels already match the bands');
