import { POKE_TYPES, type PokeType } from './types';

/** A permanent individual Tera type; never re-roll when merely reading a Pok?mon. */
export function randomTeraType(random: () => number = Math.random): PokeType {
  return POKE_TYPES[Math.min(POKE_TYPES.length - 1, Math.max(0, Math.floor(random() * POKE_TYPES.length)))];
}
export function validTeraType(value: unknown): value is PokeType {
  return typeof value === 'string' && (POKE_TYPES as readonly string[]).includes(value);
}
export function traitSeed(uid: string, salt: string): number {
  let h = 2166136261;
  for (const c of salt + ':' + uid) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
