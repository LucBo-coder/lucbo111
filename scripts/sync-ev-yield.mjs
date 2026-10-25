// EV yield of every species in the PokéAPI cache (`stats[].effort` of /pokemon/{id}, the default form).
// Output: src/data/pokeapi/ev-yield.json — { species: { stat: points } }, stats with 0 omitted.
//   node scripts/sync-ev-yield.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const CACHE = 'src/data/pokeapi/pokeapi-cache.json';
const OUT = 'src/data/pokeapi/ev-yield.json';
const STAT = { hp: 'hp', attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe' };
const species = Object.entries(JSON.parse(readFileSync(CACHE, 'utf8')).species);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15_000);
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await sleep(500 * (i + 1));
  }
  throw new Error('failed: ' + url);
}

const out = {};
let next = 0;
async function worker() {
  while (next < species.length) {
    const [key, sp] = species[next++];
    const p = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${sp.id}`);
    if (!p) { console.warn('\nno data for', key); continue; }
    const y = {};
    for (const s of p.stats) if (s.effort > 0) y[STAT[s.stat.name]] = s.effort;
    out[key] = y;
    process.stdout.write(`\r${Object.keys(out).length}/${species.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
const sorted = Object.fromEntries(species.map(([k]) => [k, out[k]]).filter(([, v]) => v));
writeFileSync(OUT, JSON.stringify(sorted) + '\n');
console.log(`\n${Object.keys(sorted).length} species → ${OUT}`);
