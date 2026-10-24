import { Biome, ECOLOGY, eligible, Rarity, REGIONS, RegionDef, regionOfArea, SHINY_OUTBREAK, WeatherKind } from '../core/encounters';
import Phaser from 'phaser';
import { DUNGEON, SCALE, TILE_PX } from '../core/map/tiles';
import { makeWildState } from '../core/wildAI';
import { ActiveEvent, ANOMALIES, EVENT_DEFS, EventType, WorldEventDirector } from '../core/worldEvents';
import type { Unit } from '../core/world';
import { ITEMS } from './AdventureState';
import { AMBUSH_TRAINER_ART, officialPack } from '../render/spriteRegistry';
import type { EventSpawnInfo } from './SpawnManager';
import type { AdventureScene } from '../scenes/AdventureScene';

// Gameplay of the random world events (Master Prompt V3 §VI). The director decides *when*; this class makes each
// event real: spawns, movement, hazards, chests, goals, rewards, map markers and cleanup.
// Event units are tagged `event:<uid>` so they never count toward (or get despawned by) ordinary spawning,
// and they are always removed when the event ends — nothing outlives its event or the scene.

const RARE_TIERS: Rarity[] = ['rare', 'epic', 'ultra'];
const FOSSILS = ['omanyte', 'kabuto', 'aerodactyl', 'lileep', 'anorith', 'cranidos', 'shieldon', 'spiritomb', 'rotom'];
const OUTBREAK_SPECIAL = ['bulbasaur', 'charmander', 'squirtle', 'chikorita', 'cyndaquil', 'totodile', 'treecko', 'torchic', 'mudkip', 'turtwig', 'chimchar', 'piplup', 'porygon', 'kecleon', 'eevee', 'pikachu', 'ralts', 'swablu'];
const TREASURE_LOOT = ['fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'kings-rock', 'metal-coat', 'dragon-scale'];
const ANOMALY_BY_BIOME: Record<string, (keyof typeof ANOMALIES)[]> = {
  lake: ['heavyRain', 'thunderstorm', 'blizzard'], rocky: ['thunderstorm', 'heatwave', 'blizzard'], forest: ['mysticFog', 'heavyRain'],
  meadow: ['thunderstorm', 'heatwave'], ruins: ['mysticFog', 'heatwave'], farm: ['heatwave', 'heavyRain'],
};
const AMBUSH_NAMES = ['Kỳ Phong', 'Lam Anh', 'Hắc Vũ', 'Bạch Tuyết', 'Thiết Sơn'];

export interface EventView {
  uid: number;
  type: EventType;
  name: string;
  region: string;
  regionName: string;
  left: number;
  progress: number;
  goal: number;
  x: number;
  y: number;
  /** map marker radius (px) — treasure is only shown approximately */
  approx: number;
}

export class WorldEventController {
  readonly director: WorldEventDirector;
  private units = new Map<number, Unit[]>();
  private lightningT = 0;
  /** Ambush trainers' sprites + name tags (removed with the event) */
  private props = new Map<number, Phaser.GameObjects.GameObject[]>();
  private distortT = 0;

  constructor(private scene: AdventureScene) {
    this.director = new WorldEventDirector(scene.state.adv.events, scene.world.rng);
  }

  private get world() { return this.scene.world; }
  private get now() { return this.scene.state.adv.playTime + this.scene.playClock; }

  /** Regions where events may start: open from the start or story-unlocked. */
  unlockedRegions(): RegionDef[] {
    const onMap = new Set(this.scene.regionDef.areas.map((a) => a.id));
    return [...REGIONS.values()].filter((r) => (!r.unlock || this.scene.state.hasFlag(r.unlock)) && r.areas.some((a) => onMap.has(a)));
  }

  currentRegion(): RegionDef | null {
    const t = this.world.trainer;
    return regionOfArea(this.scene.map.areaAt(Math.floor(t.x / TILE_PX), Math.floor(t.y / TILE_PX))?.id);
  }

  update(dt: number): void {
    if (this.scene.mapKind !== 'valley') return;
    const started = this.director.update({ now: this.now, regions: this.unlockedRegions(), current: this.currentRegion()?.id ?? null, inDungeon: false });
    for (const ev of started) this.begin(ev);
    // expiry goes through end() so every event's cleanup runs (weather restore, units, chests)
    for (const ev of this.director.active.filter((e) => this.now >= e.end)) this.end(ev, false);
    for (const ev of [...this.director.active]) this.tick(ev, dt);
  }

  /** Debug / tests: force an event now in a region (eligibility is still checked by begin). */
  force(type: EventType, region: string): ActiveEvent {
    const ev = this.director.start(type, region, this.now);
    this.begin(ev);
    return ev;
  }

  // ───────────────────────────── start ─────────────────────────────

  private begin(ev: ActiveEvent): void {
    const region = REGIONS.get(ev.region)!;
    const def = EVENT_DEFS[ev.type];
    const p = this.regionPoint(region);
    if (!p) { this.director.finish(ev, 'cleanup'); return; }
    ev.data.x = p.x; ev.data.y = p.y;
    switch (ev.type) {
      case 'outbreak': {
        const species = this.pickSpecies(region, (e) => e.rarity !== 'common', OUTBREAK_SPECIAL);
        if (!species) return this.abort(ev);
        ev.data.species = species; ev.goal = 6;
        this.track(ev, this.group(ev, species, 4, p, region.level, false));
        this.announce(`${def.name}: ${this.name(species)} xuất hiện thành đàn ở ${region.name}!`, '#ffe060');
        break;
      }
      case 'alpha': {
        const species = this.pickSpecies(region, (e) => e.stage > 0 || e.rarity !== 'common');
        if (!species) return this.abort(ev);
        const u = this.world.spawnWild(species, region.elite[1] + 2, p.x, p.y, {
          wild: makeWildState(p.x, p.y, 'aggressive', { homeR: 160, aggroR: 330, leash: 700 }), hostile: false, tag: 'event:' + ev.uid, elite: true, hpMult: 6,
        });
        u.alpha = true;
        u.radius *= 1.3;
        u.flinchImmuneT = 1e9; // alphas can't be flinched
        ev.data.species = species; ev.goal = 1;
        this.track(ev, [u]);
        this.announce(`CẢNH BÁO: ${this.name(species)} Alpha Lv${u.level} đang lảng vảng ở ${region.name}!`, '#ff7060');
        break;
      }
      case 'migration': {
        const species = this.pickSpecies(region, (e) => RARE_TIERS.includes(e.rarity));
        const end = this.regionPoint(region, p, 420);
        if (!species || !end) return this.abort(ev);
        ev.data.species = species; ev.data.path = [p, { x: (p.x + end.x) / 2 + 120, y: (p.y + end.y) / 2 }, end]; ev.data.leg = 1;
        ev.goal = 0;
        this.track(ev, this.group(ev, species, 5, p, [region.level[1] - 2, region.level[1] + 2], true));
        this.announce(`${def.name}: một đàn ${this.name(species)} đang băng qua ${region.name}!`, '#a0e0ff');
        break;
      }
      case 'weather': {
        const kinds = ANOMALY_BY_BIOME[region.biome] ?? ['thunderstorm'];
        const kind = this.world.rng.pick(kinds);
        ev.data.kind = kind;
        this.world.weatherMods = { ...ANOMALIES[kind].combat };
        this.announce(`${ANOMALIES[kind].name}! ${ANOMALIES[kind].banner}`, '#c0d0ff');
        break;
      }
      case 'ambush': {
        const t = this.world.trainer;
        const here = this.currentRegion();
        // an ambush happens to the player: only in the region they're in
        if (!here || here.id !== region.id) return this.abort(ev);
        const n = 2 + (region.danger >= 3 ? 1 : 0);
        const name = this.world.rng.pick(AMBUSH_NAMES);
        const team: Unit[] = [];
        for (let i = 0; i < n; i++) {
          const sp = this.pickSpecies(region, () => true);
          if (!sp) continue;
          const x = t.x + 220 + i * 50, y = t.y - 60 + i * 60;
          team.push(this.world.spawnWild(sp, this.world.rng.int(region.elite[0], region.elite[1]), x, y, {
            wild: makeWildState(x, y, 'aggressive', { homeR: 40, aggroR: 600, leash: 700 }), hostile: true, tag: 'trainer:ambush-' + ev.uid, noCapture: true, hpMult: 3,
          }));
        }
        if (!team.length) return this.abort(ev);
        ev.data.x = t.x + 240; ev.data.y = t.y; ev.data.trainer = name; ev.goal = team.length;
        // the trainer stands behind the team (NPC tile from the dungeon pack, tinted as a rival)
        const sx = t.x + 320, sy = t.y - 10;
        const look = [DUNGEON.npc.knight, DUNGEON.npc.viking, DUNGEON.npc.ranger, DUNGEON.npc.wizard, DUNGEON.npc.girl][this.world.rng.int(0, 4)];
        const art = 'otrainer-' + this.world.rng.pick(AMBUSH_TRAINER_ART);
        const spr = officialPack.active && this.scene.textures.exists(art)
          ? this.scene.add.image(sx, sy + 20, art).setOrigin(0.5, 0.85).setDepth(sy)
          : this.scene.add.image(sx, sy, 'ow_tiles', look).setScale(SCALE).setDepth(sy).setTint(0xffd0c0);
        const tag = this.scene.add.text(sx, sy - 40, name, { fontFamily: 'VT323, monospace', fontSize: '18px', color: '#ffb070', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(sy + 1);
        this.props.set(ev.uid, [spr, tag]);
        this.track(ev, team);
        this.announce(`Huấn luyện viên ${name} chặn đường thách đấu! (${team.length} Pokémon)`, '#ffb070');
        break;
      }
      case 'treasure': {
        ev.data.loot = this.world.rng.pick(TREASURE_LOOT);
        const guards: Unit[] = [];
        for (let i = 0; i < 2; i++) {
          const sp = this.pickSpecies(region, () => true);
          if (!sp) continue;
          const x = p.x + (i ? 70 : -70), y = p.y + 30;
          guards.push(this.world.spawnWild(sp, region.level[1] + 2, x, y, {
            wild: makeWildState(x, y, 'aggressive', { homeR: 60, aggroR: 230, leash: 300 }), hostile: false, tag: 'event:' + ev.uid, noCapture: true, hpMult: 3,
          }));
        }
        ev.goal = guards.length;
        this.track(ev, guards);
        this.scene.addEventChest(ev.uid, p.x, p.y);
        this.announce(`${def.name}: có lời đồn về một rương báu ở ${region.name} (được Pokémon canh giữ).`, '#ffd080');
        break;
      }
      case 'distortion': {
        ev.data.r = 5 * TILE_PX; ev.goal = 5;
        this.announce(`${def.name} mở ra ở ${region.name}! Pokémon cổ đại & hiếm xuất hiện, cấp cao hơn.`, '#d090ff');
        break;
      }
    }
  }

  private abort(ev: ActiveEvent): void {
    this.director.finish(ev, 'cleanup');
  }

  // ───────────────────────────── per tick ─────────────────────────────

  private tick(ev: ActiveEvent, dt: number): void {
    const units = this.units.get(ev.uid) ?? [];
    const alive = units.filter((u) => u.alive && !u.captured);
    switch (ev.type) {
      case 'alpha':
        if (!alive.length) this.end(ev, true);
        break;
      case 'ambush':
        if (!alive.length) this.end(ev, true);
        else if (Math.hypot(this.world.trainer.x - (ev.data.x as number), this.world.trainer.y - (ev.data.y as number)) > 1600) this.end(ev, false); // ran away
        break;
      case 'treasure':
        ev.progress = units.length - alive.length;
        break;
      case 'migration': {
        // the herd's home point walks the route; wild AI keeps the group around it
        const path = ev.data.path as { x: number; y: number }[];
        let leg = ev.data.leg as number;
        const tgt = path[leg];
        const hx = ev.data.x as number, hy = ev.data.y as number;
        const d = Math.hypot(tgt.x - hx, tgt.y - hy);
        const step = 38 * dt;
        if (d <= step) { leg++; ev.data.leg = leg; if (leg >= path.length) { this.end(ev, true); return; } }
        else { ev.data.x = hx + ((tgt.x - hx) / d) * step; ev.data.y = hy + ((tgt.y - hy) / d) * step; }
        for (const u of alive) if (u.wild && !u.hostile) { u.wild.homeX = (ev.data.x as number) + (u.id % 3 - 1) * 40; u.wild.homeY = (ev.data.y as number) + ((u.id >> 1) % 3 - 1) * 40; }
        break;
      }
      case 'weather': {
        if (ev.data.kind === 'thunderstorm') {
          this.lightningT -= dt;
          if (this.lightningT <= 0) {
            this.lightningT = this.world.rng.range(3, 6);
            const t = this.world.trainer;
            const x = t.x + this.world.rng.range(-260, 260), y = t.y + this.world.rng.range(-200, 200);
            this.world.addHazard(x, y, 60, 1.1, 50, 'electric', Math.max(8, this.currentRegion()?.level[1] ?? 10), { kind: 'paralysis', chance: 0.3, duration: 2, magnitude: 0.5 });
            this.scene.cameras.main.flash(120, 255, 255, 220);
          }
        }
        break;
      }
      case 'distortion': {
        const t = this.world.trainer;
        const inside = Math.hypot(t.x - (ev.data.x as number), t.y - (ev.data.y as number)) < (ev.data.r as number) + 300;
        this.distortT -= dt;
        if (inside && this.distortT <= 0 && alive.length < 4) {
          this.distortT = 8;
          const region = REGIONS.get(ev.region)!;
          const sp = this.world.rng.chance(0.4) ? this.world.rng.pick(FOSSILS) : this.pickSpecies(region, (e) => RARE_TIERS.includes(e.rarity), [], ['ruins']);
          if (sp) {
            const a = this.world.rng.range(0, Math.PI * 2), rr = this.world.rng.range(0, ev.data.r as number);
            const x = (ev.data.x as number) + Math.cos(a) * rr, y = (ev.data.y as number) + Math.sin(a) * rr;
            const u = this.world.spawnWild(sp, region.level[1] + 6, x, y, { wild: makeWildState(x, y, 'aggressive', { homeR: 80, aggroR: 260, leash: 400 }), hostile: false, tag: 'event:' + ev.uid });
            u.shiny = this.world.rng.next() < SHINY_OUTBREAK * 2;
            this.track(ev, [u]);
          }
        }
        break;
      }
      default: break;
    }
  }

  // ───────────────────────────── outcomes ─────────────────────────────

  /** Called by the scene for every defeated (death event) or captured unit. */
  onResolved(id: number, defId: string, x: number, y: number, captured: boolean): void {
    for (const ev of [...this.director.active]) {
      const mine = (this.units.get(ev.uid) ?? []).some((u) => u.id === id);
      if (ev.type === 'outbreak' && defId === ev.data.species && (mine || this.inside(ev, x, y))) {
        ev.progress++;
        if (ev.progress >= ev.goal) this.end(ev, true);
      } else if (ev.type === 'distortion' && mine) {
        ev.progress++;
        if (ev.progress >= ev.goal) this.end(ev, true);
      } else if (ev.type === 'alpha' && mine) {
        ev.data.captured = captured;
      } else if (ev.type === 'migration' && mine && captured) {
        this.scene.state.addItems({ ultraball: 1 });
        this.scene.ui.banner('Bắt được Pokémon di cư! +1 Ultra Ball', '#a0e0ff');
      }
    }
  }

  /** Treasure chest opened with E. */
  openTreasure(uid: number): boolean {
    const ev = this.director.active.find((e) => e.uid === uid && e.type === 'treasure');
    if (!ev) return false;
    const guards = (this.units.get(uid) ?? []).filter((u) => u.alive);
    if (guards.length) { this.scene.ui.banner(`Rương bị ${guards.length} Pokémon canh giữ — hãy đánh bại chúng trước!`, '#ffb0a0'); return false; }
    this.end(ev, true);
    return true;
  }

  private end(ev: ActiveEvent, completed: boolean): void {
    if (!this.director.active.includes(ev)) return;
    const st = this.scene.state;
    const region = REGIONS.get(ev.region);
    const lines: string[] = [];
    if (completed) {
      switch (ev.type) {
        case 'outbreak': st.addItems({ greatball: 5 }); st.earn(800); lines.push('+5 Great Ball', '+800 xu'); break;
        case 'alpha': { const loot = this.world.rng.pick(TREASURE_LOOT); st.addItems({ [loot]: 1 }); st.earn(1500); lines.push(`+1 ${ITEMS[loot]?.name ?? loot}`, '+1500 xu'); break; }
        case 'ambush': st.earn(700 + (region?.danger ?? 1) * 200); st.addItems({ superpotion: 1 }); lines.push(`+${700 + (region?.danger ?? 1) * 200} xu`, '+1 Super Potion'); break;
        case 'treasure': st.addItems({ [ev.data.loot as string]: 1, ultraball: 3 }); st.earn(1200); lines.push(`+1 ${ITEMS[ev.data.loot as string]?.name ?? ev.data.loot}`, '+3 Ultra Ball', '+1200 xu (cổ vật)'); break;
        case 'distortion': st.addItems({ 'moon-stone': 1, ultraball: 2 }); st.earn(1500); lines.push('+1 Moon Stone', '+2 Ultra Ball', '+1500 xu'); break;
        default: break;
      }
      st.addWorldExp(ev.type === 'weather' || ev.type === 'migration' ? 60 : 150);
    }
    this.director.finish(ev, completed ? 'completed' : 'expired');
    // cleanup: everything the event spawned goes away with it (captured ones are already in the collection)
    for (const u of this.units.get(ev.uid) ?? []) if (u.alive && !u.captured) this.world.removeEnemy(u);
    this.units.delete(ev.uid);
    if (ev.type === 'weather') this.world.weatherMods = {};
    if (ev.type === 'treasure') this.scene.removeEventChest(ev.uid);
    for (const o of this.props.get(ev.uid) ?? []) o.destroy();
    this.props.delete(ev.uid);
    const name = EVENT_DEFS[ev.type].name;
    if (completed && lines.length) this.scene.ui.questComplete(`${name}: hoàn thành!`, lines);
    else this.scene.ui.banner(`${name} ở ${region?.name ?? ''} đã kết thúc`, '#c0c8e0');
    this.scene.persist();
  }

  /** Scene shutdown / map change: end everything, remove event units, restore weather. */
  cleanupAll(): void {
    for (const [, us] of this.units) for (const u of us) if (u.alive && !u.captured) this.world.removeEnemy(u);
    this.units.clear();
    for (const ev of this.director.active) if (ev.type === 'treasure') this.scene.removeEventChest(ev.uid);
    for (const [, os] of this.props) for (const o of os) o.destroy();
    this.props.clear();
    this.director.cleanupAll();
    this.world.weatherMods = {};
  }

  // ───────────────────────────── queries for spawning / UI ─────────────────────────────

  /** What the active events add to ordinary spawns for the region at the trainer. */
  spawnInfo(): EventSpawnInfo {
    const region = this.currentRegion();
    const info: EventSpawnInfo = { extraBiomes: [], boosted: [], extraCap: 0 };
    for (const ev of this.director.active) {
      if (ev.type === 'weather') info.extraBiomes!.push(...ANOMALIES[ev.data.kind as keyof typeof ANOMALIES].extraBiomes);
      if (ev.region !== region?.id) continue;
      if (ev.type === 'outbreak') { info.boosted!.push({ species: ev.data.species as string, mult: 6 }); info.extraCap! += 4; info.shinyRate = SHINY_OUTBREAK; }
      if (ev.type === 'weather' && ev.data.kind) info.boosted!.push({ species: 'castform', mult: 4 });
    }
    return info;
  }

  weatherOverride(): WeatherKind | null {
    return this.director.weatherOverride();
  }

  views(): EventView[] {
    return this.director.active.map((ev) => {
      const r = REGIONS.get(ev.region);
      return {
        uid: ev.uid, type: ev.type, name: EVENT_DEFS[ev.type].name, region: ev.region, regionName: r?.name ?? ev.region,
        left: Math.max(0, ev.end - this.now), progress: ev.progress, goal: ev.goal,
        x: (ev.data.x as number) ?? 0, y: (ev.data.y as number) ?? 0, approx: ev.type === 'treasure' ? 260 : 0,
      };
    });
  }

  distortions(): { x: number; y: number; r: number }[] {
    return this.director.active.filter((e) => e.type === 'distortion').map((e) => ({ x: e.data.x as number, y: e.data.y as number, r: e.data.r as number }));
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private inside(ev: ActiveEvent, x: number, y: number): boolean {
    return regionOfArea(this.scene.map.areaAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX))?.id)?.id === ev.region;
  }

  private track(ev: ActiveEvent, us: Unit[]): void {
    const list = this.units.get(ev.uid) ?? [];
    list.push(...us);
    this.units.set(ev.uid, list);
  }

  private name(sp: string): string {
    return this.scene.speciesName(sp);
  }

  private announce(text: string, color: string): void {
    this.scene.ui.eventAlert(text, color);
  }

  /** A region species for an event (ignores time of day; optional special list and extra biomes). */
  private pickSpecies(region: RegionDef, filter: (e: NonNullable<ReturnType<typeof ECOLOGY.get>>) => boolean, special: string[] = [], extraBiomes: Biome[] = []): string | null {
    const rng = this.world.rng;
    if (special.length && rng.chance(0.25)) {
      const ok = special.filter((s) => ECOLOGY.has(s) && ECOLOGY.get(s)!.minLevel <= region.level[1]);
      if (ok.length) return rng.pick(ok);
    }
    const pool = [
      ...eligible({ biome: region.biome, extraBiomes, night: false, weather: 'clear' }, region),
      ...eligible({ biome: region.biome, extraBiomes, night: true, weather: 'clear' }, region),
    ].filter(filter);
    return pool.length ? rng.pick(pool).id : null;
  }

  private group(ev: ActiveEvent, sp: string, n: number, c: { x: number; y: number }, lv: [number, number], timid: boolean): Unit[] {
    const out: Unit[] = [];
    const floor = ECOLOGY.get(sp)?.minLevel ?? 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = c.x + Math.cos(a) * 70, y = c.y + Math.sin(a) * 50;
      if (this.world.blocked(x, y, 16)) continue;
      const u = this.world.spawnWild(sp, Math.max(floor, this.world.rng.int(lv[0], lv[1])), x, y, {
        wild: makeWildState(x, y, timid ? 'timid' : 'neutral', { homeR: 90 }), hostile: false, tag: 'event:' + ev.uid,
      });
      u.shiny = this.world.rng.next() < SHINY_OUTBREAK;
      out.push(u);
    }
    return out;
  }

  /** Random open tile inside the region's areas (optionally at least `minDist` from `from`). */
  private regionPoint(region: RegionDef, from?: { x: number; y: number }, minDist = 0): { x: number; y: number } | null {
    const m = this.scene.map as { def?: { areas: { id: string; rect: [number, number, number, number] }[] } };
    const rects = (m.def?.areas ?? []).filter((a) => region.areas.includes(a.id) && a.id !== 'village');
    if (!rects.length) return null;
    for (let i = 0; i < 60; i++) {
      const a = this.world.rng.pick(rects);
      const tx = this.world.rng.int(a.rect[0] + 2, a.rect[2] - 2), ty = this.world.rng.int(a.rect[1] + 2, a.rect[3] - 2);
      const x = (tx + 0.5) * TILE_PX, y = (ty + 0.5) * TILE_PX;
      if (this.scene.map.solidAt(tx, ty) || this.world.blocked(x, y, 24)) continue;
      if (from && Math.hypot(x - from.x, y - from.y) < minDist) continue;
      return { x, y };
    }
    return null;
  }
}
