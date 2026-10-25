// Save schema + migrations. Pure (no IndexedDB) so it can be unit-tested.
//
// Separation of data:
//  • PERMANENT (shared by both modes): collection, pokedex, inventory, currency, unlockedPokemon, stats
//  • ADVENTURE-ONLY: `adventure` (position, quests, flags, waypoints, exploration, dungeons, clock)
//  • SURVIVOR RUN DATA: never saved (level-up cards, run levels, mods live only inside World)

import type { OwnedPokemon } from '../core/progression';
import type { QuestState } from '../core/quests';

import { ensureIndividual } from '../core/progression';
import { EventSave, newEventSave } from '../core/worldEvents';
import type { PhaseSnapshot } from '../core/bossPhases';

export const SAVE_VERSION = 6;
export type QualitySetting = 'low' | 'medium' | 'high';
export type Difficulty = 'normal' | 'hard' | 'expert';

export type Campaign = 'classic' | 'vietnam';

export interface AdventureSave {
  started: boolean;
  /** classic = Thung Lũng Khởi Nguyên journey · vietnam = Vietnam Odyssey mode (own maps, quests, story) */
  campaign: Campaign;
  region: string;
  party: string[]; // collection uids, max 6
  pos: { x: number; y: number };
  lastWaypoint: string;
  waypoints: string[];
  quests: Record<string, QuestState>;
  flags: string[];
  discovered: number[]; // chunk indices
  chests: string[];
  areas: string[];
  worldExp: number;
  reputation: number;
  dungeons: Record<string, Difficulty[]>;
  clock: number; // minutes 0..1440
  playTime: number; // seconds
  /** playTime (s) when each world boss was last defeated → respawn timer */
  bossDefeatedAt: Record<string, number>;
  /** World events: check timers, per-type cooldowns, history (active events are not saved) */
  events: EventSave;
  /** Legendary / Mythical encounter states (persistent: a caught legendary never respawns as a duplicate) */
  legends: Record<string, LegendState>;
  /** Roaming legendaries keep their HP fraction between encounters (no reset on reload) */
  legendHp: Record<string, number>;
  /** Story eggs (Manaphy, Phione): hatch at playTime */
  eggs: { species: string; hatchAt: number }[];
  /** Explored chunks of the regions beyond the valley (the valley keeps `discovered`) */
  discoveredBy: Record<string, number[]>;
  /** Legendary boss fights in progress (HP, phase checkpoint, capture window) — keyed by species */
  bossFights: Record<string, BossFightSave>;
  /** Party members currently recalled into their Poké Ball (not on the field) */
  recalled: string[];
  /** Vietnam Odyssey passport: Date.now() of the first visit of each province */
  visited?: Record<string, number>;
}

/**
 * Boss checkpoint. A save taken mid-cinematic restores ACTIVE in the phase that was starting
 * (BossPhaseManager.restore) — the transition is never replayed nor skipped.
 */
export interface BossFightSave {
  hpFrac: number;
  phase: PhaseSnapshot;
  /** throws left in the capture window (weakened) */
  captureLeft?: number;
}

export type LegendState = 'locked' | 'available' | 'active' | 'defeated' | 'caught';

export interface SaveData {
  version: number;
  settings: { sfx: boolean; showFps: boolean; quality: QualitySetting; officialSprites: boolean; gen1Survivor: boolean; /** player toggled the official pack themselves */ officialChosen?: boolean; /** background music */ music: boolean; /** PMD animation pack (personal, if downloaded) */ pmdSprites?: boolean };
  unlockedPokemon: string[];
  permanentUpgrades: Record<string, number>;
  currency: number;
  achievements: string[];
  stats: {
    runs: number;
    victories: number;
    bestTime: number;
    totalKills: number;
    bossesDefeated: number;
    bestLevel: number;
  };
  collection: OwnedPokemon[];
  pokedex: { seen: string[]; caught: string[]; shiny?: string[] };
  inventory: Record<string, number>;
  adventure: AdventureSave | null;
  /** ms timestamp of the last write of this slot */
  savedAt?: number;
  /** Online duels of this slot (optional: older saves have none) */
  pvp?: PvpRecord;
  /** Name shown to other players online */
  playerName?: string;
}

export interface PvpRecord {
  wins: number;
  losses: number;
  draws: number;
  /** newest first, at most 20 */
  history: { opp: string; result: 'win' | 'loss' | 'draw'; rules: string; at: number; online: boolean; note?: string }[];
}

/** Records a finished duel (practice duels against the computer are not counted in wins/losses). */
export function recordDuel(save: SaveData, e: PvpRecord['history'][number]): PvpRecord {
  const r = (save.pvp ??= { wins: 0, losses: 0, draws: 0, history: [] });
  if (e.online) { if (e.result === 'win') r.wins++; else if (e.result === 'loss') r.losses++; else r.draws++; }
  r.history.unshift(e);
  r.history.length = Math.min(r.history.length, 20);
  return r;
}

