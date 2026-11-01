import cache from '../data/pokeapi/pokeapi-cache.json';
import ultraSpace from '../data/world/ultra-space.json';
import { BOSSES } from './data';
import type { Rng } from './rng';

// Ultra Wormholes [theo cốt truyện Sun / Moon / Ultra Sun / Ultra Moon]: rifts in the sky between our world and
// Ultra Space. Pure rules, no Phaser.
//   • on the open maps a wormhole opens now and then near the trainer, once the trainer is strong enough (beat Mega
//     Venusaur); E at it = step through into Không Gian Ultra (data/world/ultra-space.json), a map of nine worlds, each
//     with its own Ultra Beast, and Necrozma at the heart of the megalopolis. Its own wormhole leads back home.
//   • inside Ultra Space small rifts keep opening: E at one = a Legendary / Mythical from Gen 5–9 steps out and fights;
//     beaten through its phases = the usual legendary capture window; caught ones never come through again
//   • the rift pool opens up with progress: the Gen 5–7 legends first, the box-art giants later

type SpeciesRow = { generation: string; legendary: boolean; mythical: boolean };
const SPECIES = (cache as unknown as { species: Record<string, SpeciesRow> }).species;

export const ULTRA_BEASTS = new Set(['nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon']);
/** the cover legends: only after the trainer has caught a few legendaries */
const GIANTS = new Set(['reshiram', 'zekrom', 'kyurem', 'xerneas', 'yveltal', 'zygarde', 'solgaleo', 'lunala', 'necrozma', 'zacian', 'zamazenta', 'eternatus', 'koraidon', 'miraidon', 'terapagos']);
/** legendaries caught before the giants come through */
export const GIANTS_AFTER = 3;

export const WORMHOLE_FLAG = 'boss:mega-venusaur';
/** the dimension beyond the wormholes */
export const ULTRA_SPACE = 'ultra-space';
/** on the open maps: a wormhole into Ultra Space */
export const WORMHOLE_CHECK = 150;
export const WORMHOLE_CHANCE = 0.35;
export const WORMHOLE_OPEN = 75;
export const WORMHOLE_COOLDOWN = 300;
/** inside Ultra Space: the small rifts a legendary steps out of come much more often */
export const RIFT_CHECK = 50;
export const RIFT_CHANCE = 0.5;
export const RIFT_COOLDOWN = 120;

type Site = { id: string; name: string };
/** Ultra Space's own residents (fixed sites on its map): they never come through a rift */
export const ULTRA_SPACE_SITES: ReadonlyMap<string, string> = new Map((ultraSpace.legendaries as Site[]).map((l) => [l.id, l.name]));
/** the legend goes back through the rift if the fight drags on this long, or the trainer walks away */
export const WORMHOLE_STAY = 150;

const GEN: Record<string, number> = { 'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4, 'generation-v': 5, 'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8, 'generation-ix': 9 };

export function speciesGen(id: string): number {
  return GEN[SPECIES[id]?.generation ?? ''] ?? 0;
}

/** Everything that may come through an Ultra Wormhole: a generated legendary boss from Gen 5 on, or an Ultra Beast. */
export const WORMHOLE_POOL: string[] = [...BOSSES.values()]
  .filter((b) => b.level != null && (speciesGen(b.id) >= 5 || ULTRA_BEASTS.has(b.id)))
  .map((b) => b.id);
const POOL = new Set(WORMHOLE_POOL);

export function isWormholeLegend(id: string): boolean {
  return POOL.has(id);
}

export type WormholeKind = 'ultra-beast' | 'mythical' | 'legendary' | 'giant';
export function wormholeKind(id: string): WormholeKind {
  if (ULTRA_BEASTS.has(id)) return 'ultra-beast';
  if (GIANTS.has(id)) return 'giant';
  return SPECIES[id]?.mythical ? 'mythical' : 'legendary';
}
const WEIGHT: Record<WormholeKind, number> = { 'ultra-beast': 3, legendary: 2, mythical: 1, giant: 1 };

/** Who may come through now (not caught yet; giants once GIANTS_AFTER legendaries are caught). */
export function wormholeCandidates(caught: (id: string) => boolean, legendsCaught: number): string[] {
  return WORMHOLE_POOL.filter((id) => !caught(id) && (wormholeKind(id) !== 'giant' || legendsCaught >= GIANTS_AFTER));
}

/** Who may step out of a rift inside Ultra Space: the pool minus Ultra Space's own residents. */
export function riftCandidates(caught: (id: string) => boolean, legendsCaught: number): string[] {
  return wormholeCandidates(caught, legendsCaught).filter((id) => !ULTRA_SPACE_SITES.has(id));
}

/** One of them, weighted (Ultra Beasts most often, mythicals and giants rarely). */
export function pickWormholeLegend(rng: Rng, candidates: readonly string[]): string | null {
  const total = candidates.reduce((s, id) => s + WEIGHT[wormholeKind(id)], 0);
  if (total <= 0) return null;
  let x = rng.next() * total;
  for (const id of candidates) if ((x -= WEIGHT[wormholeKind(id)]) < 0) return id;
  return candidates[candidates.length - 1] ?? null;
}

/** Level it comes through at: its own level + 2 per world level above the first. */
export function wormholeLevel(id: string, worldLevel: number): number {
  return (BOSSES.get(id)?.level ?? 50) + Math.max(0, worldLevel - 1) * 2;
}

/** Pokédex line: how a wormhole legend is met. */
export function wormholeHint(id: string): string {
  const site = ULTRA_SPACE_SITES.get(id);
  if (site) return `Không Gian Ultra — ${site} (qua Ultra Wormhole)`;
  return wormholeKind(id) === 'giant' ? `Vết nứt trong Không Gian Ultra — sau khi đã thu phục ${GIANTS_AFTER} huyền thoại`
    : 'Vết nứt trong Không Gian Ultra — xuất hiện ngẫu nhiên';
}
