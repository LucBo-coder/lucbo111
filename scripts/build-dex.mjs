// Generates real-time combat models for every Gen 1 Pokémon from the PokéAPI cache.
//   node scripts/build-gen1.mjs     (run after sync-pokeapi.mjs)
// Hand-tuned entries in src/data/pokemon.json / skills.json always win; this only fills the rest.
// Output: src/data/dex/{pokemon,skills,ecology}.json (National Dex #1–#1025, Gen 1–9)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const cache = JSON.parse(readFileSync('src/data/pokeapi/pokeapi-cache.json', 'utf8'));
const handPokemon = JSON.parse(readFileSync('src/data/pokemon.json', 'utf8'));
const handSkills = JSON.parse(readFileSync('src/data/skills.json', 'utf8'));
const handIds = new Set(handPokemon.map((p) => p.id));
const skillIds = new Set(handSkills.map((s) => s.id));
const SP = cache.species, MV = cache.moves, FORMS = cache.forms;

// ───────────────────────────── moves → real-time skills ─────────────────────────────
// PokéAPI ailment → real-time status (durations in seconds; see GAMEPLAY_AUDIT.md "Trạng thái")
const AIL = {
  paralysis: { kind: 'paralysis', duration: 4, magnitude: 0.5 }, sleep: { kind: 'sleep', duration: 2.5, magnitude: 0 },
  freeze: { kind: 'freeze', duration: 1.8, magnitude: 0 }, confusion: { kind: 'confusion', duration: 3, magnitude: 0 },
  burn: { kind: 'burn', duration: 3, magnitude: 0.03 }, poison: { kind: 'poison', duration: 3, magnitude: 0.03 },
  trap: { kind: 'slow', duration: 3, magnitude: 0.35 }, 'leech-seed': { kind: 'leech', duration: 5, magnitude: 0.04 },
};
const PROJ_VFX = { fire: 'ember', water: 'water', grass: 'leaf', electric: 'spark', poison: 'poison', flying: 'wind', rock: 'rock', ground: 'mud', psychic: 'psychic', dark: 'shadow', steel: 'steel', ghost: 'shadow' };
const BEAM_VFX = { fire: 'flame_beam', water: 'water_beam', grass: 'solar_beam', psychic: 'psy_beam', electric: 'lightning' };
const AOE_VFX = { fire: 'explosion_fire', ground: 'quake', rock: 'rock', electric: 'thunder', grass: 'petals', flying: 'wind_burst' };
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function convertMove(id, m) {
  if (!m) return null;
  const power = m.power ? Math.min(150, m.power) : 0;
  const cat = m.metaCategory;
  const base = { id, name: m.name ?? id, type: m.type, category: m.damageClass, power: 0, castTime: 0.15, anim: 'cast', sfx: 'hit' };
  let ail = m.ailment && AIL[m.ailment] ? { ...AIL[m.ailment], chance: Math.max(0.1, (m.ailmentChance || 100) / 100) } : null;
  if (ail && m.apiName === 'toxic') ail = { kind: 'badPoison', duration: 5, magnitude: 0.02, chance: 1 };
  const acc = m.accuracy != null && m.accuracy < 100 ? { accuracy: m.accuracy } : {};
  const fl = m.flinchChance ? { flinch: round(m.flinchChance / 100) } : {};
  const selfStats = (m.statChanges ?? []).filter((c) => c.change > 0);
  const foeStats = (m.statChanges ?? []).filter((c) => c.change < 0);

  if (m.damageClass === 'status') {
    if (cat === 'heal' && (m.target === 'user' || m.target === 'user-and-allies')) {
      return { ...base, kind: 'heal', cooldown: 8, energyCost: 30, castTime: 0.4, range: 300, target: 'lowestAlly', heal: round((m.healing || 50) / 100 * 0.6), vfx: 'heal', sfx: 'heal' };
    }
    if (cat === 'ailment' && ail) {
      return { ...base, ...acc, kind: 'debuff', cooldown: ['sleep', 'freeze', 'paralysis', 'confusion'].includes(ail.kind) ? 10 : 7, energyCost: 15, castTime: 0.25, range: 230, target: 'enemy', status: { ...ail, chance: 1 }, vfx: PROJ_VFX[m.type] ?? 'spore', sfx: 'seed' };
    }
    if (cat === 'net-good-stats' && m.target === 'user' && selfStats.length) {
      const defensive = selfStats.some((c) => c.stat === 'defense' || c.stat === 'special-defense' || c.stat === 'evasion');
      if (defensive) return { ...base, kind: 'shield', cooldown: 9, energyCost: 15, castTime: 0.2, range: 0, target: 'self', shield: 0.25, anim: 'shell', vfx: 'shield', sfx: 'shield' };
      return { ...base, kind: 'buff', cooldown: 12, energyCost: 25, castTime: 0.25, range: 0, target: 'allAllies', status: { kind: 'atkUp', chance: 1, duration: 6, magnitude: 0.25 }, vfx: 'buff', sfx: 'shield' };
    }
    if (cat === 'net-good-stats' && foeStats.length && m.target !== 'user') {
      return { ...base, kind: 'debuff', cooldown: 7, energyCost: 10, castTime: 0.2, range: 220, target: 'enemy', status: { kind: 'defDown', chance: 1, duration: 4, magnitude: 0.2 }, vfx: 'sand', sfx: 'whip' };
    }
    return null; // field effects, switching, copy moves… have no real-time meaning here
  }

  const effPower = power || (cat === 'ohko' ? 120 : 50);
  if (!['damage', 'damage-ailment', 'damage-lower', 'damage-raise', 'damage-heal', 'ohko'].includes(cat) && !(cat === 'unique' && m.power)) return null;
  const cooldown = round(Math.min(cat === 'ohko' ? 12 : 7, 0.7 + effPower / 55 + (m.minHits ? 0.3 : 0)), 1);
  const energyCost = effPower >= 100 ? 35 : effPower >= 80 ? 20 : effPower >= 60 ? 10 : 0;
  const status = ail ? ail : cat === 'damage-lower' && foeStats.length ? { kind: 'defDown', chance: 0.3, duration: 3, magnitude: 0.15 } : null;
  const common = { ...base, ...acc, ...fl, power: effPower, cooldown, energyCost, ...(status ? { status } : {}), ...(m.drain > 0 ? { drain: round(m.drain / 100) } : {}), ...(m.critRate > 0 ? { critBonus: 0.12 } : {}) };
  const area = m.target === 'all-opponents' || m.target === 'all-other-pokemon';
  // breath / wind / powder sprays hit a cone in front of the user
  const CONE = { 'icy-wind': 0.5, 'powder-snow': 0.5, 'air-cutter': 0.45, twister: 0.55, 'heat-wave': 0.6, 'muddy-water': 0.55, hurricane: 0.5, blizzard: 0.6 };
  if (area && CONE[m.apiName]) return { ...common, kind: 'cone', castTime: 0.3, range: effPower < 100 ? 210 : 240, cone: { spread: CONE[m.apiName] }, target: 'enemy', anim: 'cast', vfx: 'cone', sfx: 'boom' };
  if (area) return { ...common, kind: 'aoe', castTime: 0.3, range: 140, radius: 120, target: 'self', anim: 'spin', vfx: AOE_VFX[m.type] ?? 'quake', sfx: 'boom' };
  if (m.damageClass === 'physical') {
    if (m.priority > 0 || /take-down|double-edge|body-slam|tackle|headbutt|skull-bash|wild-charge|dig|fly|rollout|horn-attack/.test(m.apiName ?? id)) {
      if (m.priority > 0 || /take-down|double-edge|skull-bash|dig|fly|rollout/.test(m.apiName ?? id)) {
        return { ...common, kind: 'dash', castTime: 0.1, range: 230, radius: 26, target: 'enemy', dash: { distance: 230, speed: 650 }, anim: 'lunge', vfx: 'impact', sfx: 'dash' };
      }
    }
    return { ...common, kind: 'melee', castTime: 0.1, range: 58, radius: 42, target: 'enemy', anim: 'lunge', vfx: m.type === 'grass' ? 'vine' : m.type === 'dark' || /bite|crunch|fang/.test(m.apiName ?? '') ? 'bite' : 'slash', sfx: 'hit' };
  }
  if (effPower >= 90) return { ...common, kind: 'beam', castTime: 0.35, range: 300, radius: 18, beam: { length: 300 }, target: 'enemy', vfx: BEAM_VFX[m.type] ?? 'beam', sfx: 'zap' };
  const count = m.minHits && m.minHits > 1 ? Math.min(3, m.minHits) : 1;
  return { ...common, kind: 'projectile', range: 280, target: 'enemy', projectile: { speed: 400, count, spread: count > 1 ? 0.25 : 0, pierce: 0, size: 7 }, vfx: PROJ_VFX[m.type] ?? 'spark', sfx: 'shoot' };
}

