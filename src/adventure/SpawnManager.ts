import { Biome, EncounterRoll, RegionDef, regionOfArea, rollEncounter, SHINY_BASE, SpawnContext, WeatherKind } from '../core/encounters';
import { PACK_SPREAD, planPack, rollRare, territoryOf } from '../core/ecologyRules';
import { MapProvider, SpawnEntry } from '../core/map/mapProvider';
import { T, TILE_PX } from '../core/map/tiles';
import { makeWildState } from '../core/wildAI';
import type { Unit, World } from '../core/world';

// Ecological spawning for the overworld.
// Valley: the encounter system decides (region → biome → time → weather → events → eligible species →
// rarity tier → species → level → shiny). Dungeons keep their authored tables.
// Density caps: global, per chunk-sized neighbourhood, per region, plus a separate budget for event spawns.
// Calm wild Pokémon that drift far from the player are despawned (memory + CPU bound).
// Ecology rules (core/ecologyRules): rare-condition species are rolled first, pack species arrive with their group,
// territorial species guard the ground around where they spawned.

/** What active world events contribute to spawning right now. */
export interface EventSpawnInfo {
  extraBiomes?: Biome[];
  boosted?: { species: string; mult: number }[];
  shinyRate?: number;
  /** Extra wild Pokémon allowed while an event is running (event spawn budget) */
  extraCap?: number;
}

export interface SpawnOptions {
  maxActive?: number;
  perHabitatCap?: number;
  /** Max wild Pokémon inside one region at a time */
  perRegionCap?: number;
  levelBonus?: () => number;
  isNight: () => boolean;
  weather: () => WeatherKind;
  /** In-game clock in minutes (rare spawns tied to an hour window) */
  clock?: () => number;
  events?: () => EventSpawnInfo;
  /** Returns false for tiles outside loaded chunks */
  loaded: (tx: number, ty: number) => boolean;
  /** True if a world point is currently on screen (spawns never pop in visibly) */
  onScreen?: (x: number, y: number) => boolean;
  onSpawn?: (u: Unit) => void;
  /** A rare-condition spawn (rule id from ecology-rules.json) */
  onRare?: (u: Unit, rule: string) => void;
}

const MIN_DIST = 380;
const MAX_DIST = 1050;
const DESPAWN_DIST = 1650;
const BIOME_OF_HABITAT: Record<string, Biome> = {
  meadow: 'meadow', 'meadow-grass': 'meadow', forest: 'forest', 'forest-grass': 'forest', lake: 'lake', rocky: 'rocky', ruins: 'ruins', farm: 'farm',
  snow: 'snow', 'snow-grass': 'snow', volcano: 'volcano', sanctuary: 'sanctuary', swamp: 'swamp', coast: 'coast',
};

export class SpawnManager {
  private t = 0.5;
  private readonly maxActive: number;
  spawned = 0;
  shinySpawned = 0;
  rareSpawned = 0;
  private packSeq = 0;

  constructor(private world: World, private map: MapProvider, private o: SpawnOptions) {
    this.maxActive = o.maxActive ?? 14;
  }

  wildUnits(): Unit[] {
    return this.world.enemies.filter((e) => e.alive && e.wild && !e.tag);
  }

  pickSpecies(table: SpawnEntry[]): SpawnEntry | null {
    const night = this.o.isNight();
    const weather = this.o.weather();
    return this.world.rng.weighted(table, (e) => {
      if (e.time === 'day' && night) return 0;
      if (e.time === 'night' && !night) return 0;
      return e.weight * (e.weather?.[weather as 'clear' | 'rain' | 'fog'] ?? 1);
    });
  }

  update(dt: number): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.1;
    const tr = this.world.trainer;
    const wild = this.wildUnits();

    for (const e of wild) {
      const d = Math.hypot(e.x - tr.x, e.y - tr.y);
      const tx = Math.floor(e.x / TILE_PX), ty = Math.floor(e.y / TILE_PX);
      if ((!e.hostile && d > DESPAWN_DIST) || (e.wild!.fled && d > 700) || !this.o.loaded(tx, ty)) this.world.removeEnemy(e);
    }
    const ev = this.o.events?.() ?? {};
    if (wild.length >= this.maxActive + Math.min(6, ev.extraCap ?? 0)) return;

