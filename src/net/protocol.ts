import type { AllyCommand } from '../core/world';
import type { Stats } from '../core/stats';

// Wire protocol of online play (PeerJS data channel or BroadcastChannel). JSON messages, one `t` tag each.
// The host is authoritative: it runs the duel simulation; the guest sends inputs and draws snapshots.

export const PROTOCOL_VERSION = 1;

/** One party member as sent over the wire (from the player's Collection, or a rental). */
export interface DuelMon {
  species: string;
  level: number;
  held?: string | null;
  ivs?: Stats;
  nature?: string;
  evs?: Stats;
  shiny?: boolean;
  nickname?: string;
}

export interface DuelRules {
  id: 'standard' | 'open' | 'legends';
  /** every Pokémon is set to this level (null = keep the real level) */
  level: number | null;
  /** party size, Pokémon on the field at once */
  partyMax: number;
  fieldMax: number;
  speciesClause: boolean;
  allowLegends: boolean;
  timeLimit: number;
}

/** Trainer movement + orders of one player, sent by the guest (and applied by the host for its own side). */
export interface DuelInput {
  x: number;
  y: number;
  run: boolean;
}

export type DuelAction =
  | { a: 'cmd'; cmd: AllyCommand; target?: number }
  | { a: 'switch'; out: number | null; inc: number | null }
  | { a: 'mega'; unit: number }
  | { a: 'forfeit' };

/** Roster entry sent once at the start: snapshot units only carry their id. */
export interface RosterUnit {
  id: number;
  side: 0 | 1;
  kind: 'trainer' | 'pokemon';
  defId: string;
  level: number;
  shiny: boolean;
  held: string | null;
  name: string;
}

/**
 * Snapshot of the simulation (host → guest, ~20 Hz). Units are packed arrays:
 * [id, x, y, hp, maxHp, flags, castSlot, energy, facing, statusMask, lastSkill?, defId?]
 * flags: 1 fainted · 2 hit flash · 4 casting/anim · 8 dash · 16 on bench · 32 shield
 */
export type PackedUnit = [number, number, number, number, number, number, number, number, number, number, string?, string?];
export interface Snapshot {
  /** host step number (monotonic) */
  n: number;
  /** duel clock (s) */
  time: number;
  units: PackedUnit[];
  /** active projectiles: [x, y, vx, vy, skillId, side] */
  projs: [number, number, number, number, string, 0 | 1][];
  /** active zones: [shape 0 circle 1 line 2 cone, x, y, r, angle, length, delay, t, side, skillId, visualOnly] */
  zones: [number, number, number, number, number, number, number, number, 0 | 1, string, 0 | 1][];
  /** per side: command, switch cooldown, mega used */
  sides: [AllyCommand, number, boolean][];
  winner: 'home' | 'rival' | 'draw' | null;
}

export type NetMsg =
  | { t: 'hello'; v: number; name: string; game: string }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }
  | { t: 'bye'; reason?: string }
  // lobby
  | { t: 'rules'; rules: DuelRules }
  | { t: 'team'; party: DuelMon[]; ready: boolean }
  | { t: 'reject'; reason: string }
  | { t: 'start'; seed: number; rules: DuelRules; host: DuelMon[]; guest: DuelMon[]; hostName: string; guestName: string; roster: RosterUnit[] }
  // duel
  | { t: 'input'; seq: number; input: DuelInput }
  | { t: 'act'; act: DuelAction }
  | { t: 'snap'; s: Snapshot; ev: unknown[] }
  | { t: 'rematch' }
  // shared world (presence)
  | { t: 'pos'; region: string; x: number; y: number; facing: number; lead: string | null; leadShiny: boolean; moving: boolean; busy: boolean }
  | { t: 'challenge'; rules: DuelRules }
  | { t: 'challengeReply'; accept: boolean };
