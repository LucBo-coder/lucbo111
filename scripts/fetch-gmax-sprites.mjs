// PERSONAL USE ONLY — downloads the Gigantamax form sprites (© The Pokémon Company) from the PokeAPI/sprites
// repository into public/assets/official/gmax/, like scripts/fetch-official-sprites.mjs does for the other forms
// (same source, same personal-use pack). PMDCollab SpriteCollab has no Gigantamax sheets yet, so a Gigantamax giant
// is drawn with this art (96×96 front, normal + shiny) instead of its base species' animated sheet.
//
//   node scripts/fetch-gmax-sprites.mjs
//
// Species ids are the keys of GMAX in src/core/gimmicks.ts; Urshifu and Toxtricity use their default form's G-Max.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const OUT = 'public/assets/official/gmax';
const src = readFileSync('src/core/gimmicks.ts', 'utf8');
const block = src.slice(src.indexOf('export const GMAX'), src.indexOf('};', src.indexOf('export const GMAX')));
const species = [...block.matchAll(/^\s+'?([a-z-]+)'?: \{/gm)].map((m) => m[1]);
const FORM = { urshifu: 'urshifu-single-strike-gmax', toxtricity: 'toxtricity-amped-gmax' };
const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

mkdirSync(`${OUT}/shiny`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, json = false) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return json ? await r.json() : Buffer.from(await r.arrayBuffer());
    } catch { await sleep(500 * (i + 1)); }
  }
  return null;
}

const index = { gmax: [], shiny: [], source: 'https://github.com/PokeAPI/sprites', note: 'Personal use only. Images © The Pokémon Company.' };
for (const sp of species) {
  const form = FORM[sp] ?? `${sp}-gmax`;
  const api = await get(`https://pokeapi.co/api/v2/pokemon/${form}`, true);
  if (!api) { console.warn(`\n${form}: not on PokéAPI`); continue; }
  for (const [dir, url, list] of [['', `${BASE}/${api.id}.png`, index.gmax], ['shiny/', `${BASE}/shiny/${api.id}.png`, index.shiny]]) {
    const file = `${OUT}/${dir}${sp}.png`;
    if (existsSync(file)) { list.push(sp); continue; }
    const png = await get(url);
    if (png) { writeFileSync(file, png); list.push(sp); }
  }
  process.stdout.write(`\r${index.gmax.length}/${species.length} Gigantamax forms…`);
}
writeFileSync(`${OUT}/index.json`, JSON.stringify(index));
console.log(`\ndone: ${index.gmax.length} forms, ${index.shiny.length} shiny → ${OUT}`);