    // A few attempts per tick to find a habitat tile in the ring around the player
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = this.world.rng.range(0, Math.PI * 2);
      const d = this.world.rng.range(MIN_DIST, MAX_DIST);
      const x = tr.x + Math.cos(a) * d, y = tr.y + Math.sin(a) * d;
      const tx = Math.floor(x / TILE_PX), ty = Math.floor(y / TILE_PX);
      if (!this.o.loaded(tx, ty)) continue;
      if (this.o.onScreen?.(x, y)) continue;
      // open water (not the shore): fish & sea creatures only
      if (this.map.kind === 'overworld' && this.isOpenWater(tx, ty)) { if (this.spawnInWater(x, y, tx, ty, wild, ev)) return; continue; } // one spawn per tick, water included
      if (this.map.solidAt(tx, ty) || this.world.blocked(x, y, 18)) continue;
      const habitat = this.map.habitatAt(tx, ty);
      if (!habitat) continue;
      // Tall grass is denser: non-grass habitats succeed less often
      if (!habitat.endsWith('-grass') && this.world.rng.next() < 0.45) continue;
      const nearby = wild.filter((w) => Math.hypot(w.x - x, w.y - y) < 400).length;
      if (nearby >= (this.o.perHabitatCap ?? 4)) continue; // ≈ per-chunk cap
      const area = this.map.areaAt(tx, ty);
      const region = this.map.kind === 'overworld' ? regionOfArea(area?.id) : null;
      if (region) {
        const inRegion = wild.filter((w) => regionOfArea(this.map.areaAt(Math.floor(w.x / TILE_PX), Math.floor(w.y / TILE_PX))?.id)?.id === region.id).length;
        if (inRegion >= (this.o.perRegionCap ?? 10)) continue;
        const ctx: SpawnContext = {
          biome: BIOME_OF_HABITAT[habitat] ?? region.biome, extraBiomes: ev.extraBiomes, night: this.o.isNight(), weather: this.o.weather(), boosted: ev.boosted,
        };
        const opts = { worldLevelBonus: this.o.levelBonus?.() ?? 0, shinyRate: ev.shinyRate ?? SHINY_BASE, clock: this.o.clock?.() };
        const rare = rollRare(this.world.rng, ctx, region, opts);
        const roll = rare ?? rollEncounter(this.world.rng, ctx, region, opts);
        if (!roll) continue;
        const u = this.spawnRolled(roll, x, y, { rare: rare?.rule });
        if (rare) { this.rareSpawned++; this.o.onRare?.(u, rare.rule); }
        else this.spawnPack(u, roll, region, wild.length);
        return;
      }
      // dungeons / unmapped areas: authored tables
      const entry = this.pickSpecies(this.map.spawnTable(habitat));
      if (!entry) continue;
      const [lo, hi] = area?.level ?? [3, 6];
      const level = this.world.rng.int(lo, hi) + (this.o.levelBonus?.() ?? 0);
      const u = this.world.spawnWild(entry.species, level, x, y, {
        wild: makeWildState(x, y, entry.temperament, { nocturnal: entry.nocturnal }),
        hostile: false,
      });
      this.spawned++;
      this.o.onSpawn?.(u);
      return;
    }
  }

  /** One ecology spawn (territory from the rules), counted and announced. */
  private spawnRolled(roll: EncounterRoll, x: number, y: number, extra: { pack?: number; leader?: boolean; follow?: Unit; rare?: string } = {}): Unit {
    const w = makeWildState(x, y, roll.temperament, { territory: territoryOf(roll.species) || undefined });
    if (extra.rare) w.rare = extra.rare;
    if (extra.pack) { w.pack = extra.pack; w.leader = !!extra.leader; w.follow = extra.follow ?? null; }
    const u = this.world.spawnWild(roll.species, roll.level, x, y, { wild: w, hostile: false });
    u.shiny = roll.shiny;
    u.rarity = roll.rarity;
    this.spawned++;
    if (roll.shiny) this.shinySpawned++;
    this.o.onSpawn?.(u);
    return u;
  }

  /** A pack species arrives with its group: same home, followers keep close to the leader. Respects the global cap. */
  private spawnPack(first: Unit, roll: EncounterRoll, region: RegionDef, wildCount: number): void {
    const plan = planPack(this.world.rng, roll, region);
    if (!plan.length) return;
    const room = this.maxActive - wildCount - 1; // the group never pushes past the global cap
    const members = plan.slice(0, Math.max(0, room));
    if (!members.length) return;
    const pack = ++this.packSeq;
    const fw = first.wild!;
    fw.pack = pack;
    let leader: Unit | null = null;
    for (const m of members) {
      let px = first.x, py = first.y;
      for (let k = 0; k < 6; k++) {
        const a = this.world.rng.range(0, Math.PI * 2), d = this.world.rng.range(PACK_SPREAD * 0.5, PACK_SPREAD);
        const cx = first.x + Math.cos(a) * d, cy = first.y + Math.sin(a) * d;
        if (!this.map.solidAt(Math.floor(cx / TILE_PX), Math.floor(cy / TILE_PX)) && !this.world.blocked(cx, cy, 18)) { px = cx; py = cy; break; }
      }
      const r: EncounterRoll = { species: m.species, level: m.level, rarity: m.leader && m.species !== roll.species ? 'uncommon' : roll.rarity, shiny: this.world.rng.next() < SHINY_BASE, temperament: roll.temperament };
      const u = this.spawnRolled(r, px, py, { pack, leader: m.leader, follow: leader ?? undefined });
      if (m.leader) leader = u;
    }
    if (leader) {
      fw.follow = leader;
      for (const e of this.world.enemies) if (e.wild?.pack === pack && e !== leader && !e.wild.follow) e.wild.follow = leader;
    }
  }

  /** Water tile mostly surrounded by water (≥ 6 of 8 neighbours) — narrow canals count, a single wet tile does not. */
  private isOpenWater(tx: number, ty: number): boolean {
    if (this.map.terrainAt(tx, ty) !== T.Water) return false;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && this.map.terrainAt(tx + dx, ty + dy) === T.Water) n++;
    return n >= 6;
  }

  /** An aquatic spawn: the area's sea (coast) or fresh-water (everything else) pool, aquatic species only. */
  private spawnInWater(x: number, y: number, tx: number, ty: number, wild: Unit[], ev: EventSpawnInfo): boolean {
    const area = this.map.areaAt(tx, ty);
    const region = regionOfArea(area?.id);
    if (!region) return false;
    if (wild.filter((w) => w.aquatic && Math.hypot(w.x - x, w.y - y) < 400).length >= 2) return false;
    const ctx: SpawnContext = {
      biome: area?.habitat === 'coast' || region.biome === 'coast' ? 'coast' : 'lake', aquatic: true, extraBiomes: ev.extraBiomes,
      night: this.o.isNight(), weather: this.o.weather(), boosted: ev.boosted,
    };
    const opts = { worldLevelBonus: this.o.levelBonus?.() ?? 0, shinyRate: ev.shinyRate ?? SHINY_BASE, clock: this.o.clock?.() };
    const rare = rollRare(this.world.rng, ctx, region, opts);
    const roll = rare ?? rollEncounter(this.world.rng, ctx, region, opts);
    if (!roll) return false;
    const cx = (tx + 0.5) * TILE_PX, cy = (ty + 0.5) * TILE_PX;
    const u = this.world.spawnWild(roll.species, roll.level, cx, cy, { wild: { ...makeWildState(cx, cy, roll.temperament, { homeR: 70 }), ...(rare ? { rare: rare.rule } : {}) }, hostile: false });
    u.shiny = roll.shiny;
    u.rarity = roll.rarity;
    if (rare) { this.rareSpawned++; this.o.onSpawn?.(u); this.o.onRare?.(u, rare.rule); }
    void x; void y;
    return true;
  }

}
