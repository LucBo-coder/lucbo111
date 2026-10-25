import cache from '../data/pokeapi/pokeapi-cache.json';
import itemsJson from '../data/items.json';
import { POKEMON, SKILLS } from './data';

// EvolutionRuleEngine. Every PokéAPI `evolution_details` entry is one rule; each condition field is
// checked by its own evaluator, so adding a condition never means touching a big if/else.
// Adaptations for a solo real-time game (also listed in EVOLUTION_EQUIPMENT_MEGA.md):
//  • trade                → use a Linking Cord (and hold the rule's item, which is consumed)
//  • min_affection        → friendship ≥ 220 (the game has a single bond value)
//  • location             → the matching habitat of the current area (moss-rock forests → forest…)
//  • time_of_day "dusk"   → night

export interface EvoRule {
  from: string; to: string; trigger: string;
  minLevel: number | null; item: string | null; heldItem?: string | null;
  minHappiness?: number | null; minAffection?: number | null; timeOfDay?: string | null;
  knownMove?: string | null; knownMoveType?: string | null; location?: string | null; needsRain?: boolean;
  gender?: number | null; relativeStats?: number | null; tradeSpecies?: string | null;
}
const SPECIES = (cache as unknown as { species: Record<string, { evolutions: EvoRule[] }> }).species;

export interface ItemDef {
  id: string;
  name: string;
  kind: 'held' | 'evoStone' | 'megaStone' | 'key' | 'evItem';
  price: number;
  color: string;
  desc: string;
  effect?: { type: 'typeBoost' | 'categoryBoost' | 'superEffective' | 'crit' | 'cdr' | 'regen' | 'drain' | 'focus' | 'flinch' | 'lifeOrb' | 'choice' | 'assaultVest' | 'rockyHelmet' | 'eviolite' | 'sitrus' | 'sash' | 'evPower'; pokeType?: string; category?: string; mult?: number; value?: number; stat?: string };
  /** Vitamins (+) and EV-reducing berries (−) */
  ev?: { stat: string; amount: number };
  megaFor?: string;
  form?: string;
  /** pixel icon shape when it differs from the kind's default (apple, cup, armor, scroll, disc, claw, scale, berry) */
  icon?: string;
}
export const ITEM_DEFS = new Map((itemsJson as ItemDef[]).map((i) => [i.id, i]));

/** What the game knows about a Pokémon when checking evolutions. */
export interface EvoContext {
  level: number;
  friendship?: number;
  timeOfDay?: 'day' | 'night';
  heldItem?: string | null;
  /** Skill ids the Pokémon currently knows */
  knownSkills?: string[];
  /** Habitat of the area the trainer is in */
  habitat?: string | null;
  raining?: boolean;
  /** Item being used on it right now (stone / Linking Cord) */
  usedItem?: string | null;
  stats?: { atk: number; def: number };
}

/** PokéAPI location → habitat of this game's map (location evolutions). */
export const LOCATION_HABITAT: Record<string, string> = {
  'eterna-forest': 'forest', 'petalburg-woods': 'forest', 'pinwheel-forest': 'forest', 'lush-jungle': 'forest', 'kalos-route-20': 'forest',
  'mt-coronet': 'rocky', 'chargestone-cave': 'rocky', 'new-mauville': 'rocky', 'vast-poni-canyon': 'rocky', 'blush-mountain': 'rocky', 'kalos-route-13': 'rocky',
};
const HABITAT_NAME: Record<string, string> = { forest: 'vùng rừng', rocky: 'vùng đá' };
const itemName = (id: string) => ITEM_DEFS.get(id)?.name ?? id;
const skillApi = (id: string) => id.replace(/_/g, '-');

interface Evaluator {
  applies(r: EvoRule): boolean;
  /** Reason when this condition can't be met in this game */
  unsupported?(r: EvoRule): string | null;
  ok(r: EvoRule, c: EvoContext): boolean;
  text(r: EvoRule): string;
}