const generatedSkills = {};
const skillDef = (id) => handSkills.find((s) => s.id === id) ?? generatedSkills[id];
for (const [id, m] of Object.entries(MV)) {
  if (skillIds.has(id)) continue;
  const conv = convertMove(id, { ...m, apiName: m.apiName });
  if (conv) generatedSkills[id] = conv;
}

// ───────────────────────────── abilities → passives ─────────────────────────────
const cap = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
function passiveFor(ability, types) {
  const n = ability;
  const P = (kind, extra, desc) => ({ id: n, name: cap(n), description: desc, kind, ...extra });
  const pinch = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' };
  if (pinch[n]) return P('pinch', { type: pinch[n], mult: 1.5, threshold: 0.33 }, `Kỹ năng hệ ${pinch[n]} +50% khi HP dưới 33%.`);
  const crit = { 'keen-eye': 0.1, 'compound-eyes': 0.1, 'super-luck': 0.12, sniper: 0.1, 'magnet-pull': 0.06, analytic: 0.08, trace: 0.06, download: 0.06, 'mold-breaker': 0.1, 'no-guard': 0.15, 'shadow-tag': 0.08, synchronize: 0.06, 'cute-charm': 0.05, 'early-bird': 0.05 };
  if (crit[n] != null) return P('critBonus', { value: crit[n] }, `Mô phỏng thời gian thực: +${Math.round(crit[n] * 100)}% chí mạng.`);
  const speed = { chlorophyll: 0.2, 'swift-swim': 0.2, 'run-away': 0.15, 'quick-feet': 0.15, 'sand-veil': 0.15, 'snow-cloak': 0.15, 'speed-boost': 0.2, levitate: 0.1, 'rain-dish': 0.1, illuminate: 0.1 };
  if (speed[n] != null) return P('moveSpeed', { value: speed[n] }, `Mô phỏng: +${Math.round(speed[n] * 100)}% tốc độ di chuyển.`);
  // Ability → statuses it prevents (main-series meaning, real-time statuses)
  const IMM = {
    'immunity': [['poison', 'badPoison'], 'Miễn nhiễm trúng độc.'], 'limber': [['paralysis'], 'Miễn nhiễm tê liệt.'],
    'insomnia': [['sleep'], 'Không bao giờ ngủ.'], 'vital-spirit': [['sleep'], 'Không bao giờ ngủ.'],
    'own-tempo': [['confusion'], 'Không bị rối loạn.'], 'oblivious': [['confusion', 'taunt'], 'Không bị rối loạn / khiêu khích.'],
    'water-veil': [['burn'], 'Không bị bỏng.'], 'magma-armor': [['freeze'], 'Không bị đóng băng.'],
    'inner-focus': [['flinch'], 'Không bao giờ khựng.'], 'steadfast': [['flinch'], 'Không bao giờ khựng.'],
    'shield-dust': [['burn', 'poison', 'paralysis', 'sleep', 'freeze', 'confusion', 'flinch'], 'Không dính hiệu ứng phụ của đòn đánh.'],
    'shed-skin': [['burn', 'poison', 'badPoison', 'paralysis', 'sleep', 'freeze'], 'Mô phỏng: lột da, không giữ trạng thái chính.'],
    'natural-cure': [['burn', 'poison', 'badPoison', 'paralysis', 'sleep', 'freeze'], 'Mô phỏng: không giữ trạng thái chính.'],
    'clear-body': [['defDown', 'slow'], 'Chỉ số không bị hạ.'], 'keen-eye': [['defDown'], 'Mô phỏng: không bị hạ chỉ số.'],
  };
  if (IMM[n]) return P('statusImmune', { immune: IMM[n][0] }, IMM[n][1]);
  if (['guts', 'hustle', 'marvel-scale'].includes(n)) return P('guts', { mult: 1.5 }, '+50% sát thương khi đang bị hiệu ứng trạng thái.');
  if (['sturdy', 'rock-head', 'battle-armor', 'shell-armor', 'solid-rock', 'filter'].includes(n)) return P('sturdy', { value: 30 }, 'Chịu được đòn chí tử với 1 HP (hồi 30 giây).');
  if (n === 'thick-fat') return P('typeResist', { types: ['fire', 'ice'], mult: 0.5 }, 'Giảm 50% sát thương Lửa/Băng.');
  if (n === 'flash-fire') return P('typeResist', { types: ['fire'], mult: 0.25 }, 'Giảm 75% sát thương Lửa.');
  if (n === 'water-absorb') return P('typeResist', { types: ['water'], mult: 0.25 }, 'Giảm 75% sát thương Nước.');
  if (n === 'volt-absorb' || n === 'lightning-rod') return P('typeResist', { types: ['electric'], mult: 0.25 }, 'Giảm 75% sát thương Điện.');
  if (n === 'static') return P('contactStatus', { status: { kind: 'slow', chance: 0.3, duration: 2, magnitude: 0.4 } }, 'Kẻ đánh cận chiến 30% bị tê liệt.');
  if (n === 'poison-point' || n === 'liquid-ooze' || n === 'stench') return P('contactStatus', { status: { kind: 'poison', chance: 0.3, duration: 3, magnitude: 0.03 } }, 'Kẻ đánh cận chiến 30% bị nhiễm độc.');
  if (n === 'effect-spore') return P('contactStatus', { status: { kind: 'stun', chance: 0.2, duration: 0.8, magnitude: 0 } }, 'Kẻ đánh cận chiến 20% bị choáng.');
  if (n === 'flame-body') return P('contactStatus', { status: { kind: 'burn', chance: 0.3, duration: 3, magnitude: 0.03 } }, 'Kẻ đánh cận chiến 30% bị bỏng.');
  if (n === 'intimidate') return P('contactStatus', { status: { kind: 'defDown', chance: 0.5, duration: 3, magnitude: 0.2 } }, 'Mô phỏng: kẻ đánh cận chiến bị giảm sức chống chịu.');
  if (n === 'tough-claws') return P('meleeBoost', { mult: 1.3 }, 'Đòn cận chiến và lao +30%.');
  if (n === 'parental-bond') return P('meleeBoost', { mult: 1.25 }, 'Mô phỏng đánh hai lần: cận chiến +25%.');
  if (n === 'huge-power' || n === 'pure-power') return P('meleeBoost', { mult: 1.5 }, 'Mô phỏng: cận chiến +50%.');
  if (n === 'mega-launcher') return P('projectileBoost', { mult: 1.5 }, 'Đạn và tia +50%.');
  if (n === 'adaptability') return P('typeBoost', { type: types[0], mult: 1.33 }, `Mô phỏng STAB mạnh hơn: kỹ năng hệ ${types[0]} +33%.`);
  if (n === 'aerilate') return P('typeBoost', { type: 'flying', mult: 1.3 }, 'Kỹ năng hệ Bay +30%.');
  if (n === 'drought') return P('typeBoost', { type: 'fire', mult: 1.5 }, 'Kỹ năng hệ Lửa luôn +50%.');
  return P('critBonus', { value: 0.05 }, `Đặc tính gốc ${cap(n)} chưa được mô phỏng riêng — trong game: +5% chí mạng.`);
}