export const DEFAULT_UNLOCKED = ['charmander', 'squirtle', 'bulbasaur'];

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { sfx: true, showFps: false, quality: 'high', officialSprites: false, gen1Survivor: false, music: true },
    unlockedPokemon: [...DEFAULT_UNLOCKED],
    permanentUpgrades: {},
    currency: 0,
    achievements: [],
    stats: { runs: 0, victories: 0, bestTime: 0, totalKills: 0, bossesDefeated: 0, bestLevel: 0 },
    collection: [],
    pokedex: { seen: [], caught: [] },
    inventory: {},
    adventure: null,
  };
}

/** A completely new save (nothing carried over) that keeps only the device settings. */
export function freshSave(settings?: SaveData['settings']): SaveData {
  const d = defaultSave();
  if (settings) d.settings = { ...d.settings, ...settings };
  return d;
}

/** True while a slot holds no progress at all (so it is shown as "empty" and never written by a settings toggle). */
export function isEmptySave(d: SaveData): boolean {
  return !d.adventure?.started && d.stats.runs === 0 && d.collection.length === 0 && d.currency === 0 && d.pokedex.seen.length === 0;
}

export interface SlotSummary {
  savedAt: number;
  playTime: number;
  region: string;
  party: string[]; // species of the adventure party
  collection: number;
  caught: number;
  badges: number; // legendaries caught
  money: number;
  runs: number;
  adventureStarted: boolean;
  campaign: Campaign;
}

export function slotSummary(d: SaveData): SlotSummary {
  const adv = d.adventure;
  const bySpecies = new Map(d.collection.map((c) => [c.uid, c.species]));
  return {
    savedAt: d.savedAt ?? 0,
    playTime: adv?.playTime ?? 0,
    region: adv?.region ?? 'starter-valley',
    party: (adv?.party ?? []).map((u) => bySpecies.get(u)).filter((x): x is string => !!x),
    collection: d.collection.length,
    caught: d.pokedex.caught.length,
    badges: Object.values(adv?.legends ?? {}).filter((v) => v === 'caught').length,
    money: d.currency,
    runs: d.stats.runs,
    adventureStarted: !!adv?.started,
    campaign: adv?.campaign ?? 'classic',
  };
}

/** Where each campaign begins. */
export const CAMPAIGN_START: Record<Campaign, { region: string; waypoint: string }> = {
  classic: { region: 'starter-valley', waypoint: 'wp-village' },
  vietnam: { region: 'ca-mau', waypoint: 'wp-ca-mau-center' },
};

export function newAdventure(campaign: Campaign = 'classic'): AdventureSave {
  return {
    started: false, campaign, region: CAMPAIGN_START[campaign].region, party: [], pos: { x: -1, y: -1 }, lastWaypoint: CAMPAIGN_START[campaign].waypoint, waypoints: [],
    quests: {}, flags: [], discovered: [], chests: [], areas: [], worldExp: 0, reputation: 0, dungeons: {}, clock: 8 * 60, playTime: 0, bossDefeatedAt: {},
    events: newEventSave(), legends: {}, legendHp: {}, eggs: [], discoveredBy: {}, bossFights: {}, recalled: [], visited: {},
  };
}

type Migration = (d: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades a save from version n to n+1. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 stored settings as a flat `muted` flag and had no bestLevel/showFps
  1: (d) => {
    const muted = Boolean(d.muted);
    const stats = { ...(d.stats as object), bestLevel: 0 };
    const { muted: _drop, ...rest } = d;
    void _drop;
    return { ...rest, settings: { sfx: !muted, showFps: false }, stats, version: 2 };
  },
  // v2 → v3: shared collection, pokédex, inventory, adventure progress, graphics quality
  2: (d) => ({
    ...d,
    settings: { quality: 'high', ...(d.settings as object) },
    collection: [],
    pokedex: { seen: [], caught: [] },
    inventory: {},
    adventure: null,
    version: 3,
  }),
  // v3 → v4: individual values, nature and friendship for every owned Pokémon (deterministic from uid)
  3: (d) => ({
    ...d,
    collection: Array.isArray(d.collection) ? (d.collection as OwnedPokemon[]).map((p) => ensureIndividual({ ...p })) : [],
    version: 4,
  }),
  // v4 → v5: world-event timers/history, legendary encounter states (derived from defeated-boss flags so
  // legendaries that already joined stay "caught" and never come back as duplicates), shiny Pokédex
  4: (d) => {
    const adv = d.adventure as (AdventureSave & { flags?: string[] }) | null | undefined;
    const legends: Record<string, LegendState> = {};
    for (const f of adv?.flags ?? []) if (f.startsWith('boss:') && f !== 'boss:mega-venusaur') legends[f.slice(5)] = 'caught';
    return {
      ...d,
      pokedex: { shiny: [], ...(d.pokedex as object) },
      adventure: adv ? { ...adv, events: adv.events ?? newEventSave(), legends: { ...legends, ...(adv.legends ?? {}) } } : null,
      version: 5,
    };
  },
  // v5 → v6: save slots (savedAt), boss fight checkpoints, recalled party members, ball of each capture
  5: (d) => {
    const adv = d.adventure as AdventureSave | null | undefined;
    return {
      ...d,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
      adventure: adv ? { ...adv, bossFights: adv.bossFights ?? {}, recalled: adv.recalled ?? [] } : null,
      version: 6,
    };
  },
};