const EVALUATORS: Evaluator[] = [
  { applies: (r) => r.minLevel != null, ok: (r, c) => c.level >= r.minLevel!, text: (r) => `Lv${r.minLevel}` },
  { applies: (r) => r.minHappiness != null, ok: (r, c) => (c.friendship ?? 0) >= r.minHappiness!, text: (r) => `thân thiết ≥ ${r.minHappiness}` },
  { applies: (r) => r.minAffection != null, ok: (_r, c) => (c.friendship ?? 0) >= 220, text: () => 'thân thiết ≥ 220' },
  {
    applies: (r) => !!r.timeOfDay, ok: (r, c) => (r.timeOfDay === 'day' ? c.timeOfDay === 'day' : c.timeOfDay === 'night'),
    text: (r) => (r.timeOfDay === 'day' ? 'ban ngày' : 'ban đêm'),
  },
  {
    applies: (r) => !!r.heldItem, unsupported: (r) => (ITEM_DEFS.has(r.heldItem!) ? null : `Cần cầm ${r.heldItem} (chưa có trong game)`),
    ok: (r, c) => c.heldItem === r.heldItem, text: (r) => `cầm ${itemName(r.heldItem!)}`,
  },
  {
    applies: (r) => !!r.knownMove, unsupported: (r) => ([...SKILLS.keys()].some((k) => skillApi(k) === r.knownMove) ? null : `Cần chiêu ${r.knownMove} (chưa có trong game)`),
    ok: (r, c) => (c.knownSkills ?? []).some((k) => skillApi(k) === r.knownMove), text: (r) => `biết chiêu ${r.knownMove}`,
  },
  {
    applies: (r) => !!r.knownMoveType, ok: (r, c) => (c.knownSkills ?? []).some((k) => SKILLS.get(k)?.type === r.knownMoveType),
    text: (r) => `biết chiêu hệ ${r.knownMoveType}`,
  },
  {
    applies: (r) => !!r.location, unsupported: (r) => (LOCATION_HABITAT[r.location!] ? null : `Cần địa điểm ${r.location} (chưa có vùng tương ứng)`),
    ok: (r, c) => c.habitat === LOCATION_HABITAT[r.location!], text: (r) => `lên cấp ở ${HABITAT_NAME[LOCATION_HABITAT[r.location!]] ?? r.location}`,
  },
  { applies: (r) => !!r.needsRain, ok: (_r, c) => !!c.raining, text: () => 'khi trời mưa' },
  {
    applies: (r) => r.relativeStats != null, ok: (r, c) => !!c.stats && Math.sign(c.stats.atk - c.stats.def) === r.relativeStats,
    text: (r) => (r.relativeStats! > 0 ? 'Tấn công > Phòng thủ' : r.relativeStats! < 0 ? 'Tấn công < Phòng thủ' : 'Tấn công = Phòng thủ'),
  },
  // no genders in this game: a gendered *item* evolution (Dawn Stone: Kirlia → Gallade, Snorunt → Froslass) works for any
  // individual; gendered level-up branches (Combee, Burmy…) stay unsupported
  { applies: (r) => r.gender != null && r.trigger !== 'use-item', unsupported: () => 'Cần giới tính (game chưa có giới tính)', ok: () => false, text: () => 'giới tính' },
  { applies: (r) => !!r.tradeSpecies, unsupported: () => 'Cần trao đổi với một loài cụ thể', ok: () => false, text: () => 'trao đổi đặc biệt' },
];

export interface EvolutionOption {
  to: string;
  /** Trade is played as 'use-item' with the Linking Cord */
  trigger: 'level-up' | 'use-item' | 'other';
  minLevel: number | null;
  item: string | null;
  rule: EvoRule;
  /** Human readable conditions (Vietnamese) */
  conditions: string[];
  /** Why it can't happen in this game (unsupported condition or the target isn't in the game) */
  unsupported: string | null;
}

function toOption(e: EvoRule): EvolutionOption {
  const isTrade = e.trigger === 'trade';
  const trigger: EvolutionOption['trigger'] = e.trigger === 'level-up' ? 'level-up' : e.trigger === 'use-item' || isTrade ? 'use-item' : 'other';
  const item = isTrade ? 'linking-cord' : e.item;
  const active = EVALUATORS.filter((ev) => ev.applies(e));
  let unsupported: string | null = null;
  if (trigger === 'other') unsupported = `Điều kiện "${e.trigger}" chưa hỗ trợ`;
  for (const ev of active) unsupported = unsupported ?? ev.unsupported?.(e) ?? null;
  if (!unsupported && trigger === 'use-item' && item && !ITEM_DEFS.has(item)) unsupported = `Cần ${item} (chưa có trong game)`;
  if (!unsupported && trigger === 'level-up' && !active.length) unsupported = 'Cần điều kiện đặc biệt — chưa hỗ trợ';
  if (!unsupported && !POKEMON.has(e.to)) unsupported = `${e.to} chưa có trong game`;
  const conditions = [...(trigger === 'use-item' ? [`dùng ${itemName(item!)}`] : []), ...active.map((ev) => ev.text(e))];
  return { to: e.to, trigger, minLevel: e.minLevel, item, rule: e, conditions, unsupported };
}