// ───────────────────────────── species → models ─────────────────────────────
function roleFor(st, hasHeal) {
  const bulk = st.hp + st.def + st.spd;
  if (bulk >= 240 && st.spe < 65) return 'tank';
  if (st.spa > st.atk + 10) return st.spe >= 90 ? 'marksman' : hasHeal ? 'support' : 'mage';
  if (st.atk > st.spa + 10) return st.spe >= 90 ? 'assassin' : 'fighter';
  return hasHeal ? 'support' : st.spe >= 90 ? 'assassin' : 'fighter';
}

const allMoveDefs = () => ({ ...Object.fromEntries(handSkills.map((s) => [s.id, s])), ...generatedSkills });
// Generation a move appears in = the earliest generation of a species learning it by level-up (hand skills: Gen 1).
// Catalogue fallbacks only pick moves of the species' own generation or older, so adding Gen 5–9 never changes
// the moves of an older species.
const GEN_N = { 'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4, 'generation-v': 5, 'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8, 'generation-ix': 9 };
const MOVE_GEN = {};
for (const s of handSkills) MOVE_GEN[s.id] = 1;
for (const sp of Object.values(SP)) {
  const g = GEN_N[sp.generation] ?? 9;
  for (const m of sp.levelUpMoves ?? []) { const k = m.move.replace(/-/g, '_'); MOVE_GEN[k] = Math.min(MOVE_GEN[k] ?? 99, g); }
}
// Gen 1–4 species keep the whole Gen 1–4 catalogue they always had; moves only in the hand-made MOVES map count as old
const movesUpTo = (sp) => { const g = Math.max(4, GEN_N[sp.generation] ?? 9); return (d) => (MOVE_GEN[d.id] ?? 1) <= g; };

