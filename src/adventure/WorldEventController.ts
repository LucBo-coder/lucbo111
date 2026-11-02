import { abilityEffect, rollAbilitySlot } from '../core/abilities';
import { randomTeraType } from '../core/pokemonTraits';
import { TYPE_VI } from '../core/synergy';
import type { PokeType } from '../core/types';
import { Biome, ECOLOGY, eligible, Rarity, REGIONS, RegionDef, regionOfArea, SHINY_OUTBREAK, WeatherKind } from '../core/encounters';
import Phaser from 'phaser';
import { SCALE, TILE_PX } from '../core/map/tiles';
import { makeWildState } from '../core/wildAI';
import { MAX_LEVEL } from '../core/progression';
import { ActiveEvent, ANOMALIES, EVENT_DEFS, EventType, WorldEventDirector } from '../core/worldEvents';
import type { Unit } from '../core/world';
import { ITEMS } from './AdventureState';
import { randomLook } from '../core/npcLooks';
import { buildNpcLook, sheetKey } from '../render/animation';
import type { EventSpawnInfo } from './SpawnManager';
import type { AdventureScene } from '../scenes/AdventureScene';
import { MERCHANT_DISCOUNT, MerchantOffer, merchantStock, shopCatalogue } from '../core/shop';
import { pickVariant, variantById, type RegionalVariant } from '../core/regionalEvents';
import { audio } from '../systems/audio';
import { GMAX, RAID_HP_MULT, RAID_SHRINK_AT, raidRewards } from '../core/gimmicks';
import { party, type PartyMsg } from '../net/party';

// Gameplay of the random world events (Master Prompt V3 §VI). The director decides *when*; this class makes each
// event real: spawns, movement, hazards, chests, goals, rewards, map markers and cleanup.
// Event units are tagged `event:<uid>` so they never count toward (or get despawned by) ordinary spawning,
// and they are always removed when the event ends — nothing outlives its event or the scene.
// Regional variants (core/regionalEvents): a local flavour can take over an event's name, species, weather or goods.
// Chơi chung (SharedWorld): on a map shared with other players, one of them (the map host — the one who also spawns
// the wild Pokémon) runs the events and the sky (time of day, weather) and sends them once a second; the others show
// the same events (`mirrors`: markers, chests, stalls, shards, alerts — the units come through SharedWorld) and get
// the same completion rewards. Chests and star shards a guest uses are passed to the host; a stall is each player's own.

