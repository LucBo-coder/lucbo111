// Build-time PokéAPI sync: Fetch → Validate → Normalize → Cache (src/data/pokeapi/pokeapi-cache.json)
// Run: node scripts/sync-pokeapi.mjs        (only needed when the species/move list changes)
// Respects PokéAPI fair use: one request at a time, results cached in the repo, never called per frame.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';

const API = 'https://pokeapi.co/api/v2';
const OUT_DIR = 'src/data/pokeapi';
const OUT = `${OUT_DIR}/pokeapi-cache.json`;

// Whole Generation I (resolved from /pokemon?limit=151) + later-gen species used by the game
// National Dex #1–#1025 (Gen 1–9, since 0.11.0). Gen 10 only once PokéAPI publishes it: raise this number.
const NATIONAL_DEX_MAX = 1025;
const EXTRA_SPECIES = [];
// Level-up learnset source by preference (FRLG covers #1–386; Gen 4 species fall back to Platinum / DP / HGSS)
const LEARNSET_GROUPS = ['firered-leafgreen', 'emerald', 'ruby-sapphire', 'platinum', 'diamond-pearl', 'heartgold-soulsilver',
  // Gen 5–9 species (never used by #1–493, which all have a Gen 3/4 learnset above)
  'black-2-white-2', 'black-white', 'omega-ruby-alpha-sapphire', 'x-y', 'ultra-sun-ultra-moon', 'sun-moon',
  'sword-shield', 'the-isle-of-armor', 'the-crown-tundra', 'brilliant-diamond-shining-pearl', 'legends-arceus',
  'scarlet-violet', 'the-teal-mask', 'the-indigo-disk'];
