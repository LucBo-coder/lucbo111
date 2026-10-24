// PERSONAL USE ONLY — downloads official Pokémon sprites (© The Pokémon Company) from the
// PokeAPI/sprites repository into public/assets/official/ for your own local copy of the game.
// The folder is git-ignored: do not commit, publish or share it (or a dist/ build that contains it).
//
//   node scripts/fetch-official-sprites.mjs        → Gen 1 + Gen 1 Mega forms (+ other species used by the game)
//
// Field sprites: Gen 7 box icons (40x30, chibi). UI sprites: default front sprites (96x96) + shiny fronts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const OUT = 'public/assets/official';
const cache = JSON.parse(readFileSync('src/data/pokeapi/pokeapi-cache.json', 'utf8'));
const targets = [
  ...Object.values(cache.species).map((s) => ({ name: s.name, id: s.id })),
  ...Object.values(cache.forms).map((f) => ({ name: f.name, id: f.id })),
];
mkdirSync(`${OUT}/icons`, { recursive: true });
mkdirSync(`${OUT}/front`, { recursive: true });
mkdirSync(`${OUT}/shiny`, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function grab(url, file) {
  if (existsSync(file)) return true;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return false;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return true;
    } catch {
      await sleep(400 * (i + 1));
    }
  }
  return false;
}

const index = { icons: [], front: [], shiny: [], source: 'https://github.com/PokeAPI/sprites', note: 'Personal use only. Images © The Pokémon Company.' };
for (const t of targets) {
  if (await grab(`${BASE}/versions/generation-vii/icons/${t.id}.png`, `${OUT}/icons/${t.name}.png`)) index.icons.push(t.name);
  if (await grab(`${BASE}/${t.id}.png`, `${OUT}/front/${t.name}.png`)) index.front.push(t.name);
  // official shiny front art (UI) - also the colour reference for shiny field icons
  if (await grab(`${BASE}/shiny/${t.id}.png`, `${OUT}/shiny/${t.name}.png`)) index.shiny.push(t.name);
  process.stdout.write(`\r${index.icons.length} icons, ${index.front.length} front sprites…`);
  await sleep(30);
}
// ── item art (PokeAPI/sprites/items, 30×30) — game id → PokéAPI item name ──
const ITEM_NAME = {
  pokeball: 'poke-ball', greatball: 'great-ball', ultraball: 'ultra-ball', netball: 'net-ball', duskball: 'dusk-ball', quickball: 'quick-ball',
  timerball: 'timer-ball', luxuryball: 'luxury-ball', potion: 'potion', superpotion: 'super-potion', oranberry: 'oran-berry', 'key-stone': 'key-stone',
};
for (const it of JSON.parse(readFileSync('src/data/items.json', 'utf8'))) ITEM_NAME[it.id] ??= it.id;
mkdirSync(`${OUT}/items`, { recursive: true });
index.items = [];
for (const [id, api] of Object.entries(ITEM_NAME)) {
  if (await grab(`${BASE.replace('/pokemon', '/items')}/${api}.png`, `${OUT}/items/${id}.png`)) index.items.push(id);
  else if (id === 'key-stone' && await grab(`${BASE.replace('/pokemon', '/items')}/mega-ring.png`, `${OUT}/items/${id}.png`)) index.items.push(id);
}
// ── trainer art (Pokémon Showdown trainer sprites, 80×80) — NPC portraits & field sprites ──
const TRAINERS = ['oak', 'rancher', 'pokemaniac', 'pokemonranger', 'sage', 'nurse', 'gentleman', 'youngster', 'hiker', 'scientist', 'psychic',
  'acetrainer', 'acetrainerf', 'blackbelt', 'beauty', 'veteran', 'cyclist', 'skier', 'lass', 'camper', 'picnicker', 'fisherman', 'bugcatcher', 'birdkeeper'];
mkdirSync(`${OUT}/trainers`, { recursive: true });
index.trainers = [];
for (const t of TRAINERS) if (await grab(`https://play.pokemonshowdown.com/sprites/trainers/${t}.png`, `${OUT}/trainers/${t}.png`)) index.trainers.push(t);
console.log(`\nitems ${index.items.length}/${Object.keys(ITEM_NAME).length}, trainers ${index.trainers.length}/${TRAINERS.length}`);
index.note = 'Personal use only. Pokémon / item images © The Pokémon Company (PokeAPI/sprites); trainer sprites via Pokémon Showdown.';
writeFileSync(`${OUT}/index.json`, JSON.stringify(index));
console.log(`\nDone: ${index.icons.length}/${targets.length} icons, ${index.front.length}/${targets.length} front, ${index.shiny.length}/${targets.length} shiny → ${OUT}`);
