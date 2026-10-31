import type { Biome, RegionDef, WeatherKind } from './encounters';
import type { Rng } from './rng';
import type { PokeType } from './types';

// WorldEventDirector (pure scheduling/state; gameplay lives in adventure/WorldEventController.ts).
//  • minor events (outbreak, alpha, ambush, treasure) are *checked* every 5 min of play, major ones
//    (migration, weather anomaly, distortion zone) every 15 min — a check is not a guarantee: each has a chance;
//  • priority, per-type cooldown, concurrency limit (2 total, 1 major), only unlocked regions, never in dungeons;
//  • every event has a duration and ends (expired / completed / cleaned up); history and cooldowns are saved,
//    active events are not (they end when the game is saved & reloaded — documented Save/Load policy).

export type EventType = 'outbreak' | 'alpha' | 'migration' | 'weather' | 'ambush' | 'treasure' | 'distortion' | 'merchant' | 'meteor' | 'raid';

export interface EventDef {
  name: string;
  major: boolean;
  /** seconds */
  duration: number;
  /** seconds before the same type may start again */
  cooldown: number;
  /** chance to start when its check comes up */
  chance: number;
  priority: number;
}

export const EVENT_DEFS: Record<EventType, EventDef> = {
  outbreak: { name: 'Bùng phát Pokémon', major: false, duration: 240, cooldown: 420, chance: 0.5, priority: 3 },
  alpha: { name: 'Pokémon Alpha', major: false, duration: 300, cooldown: 600, chance: 0.35, priority: 4 },
  ambush: { name: 'Huấn luyện viên phục kích', major: false, duration: 150, cooldown: 480, chance: 0.35, priority: 2 },
  treasure: { name: 'Kho báu ẩn', major: false, duration: 240, cooldown: 600, chance: 0.3, priority: 1 },
  migration: { name: 'Di cư hiếm', major: true, duration: 200, cooldown: 1200, chance: 0.45, priority: 3 },
  weather: { name: 'Thời tiết dị thường', major: true, duration: 180, cooldown: 900, chance: 0.5, priority: 2 },
  distortion: { name: 'Vùng biến dạng', major: true, duration: 180, cooldown: 1500, chance: 0.3, priority: 5 },
  // 0.18: a travelling merchant sells rare goods at a discount; a meteor shower scatters star shards to collect
  merchant: { name: 'Thương nhân lưu động', major: false, duration: 240, cooldown: 720, chance: 0.35, priority: 2 },
  meteor: { name: 'Mưa sao băng', major: true, duration: 200, cooldown: 1200, chance: 0.4, priority: 4 },
  // V31: a Dynamax den lights up — a giant wild Pokémon to beat, then catch once it shrinks (needs the Dynamax Band)
  raid: { name: 'Max Raid — Hang Dynamax', major: true, duration: 300, cooldown: 900, chance: 0.45, priority: 4 },
};
export const MINOR_CHECK = 300;
export const MAJOR_CHECK = 900;
export const MAX_ACTIVE = 2;
export const MAX_MAJOR = 1;
export const HISTORY_LIMIT = 30;

export type EventOutcome = 'completed' | 'expired' | 'cleanup';

export interface ActiveEvent {
  uid: number;
  type: EventType;
  region: string;
  start: number;
  end: number;
  /** goal progress (e.g. outbreak: Pokémon of the species defeated/caught) */
  progress: number;
  goal: number;
  data: Record<string, unknown>;
}

export interface EventSave {
  nextMinor: number;
  nextMajor: number;
  /** playTime at which each type is allowed again */
  readyAt: Partial<Record<EventType, number>>;
  history: { type: EventType; region: string; start: number; outcome: EventOutcome }[];
  completed: number;
}

export function newEventSave(): EventSave {
  // first checks come a little earlier so a new player sees the system
  return { nextMinor: 150, nextMajor: 600, readyAt: {}, history: [], completed: 0 };
}

export interface DirectorContext {
  now: number;
  /** regions the player has unlocked */
  regions: RegionDef[];
  /** region the player is in (events prefer it, within reach) */
  current: string | null;
  inDungeon: boolean;
}

export class WorldEventDirector {
  active: ActiveEvent[] = [];
  private nextUid = 1;

  constructor(readonly save: EventSave, private rng: Rng) {}

  /** Runs due checks; returns events that started this call. */
  update(c: DirectorContext): ActiveEvent[] {
    const started: ActiveEvent[] = [];
    if (c.inDungeon) return started;
    if (c.now >= this.save.nextMinor) {
      this.save.nextMinor = c.now + MINOR_CHECK;
      const ev = this.tryStart(false, c);
      if (ev) started.push(ev);
    }
    if (c.now >= this.save.nextMajor) {
      this.save.nextMajor = c.now + MAJOR_CHECK;
      const ev = this.tryStart(true, c);
      if (ev) started.push(ev);
    }
    return started;
  }