const optionCache = new Map<string, EvolutionOption[]>();

/** All evolution rules of a species (one option per PokéAPI condition set, duplicates merged). */
export function evolutionsOf(species: string): EvolutionOption[] {
  const hit = optionCache.get(species);
  if (hit) return hit;
  const seen = new Set<string>();
  const out: EvolutionOption[] = [];
  for (const sp of Object.values(SPECIES)) {
    for (const e of sp.evolutions) {
      if (e.from !== species) continue;
      const o = toOption(e);
      const key = `${o.to}|${o.trigger}|${o.item}|${o.conditions.join(',')}|${o.unsupported ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
  }
  // supported options first so callers that take "the" option get a playable one
  out.sort((a, b) => Number(!!a.unsupported) - Number(!!b.unsupported));
  optionCache.set(species, out);
  return out;
}

/** True when every condition of the option holds (trigger included). */
export function evaluate(o: EvolutionOption, c: EvoContext): boolean {
  if (o.unsupported) return false;
  if (o.trigger === 'use-item' && c.usedItem !== o.item) return false;
  if (o.trigger === 'level-up' && c.usedItem) return false;
  return EVALUATORS.every((ev) => !ev.applies(o.rule) || ev.ok(o.rule, c));
}

/** Conditions of the option that are not met yet (for the UI). */
export function missingConditions(o: EvolutionOption, c: EvoContext): string[] {
  return EVALUATORS.filter((ev) => ev.applies(o.rule) && !ev.ok(o.rule, c)).map((ev) => ev.text(o.rule));
}

/** Every evolution available right now. Several results = a real branch the player must choose from. */
export function availableEvolutions(species: string, c: EvoContext): EvolutionOption[] {
  const out: EvolutionOption[] = [];
  for (const o of evolutionsOf(species)) if (evaluate(o, c) && !out.some((x) => x.to === o.to)) out.push(o);
  return out;
}

/** The first level-up evolution available right now, if any (context defaults: no friendship, daytime). */
export function levelEvolution(species: string, level: number, c: Partial<EvoContext> = {}): EvolutionOption | null {
  return availableEvolutions(species, { ...c, level, usedItem: null }).find((o) => o.trigger === 'level-up') ?? null;
}

/** Evolution triggered by using `item` on the species, if any. */
export function itemEvolution(species: string, item: string, c: Partial<EvoContext> = {}): EvolutionOption | null {
  return availableEvolutions(species, { level: 100, ...c, usedItem: item })[0] ?? null;
}

/** First-stage → final chain, e.g. charmander → [charmeleon, charizard] (playable only). */
export function evolutionLine(species: string): string[] {
  const line: string[] = [];
  let cur = species;
  for (let i = 0; i < 3; i++) {
    const next = evolutionsOf(cur).find((e) => !e.unsupported);
    if (!next) break;
    line.push(next.to);
    cur = next.to;
  }
  return line;
}

// ───────────────────────────── Mega ─────────────────────────────

export const MEGA_DURATION = 90; // s
export const MEGA_COOLDOWN = 120; // s after reverting
export const MEGA_IDLE_REVERT = 10; // s without combat → revert

/** Mega forms a species can reach, with the stone each requires. */
export function megaFormsOf(species: string): { form: string; stone: string }[] {
  return [...POKEMON.values()].filter((p) => p.mega?.base === species && !p.mega.bossOnly).map((p) => ({ form: p.id, stone: p.mega!.stone }));
}

export interface MegaCheck {
  ok: boolean;
  form?: string;
  reason?: string;
}

export function canMega(species: string, heldItem: string | undefined, hasKeyStone: boolean, megaActive: boolean, cooldown: number): MegaCheck {
  if (!hasKeyStone) return { ok: false, reason: 'Cần Vòng Mega (Key Stone)' };
  if (megaActive) return { ok: false, reason: 'Chỉ một Pokémon được Mega Tiến Hóa cùng lúc' };
  if (cooldown > 0) return { ok: false, reason: `Vòng Mega đang hồi (${Math.ceil(cooldown)}s)` };
  const forms = megaFormsOf(species);
  if (!forms.length) return { ok: false, reason: `${species} không có dạng Mega` };
  const f = forms.find((x) => x.stone === heldItem);
  if (!f) return { ok: false, reason: `Cần cầm ${forms.map((x) => ITEM_DEFS.get(x.stone)?.name ?? x.stone).join(' hoặc ')}` };
  return { ok: true, form: f.form };
}