// Alternate forms: fetched from /pokemon/{form}; species data comes from the base species
const FORMS = [
  'venusaur-mega', 'charizard-mega-x', 'charizard-mega-y', 'blastoise-mega', 'beedrill-mega', 'pidgeot-mega', 'alakazam-mega',
  'slowbro-mega', 'gengar-mega', 'kangaskhan-mega', 'pinsir-mega', 'gyarados-mega', 'aerodactyl-mega', 'mewtwo-mega-x', 'mewtwo-mega-y',
  'rayquaza-mega', // boss-only form (Rayquaza boss phase 2), not obtainable by the player
];
// Local skill id → PokéAPI move name
const MOVES = {
  scratch: 'scratch', ember: 'ember', flame_burst: 'flame-burst', fire_spin: 'fire-spin',
  tackle: 'tackle', water_gun: 'water-gun', withdraw: 'withdraw', bubble: 'bubble',
  vine_whip: 'vine-whip', razor_leaf: 'razor-leaf', synthesis: 'synthesis', leech_seed: 'leech-seed',
  thunder_shock: 'thunder-shock', quick_attack: 'quick-attack', rock_throw: 'rock-throw', earthquake: 'earthquake',
  body_slam: 'body-slam', rock_tomb: 'rock-tomb', thunder_wave: 'thunder-wave', spark: 'spark',
  thunderbolt: 'thunderbolt', gust: 'gust', wing_attack: 'wing-attack', sand_attack: 'sand-attack',
  string_shot: 'string-shot', bug_bite: 'bug-bite', harden: 'harden', absorb: 'absorb', acid: 'acid',
  poison_powder: 'poison-powder', stun_spore: 'stun-spore', leech_life: 'leech-life', bite: 'bite',
  supersonic: 'supersonic', hyper_fang: 'hyper-fang', defense_curl: 'defense-curl',
  slash: 'slash', flamethrower: 'flamethrower', air_slash: 'air-slash', dragon_claw: 'dragon-claw', heat_wave: 'heat-wave',
  hydro_pump: 'hydro-pump', aqua_tail: 'aqua-tail', dark_pulse: 'dark-pulse', flash_cannon: 'flash-cannon',
  solar_beam: 'solar-beam', petal_blizzard: 'petal-blizzard', sleep_powder: 'sleep-powder', sludge_bomb: 'sludge-bomb',
  thunder: 'thunder', hurricane: 'hurricane', confusion: 'confusion', psybeam: 'psybeam', mega_drain: 'mega-drain',
  crunch: 'crunch', super_fang: 'super-fang', rock_slide: 'rock-slide', magnitude: 'magnitude', tri_attack: 'tri-attack',
  mud_slap: 'mud-slap', dig: 'dig', sludge: 'sludge', hypnosis: 'hypnosis', peck: 'peck', spore: 'spore', take_down: 'take-down',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, { retries = 3, timeoutMs = 12000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'pokemon-survivor-fan-project (build-time cache)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(500 * 2 ** attempt); // exponential backoff
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

const en = (arr, key) => arr?.find((x) => x.language?.name === 'en')?.[key];
const clean = (s) => (s ?? '').replace(/[\f\n\r­]+/g, ' ').replace(/\s+/g, ' ').trim();

function assert(cond, msg) {
  if (!cond) throw new Error('Validation failed: ' + msg);
}

function flattenChain(node, out = []) {
  for (const next of node.evolves_to) {
    // Every alternative condition set (e.g. several location/item options) is kept as its own rule
    const details = next.evolution_details.length ? next.evolution_details : [{}];
    for (const d of details) {
      out.push({
        from: node.species.name, to: next.species.name, trigger: d.trigger?.name ?? 'unknown',
        minLevel: d.min_level ?? null, item: d.item?.name ?? null,
        heldItem: d.held_item?.name ?? null, minHappiness: d.min_happiness ?? null, minAffection: d.min_affection ?? null,
        timeOfDay: d.time_of_day || null, knownMove: d.known_move?.name ?? null, knownMoveType: d.known_move_type?.name ?? null,
        location: d.location?.name ?? null, needsRain: !!d.needs_overworld_rain, gender: d.gender ?? null,
        relativeStats: d.relative_physical_stats ?? null, tradeSpecies: d.trade_species?.name ?? null,
      });
    }
    flattenChain(next, out);
  }
  return out;
}

async function main() {
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  // species endpoint names (e.g. "deoxys") — /pokemon?limit lists default *forms* ("deoxys-normal")
  const list = await getJson(`${API}/pokemon-species?limit=${NATIONAL_DEX_MAX}&offset=0`);
  const SPECIES = [...list.results.map((r) => r.name), ...EXTRA_SPECIES];
  const species = {};
  const growthNames = new Set();
  const chains = new Map();
  const prevSpecies = prev?.species ?? {};
  for (const name of SPECIES) {
    // resume-friendly: species already normalised with the current schema are kept
    if (prevSpecies[name]?.generation && prevSpecies[name]?.learnsetGroup !== undefined) { species[name] = prevSpecies[name]; growthNames.add(species[name].growthRate); continue; }
    const s = await getJson(`${API}/pokemon-species/${name}`);
    const defVariety = s.varieties.find((v) => v.is_default)?.pokemon.name ?? name;
    const p = await getJson(`${API}/pokemon/${defVariety}`);
    let chain = chains.get(s.evolution_chain.url);
    if (!chain) { chain = await getJson(s.evolution_chain.url); chains.set(s.evolution_chain.url, chain); }
    const group = LEARNSET_GROUPS.find((g) => p.moves.some((m) => m.version_group_details.some((v) => v.version_group.name === g && v.move_learn_method.name === 'level-up'))) ?? null;
    const stat = (n) => p.stats.find((x) => x.stat.name === n)?.base_stat;
    const norm = {
      id: p.id,
      name: p.name,
      displayName: en(s.names, 'name') ?? p.name,
      genus: en(s.genera, 'genus') ?? '',
      types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      baseStats: { hp: stat('hp'), atk: stat('attack'), def: stat('defense'), spa: stat('special-attack'), spd: stat('special-defense'), spe: stat('speed') },
      abilities: p.abilities.map((a) => ({ name: a.ability.name, hidden: a.is_hidden })),
      heightDm: p.height,
      weightHg: p.weight,
      baseExperience: p.base_experience,
      captureRate: s.capture_rate,
      baseHappiness: s.base_happiness,
      growthRate: s.growth_rate.name,
      habitat: s.habitat?.name ?? null,
      legendary: !!s.is_legendary, mythical: !!s.is_mythical,
      evolvesFrom: s.evolves_from_species?.name ?? null,
      flavorText: clean((s.flavor_text_entries.find((f) => f.language.name === 'en' && f.version.name === 'firered') ?? s.flavor_text_entries.find((f) => f.language.name === 'en' && f.version.name === 'platinum'))?.flavor_text ?? en(s.flavor_text_entries, 'flavor_text')),
      evolutions: flattenChain(chain.chain),
      levelUpMoves: p.moves
        .flatMap((m) => m.version_group_details.filter((v) => v.version_group.name === group && v.move_learn_method.name === 'level-up').map((v) => ({ move: m.move.name, level: v.level_learned_at })))
        .sort((a, b) => a.level - b.level),
      learnsetGroup: group,
      generation: s.generation?.name ?? null,
      isBaby: !!s.is_baby,
      color: s.color?.name ?? null,
      shape: s.shape?.name ?? null,
      formNames: s.varieties.filter((v) => !v.is_default).map((v) => v.pokemon.name),
    };
    assert(norm.types.length >= 1 && norm.types.length <= 2, `${name} types`);
    assert(Object.values(norm.baseStats).every((v) => Number.isInteger(v) && v > 0), `${name} stats`);
    assert(norm.captureRate >= 1 && norm.captureRate <= 255, `${name} capture rate`);
    norm.name = name; // species name, even when the default variety is a form (deoxys-normal…)
    species[name] = norm;
    growthNames.add(norm.growthRate);
    console.log(`✓ species ${name} #${norm.id} [${norm.types}] capture=${norm.captureRate} growth=${norm.growthRate}`);
    await sleep(40);
    // checkpoint so an interrupted sync resumes instead of starting over
    if (Object.keys(species).length % 40 === 0 && prev) writeFileSync(OUT, JSON.stringify({ ...prev, species: { ...prevSpecies, ...species } }, null, 1));
  }

  const forms = {};
  for (const name of FORMS) {
    const p = await getJson(`${API}/pokemon/${name}`);
    const stat = (n) => p.stats.find((x) => x.stat.name === n)?.base_stat;
    forms[name] = {
      id: p.id, name: p.name, baseSpecies: p.species.name,
      types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      baseStats: { hp: stat('hp'), atk: stat('attack'), def: stat('defense'), spa: stat('special-attack'), spd: stat('special-defense'), spe: stat('speed') },
      abilities: p.abilities.map((a) => ({ name: a.ability.name, hidden: a.is_hidden })),
      heightDm: p.height, weightHg: p.weight,
    };
    assert(Object.values(forms[name].baseStats).every((v) => v > 0), `${name} stats`);
    console.log(`✓ form ${name} [${forms[name].types}] ${JSON.stringify(forms[name].baseStats)}`);
    await sleep(120);
  }

  const moves = {};
  const wanted = new Map(Object.entries(MOVES));
  for (const sp of Object.values(species)) for (const lm of sp.levelUpMoves) {
    const local = lm.move.replace(/-/g, '_');
    if (!wanted.has(local)) wanted.set(local, lm.move);
  }
  const prevMoves = prev?.moves ?? {};
  for (const [local, apiName] of wanted) {
    if (prevMoves[local]?.target && prevMoves[local]?.flinchChance !== undefined) { moves[local] = prevMoves[local]; continue; } // already cached
    const m = await getJson(`${API}/move/${apiName}`);
    moves[local] = {
      apiName, id: m.id, type: m.type.name, damageClass: m.damage_class.name, power: m.power, accuracy: m.accuracy, pp: m.pp,
      priority: m.priority, ailment: m.meta?.ailment?.name ?? null, ailmentChance: m.meta?.ailment_chance ?? 0, flinchChance: m.meta?.flinch_chance ?? 0,
      name: en(m.names, 'name') ?? apiName, target: m.target?.name ?? null, metaCategory: m.meta?.category?.name ?? null,
      minHits: m.meta?.min_hits ?? null, drain: m.meta?.drain ?? 0, healing: m.meta?.healing ?? 0, critRate: m.meta?.crit_rate ?? 0,
      statChanges: (m.stat_changes ?? []).map((c) => ({ stat: c.stat.name, change: c.change })),
      shortEffect: clean(en(m.effect_entries, 'short_effect')).replace(/\$effect_chance/g, String(m.effect_chance ?? '')),
    };
    assert(['physical', 'special', 'status'].includes(moves[local].damageClass), `${apiName} class`);
    console.log(`✓ move ${apiName} ${m.type.name}/${m.damage_class.name} pow=${m.power}`);
    await sleep(50);
  }

  // Item flavour/effect text (data only, no item sprites)
  const items = {};
  const localItems = JSON.parse(readFileSync('src/data/items.json', 'utf8'));
  for (const extra of ['fire-stone', 'water-stone', 'moon-stone', 'linking-cord', 'metal-coat', 'kings-rock', 'dragon-scale', 'sun-stone', 'beedrillite', 'alakazite', 'slowbronite', 'gengarite', 'kangaskhanite', 'pinsirite', 'gyaradosite', 'aerodactylite', 'mewtwonite-x', 'mewtwonite-y']) {
    if (!localItems.some((i) => i.id === extra)) localItems.push({ id: extra });
  }
  for (const it of localItems) {
    try {
      const d = await getJson(`${API}/item/${it.id}`, { retries: 1 });
      items[it.id] = { apiName: d.name, cost: d.cost, category: d.category?.name ?? null, shortEffect: clean(en(d.effect_entries, 'short_effect')), flavor: clean(d.flavor_text_entries?.find((f) => f.language.name === 'en')?.text) };
      items[it.id].name = en(d.names, 'name') ?? it.id;
      console.log(`✓ item ${it.id}`);
    } catch (e) {
      console.log(`· item ${it.id} not in PokéAPI (${e.message}) — local description only`);
    }
    await sleep(50);
  }

  const growthRates = {};
  for (const g of growthNames) {
    const r = await getJson(`${API}/growth-rate/${g}`);
    const levels = r.levels.sort((a, b) => a.level - b.level).map((l) => l.experience);
    assert(levels.length === 100 && levels[0] === 0, `growth ${g}`);
    growthRates[g] = levels;
    console.log(`✓ growth-rate ${g}`);
  }

  const out = {
    meta: {
      // bump when the normalized shape changes (2: full evolution_details per rule)
      schemaVersion: 2,
      source: 'https://pokeapi.co/api/v2',
      fetchedAt: new Date().toISOString(),
      note: 'Data only. No images are cached or redistributed. Pokémon names/data © Nintendo, Game Freak, The Pokémon Company.',
      previousFetch: prev?.meta?.fetchedAt ?? null,
    },
    species, forms, moves, items, growthRates,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\nWrote ${OUT}: ${Object.keys(species).length} species, ${Object.keys(moves).length} moves, ${Object.keys(growthRates).length} growth rates`);
}

main().catch((e) => {
  console.error('Sync failed (existing cache left untouched):', e.message);
  process.exit(1);
});