function pickMoves(sp) {
  const defs = allMoveDefs();
  const learn = [...new Set(sp.levelUpMoves.map((m) => m.move.replace(/-/g, '_')))].filter((id) => defs[id]);
  const stab = (d) => (sp.types.includes(d.type) ? 1.5 : 1);
  const dmg = learn.filter((id) => defs[id].power > 0).sort((a, b) => defs[b].power * stab(defs[b]) - defs[a].power * stab(defs[a]));
  const util = learn.filter((id) => defs[id].power === 0);
  const chosen = [];
  const add = (id) => { if (id && !chosen.includes(id) && chosen.length < 4) chosen.push(id); };
  // 1) a free basic attack so the AI always has something to do
  add(dmg.filter((id) => defs[id].energyCost === 0).sort((a, b) => defs[b].power * stab(defs[b]) - defs[a].power * stab(defs[a]))[0]);
  // 2) strongest STAB-weighted attack
  add(dmg.find((id) => !chosen.includes(id)));
  // 3) coverage: different type or kind
  add(dmg.find((id) => !chosen.includes(id) && chosen.every((c) => defs[c].type !== defs[id].type || defs[c].kind !== defs[id].kind)));
  // 4) utility (heal > shield > buff > debuff)
  const prefer = ['heal', 'shield', 'buff', 'debuff'];
  add(util.sort((a, b) => prefer.indexOf(defs[a].kind) - prefer.indexOf(defs[b].kind))[0]);
  for (const id of dmg) add(id);
  // fallback: weakest moves of the species' types from the whole catalogue
  for (const t of [...sp.types, 'normal']) {
    const pool = Object.values(defs).filter((d) => d.type === t && d.power > 0 && movesUpTo(sp)(d)).sort((a, b) => a.power - b.power);
    for (const d of pool) { if (chosen.length >= 4) break; add(d.id); }
  }
  if (!chosen.some((id) => defs[id].power > 0 && defs[id].energyCost === 0)) {
    const basic = Object.values(defs).filter((d) => d.type === 'normal' && d.power > 0 && d.energyCost === 0 && movesUpTo(sp)(d)).sort((a, b) => a.power - b.power)[0];
    chosen[0] = basic.id;
  }
  // An evolution that needs a known move (Piloswine → Mamoswine: Ancient Power) or a move type
  // (Eevee → Sylveon: a Fairy move) must be reachable: the kit carries it in the last slot (Lv30 at most).
  for (const need of EVO_MOVE_NEEDS.get(sp.name) ?? []) {
    if (chosen.some((id) => (need.move ? id === need.move : defs[id].type === need.type))) continue;
    const pick = need.move
      ? (defs[need.move] ? need.move : null)
      : (learn.find((id) => defs[id].type === need.type && defs[id].power > 0)
        // no generation cap here: the evolution itself is from the move's generation (Fairy → Gen 6)
        ?? Object.values(defs).filter((d) => d.type === need.type && d.power > 0).sort((a, b) => a.power - b.power)[0]?.id);
    if (pick) chosen[Math.min(3, chosen.length)] = pick;
  }
  return [...new Set(chosen)].slice(0, 4);
}

/** species → moves / move types one of its evolutions requires it to know */
const EVO_MOVE_NEEDS = new Map();
for (const s of Object.values(SP)) for (const e of s.evolutions ?? []) {
  if (!e.knownMove && !e.knownMoveType) continue;
  const list = EVO_MOVE_NEEDS.get(e.from) ?? [];
  list.push(e.knownMove ? { move: e.knownMove.replace(/-/g, '_') } : { type: e.knownMoveType });
  EVO_MOVE_NEEDS.set(e.from, list);
}

const bst = (s) => s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
function model(id, src, types, stats, abilityName, extra = {}) {
  const sp = SP[extra.baseSpecies ?? id] ?? src;
  const skills = extra.skills ?? pickMoves(sp);
  const hasHeal = skills.some((k) => allMoveDefs()[k]?.kind === 'heal');
  const role = roleFor(stats, hasHeal);
  const total = bst(stats);
  const rarity = sp.legendary || sp.mythical || extra.mega ? 'legendary' : total >= 520 ? 'epic' : total >= 400 ? 'rare' : 'common';
  const ranged = role === 'marksman' || role === 'mage' || role === 'support';
  return {
    id, name: extra.name ?? src.displayName ?? cap(id), types, rarity, role, baseStats: stats,
    moveSpeed: Math.round(Math.max(150, Math.min(250, 160 + stats.spe * 0.6))), attackRange: ranged ? 260 : 58,
    critRate: role === 'assassin' ? 0.08 : 0.05, radius: Math.round(Math.min(24, 13 + (src.heightDm ?? 8) / 2.5)),
    skills, passive: passiveFor(abilityName, types), evolution: null, sprite: id,
    animation: { walk: 'walk4', cast: 'glow' }, vfx: { hit: types[0], aura: types[0] }, generated: true, ...(extra.mega ? { mega: extra.mega } : {}),
  };
}

