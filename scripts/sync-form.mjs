// Adds (or refreshes) single alternate forms in the PokéAPI cache without re-running the full sync.
//   node scripts/sync-form.mjs rayquaza-mega
// Same normalisation as the FORMS loop of sync-pokeapi.mjs.
import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://pokeapi.co/api/v2';
const OUT = 'src/data/pokeapi/pokeapi-cache.json';
const names = process.argv.slice(2);
if (!names.length) { console.error('usage: node scripts/sync-form.mjs <form> [...]'); process.exit(1); }

const cache = JSON.parse(readFileSync(OUT, 'utf8'));
cache.forms ??= {};
for (const name of names) {
  const res = await fetch(`${API}/pokemon/${name}`, { headers: { 'User-Agent': 'pokemon-survivor-fan-project (local cache)' } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const p = await res.json();
  const stat = (n) => p.stats.find((x) => x.stat.name === n)?.base_stat;
  const f = {
    id: p.id, name: p.name, baseSpecies: p.species.name,
    types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    baseStats: { hp: stat('hp'), atk: stat('attack'), def: stat('defense'), spa: stat('special-attack'), spd: stat('special-defense'), spe: stat('speed') },
    abilities: p.abilities.map((a) => ({ name: a.ability.name, hidden: a.is_hidden })),
    heightDm: p.height, weightHg: p.weight,
  };
  if (!Object.values(f.baseStats).every((v) => v > 0)) throw new Error(`${name}: bad stats`);
  cache.forms[name] = f;
  console.log(`✓ form ${name} #${f.id} [${f.types}] ${JSON.stringify(f.baseStats)}`);
}
writeFileSync(OUT, JSON.stringify(cache, null, 1));