export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  let d = raw as Record<string, unknown>;
  let v = typeof d.version === 'number' ? d.version : 1;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) return base;
    d = m(d);
    v = d.version as number;
  }
  // Deep-merge onto defaults so newly-added fields always exist
  const adv = d.adventure as AdventureSave | null | undefined;
  return {
    ...base,
    ...(d as Partial<SaveData>),
    settings: { ...base.settings, ...(d.settings as object) },
    stats: { ...base.stats, ...(d.stats as object) },
    pokedex: { ...base.pokedex, ...(d.pokedex as object) },
    collection: Array.isArray(d.collection) ? (d.collection as OwnedPokemon[]) : [],
    inventory: { ...(d.inventory as object) },
    adventure: adv ? { ...newAdventure(), ...adv, campaign: adv.campaign ?? 'classic' } : null,
    version: SAVE_VERSION,
  };
}

export interface RunSummary {
  victory: boolean;
  time: number;
  kills: number;
  level: number;
  bosses: number;
  /** Species recruited during the run (Survivor) */
  recruited?: string[];
}

/** Rule: a Survivor run that reaches 10:00 or beats 2 bosses adds every recruited species you don't own yet to the Collection at Lv5. */
export const SURVIVOR_UNLOCK_TIME = 600;

export function recordRun(save: SaveData, run: RunSummary, makeEntry?: (species: string) => OwnedPokemon): SaveData {
  const s = { ...save.stats };
  s.runs++;
  if (run.victory) s.victories++;
  s.bestTime = Math.max(s.bestTime, Math.floor(run.time));
  s.totalKills += run.kills;
  s.bossesDefeated += run.bosses;
  s.bestLevel = Math.max(s.bestLevel, run.level);
  const earned = Math.floor(run.kills / 10) + run.bosses * 50 + (run.victory ? 200 : 0);
  const next: SaveData = { ...save, stats: s, currency: save.currency + earned, collection: [...save.collection], pokedex: { seen: [...save.pokedex.seen], caught: [...save.pokedex.caught] } };
  for (const sp of run.recruited ?? []) if (!next.pokedex.seen.includes(sp)) next.pokedex.seen.push(sp);
  if (makeEntry && (run.time >= SURVIVOR_UNLOCK_TIME || run.bosses >= 2)) {
    for (const sp of run.recruited ?? []) {
      if (next.collection.some((c) => c.species === sp)) continue;
      next.collection.push(makeEntry(sp));
      if (!next.pokedex.caught.includes(sp)) next.pokedex.caught.push(sp);
    }
  }
  return next;
}

/** Species usable in Survivor: default starters + every species in the shared Collection. */
export function survivorPool(save: SaveData, allSpecies?: string[]): string[] {
  // Personal "whole Gen 1" option: every playable species (Mega forms are reached in-run, not picked)
  if (save.settings.gen1Survivor && allSpecies) return allSpecies;
  const set = new Set([...save.unlockedPokemon, ...save.collection.map((c) => c.species)]);
  return [...set];
}

/** The Collection entry a Survivor run starts from (the highest-level one of that species), if any. */
export function starterEntry(save: SaveData, species: string): OwnedPokemon | undefined {
  return save.collection.filter((c) => c.species === species).sort((a, b) => b.level - a.level)[0];
}

export function registerSeen(save: SaveData, species: string): void {
  if (!save.pokedex.seen.includes(species)) save.pokedex.seen.push(species);
}

export function registerCaught(save: SaveData, species: string, shiny = false): void {
  registerSeen(save, species);
  if (!save.pokedex.caught.includes(species)) save.pokedex.caught.push(species);
  if (shiny) { save.pokedex.shiny ??= []; if (!save.pokedex.shiny.includes(species)) save.pokedex.shiny.push(species); }
}