const generatedPokemon = [];
for (const [id, sp] of Object.entries(SP)) {
  if (handIds.has(id) || id === 'onix') continue;
  const ability = sp.abilities.find((a) => !a.hidden)?.name ?? sp.abilities[0]?.name ?? 'none';
  generatedPokemon.push(model(id, sp, sp.types, sp.baseStats, ability));
}
// onix also becomes catchable/playable (it was boss-only)
if (!handIds.has('onix')) generatedPokemon.push(model('onix', SP.onix, SP.onix.types, SP.onix.baseStats, 'sturdy'));

const MEGA_STONES = {
  'beedrill-mega': 'beedrillite', 'alakazam-mega': 'alakazite', 'slowbro-mega': 'slowbronite', 'gengar-mega': 'gengarite', 'kangaskhan-mega': 'kangaskhanite',
  'pinsir-mega': 'pinsirite', 'gyarados-mega': 'gyaradosite', 'aerodactyl-mega': 'aerodactylite', 'mewtwo-mega-x': 'mewtwonite-x', 'mewtwo-mega-y': 'mewtwonite-y',
};
for (const [form, stone] of Object.entries(MEGA_STONES)) {
  if (handIds.has(form) || !FORMS[form]) continue;
  const f = FORMS[form];
  const baseModel = generatedPokemon.find((p) => p.id === f.baseSpecies) ?? handPokemon.find((p) => p.id === f.baseSpecies);
  const ability = f.abilities.find((a) => !a.hidden)?.name ?? f.abilities[0]?.name;
  const nm = 'Mega ' + (SP[f.baseSpecies]?.displayName ?? cap(f.baseSpecies)) + (form.endsWith('-x') ? ' X' : form.endsWith('-y') ? ' Y' : '');
  generatedPokemon.push(model(form, { ...f, displayName: nm }, f.types, f.baseStats, ability, { baseSpecies: f.baseSpecies, skills: baseModel?.skills, name: nm, mega: { base: f.baseSpecies, stone } }));
}

// Boss-only Mega forms: real PokéAPI form data, used by a boss phase (form change), never by the player.
// Mega Rayquaza needs no stone in the main series (Dragon Ascent) → `bossOnly` keeps it out of megaFormsOf().
for (const form of ['rayquaza-mega']) {
  if (handIds.has(form) || !FORMS[form]) continue;
  const f = FORMS[form];
  const baseModel = generatedPokemon.find((p) => p.id === f.baseSpecies) ?? handPokemon.find((p) => p.id === f.baseSpecies);
  const ability = f.abilities.find((a) => !a.hidden)?.name ?? f.abilities[0]?.name;
  const nm = 'Mega ' + (SP[f.baseSpecies]?.displayName ?? cap(f.baseSpecies));
  generatedPokemon.push(model(form, { ...f, displayName: nm }, f.types, f.baseStats, ability, { baseSpecies: f.baseSpecies, skills: baseModel?.skills, name: nm, mega: { base: f.baseSpecies, stone: 'dragon-ascent', bossOnly: true } }));
}

// ───────────────────────────── ecology (BiomeSpawnManager / RaritySystem input) ─────────────────────────────
// Every National Dex species #1–#1025 gets: biomes, rarity tier, evolution stage, wild level floor, time, weather
// multipliers and an encounter method. Rules are documented in GAMEPLAY_AUDIT.md (V3).
const PAPI_HABITAT = { grassland: ['meadow'], forest: ['forest'], 'waters-edge': ['lake'], sea: ['lake'], cave: ['ruins', 'rocky'], mountain: ['rocky'], 'rough-terrain': ['rocky'], urban: ['farm'] };
const TYPE_BIOME = { water: 'lake', grass: 'forest', bug: 'forest', rock: 'rocky', ground: 'rocky', steel: 'rocky', fighting: 'rocky', ghost: 'ruins', psychic: 'ruins', dark: 'ruins', normal: 'meadow', flying: 'meadow', electric: 'meadow', fairy: 'meadow', poison: 'forest', dragon: 'rocky', fire: 'volcano', ice: 'snow' };
// Núi Tuyết / Vùng Núi Lửa / Thánh Địa have their own maps since 0.7.0
const MAP_BIOMES = new Set(['meadow', 'forest', 'lake', 'rocky', 'ruins', 'farm', 'snow', 'volcano', 'sanctuary', 'swamp', 'coast']);
// Đầm Lầy Sương Mù / Bờ Biển San Hô (0.9.0): added on top of the existing biomes (no species leaves its old biomes)
function extraBiomes(sp) {
  const t = new Set(sp.types), out = [];
  if (t.has('poison') || (t.has('water') && t.has('ground')) || (sp.habitat === 'waters-edge' && (t.has('bug') || t.has('grass'))) || (t.has('ghost') && t.has('grass'))) out.push('swamp');
  if (sp.habitat === 'sea' || (t.has('water') && (t.has('flying') || t.has('rock'))) || (t.has('water') && sp.habitat === 'waters-edge' && !t.has('ground'))) out.push('coast');
  return out;
}
// Gifts / fossils / starters: only through events (outbreaks, distortion zones) or story
const EVENT_ONLY = new Set([
  'bulbasaur', 'charmander', 'squirtle', 'chikorita', 'cyndaquil', 'totodile', 'treecko', 'torchic', 'mudkip', 'turtwig', 'chimchar', 'piplup',
  'omanyte', 'kabuto', 'aerodactyl', 'lileep', 'anorith', 'cranidos', 'shieldon', 'porygon', 'spiritomb', 'rotom', 'castform', 'kecleon',
  // Gen 5–9 starters and fossils
  'snivy', 'tepig', 'oshawott', 'chespin', 'fennekin', 'froakie', 'rowlet', 'litten', 'popplio', 'grookey', 'scorbunny', 'sobble', 'sprigatito', 'fuecoco', 'quaxly',
  'tirtouga', 'archen', 'tyrunt', 'amaura', 'dracozolt', 'arctozolt', 'dracovish', 'arctovish', 'type-null', 'silvally',
  // Ultra Beasts (not flagged legendary by PokéAPI) and Paradox Pokémon: never ordinary random spawns
  'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon',
]);
/** Paradox Pokémon (Scarlet / Violet): ancient & future forms — event / story encounters only */
const PARADOX = new Set(['great-tusk', 'scream-tail', 'brute-bonnet', 'flutter-mane', 'slither-wing', 'sandy-shocks', 'roaring-moon', 'walking-wake', 'gouging-fire', 'raging-bolt',
  'iron-treads', 'iron-bundle', 'iron-hands', 'iron-jugulis', 'iron-moth', 'iron-thorns', 'iron-valiant', 'iron-leaves', 'iron-boulder', 'iron-crown']);
