import skillsJson from '../data/skills.json';
import pokemonJson from '../data/pokemon.json';
import enemiesJson from '../data/enemies.json';
import bossesJson from '../data/bosses.json';
import upgradesJson from '../data/upgrades.json';
import dexPokemon from '../data/dex/pokemon.json';
import dexMegas from '../data/dex/megas.json';
import dexSkills from '../data/dex/skills.json';
import legendBossesJson from '../data/dex/legend-bosses.json';
import { BossDef, EnemyDef, PokemonDef, POKE_TYPES, Rarity, SkillDef } from './types';

export interface StatUpgradeDef {
  id: string;
  stat: ModStat;
  base: number;
  cap: number;
  percent: boolean;
  minRarity?: Rarity;
  icon: string;
  name: string;
  desc: string;
}
export type ModStat =
  | 'dmgMult' | 'cdr' | 'hpMult' | 'areaMult' | 'critBonus' | 'trainerSpeed' | 'magnet' | 'energyRegen' | 'extraProjectiles';

export interface UpgradeConfig {
  rarityWeights: Record<Rarity, number>;
  rarityScale: Record<Rarity, number>;
  maxSkillLevel: number;
  maxParty: number;
  stats: StatUpgradeDef[];
}

function indexById<T extends { id: string }>(list: T[], label: string): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of list) {
    if (m.has(it.id)) throw new Error(`Duplicate ${label} id: ${it.id}`);
    m.set(it.id, it);
  }
  return m;
}

// Hand-tuned data first; the National Dex generator (scripts/build-dex.mjs) only fills species/moves not defined by hand.
export const SKILLS = indexById([...(skillsJson as SkillDef[]), ...(dexSkills as SkillDef[])], 'skill');
// Gen 2–6 Mega forms (hand-entered stats, see data/dex/megas.json) — their stones are in items.json
export const POKEMON = indexById([...(pokemonJson as PokemonDef[]), ...(dexPokemon as PokemonDef[]), ...(dexMegas as unknown as PokemonDef[])], 'pokemon');
export const ENEMIES = indexById(enemiesJson as EnemyDef[], 'enemy');
// hand-tuned bosses first, then the generated Gen 1–4 legendaries (scripts/build-dex.mjs)
export const BOSSES = indexById([...(bossesJson as BossDef[]), ...(legendBossesJson as unknown as BossDef[]).filter((b) => !(bossesJson as BossDef[]).some((h) => h.id === b.id))], 'boss');
export const UPGRADES = upgradesJson as UpgradeConfig;

/** Species that can be picked/recruited directly (excludes Mega forms). */
export function playableSpecies(): string[] {
  return [...POKEMON.values()].filter((p) => !p.mega).map((p) => p.id);
}

export function getSkill(id: string): SkillDef {
  const s = SKILLS.get(id);
  if (!s) throw new Error(`Unknown skill: ${id}`);
  return s;
}

/** Cross-reference validation so bad data fails loudly at boot (and in tests). */
export function validateData(): string[] {
  const errors: string[] = [];
  const typeOk = (t: string) => (POKE_TYPES as readonly string[]).includes(t);
  for (const s of SKILLS.values()) {
    if (!typeOk(s.type)) errors.push(`skill ${s.id}: bad type ${s.type}`);
    if (s.cooldown <= 0) errors.push(`skill ${s.id}: cooldown must be > 0`);
    if (s.kind === 'projectile' && !s.projectile) errors.push(`skill ${s.id}: missing projectile`);
    if (s.kind === 'field' && !s.field) errors.push(`skill ${s.id}: missing field`);
    if (s.kind === 'dash' && !s.dash) errors.push(`skill ${s.id}: missing dash`);
    if (s.kind === 'heal' && !s.heal) errors.push(`skill ${s.id}: missing heal`);
    if (s.kind === 'shield' && !s.shield) errors.push(`skill ${s.id}: missing shield`);
  }
  for (const p of POKEMON.values()) {
    if (p.skills.length !== 4) errors.push(`pokemon ${p.id}: needs exactly 4 skills`);
    for (const sk of p.skills) if (!SKILLS.has(sk)) errors.push(`pokemon ${p.id}: unknown skill ${sk}`);
    for (const t of p.types) if (!typeOk(t)) errors.push(`pokemon ${p.id}: bad type ${t}`);
    if (p.types.length < 1 || p.types.length > 2) errors.push(`pokemon ${p.id}: 1-2 types`);
    if (p.evolution && !POKEMON.has(p.evolution.into)) errors.push(`pokemon ${p.id}: unknown evolution ${p.evolution.into}`);
    if (p.mega && !POKEMON.has(p.mega.base)) errors.push(`pokemon ${p.id}: unknown mega base ${p.mega.base}`);
  }
  for (const e of ENEMIES.values()) {
    for (const sk of e.skills) if (!SKILLS.has(sk)) errors.push(`enemy ${e.id}: unknown skill ${sk}`);
  }
  for (const b of BOSSES.values()) {
    for (const sk of b.skills) if (!SKILLS.has(sk)) errors.push(`boss ${b.id}: unknown skill ${sk}`);
    if (b.legend) for (const sk of [b.legend.beam, b.legend.volley, b.legend.nova, b.legend.field, b.legend.ultimate]) if (!SKILLS.has(sk)) errors.push(`boss ${b.id}: unknown legend skill ${sk}`);
    if (!ENEMIES.has(b.phase2Summon.enemy) && !POKEMON.has(b.phase2Summon.enemy)) errors.push(`boss ${b.id}: unknown summon ${b.phase2Summon.enemy}`);
  }
  return errors;
}