const RARE_TIERS: Rarity[] = ['rare', 'epic', 'ultra'];
const FOSSILS = ['omanyte', 'kabuto', 'aerodactyl', 'lileep', 'anorith', 'cranidos', 'shieldon', 'spiritomb', 'rotom'];
const OUTBREAK_SPECIAL = ['bulbasaur', 'charmander', 'squirtle', 'chikorita', 'cyndaquil', 'totodile', 'treecko', 'torchic', 'mudkip', 'turtwig', 'chimchar', 'piplup', 'porygon', 'kecleon', 'eevee', 'pikachu', 'ralts', 'swablu'];
const TREASURE_LOOT = ['fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone', 'kings-rock', 'metal-coat', 'dragon-scale'];
const ANOMALY_BY_BIOME: Record<string, (keyof typeof ANOMALIES)[]> = {
  lake: ['heavyRain', 'thunderstorm', 'blizzard'], rocky: ['thunderstorm', 'heatwave', 'blizzard'], forest: ['mysticFog', 'heavyRain'],
  meadow: ['thunderstorm', 'heatwave'], ruins: ['mysticFog', 'heatwave'], farm: ['heatwave', 'heavyRain'],
};
const AMBUSH_NAMES = ['Kỳ Phong', 'Lam Anh', 'Hắc Vũ', 'Bạch Tuyết', 'Thiết Sơn'];
const METEOR_STONES = ['moon-stone', 'shiny-stone', 'dusk-stone', 'dawn-stone', 'sun-stone', 'ice-stone'];
/** Pokémon drawn by a meteor shower (only those of the region's level range appear). */
const METEOR_SPECIES = ['cleffa', 'clefairy', 'minior', 'lunatone', 'solrock', 'staryu', 'elgyem', 'bronzor', 'beldum'];

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
  /** uid of the merchant whose shop window is open */
  private merchantOpen: number | null = null;
  /** Chơi chung: the map host's events, shown here (uid of the host's event → its copy) */
  private mirrors = new Map<number, ActiveEvent>();
  /** when the host last sent its events (performance.now) */
  private mirrorAt = 0;
  private syncT = 0;
  /** the event begin() is setting up (its opening alert is kept for players who arrive later) */
  private beginning: ActiveEvent | null = null;

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
    const shared = this.scene.shared;
    if (shared?.hasMates() && shared.mapHost() !== party.me) { this.guestUpdate(dt); return; }
    if (this.mirrors.size) this.clearMirrors();
    if (this.mirrorAt) { this.mirrorAt = 0; this.scene.raidDens?.applyMirror([]); this.scene.wormholes?.applyMirror(null); }
    const started = this.director.update({ now: this.now, regions: this.unlockedRegions(), current: this.currentRegion()?.id ?? null, inDungeon: false });
    for (const ev of started) this.begin(ev);
    // expiry goes through end() so every event's cleanup runs (weather restore, units, chests)
    for (const ev of this.director.active.filter((e) => this.now >= e.end)) this.end(ev, false);
    for (const ev of [...this.director.active]) this.tick(ev, dt);
    if (shared?.hasMates()) {
      this.syncT -= dt;
      if (this.syncT <= 0) { this.syncT = 1; this.broadcast(); }
    } else this.syncT = 0;
  }

  /** Debug / tests: force an event now in a region (eligibility is still checked by begin). */
  force(type: EventType, region: string, variant?: string): ActiveEvent {
    const ev = this.director.start(type, region, this.now, variant ? { variant } : {});
    this.begin(ev);
    return ev;
  }

  // ───────────────────────────── start ─────────────────────────────

  private begin(ev: ActiveEvent): void {
    this.beginning = ev;
    try { this.setUp(ev); } finally { this.beginning = null; }
    this.syncT = 0; // the others on this map see it at once
  }

  private setUp(ev: ActiveEvent): void {
    const region = REGIONS.get(ev.region)!;
    const def = EVENT_DEFS[ev.type];
    const p = this.regionPoint(region);
    if (!p) { this.director.finish(ev, 'cleanup'); return; }
    ev.data.x = p.x; ev.data.y = p.y;
    // a local flavour (forced by debug / tests, or rolled here)
    const v = variantById(ev.data.variant) ?? (ev.data.variant === undefined ? pickVariant(this.world.rng, ev.type, region.id) : null);
    if (v) ev.data.variant = v.id; else delete ev.data.variant;
    switch (ev.type) {
      case 'outbreak': {
        const species = this.variantSpecies(v) ?? this.pickSpecies(region, (e) => e.rarity !== 'common', OUTBREAK_SPECIAL);
        if (!species) return this.abort(ev);
        ev.data.species = species; ev.goal = 6;
        this.track(ev, this.group(ev, species, 4, p, region.level, false));
        this.announce(v ? `${v.name}: ${v.intro}` : `${def.name}: ${this.name(species)} xuất hiện thành đàn ở ${region.name}!`, '#ffe060');
        break;
      }
      case 'alpha': {
        const species = this.pickSpecies(region, (e) => e.stage > 0 || e.rarity !== 'common');
        if (!species) return this.abort(ev);
        const u = this.world.spawnWild(species, Math.min(MAX_LEVEL, region.elite[1] + 2), p.x, p.y, {
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
      case 'teraRaid': {
        const species = this.pickSpecies(region, e => !e.aquatic);
        if (!species) return this.abort(ev);
        const type = randomTeraType(() => this.world.rng.next());
        const u = this.world.spawnWild(species, Math.min(MAX_LEVEL, region.elite[1] + 2), p.x, p.y, {
          wild: makeWildState(p.x, p.y, 'aggressive', { homeR: 100, aggroR: 280, leash: 550 }),
          tag: 'event:' + ev.uid, elite: true, hpMult: 6, noCapture: true,
        });
        u.teraPick = type;
        u.abilitySlot = rollAbilitySlot(species, () => this.world.rng.next(), true);
        u.passive = abilityEffect(species, u.abilitySlot);
        u.flinchImmuneT = 1e9;
        this.world.terastallize(u, type);
        ev.data.species = species; ev.data.teraType = type; ev.goal = 1;
        this.track(ev, [u]);
        this.present(ev);
        this.announce(`Tinh thể Tera xuất hiện ở ${region.name}: ${this.name(species)} — hệ ${TYPE_VI[type]}! Xem dấu trên bản đồ; phá Tera rồi ném bóng.`, '#a0f0ff');
        break;
      }
      case 'raid': {
        // only once the player can answer a giant with a giant
        if (this.scene.state.item('dynamax-band') <= 0) return this.abort(ev);
        const rng = this.world.rng;
        const gmaxPool = Object.keys(GMAX).filter((s) => ECOLOGY.has(s) && ECOLOGY.get(s)!.minLevel <= region.level[1] + 10);
        const species = (ev.data.species as string | undefined) ?? (gmaxPool.length && rng.chance(0.4) ? rng.pick(gmaxPool) : this.pickSpecies(region, (e) => e.stage > 0 || e.rarity !== 'common'));
        if (!species) return this.abort(ev);
        const gmax = !!GMAX[species];
        const u = this.world.spawnWild(species, Math.min(MAX_LEVEL, region.elite[1] + 4), p.x, p.y, {
          wild: makeWildState(p.x, p.y, 'aggressive', { homeR: 120, aggroR: 300, leash: 600 }), hostile: false, tag: 'event:' + ev.uid, elite: true, hpMult: RAID_HP_MULT, noCapture: true,
        });
        u.flinchImmuneT = 1e9;
        this.world.dynamax(u, gmax);
        ev.data.species = species; ev.data.gmax = gmax; ev.goal = 1;
        this.track(ev, [u]);
        this.announce(`${gmax ? 'Hang Gigantamax' : 'Hang Dynamax'} phát sáng ở ${region.name}: ${this.name(species)} khổng lồ Lv${u.level}! Hạ nó cho tới khi nó thu nhỏ rồi ném bóng.`, '#ff6080');
        break;
      }
      case 'migration': {
        const species = this.variantSpecies(v) ?? this.pickSpecies(region, (e) => RARE_TIERS.includes(e.rarity));
        const end = this.regionPoint(region, p, 420);
        if (!species || !end) return this.abort(ev);
        ev.data.species = species; ev.data.path = [p, { x: (p.x + end.x) / 2 + 120, y: (p.y + end.y) / 2 }, end]; ev.data.leg = 1;
        ev.goal = 0;
        this.track(ev, this.group(ev, species, 5, p, [region.level[1] - 2, region.level[1] + 2], true));
        this.announce(v ? `${v.name}: ${v.intro}` : `${def.name}: một đàn ${this.name(species)} đang băng qua ${region.name}!`, '#a0e0ff');
        break;
      }
      case 'weather': {
        const kinds = ANOMALY_BY_BIOME[region.biome] ?? ['thunderstorm'];
        const kind = v?.weather && v.weather in ANOMALIES ? v.weather as keyof typeof ANOMALIES : this.world.rng.pick(kinds);
        ev.data.kind = kind;
        this.present(ev);
        this.announce(v ? `${v.name}! ${v.intro}` : `${ANOMALIES[kind].name}! ${ANOMALIES[kind].banner}`, '#c0d0ff');
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
        this.present(ev);
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
        this.present(ev);
        this.announce(`${def.name}: có lời đồn về một rương báu ở ${region.name} (được Pokémon canh giữ).`, '#ffd080');
        break;
      }
      case 'distortion': {
        ev.data.r = 5 * TILE_PX; ev.goal = 5;
        this.announce(`${def.name} mở ra ở ${region.name}! Pokémon cổ đại & hiếm xuất hiện, cấp cao hơn.`, '#d090ff');
        break;
      }
      case 'merchant': {
        const rng = this.world.rng;
        const stock = v?.offers ? this.variantOffers(v) : merchantStock(<T,>(l: T[]) => rng.pick(l), (a, b) => rng.int(a, b));
        if (!stock.length) return this.abort(ev);
        ev.data.stock = stock;
        this.present(ev);
        this.announce(v ? `${v.name}! ${v.intro}` : `${def.name} dừng chân ở ${region.name}: ${stock.length} món hàng hiếm giảm 30%, chỉ trong ${Math.round(def.duration / 60)} phút!`, '#80ffb0');
        break;
      }
      case 'meteor': {
        const rng = this.world.rng;
        const shards: { x: number; y: number }[] = [];
        for (let i = 0; i < 120 && shards.length < 5; i++) {
          const a = rng.range(0, Math.PI * 2), d = rng.range(90, 380);
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          if (this.scene.map.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)) || this.world.blocked(x, y, 20)) continue;
          if (shards.some((q) => Math.hypot(q.x - x, q.y - y) < 80)) continue;
          shards.push({ x, y });
        }
        if (shards.length < 3) return this.abort(ev);
        ev.goal = shards.length;
        ev.data.shards = shards;
        ev.data.left = shards.map((_, i) => i);
        this.present(ev);
        this.announce(`${def.name} trên ${region.name}! ${shards.length} mảnh sao vừa rơi xuống — nhặt hết trước khi chúng tắt.`, '#fff0a0');
        break;
      }
    }
  }

  /** What players see of an event in the world (props, chest, stall, shards, weather): the host's and the copies. */
  private present(ev: ActiveEvent): void {
    const d = ev.data, x = d.x as number, y = d.y as number;
    switch (ev.type) {
      case 'teraRaid': {
        const crystal = this.scene.add.graphics().setDepth(y - 1);
        crystal.fillStyle(0x88eeff, 0.25).fillCircle(x, y, 54);
        crystal.fillStyle(0xaaddff, 0.8).fillTriangle(x, y - 90, x - 25, y - 30, x + 25, y - 30);
        crystal.lineStyle(2, 0xffffff, 0.9).strokeTriangle(x, y - 90, x - 25, y - 30, x + 25, y - 30);
        const label = this.scene.add.text(x, y - 112, `Tera Raid · ${TYPE_VI[d.teraType as PokeType] ?? ''}`, { fontSize: '15px', color: '#b8f5ff', stroke: '#18283b', strokeThickness: 4 }).setOrigin(0.5).setDepth(y + 100);
        this.props.set(ev.uid, [crystal, label]);
        break;
      }
      case 'ambush': {
        // the trainer stands behind the team: a pixel character of its own (same style as the map NPCs)
        const name = String(d.trainer ?? '');
        const sx = x + 80, sy = y - 10;
        const look = buildNpcLook(this.scene, randomLook('ambush-' + ev.uid + '-' + name, ['cap', 'veteran', 'ranger', 'hiker', 'lass', 'woman', 'man']));
        const spr = this.scene.add.sprite(sx, sy, sheetKey(look), 0).setScale(SCALE).setDepth(sy).setFlipX(true).play(look + ':idle');
        const tag = this.scene.add.text(sx, sy - 40, name, { fontFamily: 'VT323, monospace', fontSize: '18px', color: '#ffb070', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(sy + 1);
        this.props.set(ev.uid, [spr, tag]);
        break;
      }
      case 'treasure': this.scene.addEventChest(ev.uid, x, y); break;
      case 'weather': {
        const kind = d.kind as keyof typeof ANOMALIES;
        if (ANOMALIES[kind]) this.world.weatherMods = { ...ANOMALIES[kind].combat };
        break;
      }
      case 'merchant': {
        const v = variantById(d.variant);
        const look = buildNpcLook(this.scene, randomLook('merchant-' + ev.uid, ['robe', 'man', 'grandma']));
        const spr = this.scene.add.sprite(x, y, sheetKey(look), 0).setScale(SCALE).setDepth(y).play(look + ':idle');
        this.scene.addEventObject('evmerchant-' + ev.uid, x, y, 'Mua hàng hiếm', { event: ev.uid, action: 'merchant' }, spr);
        const tag = this.scene.add.text(x, y + 30, v?.tag ?? '$ Thương nhân Lữ Khách', { fontFamily: 'VT323, monospace', fontSize: '18px', color: '#80ffb0', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(y + 1);
        this.props.set(ev.uid, [tag]);
        break;
      }
      case 'meteor': {
        const shards = d.shards as { x: number; y: number }[];
        for (const i of d.left as number[]) {
          const q = shards[i];
          if (!q) continue;
          const spr = this.scene.add.image(q.x, q.y, 'item-star-shard').setScale(SCALE).setDepth(q.y);
          this.scene.tweens.add({ targets: spr, alpha: 0.5, scale: SCALE * 1.15, yoyo: true, repeat: -1, duration: 650 });
          this.scene.addEventObject(`evshard-${ev.uid}-${i}`, q.x, q.y, 'Nhặt mảnh sao', { event: ev.uid, action: 'shard', i }, spr);
        }
        this.scene.cameras.main.flash(350, 255, 248, 200);
        break;
      }
      default: break;
    }
  }

  /** E on an event object: the merchant's stall or a star shard. */
  useObject(uid: number, action: string, i: number): void {
    const ev = this.director.active.find((e) => e.uid === uid);
    if (!ev) { this.useMirror(uid, action, i); return; }
    if (action === 'merchant') { void this.openMerchant(ev); return; }
    if (action === 'shard') {
      const left = ev.data.left as number[];
      if (!left.includes(i)) return;
      left.splice(left.indexOf(i), 1);
      this.scene.removeEventObject(`evshard-${uid}-${i}`);
      const q = (ev.data.shards as { x: number; y: number }[])[i];
      this.scene.renderer_.vfx.emit('fairy', q.x, q.y, 10);
      audio.play('gem');
      ev.progress++;
      this.scene.ui.banner(`Mảnh sao ${ev.progress}/${ev.goal}`, '#fff0a0');
      if (ev.progress >= ev.goal) this.end(ev, true);
    }
  }

  private async openMerchant(ev: ActiveEvent): Promise<void> {
    const stock = ev.data.stock as MerchantOffer[];
    const v = variantById(ev.data.variant);
    this.merchantOpen = ev.uid;
    await this.scene.ui.openShop({
      title: v?.title ?? 'Thương nhân lưu động', shelves: false, offers: stock,
      greeting: v?.greeting ?? 'Hàng hiếm từ phương xa, giảm 30% — mỗi món chỉ có vài cái. Ta sắp lên đường rồi đấy!',
      onBought: () => { ev.progress = stock.filter((o) => o.stock <= 0).length; },
    });
    this.merchantOpen = null;
    if (this.director.active.includes(ev) && stock.every((o) => o.stock <= 0)) this.end(ev, true);
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
      case 'teraRaid': {
        if (!alive.length) { this.end(ev, true); break; }
        const u = alive[0];
        if (u.tera && u.hp / u.maxHp < RAID_SHRINK_AT) {
          this.world.endTera(u);
          u.noCapture = false;
          ev.data.shattered = true;
          this.announce(`${u.name} đã vỡ lớp Tera — có thể ném bóng!`, '#a0f0ff');
        }
        break;
      }
      case 'raid': {
        if (!alive.length) { this.end(ev, true); break; }
        const u = alive[0];
        this.denGlow(ev, dt);
        // worn down: it shrinks back to normal size and can be caught
        if (u.dyna && u.hp / u.maxHp < RAID_SHRINK_AT) {
          this.world.endDynamax(u);
          u.noCapture = false;
          ev.data.shrunk = true;
          this.announce(`${u.name} thu nhỏ lại — ném bóng ngay!`, '#ffb0c0');
        }
        break;
      }
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
      case 'weather': this.storm(ev, dt); break;
      case 'meteor': this.twinkle(ev, dt); break;
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

  /** the den's red light column */
  private denGlow(ev: ActiveEvent, dt: number): void {
    if (Math.random() < dt * 12) this.scene.renderer_.vfx.emit('dyna', (ev.data.x as number) + (Math.random() - 0.5) * 60, (ev.data.y as number) - Math.random() * 40, 1);
  }

  /** a thunderstorm strikes around my own trainer (each player gets their own lightning) */
  private storm(ev: ActiveEvent, dt: number): void {
    if (ev.data.kind !== 'thunderstorm') return;
    this.lightningT -= dt;
    if (this.lightningT > 0) return;
    this.lightningT = this.world.rng.range(3, 6);
    const t = this.world.trainer;
    const x = t.x + this.world.rng.range(-260, 260), y = t.y + this.world.rng.range(-200, 200);
    this.world.addHazard(x, y, 60, 1.1, 50, 'electric', Math.max(8, this.currentRegion()?.level[1] ?? 10), { kind: 'paralysis', chance: 0.3, duration: 2, magnitude: 0.5 });
    this.scene.cameras.main.flash(120, 255, 255, 220);
  }

  /** shards twinkle so they can be spotted from afar */
  private twinkle(ev: ActiveEvent, dt: number): void {
    const shards = ev.data.shards as { x: number; y: number }[];
    for (const i of ev.data.left as number[]) {
      if (Math.random() > dt * 1.5 || !shards[i]) continue;
      this.scene.renderer_.vfx.emit('fairy', shards[i].x, shards[i].y - 10, 1);
    }
  }

  // ───────────────────────────── Chơi chung: the map host's events ─────────────────────────────

  /** Host: my events and the sky, for the others on this map. */
  private broadcast(): void {
    const sc = this.scene;
    const evs = this.director.active.map((ev) => ({ uid: ev.uid, type: ev.type, region: ev.region, left: Math.max(0, ev.end - this.now), progress: ev.progress, goal: ev.goal, data: ev.data }));
    sc.shared?.sendEvents({ t: 'swEv', evs, clock: sc.state.adv.clock, wk: sc.weather.kind, ce: sc.env?.cycle.event ?? null,
      dens: sc.raidDens?.snapshot() ?? [], hole: sc.wormholes?.snapshot() ?? null });
  }

  /** Guest: no events of my own while someone else runs this map's; the host's are drawn and ticked here. */
  private guestUpdate(dt: number): void {
    if (this.director.active.length) this.retireOwn();
    // the host went quiet (left, lost the link): their events go with them
    if (performance.now() - this.mirrorAt > 4000) {
      if (this.mirrors.size) this.clearMirrors();
      this.scene.raidDens?.applyMirror([]);
      this.scene.wormholes?.applyMirror(null);
    }
    for (const ev of [...this.mirrors.values()]) {
      if (this.now > ev.end + 5) { this.dropMirror(ev, false); continue; }
      if (ev.type === 'raid') this.denGlow(ev, dt);
      else if (ev.type === 'weather') this.storm(ev, dt);
      else if (ev.type === 'meteor') this.twinkle(ev, dt);
    }
  }

  /** My own events end quietly (no reward) when I join a map whose events another player runs. */
  private retireOwn(): void {
    for (const ev of [...this.director.active]) {
      if (ev.type === 'merchant' && this.merchantOpen === ev.uid) this.scene.ui.shop?.close();
      for (const u of this.units.get(ev.uid) ?? []) if (u.alive && !u.captured) this.world.removeEnemy(u);
      this.units.delete(ev.uid);
      this.removeObjects(ev);
      if (ev.type === 'treasure') this.scene.removeEventChest(ev.uid);
      for (const o of this.props.get(ev.uid) ?? []) o.destroy();
      this.props.delete(ev.uid);
      if (ev.type === 'weather') this.world.weatherMods = {};
      this.director.finish(ev, 'cleanup');
    }
  }

  /** A message of the map's world events from another player here (SharedWorld checked map and campaign). */
  receiveNet(m: PartyMsg, from: string): void {
    const shared = this.scene.shared;
    if (!shared) return;
    if (m.t === 'swEvUse') {
      // a guest used my chest / star shard / raid den / rift
      if (shared.mapHost() !== party.me) return;
      const uid = Number(m.uid);
      if (m.a === 'treasure') this.openTreasure(uid);
      else if (m.a === 'shard') this.useObject(uid, 'shard', Number(m.i));
      else if (m.a === 'den') this.scene.raidDens?.startFor(uid, from);
      else if (m.a === 'rift') void this.scene.wormholes?.openRiftFor(from);
      return;
    }
    // alerts of anyone on my map (a roamer of theirs, their raid…)
    if (m.t === 'swEvNote' && typeof m.text === 'string') { this.scene.ui.eventAlert(m.text.slice(0, 300), typeof m.color === 'string' ? m.color : '#ffe060'); return; }
    if (from !== shared.mapHost()) return; // only the map host's events count
    if (m.t === 'swEv') { this.applyHost(m); return; }
    if (m.t === 'swRaid') { this.scene.raidDens?.mirrorOutcome(m); return; }
    if (m.t === 'swEvEnd') {
      const ev = this.mirrors.get(Number(m.uid));
      if (ev) this.dropMirror(ev, !!m.completed);
    }
  }

  private applyHost(m: PartyMsg): void {
    this.mirrorAt = performance.now();
    this.applySky(m);
    this.scene.raidDens?.applyMirror(Array.isArray(m.dens) ? m.dens as Record<string, unknown>[] : []);
    this.scene.wormholes?.applyMirror((m.hole ?? null) as Record<string, unknown> | null);
    if (!Array.isArray(m.evs)) return;
    const seen = new Set<number>();
    for (const raw of (m.evs as Record<string, unknown>[]).slice(0, 8)) {
      const ev = this.readEvent(raw);
      if (!ev) continue;
      seen.add(ev.uid);
      const had = this.mirrors.get(ev.uid);
      if (!had) {
        this.mirrors.set(ev.uid, ev);
        this.present(ev);
        if (typeof ev.data.msg === 'string') this.scene.ui.eventAlert(ev.data.msg, typeof ev.data.color === 'string' ? ev.data.color : '#ffe060');
        continue;
      }
      had.progress = ev.progress; had.goal = ev.goal; had.end = ev.end;
      // my copy of a stall keeps its own stock (what I bought from it)
      const stock = had.data.stock;
      const before = (had.data.left as number[] | undefined) ?? [];
      had.data = { ...ev.data, ...(stock ? { stock } : {}) };
      if (had.type === 'meteor') {
        const left = had.data.left as number[];
        for (const i of before) if (!left.includes(i)) this.scene.removeEventObject(`evshard-${had.uid}-${i}`);
      }
    }
    for (const ev of [...this.mirrors.values()]) if (!seen.has(ev.uid)) this.dropMirror(ev, null);
  }

  /** A host event from the wire (only the fields present() and the HUD read, checked). */
  private readEvent(r: Record<string, unknown>): ActiveEvent | null {
    const type = r.type as EventType;
    const d = r.data as Record<string, unknown> | undefined;
    if (!r || typeof r !== 'object' || !EVENT_DEFS[type] || typeof r.region !== 'string' || !REGIONS.has(r.region) || !d || typeof d !== 'object') return null;
    if (!Number.isFinite(r.uid) || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return null;
    if (type === 'meteor' && (!Array.isArray(d.shards) || !Array.isArray(d.left))) return null;
    if (type === 'merchant' && !Array.isArray(d.stock)) return null;
    const left = Math.max(0, Math.min(EVENT_DEFS[type].duration, Number(r.left) || 0));
    const data = { ...d };
    if (type === 'merchant') data.stock = (d.stock as MerchantOffer[]).slice(0, 20).map((o) => ({ ...o }));
    return { uid: r.uid as number, type, region: r.region, start: this.now, end: this.now + left, progress: Number(r.progress) || 0, goal: Number(r.goal) || 0, data };
  }

  /** The host's time of day and weather become mine while we share the map. */
  private applySky(m: PartyMsg): void {
    const sc = this.scene;
    if (Number.isFinite(m.clock)) sc.state.adv.clock = (((m.clock as number) % 1440) + 1440) % 1440;
    const wk = m.wk as WeatherKind;
    if (typeof wk === 'string' && ['clear', 'rain', 'fog', 'thunderstorm', 'blizzard', 'heatwave', 'heavyRain', 'mysticFog'].includes(wk) && sc.weather.kind !== wk) {
      sc.weather.kind = wk;
    }
    if (Number.isFinite(sc.weather.t)) sc.weather.t = Math.max(sc.weather.t, 30); // my own cycle waits
    const env = sc.env;
    if (env && (m.ce === null || m.ce === 'blizzard' || m.ce === 'eruption')) env.adopt(m.ce);
  }

  /** Use (E) a chest / star shard / stall of the host's event. */
  private useMirror(uid: number, action: string, i: number): void {
    const ev = this.mirrors.get(uid);
    const shared = this.scene.shared;
    if (!ev || !shared) return;
    if (action === 'merchant') { void this.openMerchant(ev); return; }
    if (action === 'treasure') {
      const guards = ev.goal - ev.progress;
      if (guards > 0) { this.scene.ui.banner(`Rương bị ${guards} Pokémon canh giữ — hãy đánh bại chúng trước!`, '#ffb0a0'); return; }
      shared.sendEvents({ t: 'swEvUse', uid, a: 'treasure' }, shared.mapHost());
      this.scene.ui.banner('Đang mở rương…', '#ffd080');
      return;
    }
    if (action === 'shard') {
      const left = ev.data.left as number[];
      if (!left.includes(i)) return;
      left.splice(left.indexOf(i), 1);
      this.scene.removeEventObject(`evshard-${uid}-${i}`);
      const q = (ev.data.shards as { x: number; y: number }[])[i];
      if (q) this.scene.renderer_.vfx.emit('fairy', q.x, q.y, 10);
      audio.play('gem');
      shared.sendEvents({ t: 'swEvUse', uid, a: 'shard', i }, shared.mapHost());
    }
  }

  /** A host event is over here: completed → my own completion rewards; null = it just went away (host left…). */
  private dropMirror(ev: ActiveEvent, completed: boolean | null): void {
    if (!this.mirrors.delete(ev.uid)) return;
    if (ev.type === 'merchant' && this.merchantOpen === ev.uid) this.scene.ui.shop?.close();
    this.removeObjects(ev);
    if (ev.type === 'treasure') this.scene.removeEventChest(ev.uid);
    for (const o of this.props.get(ev.uid) ?? []) o.destroy();
    this.props.delete(ev.uid);
    if (ev.type === 'weather' && !this.all().some((e) => e.type === 'weather')) this.world.weatherMods = {};
    if (completed === null) return;
    const name = variantById(ev.data.variant)?.name ?? EVENT_DEFS[ev.type].name;
    const lines = completed ? this.rewards(ev) : [];
    if (lines.length) this.scene.ui.questComplete(`${name}: hoàn thành!`, lines);
    else this.scene.ui.banner(`${name} ở ${REGIONS.get(ev.region)?.name ?? ''} đã kết thúc`, '#c0c8e0');
    if (completed) this.scene.persist();
  }

  private clearMirrors(): void {
    for (const ev of [...this.mirrors.values()]) this.dropMirror(ev, null);
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
      } else if (ev.type === 'raid' && mine && captured && ev.data.gmax) {
        // caught from a Gigantamax den: it keeps the Gigantamax Factor (the newest member of that species)
        const p = [...this.scene.state.save.collection].reverse().find((c) => c.species === defId);
        if (p) { p.gmax = true; this.scene.ui.banner(`${this.name(defId)} mang Nhân Tố Gigantamax!`, '#ff6080'); }
      } else if (ev.type === 'migration' && mine && captured) {
        this.scene.state.addItems({ ultraball: 1 });
        this.scene.ui.banner('Bắt được Pokémon di cư! +1 Ultra Ball', '#a0e0ff');
      }
    }
    // a guest caught a Pokémon of the host's event (its copy here has another id: matched by species)
    if (captured) for (const ev of this.mirrors.values()) {
      if (ev.data.species !== defId) continue;
      if (ev.type === 'raid' && ev.data.gmax) {
        const p = [...this.scene.state.save.collection].reverse().find((c) => c.species === defId);
        if (p) { p.gmax = true; this.scene.ui.banner(`${this.name(defId)} mang Nhân Tố Gigantamax!`, '#ff6080'); }
      } else if (ev.type === 'migration') {
        this.scene.state.addItems({ ultraball: 1 });
        this.scene.ui.banner('Bắt được Pokémon di cư! +1 Ultra Ball', '#a0e0ff');
      }
    }
  }

  /** Treasure chest opened with E. */
  openTreasure(uid: number): boolean {
    const ev = this.director.active.find((e) => e.uid === uid && e.type === 'treasure');
    if (!ev) { this.useMirror(uid, 'treasure', 0); return false; }
    const guards = (this.units.get(uid) ?? []).filter((u) => u.alive);
    if (guards.length) { this.scene.ui.banner(`Rương bị ${guards.length} Pokémon canh giữ — hãy đánh bại chúng trước!`, '#ffb0a0'); return false; }
    this.end(ev, true);
    return true;
  }

  private end(ev: ActiveEvent, completed: boolean): void {
    if (!this.director.active.includes(ev)) return;
    const st = this.scene.state;
    const beforeMoney = st.money, beforeItems = { ...st.save.inventory };
    const region = REGIONS.get(ev.region);
    const lines: string[] = [];
    if (completed) {
      lines.push(...this.rewards(ev));
      const items = Object.fromEntries(Object.entries(st.save.inventory).map(([id, qty]) => [id, qty - (beforeItems[id] ?? 0)]).filter(([, qty]) => Number(qty) > 0));
      this.scene.coopHost?.grant({ currency: st.money - beforeMoney, items, note: EVENT_DEFS[ev.type].name });
    }
    let partial = '';
    if (!completed && ev.type === 'meteor' && ev.progress > 0) {
      // shards picked before the shower ended still sell for something
      st.earn(ev.progress * 250);
      partial = ` — ${ev.progress} mảnh sao bán được ${ev.progress * 250} ${st.unit}`;
      this.scene.coopHost?.grant({ currency: ev.progress * 250, items: {}, note: EVENT_DEFS[ev.type].name });
    }
    if (ev.type === 'merchant' && this.merchantOpen === ev.uid) this.scene.ui.shop?.close();
    this.director.finish(ev, completed ? 'completed' : 'expired');
    this.scene.shared?.sendEvents({ t: 'swEvEnd', uid: ev.uid, completed });
    this.removeObjects(ev);
    // cleanup: everything the event spawned goes away with it (captured ones are already in the collection)
    for (const u of this.units.get(ev.uid) ?? []) if (u.alive && !u.captured) this.world.removeEnemy(u);
    this.units.delete(ev.uid);
    if (ev.type === 'weather') this.world.weatherMods = {};
    if (ev.type === 'treasure') this.scene.removeEventChest(ev.uid);
    for (const o of this.props.get(ev.uid) ?? []) o.destroy();
    this.props.delete(ev.uid);
    const name = variantById(ev.data.variant)?.name ?? EVENT_DEFS[ev.type].name;
    if (completed && lines.length) this.scene.ui.questComplete(`${name}: hoàn thành!`, lines);
    else this.scene.ui.banner(`${name} ở ${region?.name ?? ''} đã kết thúc${partial}`, '#c0c8e0');
    this.scene.persist();
  }

  /** Completion rewards of an event, added to my save (the host's own, and each guest's on the map); the lines shown. */
  private rewards(ev: ActiveEvent): string[] {
    const st = this.scene.state;
    const region = REGIONS.get(ev.region);
    const lines: string[] = [];
    switch (ev.type) {
      case 'outbreak': st.addItems({ greatball: 5 }); st.earn(800); lines.push('+5 Great Ball', `+800 ${st.unit}`); break;
      case 'teraRaid': {
        const loot = { 'tera-shard': 10, 'exp-candy-m': 2 };
        st.addItems(loot); st.earn(1500);
        lines.push(...Object.entries(loot).map(([id, n]) => `+${n} ${ITEMS[id]?.name ?? id}`), `+1500 ${st.unit}`);
        break;
      }
      case 'raid': {
        const loot = raidRewards(!!ev.data.gmax, this.world.rng.next());
        st.addItems(loot); st.earn(2000);
        lines.push(...Object.entries(loot).map(([id, n]) => `+${n} ${ITEMS[id]?.name ?? id}`), `+2000 ${st.unit}`);
        break;
      }
      case 'alpha': { const loot = this.world.rng.pick(TREASURE_LOOT); st.addItems({ [loot]: 1 }); st.earn(1500); lines.push(`+1 ${ITEMS[loot]?.name ?? loot}`, `+1500 ${st.unit}`); break; }
      case 'ambush': st.earn(700 + (region?.danger ?? 1) * 200); st.addItems({ superpotion: 1 }); lines.push(`+${700 + (region?.danger ?? 1) * 200} ${st.unit}`, '+1 Super Potion'); break;
      case 'treasure': st.addItems({ [ev.data.loot as string]: 1, ultraball: 3 }); st.earn(1200); lines.push(`+1 ${ITEMS[ev.data.loot as string]?.name ?? ev.data.loot}`, '+3 Ultra Ball', `+1200 ${st.unit} (cổ vật)`); break;
      case 'distortion': st.addItems({ 'moon-stone': 1, ultraball: 2 }); st.earn(1500); lines.push('+1 Moon Stone', '+2 Ultra Ball', `+1500 ${st.unit}`); break;
      case 'merchant': st.addItems({ ultraball: 2 }); lines.push('Thương nhân bán hết hàng', '+2 Ultra Ball (quà cảm ơn)'); break;
      case 'meteor': {
        const stone = this.world.rng.pick(METEOR_STONES);
        st.addItems({ [stone]: 1 }); st.earn(1500); lines.push(`+1 ${ITEMS[stone]?.name ?? stone}`, `+1500 ${st.unit}`);
        if (this.world.rng.chance(0.3)) {
          const mega = this.world.rng.pick(shopCatalogue().filter((e) => e.category === 'mega')).id;
          st.addItems({ [mega]: 1 }); lines.push(`+1 ${ITEMS[mega]?.name ?? mega} (hiếm!)`);
        }
        break;
      }
      default: break;
    }
    // the local flavour's own extra
    const bonus = variantById(ev.data.variant)?.bonus;
    if (bonus) { st.addItems(bonus); for (const [id, n] of Object.entries(bonus)) lines.push(`+${n} ${ITEMS[id]?.name ?? id} (${variantById(ev.data.variant)!.name})`); }
    st.addWorldExp(ev.type === 'weather' || ev.type === 'migration' || ev.type === 'merchant' ? 60 : 150);
    return lines;
  }

  /** Scene shutdown / map change: end everything, remove event units, restore weather. */
  cleanupAll(): void {
    for (const [, us] of this.units) for (const u of us) if (u.alive && !u.captured) this.world.removeEnemy(u);
    this.units.clear();
    for (const ev of this.director.active) { if (ev.type === 'treasure') this.scene.removeEventChest(ev.uid); this.removeObjects(ev); }
    if (this.merchantOpen !== null) this.scene.ui.shop?.close();
    for (const [, os] of this.props) for (const o of os) o.destroy();
    this.props.clear();
    this.director.cleanupAll();
    this.clearMirrors();
    this.world.weatherMods = {};
  }

  /** Merchant stall / remaining star shards leave the world with their event. */
  private removeObjects(ev: ActiveEvent): void {
    if (ev.type === 'merchant') this.scene.removeEventObject('evmerchant-' + ev.uid);
    if (ev.type === 'meteor') for (const i of (ev.data.left as number[] | undefined) ?? []) this.scene.removeEventObject(`evshard-${ev.uid}-${i}`);
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
      if (ev.type === 'meteor') for (const sp of METEOR_SPECIES) if (ECOLOGY.has(sp)) info.boosted!.push({ species: sp, mult: 5 });
    }
    return info;
  }

  weatherOverride(): WeatherKind | null {
    const copy = [...this.mirrors.values()].find((e) => e.type === 'weather');
    return this.director.weatherOverride() ?? (copy ? copy.data.kind as WeatherKind : null);
  }

  /** My events and, on a shared map, the host's. */
  private all(): ActiveEvent[] {
    return this.mirrors.size ? [...this.director.active, ...this.mirrors.values()] : this.director.active;
  }

  views(): EventView[] {
    return this.all().map((ev) => {
      const r = REGIONS.get(ev.region);
      return {
        uid: ev.uid, type: ev.type, name: ev.type === 'teraRaid' ? `Tera Raid · ${TYPE_VI[ev.data.teraType as PokeType]} · ${this.name(ev.data.species as string)}` : variantById(ev.data.variant)?.name ?? EVENT_DEFS[ev.type].name, region: ev.region, regionName: r?.name ?? ev.region,
        left: Math.max(0, ev.end - this.now), progress: ev.progress, goal: ev.goal,
        x: (ev.data.x as number) ?? 0, y: (ev.data.y as number) ?? 0, approx: ev.type === 'treasure' ? 260 : 0,
      };
    });
  }

  distortions(): { x: number; y: number; r: number }[] {
    return this.all().filter((e) => e.type === 'distortion').map((e) => ({ x: e.data.x as number, y: e.data.y as number, r: e.data.r as number }));
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

  /** A variant's species that exists and fits the region's level range (null: fall back to the generic pick). */
  private variantSpecies(v: RegionalVariant | null): string | null {
    const ok = (v?.species ?? []).filter((s) => { const e = ECOLOGY.get(s); return e && !e.legendary && !e.mythical; });
    return ok.length ? this.world.rng.pick(ok) : null;
  }

  /** A variant market's goods at the event discount (catalogue prices; unknown items dropped). */
  private variantOffers(v: RegionalVariant): MerchantOffer[] {
    const cat = shopCatalogue();
    return (v.offers ?? []).flatMap((o) => {
      const e = cat.find((c) => c.id === o.id);
      return e ? [{ ...e, was: e.price, price: Math.round((e.price * (1 - MERCHANT_DISCOUNT)) / 50) * 50, stock: o.stock }] : [];
    });
  }

  private name(sp: string): string {
    return this.scene.speciesName(sp);
  }

  private announce(text: string, color: string): void {
    this.scene.ui.eventAlert(text, color);
    // the opening alert travels with the event (players who come later see it too); the rest is sent as it happens
    if (this.beginning) { this.beginning.data.msg = text; this.beginning.data.color = color; }
    else this.scene.shared?.sendEvents({ t: 'swEvNote', text, color });
  }

  /** A region species for an event (ignores time of day; optional special list and extra biomes). */
  pickSpecies(region: RegionDef, filter: (e: NonNullable<ReturnType<typeof ECOLOGY.get>>) => boolean, special: string[] = [], extraBiomes: Biome[] = []): string | null {
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
      // around the point; a spot on water / a wall tries closer, farther and a little round the circle
      let x = 0, y = 0, ok = false;
      for (const [r, da] of [[1, 0], [0.6, 0], [1.5, 0], [1, 0.4], [0.6, -0.4], [2, 0.2]]) {
        const a = (i / n) * Math.PI * 2 + da;
        x = c.x + Math.cos(a) * 70 * r; y = c.y + Math.sin(a) * 50 * r;
        if (!this.world.blocked(x, y, 16)) { ok = true; break; }
      }
      if (!ok) continue;
      const u = this.world.spawnWild(sp, Math.max(floor, this.world.rng.int(lv[0], lv[1])), x, y, {
        wild: makeWildState(x, y, timid ? 'timid' : 'neutral', { homeR: 90 }), hostile: false, tag: 'event:' + ev.uid,
      });
      u.shiny = this.world.rng.next() < SHINY_OUTBREAK;
      out.push(u);
    }
    return out;
  }

  /** Random open tile inside the region's areas (optionally at least `minDist` from `from`). */
  regionPoint(region: RegionDef, from?: { x: number; y: number }, minDist = 0): { x: number; y: number } | null {
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