for (const p of PARADOX) EVENT_ONLY.add(p);
const PSEUDO = new Set(['dratini', 'larvitar', 'bagon', 'beldum', 'gible', 'deino', 'goomy', 'jangmo-o', 'dreepy', 'frigibax']);
const SPECIAL_EPIC = new Set(['eevee', 'chansey', 'lapras', 'snorlax', 'scyther', 'pinsir', 'tauros', 'kangaskhan', 'ditto', 'heracross', 'skarmory', 'absol', 'riolu', 'munchlax', 'feebas', 'tropius', 'relicanth', 'lickitung', 'togepi', 'happiny']);
const TIERS = ['common', 'uncommon', 'rare', 'epic', 'ultra'];
const genNum = (g) => ({ 'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4, 'generation-v': 5, 'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8, 'generation-ix': 9 })[g] ?? 0;
const stageOf = (name) => { let n = 0, cur = SP[name]; while (cur?.evolvesFrom && SP[cur.evolvesFrom] && !SP[cur.evolvesFrom].isBaby) { n++; cur = SP[cur.evolvesFrom]; } return Math.min(2, n); };
function minLevelOf(name, stage) {
  const sp = SP[name];
  if (stage === 0) {
    // evolved from a baby by *level* (Elekid → Electabuzz 30, Tyrogue → Hitmon 20): that level is the wild floor;
    // friendship / item babies (Pichu → Pikachu) keep a low floor, as in the main series
    const pre = sp?.evolvesFrom && SP[sp.evolvesFrom]?.isBaby ? SP[sp.evolvesFrom] : null;
    const rule = pre?.evolutions.find((e) => e.from === sp.evolvesFrom && e.to === name && e.minLevel != null);
    return rule?.minLevel ?? 1;
  }
  const rule = SP[sp.evolvesFrom]?.evolutions.find((e) => e.from === sp.evolvesFrom && e.to === name && e.minLevel != null);
  const own = rule?.minLevel ?? (stage === 1 ? 20 : 30);
  // a stage-2 form also can't be below its middle form's floor
  return stage === 2 ? Math.max(own, minLevelOf(sp.evolvesFrom, 1)) : own;
}
// Aquatic species live and move in water only (spawn on water tiles, can't walk on land): PokéAPI shape "fish"
// (except the seals, which haul out on beaches) + sea creatures of other shapes.
const AQUATIC_EXTRA = new Set(['tentacool', 'tentacruel', 'octillery', 'horsea', 'seadra', 'kingdra', 'gyarados', 'milotic', 'huntail', 'gorebyss', 'mantine', 'mantyke']);
const NOT_AQUATIC = new Set(['seel', 'dewgong', 'spheal', 'sealeo', 'popplio', 'brionne', 'primarina']);
const isAquatic = (id, sp) => sp.types.includes('water') && !sp.legendary && !sp.mythical && !NOT_AQUATIC.has(id) && (sp.shape === 'fish' || AQUATIC_EXTRA.has(id));
const ecology = [];
for (const [id, sp] of Object.entries(SP)) {
  if (!sp.generation || sp.id > 1025) continue;
  const stage = stageOf(id);
  let biomes = [...(PAPI_HABITAT[sp.habitat] ?? [])];
  for (const t of sp.types) {
    const b = TYPE_BIOME[t];
    if (!biomes.length || b === 'snow' || b === 'volcano' || (t === 'water' && !biomes.includes('lake'))) biomes.push(b);
  }
  if (!sp.isBaby) biomes.push(...extraBiomes(sp));
  if (sp.isBaby) biomes = ['farm']; // babies: the farm's nursery fields only
  // Legendary Sanctuary: fully evolved species (no further evolution) and pseudo-legendaries / the rarest basics
  const evolvesFurther = Object.values(SP).some((o) => o.evolvesFrom === id);
  if (!sp.isBaby && !sp.legendary && !sp.mythical && ((stage >= 1 && !evolvesFurther) || (stage === 0 && !evolvesFurther && sp.captureRate <= 45) || PSEUDO.has(id))) biomes.push('sanctuary');
  biomes = [...new Set(biomes.filter(Boolean))];
  const onMap = biomes.some((b) => MAP_BIOMES.has(b));
  let method = sp.legendary ? 'legendary' : sp.mythical ? 'mythical' : EVENT_ONLY.has(id) ? 'event' : onMap ? 'wild' : 'event';
  // capture-rate driven tier, evolved forms one step rarer when they'd be common, special picks floor at epic
  let tier = sp.captureRate >= 190 ? 0 : sp.captureRate >= 120 ? 1 : sp.captureRate >= 60 ? 2 : sp.captureRate >= 25 ? 3 : 4;
  if (stage >= 1 && tier === 0) tier = 1;
  if (stage === 2 && tier < 2) tier = 2;
  if (SPECIAL_EPIC.has(id)) tier = Math.max(tier, 3);
  if (PSEUDO.has(id)) tier = 4;
  if (sp.isBaby) tier = Math.max(tier, 2);
  const has = (t) => sp.types.includes(t);
  const weather = {};
  const mul = (k, v) => { weather[k] = round((weather[k] ?? 1) * v, 2); };
  if (has('water')) { mul('rain', 1.6); mul('heavyRain', 2); mul('thunderstorm', 1.3); }
  if (has('electric')) { mul('rain', 1.3); mul('thunderstorm', 2.5); }
  if (has('fire')) { mul('rain', 0.5); mul('heavyRain', 0.3); mul('heatwave', 2); }
  if (has('ice')) { mul('blizzard', 2.5); mul('heatwave', 0.3); }
  if (has('ghost') || has('psychic')) { mul('fog', 1.8); mul('mysticFog', 2.5); }
  if (has('grass')) { mul('clear', 1.2); mul('heatwave', 0.7); }
  if (has('flying')) mul('thunderstorm', 0.5);
  if (has('ground') || has('rock')) mul('heatwave', 1.3);
  ecology.push({
    id, dex: sp.id, gen: genNum(sp.generation), biomes, rarity: TIERS[tier], stage, minLevel: minLevelOf(id, stage),
    time: has('ghost') || has('dark') || ['clefairy', 'jigglypuff', 'hoothoot', 'noctowl', 'drowzee', 'murkrow', 'misdreavus', 'kricketot', 'zubat', 'oddish'].includes(id) ? 'night' : 'any',
    weather, method, temperament: sp.types.some((t) => ['fighting', 'poison', 'ghost', 'dragon', 'dark'].includes(t)) ? 'aggressive' : sp.captureRate >= 190 ? 'timid' : 'neutral',
    weight: round(1 + sp.captureRate / 255, 2), legendary: !!sp.legendary, mythical: !!sp.mythical, baby: !!sp.isBaby, ...(isAquatic(id, sp) ? { aquatic: true } : {}), ...(PARADOX.has(id) ? { paradox: true } : {}),
  });
}
ecology.sort((a, b) => a.dex - b.dex);

