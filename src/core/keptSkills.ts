import type { OwnedPokemon } from './progression';

// Skills a player keeps for the skill bar (the AI leaves them alone), stored by id on the owned Pokémon so the choice
// survives recall / summon, new moves, evolution and reloads.

/** Bitmask of a unit's skill slots that hold a kept skill. */
export function keptMask(p: OwnedPokemon | undefined, skills: readonly { def: { id: string } }[]): number {
  const kept = p?.keptSkills;
  if (!kept?.length) return 0;
  let m = 0;
  skills.forEach((s, i) => { if (kept.includes(s.def.id)) m |= 1 << i; });
  return m;
}

export function setKept(p: OwnedPokemon, skillId: string, on: boolean): void {
  const kept = (p.keptSkills ?? []).filter((id) => id !== skillId);
  if (on) kept.push(skillId);
  if (kept.length) p.keptSkills = kept;
  else delete p.keptSkills;
}
