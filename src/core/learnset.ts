import cache from '../data/pokeapi/pokeapi-cache.json';
import { POKEMON, SKILLS } from './data';

// Level-based move unlocks (Adventure). Each species has a 4-skill real-time kit; the level at which
// each skill unlocks comes from its FireRed/LeafGreen level-up learnset (PokéAPI), compressed per slot
// so a 4-skill kit is complete by Lv30: slot 0 is always known, slots 1-3 unlock no later than 10/20/30.
// Skills the species can't learn by level-up in FRLG (TM/tutor/later-gen moves) unlock at the slot cap.

export const SLOT_UNLOCK_CAP = [1, 10, 20, 30];

type Learn = { move: string; level: number };
const SPECIES = (cache as unknown as { species: Record<string, { levelUpMoves: Learn[] }> }).species;

const toApi = (skillId: string) => skillId.replace(/_/g, '-');

function learnsetOf(species: string): Learn[] {
  const def = POKEMON.get(species);
  const key = def?.mega?.base ?? species;
  return SPECIES[key]?.levelUpMoves ?? [];
}

/** Level at which `species` gets the skill in kit slot `slot`. */
export function skillUnlockLevel(species: string, slot: number): number {
  const def = POKEMON.get(species);
  const id = def?.skills[slot];
  const cap = SLOT_UNLOCK_CAP[Math.min(slot, SLOT_UNLOCK_CAP.length - 1)];
  if (!id || slot === 0) return 1;
  const api = SKILLS.get(id) ? toApi(id) : id;
  const levels = learnsetOf(species).filter((l) => l.move === api).map((l) => l.level);
  const learn = levels.length ? Math.max(1, Math.min(...levels)) : cap;
  return Math.min(learn, cap);
}

/** Skill ids of the kit known at `level`, in slot order. */
export function unlockedSkills(species: string, level: number): string[] {
  const def = POKEMON.get(species);
  if (!def) return [];
  return def.skills.filter((_, i) => skillUnlockLevel(species, i) <= level);
}

/** Skills newly learned when going from `from` to `to` (exclusive → inclusive). */
export function skillsLearned(species: string, from: number, to: number): string[] {
  const def = POKEMON.get(species);
  if (!def) return [];
  return def.skills.filter((_, i) => { const l = skillUnlockLevel(species, i); return l > from && l <= to; });
}