  /** Types that could start now (cooldown, concurrency, same type not already running). */
  candidates(major: boolean, now: number): EventType[] {
    if (this.active.length >= MAX_ACTIVE) return [];
    if (major && this.active.some((e) => EVENT_DEFS[e.type].major) && this.active.filter((e) => EVENT_DEFS[e.type].major).length >= MAX_MAJOR) return [];
    return (Object.keys(EVENT_DEFS) as EventType[])
      .filter((t) => EVENT_DEFS[t].major === major && (this.save.readyAt[t] ?? 0) <= now && !this.active.some((e) => e.type === t))
      .sort((a, b) => EVENT_DEFS[b].priority - EVENT_DEFS[a].priority);
  }

  private tryStart(major: boolean, c: DirectorContext): ActiveEvent | null {
    const regions = c.regions;
    if (!regions.length) return null;
    for (const t of this.candidates(major, c.now)) {
      if (!this.rng.chance(EVENT_DEFS[t].chance)) continue;
      // prefer the player's region, else any unlocked one
      const here = regions.find((r) => r.id === c.current);
      const region = here && this.rng.chance(0.65) ? here : this.rng.pick(regions);
      return this.start(t, region.id, c.now);
    }
    return null;
  }

  /** Starts an event (also used by debug / tests). Respects nothing — callers check eligibility. */
  start(type: EventType, region: string, now: number, data: Record<string, unknown> = {}, goal = 0): ActiveEvent {
    const ev: ActiveEvent = { uid: this.nextUid++, type, region, start: now, end: now + EVENT_DEFS[type].duration, progress: 0, goal, data };
    this.active.push(ev);
    this.save.readyAt[type] = now + EVENT_DEFS[type].duration + EVENT_DEFS[type].cooldown;
    return ev;
  }

  /** Ends events whose time ran out; returns them. */
  expire(now: number): ActiveEvent[] {
    const out = this.active.filter((e) => now >= e.end);
    for (const e of out) this.finish(e, 'expired');
    return out;
  }

  finish(e: ActiveEvent, outcome: EventOutcome): void {
    const i = this.active.indexOf(e);
    if (i < 0) return;
    this.active.splice(i, 1);
    if (outcome === 'completed') this.save.completed++;
    this.save.history.unshift({ type: e.type, region: e.region, start: Math.round(e.start), outcome });
    if (this.save.history.length > HISTORY_LIMIT) this.save.history.length = HISTORY_LIMIT;
  }

  /** Scene exit / load: nothing keeps running. */
  cleanupAll(): void {
    for (const e of [...this.active]) this.finish(e, 'cleanup');
  }

  inRegion(region: string | null): ActiveEvent[] {
    return this.active.filter((e) => e.region === region);
  }

  /** Weather anomaly currently forcing the sky, if any. */
  weatherOverride(): WeatherKind | null {
    const w = this.active.find((e) => e.type === 'weather');
    return w ? (w.data.kind as WeatherKind) : null;
  }
}

// ───────────────────────────── weather anomalies ─────────────────────────────
export const ANOMALIES: Record<'thunderstorm' | 'blizzard' | 'heatwave' | 'heavyRain' | 'mysticFog', {
  name: string; extraBiomes: Biome[]; combat: Partial<Record<PokeType, number>>; banner: string;
}> = {
  thunderstorm: { name: 'Giông sét', extraBiomes: [], combat: { electric: 1.2, flying: 0.9 }, banner: 'Giông sét dữ dội! Pokémon hệ Điện xuất hiện nhiều, sét đánh xuống ngẫu nhiên.' },
  blizzard: { name: 'Bão tuyết', extraBiomes: ['snow'], combat: { ice: 1.2, fire: 0.9 }, banner: 'Bão tuyết bất thường! Pokémon vùng tuyết kéo xuống thung lũng.' },
  heatwave: { name: 'Sóng nhiệt', extraBiomes: ['volcano'], combat: { fire: 1.2, water: 0.85, grass: 0.9 }, banner: 'Sóng nhiệt! Pokémon vùng núi lửa xuất hiện, đòn Lửa mạnh hơn.' },
  heavyRain: { name: 'Mưa xối xả', extraBiomes: [], combat: { water: 1.2, fire: 0.7 }, banner: 'Mưa xối xả! Đòn Nước mạnh hơn, đòn Lửa yếu đi.' },
  mysticFog: { name: 'Sương mù huyền bí', extraBiomes: ['ruins'], combat: { ghost: 1.2, psychic: 1.1 }, banner: 'Sương mù huyền bí phủ xuống... Pokémon hệ Ma & Tâm linh trỗi dậy.' },
};