mkdirSync('src/data/dex', { recursive: true });
writeFileSync('src/data/dex/skills.json', JSON.stringify(Object.values(generatedSkills), null, 0).replace(/},{/g, '},\n{'));
writeFileSync('src/data/dex/pokemon.json', JSON.stringify(generatedPokemon, null, 0).replace(/},{"id"/g, '},\n{"id"'));
writeFileSync('src/data/dex/ecology.json', JSON.stringify(ecology, null, 0).replace(/},{"id"/g, '},\n{"id"'));
const roles = {};
for (const p of generatedPokemon) roles[p.role] = (roles[p.role] ?? 0) + 1;
const methods = {}, tiers = {};
for (const e of ecology) { methods[e.method] = (methods[e.method] ?? 0) + 1; tiers[e.rarity] = (tiers[e.rarity] ?? 0) + 1; }
console.log(`generated ${generatedPokemon.length} Pokémon (+${handPokemon.length} hand-tuned), ${Object.keys(generatedSkills).length} skills; roles`, roles);
console.log(`ecology: ${ecology.length} species`, methods, tiers);

// ───────────────────────────── legendary bosses (LegendaryEncounterManager) ─────────────────────────────
// One boss definition per Legendary / Mythical not hand-tuned in bosses.json. Kit = per-type pattern skills +
// signature move; power follows the curve tuned on the Gen 1 birds / Mewtwo: 0.45·(40/level)·(110/max(Atk,SpA)).
const handBosses = new Set(JSON.parse(readFileSync('src/data/bosses.json', 'utf8')).map((b) => b.id));
const LEGEND_LEVEL = {
  raikou: 40, entei: 40, suicune: 40, lugia: 45, 'ho-oh': 45, celebi: 30, regirock: 42, regice: 42, registeel: 42, latias: 45, latios: 45,
  kyogre: 50, groudon: 50, rayquaza: 55, jirachi: 35, deoxys: 55, uxie: 45, mesprit: 45, azelf: 45, dialga: 55, palkia: 55, heatran: 50,
  regigigas: 52, giratina: 58, cresselia: 48, phione: 20, manaphy: 20, darkrai: 52, shaymin: 30, arceus: 65,
};
const SIGNATURE = { lugia: 'aeroblast', 'ho-oh': 'sacred_fire', dialga: 'roar_of_time', palkia: 'spacial_rend', giratina: 'shadow_force', heatran: 'magma_storm', jirachi: 'doom_desire', latios: 'luster_purge', latias: 'mist_ball', darkrai: 'dark_pulse', kyogre: 'water_spout', groudon: 'eruption', rayquaza: 'outrage', regigigas: 'superpower', deoxys: 'psycho_cut', arceus: 'hyper_beam' };
const TYPE_STATUS = { fire: ['burn', 3, 0.03], electric: ['paralysis', 3, 0.5], ice: ['freeze', 1.5, 0], poison: ['badPoison', 5, 0.02], grass: ['sleep', 1.5, 0], psychic: ['confusion', 3, 0], ghost: ['confusion', 3, 0], fairy: ['confusion', 3, 0], dark: ['defDown', 4, 0.3], steel: ['defDown', 4, 0.3], fighting: ['defDown', 4, 0.3], normal: ['defDown', 4, 0.3], dragon: ['paralysis', 2, 0.5], water: ['slow', 3, 0.4], ground: ['slow', 3, 0.4], rock: ['slow', 3, 0.4], flying: ['slow', 3, 0.4], bug: ['slow', 3, 0.4] };
const TYPE_STYLE = { electric: 'storm', rock: 'storm', flying: 'storm', bug: 'storm', fire: 'spokes', dragon: 'spokes', steel: 'spokes', fighting: 'spokes', ice: 'safe', water: 'safe', ground: 'safe', grass: 'safe', poison: 'safe' };
const SPECIAL_STYLE = { dialga: 'timestop', palkia: 'rift', arceus: 'judgment' };
// per-legend tuning from scripts/legend-balance.test.ts (target ≈ 60–110 s for a matching 6-Pokémon party);
// bulky flyers / blinkers (Lugia, Latias, lake guardians, Cresselia) were taking 150–220 s
const HP_TUNE = { lugia: 60, latias: 70, uxie: 70, mesprit: 70, cresselia: 50 };
const POWER_TUNE = { cresselia: 0.4 };
const allSkills = Object.values(allMoveDefs());
const ofType = (t, kinds) => allSkills.filter((s) => s.type === t && kinds.includes(s.kind) && s.power > 0).sort((a, b) => b.power - a.power);
const legendBosses = [];
for (const [id, lv] of Object.entries(LEGEND_LEVEL)) {
  if (handBosses.has(id) || !SP[id]) continue;
  const sp = SP[id];
  const t = sp.types[0], t2 = sp.types[1] ?? t;
  const ok = movesUpTo(sp);
  const ofType = (ty, kinds) => allSkills.filter((s) => s.type === ty && kinds.includes(s.kind) && s.power > 0 && ok(s)).sort((a, b) => b.power - a.power);
  const pick = (kinds, fallbackType) => (ofType(t, kinds)[0] ?? ofType(t2, kinds)[0] ?? ofType(fallbackType ?? 'normal', kinds)[0] ?? ofType('normal', ['melee'])[0]).id;
  const beam = SIGNATURE[id] && allMoveDefs()[SIGNATURE[id]] ? SIGNATURE[id] : pick(['beam', 'projectile']);
  const volley = pick(['aoe', 'projectile']);
  const nova = pick(['aoe', 'melee']);
  const fieldSkill = allSkills.find((s) => s.type === t && (s.kind === 'field' || s.kind === 'debuff') && s.status && ok(s)) ?? allSkills.find((s) => s.type === t2 && (s.kind === 'field' || s.kind === 'debuff') && s.status && ok(s));
  const [sk, sd, sm] = TYPE_STATUS[t] ?? TYPE_STATUS.normal;
  const ult = [...ofType(t, ['beam', 'aoe', 'projectile', 'melee']), ...ofType(t2, ['beam', 'aoe'])][0]?.id ?? beam;
  const st = sp.baseStats;
  const power = POWER_TUNE[id] ?? round(Math.min(0.5, 0.45 * (40 / lv) * (110 / Math.max(st.atk, st.spa))), 2);
  const flying = sp.types.includes('flying') || ['latias', 'latios', 'cresselia', 'mesprit', 'uxie', 'azelf', 'jirachi', 'celebi', 'deoxys'].includes(id);
  const blink = sp.types.includes('psychic') || sp.types.includes('ghost') || sp.mythical || id === 'darkrai' || id === 'palkia';
  const summon = Object.entries(SP).find(([sid, s]) => s.types[0] === t && !s.legendary && !s.mythical && !s.evolvesFrom && !s.isBaby && sid !== id && (GEN_N[s.generation] ?? 9) <= Math.max(4, GEN_N[sp.generation] ?? 9))?.[0] ?? 'rattata';
  legendBosses.push({
    id, name: sp.displayName ?? cap(id), types: sp.types, baseStats: st, hpMult: HP_TUNE[id] ?? (id === 'arceus' ? 150 : ['dialga', 'palkia', 'giratina', 'regigigas'].includes(id) ? 120 : 100),
    moveSpeed: flying ? 95 : 70, radius: Math.round(Math.min(44, 30 + (sp.heightDm ?? 20) / 3)), contactPower: 55, segments: 0,
    skills: [...new Set([beam, volley, nova])], phase2Threshold: 0.5, phase2Summon: { enemy: summon, count: lv >= 55 ? 3 : 2 },
    phase3Threshold: 0.25, phase3Banner: 'đang dồn toàn bộ sức mạnh!', exp: 140, sprite: id, ai: 'legendary', scale: id === 'arceus' || id === 'regigigas' || id === 'giratina' ? 5 : 4.5, survivor: false,
    legend: {
      beam, volley, nova, field: fieldSkill?.id ?? nova, fieldStatus: fieldSkill?.status ?? { kind: sk, chance: 0.5, duration: sd, magnitude: sm },
      ultimate: ult, ultimateName: `${SIGNATURE[id] ? allMoveDefs()[SIGNATURE[id]].name : allMoveDefs()[ult].name} tối thượng`,
      ultimateStyle: SPECIAL_STYLE[id] ?? (sp.mythical || ['psychic', 'ghost', 'dark', 'normal', 'fairy'].includes(t) ? 'mixed' : TYPE_STYLE[t] ?? 'mixed'),
      flying, blink, power,
    },
  });
}
writeFileSync('src/data/dex/legend-bosses.json', JSON.stringify(legendBosses, null, 1));
console.log(`legend bosses: ${legendBosses.length} generated (+${handBosses.size} hand-tuned)`);
