import tablesJson from '../data/world/gathering.json';

// Resource nodes of the overworld (data: data/world/gathering.json, placed by a region's `nodes`):
//   fish   — a spot on a lake shore: cast, wait for the bite, press in time → an item or a wild Pokémon on the hook
//   forage — a berry bush: pick it → an item (sometimes a hidden Pokémon jumps out)
// A used node refills after `cooldown` seconds of play time (AdventureSave.nodes), like world bosses.

export type GatherKind = 'fish' | 'forage';

export interface GatherTable {
  kind: GatherKind;
  name: string;
  /** seconds of play time before the node can be used again */
  cooldown: number;
  /** story flag needed (the fishing rod) */
  requiresFlag?: string;
  /** chance that the result is a wild Pokémon instead of an item */
  pokemonChance: number;
  pokemon: { species: string; level: [number, number]; weight: number }[];
  items: { id: string; qty: [number, number]; weight: number }[];
}

export type GatherResult = { type: 'item'; id: string; qty: number } | { type: 'pokemon'; species: string; level: number };

export const GATHER_TABLES = tablesJson as unknown as Record<string, GatherTable>;

/** Fishing: the bite comes after FISH_WAIT seconds; the player has FISH_WINDOW seconds to reel in. */
export const FISH_WAIT: [number, number] = [1.5, 4];
export const FISH_WINDOW = 0.9;

export function gatherTable(id: string): GatherTable | undefined {
  return GATHER_TABLES[id];
}

/** Seconds until the node refills (0 = ready). `used` = AdventureSave.nodes, `now` = play time in seconds. */
export function nodeCooldownLeft(used: Record<string, number> | undefined, nodeId: string, table: GatherTable, now: number): number {
  const at = used?.[nodeId];
  return at == null ? 0 : Math.max(0, at + table.cooldown - now);
}

function pick<T extends { weight: number }>(list: T[], rnd: () => number): T | undefined {
  const total = list.reduce((n, e) => n + Math.max(0, e.weight), 0);
  let r = rnd() * total;
  for (const e of list) { r -= Math.max(0, e.weight); if (r < 0) return e; }
  return list[list.length - 1];
}

const between = ([a, b]: [number, number], rnd: () => number) => a + Math.floor(rnd() * (b - a + 1));

export function rollGather(table: GatherTable, rnd: () => number = Math.random): GatherResult {
  if (table.pokemon.length && rnd() < table.pokemonChance) {
    const p = pick(table.pokemon, rnd)!;
    return { type: 'pokemon', species: p.species, level: between(p.level, rnd) };
  }
  const it = pick(table.items, rnd)!;
  return { type: 'item', id: it.id, qty: between(it.qty, rnd) };
}

/**
 * Fishing reaction: `pressedAt` / `biteAt` are seconds since the cast (pressedAt null = never pressed).
 * early = reeled before the bite (the fish swims off) · late = the window passed · hooked = caught.
 */
export function fishOutcome(biteAt: number, pressedAt: number | null): 'early' | 'late' | 'hooked' | 'waiting' {
  if (pressedAt == null) return 'waiting';
  if (pressedAt < biteAt) return 'early';
  return pressedAt - biteAt <= FISH_WINDOW ? 'hooked' : 'late';
}
