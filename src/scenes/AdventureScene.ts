import Phaser from 'phaser';
import { CoopHost, coopSession } from '../net/coop';
import { addCoopHud, rewardCoopHost } from './coopHud';
import { passportPages, stampVisit } from '../adventure/passport';
import { OnlinePresence } from '../adventure/OnlinePresence';
import { net } from '../net/session';
import { EnvironmentController } from '../adventure/EnvironmentController';
import { music, Mood } from '../systems/music';
import { PokemonSummonManager } from '../adventure/PokemonSummonManager';
import { AdventureState, EvoEnv, HEAL_POWER, ITEMS, SHOP, STARTERS } from '../adventure/AdventureState';
import { canMega, MEGA_COOLDOWN, MEGA_DURATION, MEGA_IDLE_REVERT, megaFormsOf } from '../core/evolution';
import { DungeonController } from '../adventure/DungeonController';
import { SpawnManager } from '../adventure/SpawnManager';
import { BALL_ORDER, BallContext, ballMultiplier, BALLS, BallId, fleeChance, rollCapture, statusBonus, captureChance } from '../core/capture';
import { BOSSES, POKEMON } from '../core/data';
import { DungeonMap } from '../core/map/dungeonMap';
import { dungeonDef } from '../core/map/dungeons';
import { REGION_DEFS } from '../core/map/regionDefs';
import { chunkCols, chunkRows, MapObject, MapProvider } from '../core/map/mapProvider';
import { DUNGEON, EX, SCALE, T, TILE_PX, TOWN } from '../core/map/tiles';
import { PortalDef, RegionDef, ValleyMap } from '../core/map/valley';
import { regionDef } from '../core/map/regionDefs';
import { itemIconKey, trainerArtKey } from '../render/spriteRegistry';
import { REGIONS as ENC_REGIONS } from '../core/encounters';
import { addFriendship, captureRateOf, expYield, individualOf } from '../core/progression';
import { legendRule, legendThrowChance, LegendCaptureRule } from '../core/legendCapture';
import { QuestDef } from '../core/quests';
import { makeWildState } from '../core/wildAI';
import { AllyCommand, STEP, Unit, World, WorldEvent } from '../core/world';
import { createGroundSprite } from '../render/groundSprite';
import { pixelPerfectZoom } from '../render/pixelZoom';
import { ChunkRecord, ChunkView } from '../render/ChunkView';
import { QUALITY_PROFILE } from '../render/vfx';
import { WorldRenderer } from '../render/WorldRenderer';
import { WorldEventController } from '../adventure/WorldEventController';
import type { WeatherKind } from '../core/encounters';
import { LEGENDS, LegendEnv, missingConditions as legendMissing } from '../core/legends';
import { LegendaryEncounterManager } from '../adventure/LegendaryEncounterManager';
import { audio } from '../systems/audio';
import { gameModes } from '../systems/gameMode';
import { saveStore } from '../systems/save';
import type { Difficulty } from '../systems/saveSchema';
import type { PerfStats } from './GameScene';
import type { AdventureUI, DialogueChoice } from './AdventureUI';
import { DPR } from './ui';

/** First-win rewards of the legendary shrines (the legendary itself also joins) */
const LEGEND_REWARDS: Record<string, Record<string, number>> = {
  articuno: { 'wise-glasses': 1, superpotion: 3 },
  zapdos: { magnet: 1, superpotion: 3 },
  moltres: { charcoal: 1, superpotion: 3 },
  mewtwo: { 'mewtwonite-x': 1, 'mewtwonite-y': 1 },
  mew: { 'expert-belt': 1, ultraball: 5 },
};

const MAX_STEPS = 6;
/** NPC look → tile; `board` = quest board, `light` = mysterious glowing crystal (Vietnam Odyssey) */
const NPC_FRAME: Record<string, number> = { ...DUNGEON.npc, board: TOWN.sign, light: EX.crystal };
export const COMMANDS: { id: AllyCommand; label: string; key: string }[] = [
  { id: 'auto', label: 'Tự do', key: '`' },
  { id: 'attack', label: 'Tấn công mục tiêu', key: '1' },
  { id: 'defend', label: 'Bảo vệ HLV', key: '2' },
  { id: 'follow', label: 'Đi theo', key: '3' },
  { id: 'hold', label: 'Giữ vị trí', key: '4' },
  { id: 'retreat', label: 'Rút lui', key: '5' },
];

/** Dialogue portraits (IcyEthics trainer art) per NPC id */
export const PORTRAITS: Record<string, string> = {
  prof: 'portrait-mycologist', youngster: 'portrait-youngster_m', collector: 'portrait-youngster_f', nurse: 'portrait-hilda', ranger: 'portrait-hilda',
};

export interface Interactable {
  /** 'remote' = the other player of an online session (shared open world) */
  kind: MapObject['kind'] | 'remote';
  id: string;
  x: number;
  y: number;
  label: string;
  obj: MapObject;
  sprite?: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  marker?: Phaser.GameObjects.Text;
  /** name plate under an NPC / trainer */
  nameTag?: Phaser.GameObjects.Text;
}

/** Floor colour wash of the dungeons that reuse the Ancient Cave layout. */
const DUNGEON_WASH: Record<string, number> = { 'ice-cave': 0x9cc8ff, 'magma-cave': 0xffa070, 'trial-tower': 0xe0d0ff };

interface CaptureFx {
  ball: Phaser.GameObjects.Image;
  phase: 'flying' | 'shaking' | 'done';
  target: Unit | null;
  ballId: BallId;
}

export class AdventureScene extends Phaser.Scene {
  state!: AdventureState;
  map!: MapProvider;
  world!: World;
  renderer_!: WorldRenderer;
  chunks!: ChunkView;
  spawns: SpawnManager | null = null;
  /** Random world events (valley only) */
  worldEvents: WorldEventController | null = null;
  legendsMgr: LegendaryEncounterManager | null = null;
  private distortG: Phaser.GameObjects.Graphics | null = null;
  private snow: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private heat: Phaser.GameObjects.Rectangle | null = null;
  dungeon: DungeonController | null = null;
  mapKind: 'valley' | 'dungeon' = 'valley';
  difficulty: Difficulty = 'normal';
  interactables = new Map<string, Interactable>();
  nearest: Interactable | null = null;
  joystick = { x: 0, y: 0 };
  runHeld = false;
  modal = false;
  perf: PerfStats = { fps: 0, frameMs: 0, simMs: 0, entities: 0, particles: 0 };
  selectedBall: BallId = 'pokeball';
  captureFx: CaptureFx | null = null;
  summons: PokemonSummonManager | null = null;
  env: EnvironmentController | null = null;
  /** Open capture window on a weakened legendary boss (all phases cleared) */
  legendCap: { unit: Unit; id: string; level: number; left: number; rule: LegendCaptureRule } | null = null;
  battle: { id: string; units: Unit[] } | null = null;
  areaName = '';
  weather: { kind: WeatherKind; t: number } = { kind: 'clear', t: 240 };
  pointerWorld = { x: 0, y: 0, at: -99999 };
  /** Mega Evolution runtime state */
  megaUnit: Unit | null = null;
  megaT = 0;
  megaIdle = 0;
  megaCd = 0;
  worldBoss: Unit | null = null;
  /** Sealed shrines already hinted at this session */
  private sealedHinted = new Set<string>();
  private evoQueue = new Set<string>();
  private evoBusy = false;
  private acc = 0;
  private animFrame = 0;
  private animT = 0;
  private saveT = 20;
  private lastChunk = -1;
  private blackoutT = -1;
  private plateProgress = 0;
  private plateOn = -1;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private dark!: Phaser.GameObjects.Rectangle;
  private lamps: { img: Phaser.GameObjects.Image; x: number; y: number; r: number; flicker: boolean }[] = [];
  private trainerLight!: Phaser.GameObjects.Image;
  private rain: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private fog: Phaser.GameObjects.TileSprite | null = null;
  private ambientT = 0;
  private sway: Phaser.Tweens.Tween[] = [];
  /** World positions of PC terminals (Pokémon Center / town lab). PC access is gated by proximity. */
  private pcTerminals: { x: number; y: number }[] = [];

  constructor() {
    super('Adventure');
  }

  private mapDef: RegionDef | null = null;

  /** The overworld map this scene shows (fixed at create, so a pending travel can't change it mid-fade). */
  get regionDef(): RegionDef {
    return this.mapDef ?? regionDef(this.state?.adv.region);
  }

  get ui(): AdventureUI {
    return this.scene.get('AdvUI') as AdventureUI;
  }

  /** Dungeon being played (mapKind 'dungeon') */
  dungeonId = 'ancient-cave';

  init(data: { map?: 'valley' | 'dungeon'; difficulty?: Difficulty; dungeonId?: string }): void {
    this.dungeonId = data.dungeonId ?? 'ancient-cave';
    this.mapKind = data.map ?? 'valley';
    this.difficulty = data.difficulty ?? 'normal';
    this.interactables = new Map();
    this.pcTerminals = [];
    this.nearest = null;
    this.spawns = null;
    this.dungeon = null;
    this.captureFx = null;
    this.battle = null;
    this.modal = false;
    this.lamps = [];
    this.sway = [];
    this.megaUnit = null;
    this.megaT = 0;
    this.megaIdle = 0;
    this.worldBoss = null;
    this.evoQueue = new Set();
    this.evoBusy = false;
    this.rain = null;
    this.fog = null;
    this.dark = undefined as unknown as Phaser.GameObjects.Rectangle; // previous run's objects are destroyed on restart
    this.acc = 0;
    this.lastChunk = -1;
    this.blackoutT = -1;
    this.plateProgress = 0;
    this.joystick = { x: 0, y: 0 };
  }

  create(): void {
    this.state = new AdventureState(saveStore.data);
    const adv = this.state.adv;
    const dDef = dungeonDef(this.dungeonId);
    this.mapDef = regionDef(this.mapKind === 'dungeon' ? dDef.region ?? 'starter-valley' : adv.region);
    this.map = this.mapKind === 'dungeon' ? new DungeonMap(dDef) : new ValleyMap(this.regionDef);
    this.state.currentRegion = this.regionDef.id;
    if (this.mapKind !== 'dungeon') stampVisit(adv, this.regionDef.id);
    const map = this.map;
    const solidPx = (x: number, y: number) => map.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
    this.world = new World({
      mode: 'adventure', width: map.widthTiles * TILE_PX, height: map.heightTiles * TILE_PX, trainerLevel: 3 + this.state.worldLevel * 2,
      terrain: {
        // feet-area sampling so the trainer's body doesn't clip into walls
        blocksMove: (x, y) => solidPx(x, y + 6) || solidPx(x - 10, y + 8) || solidPx(x + 10, y + 8),
        blocksShot: (x, y) => map.shotSolidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
        isWater: (x, y) => map.terrainAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)) === T.Water,
      },
    });
    (window as unknown as { __adv: AdventureScene }).__adv = this;
    (window as unknown as { __passport: typeof passportPages }).__passport = passportPages;

    // Position: dungeon start, saved position, or region spawn
    const region = this.regionDef;
    if (this.mapKind === 'dungeon') {
      const d = this.map as DungeonMap;
      this.world.teleport((d.start.x + 0.5) * TILE_PX, (d.start.y + 0.5) * TILE_PX);
    } else if (adv.started && adv.pos.x > 0) this.world.teleport(adv.pos.x, adv.pos.y);
    else this.world.teleport((region.spawn.x + 0.5) * TILE_PX, (region.spawn.y + 0.5) * TILE_PX);
    adv.started = true;
    this.summons = new PokemonSummonManager(this);
    this.env = new EnvironmentController(this);
    this.applyParty();
    for (const a of this.world.allies) { a.x = this.world.trainer.x + 20; a.y = this.world.trainer.y + 20; }
    // the trainer (local + shared by online peers) wears the avatar chosen in the device profile
    this.world.trainer.avatar = saveStore.avatar;
    net.setProfile(saveStore.playerName, saveStore.avatar);

    this.renderer_ = new WorldRenderer(this, this.world, {
      banner: (t, c) => this.ui?.banner(t, c),
      decorate: (u, v) => this.decorate(u, v),
      names: 'all',
    }, saveStore.data.settings.quality);
    this.chunks = new ChunkView(this, map, { onLoad: (r) => this.onChunkLoad(r), onUnload: (r) => this.onChunkUnload(r) });
    // elemental / challenge dungeons share the cave layout: a multiply wash over the floor tiles gives each its own look
    const wash = this.mapKind === 'dungeon' ? DUNGEON_WASH[(this.map as DungeonMap).def.id] : undefined;
    if (wash) this.add.rectangle(0, 0, map.widthTiles * TILE_PX, map.heightTiles * TILE_PX, wash, 1).setOrigin(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(-99);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthTiles * TILE_PX, map.heightTiles * TILE_PX);
    const theme = this.mapKind === 'dungeon' ? 'dungeon' : this.regionDef.theme ?? 'valley';
    cam.setBackgroundColor(theme === 'dungeon' ? 0x120e16 : theme === 'frozen' ? 0xc8d8e8 : theme === 'volcanic' ? 0x2a1c18 : theme === 'sanctuary' ? 0x3a3050 : theme === 'swamp' ? 0x22382a : theme === 'coast' ? 0x3c7fd8 : 0x1f4a24);
    cam.startFollow(this.renderer_.trainerSprite(), true, 0.12, 0.12);
    this.applyZoom();
    cam.fadeIn(350);
    this.scale.on('resize', this.applyZoom, this);

    if (this.mapKind === 'valley') {
      this.worldEvents = new WorldEventController(this);
      this.legendsMgr = new LegendaryEncounterManager(this);
      this.spawns = new SpawnManager(this.world, map, {
        maxActive: 14,
        perRegionCap: 10,
        levelBonus: () => Math.floor((this.state.worldLevel - 1) / 2),
        isNight: () => this.isNight(),
        weather: () => this.effectiveWeather(),
        events: () => this.worldEvents?.spawnInfo() ?? {},
        loaded: (tx, ty) => this.chunks.isLoadedTile(tx, ty),
        onScreen: (x, y) => { const v = this.cameras.main.worldView; return x > v.x - 60 && x < v.right + 60 && y > v.y - 60 && y < v.bottom + 60; },
        onSpawn: (u) => {
          if (!this.state.save.pokedex.seen.includes(u.defId)) this.state.save.pokedex.seen.push(u.defId);
          // rare alerts never reveal the exact position
          if (u.shiny) this.ui?.eventAlert('Có thứ gì đó lấp lánh gần đây...', '#fff0a0');
          else if (u.rarity === 'ultra' || u.rarity === 'epic') this.ui?.eventAlert('Một Pokémon hiếm vừa xuất hiện quanh đây!', '#e0b0ff');
        },
      });
    } else {
      this.dungeon = new DungeonController(this.world, this.map as DungeonMap, this.difficulty, {
        banner: (t, c) => this.ui?.banner(t, c ?? '#ffffff'),
        doorsChanged: () => this.chunks.refreshTiles(),
        bossDefeated: () => this.onDungeonBossDefeated(),
        timeUp: () => { this.ui.banner('Hết giờ! Thử thách thất bại — bị đưa ra ngoài.', '#ff7050'); this.time.delayedCall(1500, () => this.leaveDungeon(false)); },
      });
    }

    this.buildAtmosphere();
    this.bindInput();
    this.game.events.on('blur', this.onBlur, this);
    this.scene.launch('AdvUI', { adv: this });
    this.events.once('shutdown', () => this.shutdown());
    audio.play('levelup');
    if (coopSession.active && net.role === 'host') this.startCoopHost();
    else if (net.connected) this.startPresence();
  }

  /** Shared open world with the other player of the online session (see OnlinePresence). */
  presence: OnlinePresence | null = null;
  coopHost: CoopHost | null = null;
  private clearCoopHud?: () => void;
  startCoopHost(): void {
    coopSession.active = true;
    this.presence?.destroy(); this.presence = null;
    this.coopHost?.destroy();
    this.clearCoopHud?.();
    this.coopHost = new CoopHost(this.world, () => ({
      kind: this.mapKind === 'dungeon' ? 'dungeon' : 'region',
      id: this.mapKind === 'dungeon' ? this.dungeonId : this.regionDef.id,
      width: this.world.width, height: this.world.height,
      doors: this.map instanceof DungeonMap ? [this.map.doorOpen('D'), this.map.doorOpen('Q')] : undefined,
    }), rewardCoopHost);
    this.clearCoopHud = addCoopHud(this, this.coopHost);
  }
  startPresence(): void {
    if (coopSession.active) { if (net.role === 'host') this.startCoopHost(); return; }
    this.presence?.destroy();
    this.presence = new OnlinePresence(this);
  }

  private shutdown(): void {
    this.coopHost?.destroy(); this.coopHost = null;
    this.presence?.destroy();
    this.presence = null;
    // events never outlive the scene (timers, spawned units, weather override, chests)
    this.worldEvents?.cleanupAll();
    this.worldEvents = null;
    this.legendsMgr?.cleanup();
    this.legendsMgr = null;
    this.scale.off('resize', this.applyZoom, this);
    this.game.events.off('blur', this.onBlur, this);
    this.sway.forEach((t) => t.remove());
    this.sway = [];
    this.chunks.destroyAll();
    this.renderer_.destroy();
    this.lamps.forEach((l) => l.img.destroy());
  }

  private onBlur(): void {
    if (coopSession.active) return;
    if (!this.modal) this.ui?.openMenu('settings');
  }

  private applyZoom(): void {
    const { width, height } = this.scale;
    this.cameras.main.setZoom(DPR * pixelPerfectZoom(Math.min(width, height) / DPR / 620, 0.6, 1.6));
    if (this.dark?.active) this.dark.setSize(width * 4, height * 4);
  }

  // ───────────────────────────── party ─────────────────────────────

  /**
   * Syncs the field with the single active Pokémon (Adventure Mode rule: only ONE Pokémon may be
   * outside its ball). The rest of the party stays in its balls; the server enforces the same rule.
   */
  applyParty(): void {
    this.summons?.sanitize();
    const active = this.state.activePokemon();
    const keep = active ? active.uid : null;
    for (const a of [...this.world.allies]) {
      if (a.ownerUid && a.ownerUid === keep) continue;
      // remember the HP of a partner leaving the field (recall, deposit, faint)
      const p = a.ownerUid ? this.state.owned(a.ownerUid) : undefined;
      if (p) p.hpFrac = a.fainted ? 0.5 : Math.max(0.05, a.hp / a.maxHp);
      this.world.removePokemon(a);
    }
    if (active && !this.world.allies.some((a) => a.ownerUid === active.uid)) {
      if ((active.hpFrac ?? 1) <= 0) {
        // a fainted Pokémon stays in its ball until healed
        this.state.adv.activeUid = null;
        if (!this.state.adv.recalled.includes(active.uid)) this.state.adv.recalled.push(active.uid);
      } else {
        const u = this.world.addPokemon(active.species, { level: active.level, uid: active.uid, hpFrac: active.hpFrac ?? 1, held: active.held ?? null, ind: individualOf(active) });
        u.shiny = !!active.shiny;
        u.x = this.world.trainer.x + this.world.rng.range(-30, 30); u.y = this.world.trainer.y + this.world.rng.range(-30, 30);
      }
    }
    this.world.allies.sort((a, b) => this.state.adv.party.indexOf(a.ownerUid!) - this.state.adv.party.indexOf(b.ownerUid!));
    this.world.allies.forEach((a, i) => (a.slotIndex = i));
  }

  /** True when the trainer stands at a Pokémon Center / town-lab PC terminal. */
  pcNearby(): boolean {
    if (!this.world?.trainer || !this.pcTerminals.length) return false;
    const t = this.world.trainer;
    return this.pcTerminals.some((p) => Math.hypot(p.x - t.x, p.y - t.y) < 110);
  }

  /** Applies EXP/Rare Candy through the authoritative state and refreshes the field + evolutions. */
  useCandy(uid: string, candyId: string, qty: number): ReturnType<AdventureState['useCandy']> {
    const res = this.state.useCandy(uid, candyId, qty);
    if (res.used > 0) {
      const ally = this.world.allies.find((a) => a.ownerUid === uid);
      if (ally) {
        this.world.setAllyLevel(ally, res.afterLevel);
        this.renderer_.vfx.ring(ally.x, ally.y, 80, 0xffe060, 500);
      }
      if (res.evolutions.length) this.evoQueue.add(uid);
      this.ui?.banner(`${this.state.owned(uid) ? POKEMON.get(this.state.owned(uid)!.species)?.name : ''} +${res.expGained} EXP · Lv${res.afterLevel}`, '#ffe060');
      audio.play('levelup');
      this.persist();
    }
    return res;
  }

  persist(): void {
    const adv = this.state.adv;
    if (this.mapKind === 'valley') adv.pos = { x: Math.round(this.world.trainer.x), y: Math.round(this.world.trainer.y) };
    for (const a of this.world.allies) {
      const p = a.ownerUid ? this.state.owned(a.ownerUid) : undefined;
      if (p) p.hpFrac = a.fainted ? 0.5 : Math.max(0.05, a.hp / a.maxHp);
    }
    // boss checkpoint: HP + phase snapshot (+ capture throws left) of a world boss / roamer fight in progress
    for (const u of this.world.enemies) {
      if (!u.alive || u.kind !== 'boss' || !u.boss || (u.tag !== 'worldboss' && u.tag !== 'roamer')) continue;
      adv.bossFights[u.defId] = { hpFrac: u.hp / u.maxHp, phase: u.boss.pm.snapshot(), captureLeft: this.legendCap?.unit === u ? this.legendCap.left : undefined };
    }
    void saveStore.save(this.state.save);
  }

  // ───────────────────────────── chunks & objects ─────────────────────────────

  private onChunkLoad(rec: ChunkRecord): void {
    const tag = 'chunk-' + rec.idx;
    const q = QUALITY_PROFILE[saveStore.data.settings.quality];
    for (const o of rec.mapObjects) {
      const px = o.x * TILE_PX, py = o.y * TILE_PX;
      const add = <T extends Phaser.GameObjects.GameObject>(g: T) => { rec.objects.push(g); return g; };
      switch (o.kind) {
        case 'tree': {
          add(this.add.image(px, py + 22, 'shadow').setScale(2.6, 2.2).setDepth(py + 21.9));
          const img = add(this.add.image(px, py + 22, 'ow_tiles', o.tile).setOrigin(0.5, 1).setScale(SCALE).setDepth(py + 22));
          // Kenney's pines share the grass colour; a slight shade keeps the silhouette readable
          if (o.tile === 4 || o.tile === 28) img.setTint(0xc4dcb8);
          if (q.sway) this.sway.push(this.tweens.add({ targets: img, angle: { from: -1.6, to: 1.6 }, duration: 1600 + (o.x * 37 % 900), yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
          this.world.addObstacle({ x: px, y: py + 6, r: o.collideR ?? 15, kind: 'tree', tag });
          break;
        }
        case 'boulder':
          add(this.add.image(px, py + 6, 'boulder').setScale(SCALE).setDepth(py + 6));
          this.world.addObstacle({ x: px, y: py + 6, r: o.collideR ?? 20, kind: 'rock', tag });
          break;
        case 'building': {
          const bottom = (o.y + o.h!) * TILE_PX;
          o.tiles!.forEach((row, ry) => row.forEach((t, rx) => {
            add(this.add.image((o.x + rx) * TILE_PX, (o.y + ry) * TILE_PX, 'ow_tiles', t).setOrigin(0).setScale(SCALE).setDepth(bottom - 4));
          }));
          const dx = (o.data!.doorX as number + 0.5) * TILE_PX, dy = (o.data!.doorY as number + 0.5) * TILE_PX;
          this.addLight(rec, dx, dy - 10, 120, true);
          // PC storage lives at Pokémon Centers (and the town lab as a second hub).
          if (/center|lab/i.test(o.id)) {
            this.pcTerminals.push({ x: dx, y: dy });
            const marker = add(this.add.text(dx, dy - 42, 'PC', { fontFamily: '"VT323", monospace', fontSize: '26px', color: '#80e0ff', stroke: '#001018', strokeThickness: 5 }).setOrigin(0.5).setDepth(9100));
            this.tweens.add({ targets: marker, alpha: { from: 1, to: 0.45 }, duration: 900, yoyo: true, repeat: -1 });
            this.addInteractable(o, dx, dy + 18, 'Máy PC');
          }
          break;
        }
        case 'fence': add(this.add.image(px, py, 'ow_tiles', o.tile).setOrigin(0).setScale(SCALE).setDepth(py + TILE_PX)); break;
        case 'prop':
        case 'pillar':
        case 'sign': {
          const cx = px + (o.kind === 'pillar' || o.kind === 'prop' || o.kind === 'sign' ? TILE_PX / 2 : 0);
          add(this.add.image(cx, py + TILE_PX / 2, 'ow_tiles', o.tile).setScale(SCALE).setDepth(py + TILE_PX / 2));
          this.world.addObstacle({ x: cx, y: py + TILE_PX / 2, r: o.collideR ?? 16, kind: o.kind === 'pillar' ? 'rock' : 'prop', tag });
          if (o.kind === 'sign') this.addInteractable(o, cx, py + TILE_PX / 2 + 20, 'Đọc');
          break;
        }
        case 'torch': {
          add(this.add.image(px, py, 'ow_tiles', o.tile).setOrigin(0).setScale(SCALE).setDepth(py + TILE_PX));
          this.addLight(rec, px + TILE_PX / 2, py + TILE_PX, 170, true, 0xffa040);
          break;
        }
        case 'npc':
        case 'trainer': {
          const d = o.data as { sprite: string; name: string; id?: string };
          // official trainer art (personal pack) when available — feet on the tile, else the Kenney NPC tile
          const art = trainerArtKey(this, o.id);
          const s = add(art
            ? this.add.image(px + TILE_PX / 2, py + TILE_PX * 0.95, art).setOrigin(0.5, 0.85).setScale(1).setDepth(py + TILE_PX / 2)
            : this.add.image(px + TILE_PX / 2, py + TILE_PX / 2, 'ow_tiles', NPC_FRAME[d.sprite] ?? DUNGEON.npc.villager).setScale(SCALE).setDepth(py + TILE_PX / 2));
          this.tweens.add({ targets: s, y: s.y - 3, duration: 700 + (o.x % 5) * 80, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
          this.world.addObstacle({ x: s.x, y: s.y + 6, r: 14, kind: 'prop', tag });
          const it = this.addInteractable(o, s.x, s.y + 24, o.kind === 'trainer' ? 'Thách đấu' : 'Nói chuyện', s);
          it.marker = add(this.add.text(s.x, s.y - 44, '', { fontFamily: '"VT323", monospace', fontSize: '34px', color: '#ffe040', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(9100));
          // name under the feet, sized for the camera zoom (readable on phones); trainers: orange, grey once beaten
          const zoom = this.cameras.main.zoom || 1;
          it.nameTag = add(this.add.text(px + TILE_PX / 2, py + TILE_PX + 4, '', { fontFamily: '"VT323", monospace', fontSize: `${Math.round((16 * DPR) / zoom)}px`, color: '#ffffff', stroke: '#000', strokeThickness: Math.max(3, Math.round((4 * DPR) / zoom)), resolution: Math.max(1, zoom) })
            .setOrigin(0.5, 0).setDepth(9100));
          this.tagNpc(it, d.name, o.kind === 'trainer', o.kind === 'trainer' && this.state.hasFlag('beat:' + o.id));
          break;
        }
        case 'chest': {
          const opened = this.state.adv.chests.includes(o.id);
          const s = add(this.add.image(px + TILE_PX / 2, py + TILE_PX / 2, 'ow_tiles', opened ? DUNGEON.chestOpen : DUNGEON.chestClosed).setScale(SCALE).setDepth(py + TILE_PX / 2));
          const sealed = (o.data as { requiresFlag?: string }).requiresFlag;
          if (sealed && !this.state.hasFlag(sealed)) s.setTint(0x9070d0);
          this.world.addObstacle({ x: s.x, y: s.y, r: 14, kind: 'prop', tag });
          if (!opened) this.addInteractable(o, s.x, s.y + 20, 'Mở rương', s);
          break;
        }
        case 'portal': {
          const p = o.data as unknown as PortalDef;
          const open = (p.requires ?? []).every((f) => this.state.hasFlag(f));
          const s = add(this.add.image(px + TILE_PX / 2, py + TILE_PX, 'ow_tiles', EX.portal).setOrigin(0.5, 1).setScale(SCALE * 1.6).setDepth(py + TILE_PX));
          if (!open) s.setTint(0x707080);
          else this.tweens.add({ targets: s, alpha: { from: 1, to: 0.8 }, duration: 700, yoyo: true, repeat: -1 });
          this.world.addObstacle({ x: s.x, y: py + TILE_PX - 10, r: 18, kind: 'prop', tag });
          this.addInteractable(o, s.x, py + TILE_PX + 16, open ? p.name : `${p.name} (đã khóa)`, s);
          if (open) this.addLight(rec, s.x, py + TILE_PX - 30, 170, true, 0xa080ff);
          break;
        }
        case 'waypoint': {
          const on = this.state.adv.waypoints.includes(o.id);
          const s = add(this.add.image(px + TILE_PX / 2, py + TILE_PX, on ? 'waypoint' : 'waypoint_off', 0).setOrigin(0.5, 1).setScale(SCALE).setDepth(py + TILE_PX));
          if (on) this.tweens.add({ targets: s, alpha: { from: 1, to: 0.75 }, duration: 900, yoyo: true, repeat: -1 });
          this.world.addObstacle({ x: s.x, y: py + TILE_PX - 10, r: 16, kind: 'prop', tag });
          this.addInteractable(o, s.x, py + TILE_PX + 14, on ? 'Trạm dịch chuyển' : 'Kích hoạt', s);
          if (on) this.addLight(rec, s.x, py + TILE_PX - 30, 150, false, 0x60d0ff);
          break;
        }
        case 'plate': {
          const d = o.data as { label?: string; index: number; puzzle?: string };
          const solved = d.puzzle ? this.state.hasFlag('puzzle:' + d.puzzle) : false;
          const s = add(this.add.image(px + TILE_PX / 2, py + TILE_PX / 2, 'ow_tiles', solved ? DUNGEON.plateOn : DUNGEON.plate).setScale(SCALE).setDepth(-50));
          s.setData('plateIndex', d.index);
          if (d.label) add(this.add.text(s.x, s.y - 34, d.label, { fontFamily: '"VT323", monospace', fontSize: '20px', color: '#e8d8ff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(-40));
          this.interactables.set('plate:' + o.id, { kind: 'plate', id: o.id, x: s.x, y: s.y, label: '', obj: o, sprite: s });
          break;
        }
        case 'cave': {
          const s = add(this.add.image(px + TILE_PX / 2, py + TILE_PX, 'cave').setOrigin(0.5, 1).setScale(SCALE).setDepth(py));
          this.addInteractable(o, s.x, py + TILE_PX + 10, 'Vào Hang Đá Cổ', s);
          break;
        }
        case 'exit': {
          const s = add(this.add.image(px + TILE_PX / 2, py + TILE_PX, 'waypoint').setOrigin(0.5, 1).setScale(SCALE).setTint(0xffa060).setDepth(py + TILE_PX));
          this.addInteractable(o, s.x, py + TILE_PX + 14, 'Rời hang', s);
          break;
        }
        case 'rescue': {
          if (this.state.hasFlag('rescued:' + o.id)) break;
          const d = o.data as { species: string; guards: [string, number][] };
          const s = add(createGroundSprite(this, d.species, px + TILE_PX / 2, py + TILE_PX / 2));
          s.setTint(0xd0d0ff);
          this.addInteractable(o, s.x, s.y + 22, 'Giải cứu', s);
          if (!this.world.enemies.some((e) => e.tag === 'rescue' && e.alive)) {
            d.guards.forEach(([sp, lv], i) => {
              const a = (i / d.guards.length) * Math.PI * 2;
              const gx = s.x + Math.cos(a) * 90, gy = s.y + Math.sin(a) * 90;
              this.world.spawnWild(sp, lv, gx, gy, { wild: makeWildState(gx, gy, 'aggressive', { homeR: 50, aggroR: 230, leash: 380 }), tag: 'rescue', noCapture: true });
            });
          }
          break;
        }
      }
    }
  }

  private onChunkUnload(rec: ChunkRecord): void {
    this.world.removeObstacles('chunk-' + rec.idx);
    for (const o of rec.mapObjects) {
      this.interactables.delete(o.kind === 'plate' ? 'plate:' + o.id : o.id);
    }
    this.lamps = this.lamps.filter((l) => {
      if (rec.objects.includes(l.img)) return false;
      return true;
    });
    this.sway = this.sway.filter((t) => {
      const target = t.targets?.[0] as Phaser.GameObjects.GameObject | undefined;
      const alive = !!target && !rec.objects.includes(target);
      if (!alive) t.remove();
      return alive;
    });
  }

  private addInteractable(o: MapObject, x: number, y: number, label: string, sprite?: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): Interactable {
    const it: Interactable = { kind: o.kind, id: o.id, x, y, label, obj: o, sprite };
    this.interactables.set(o.id, it);
    return it;
  }

  private addLight(rec: ChunkRecord, x: number, y: number, r: number, flicker: boolean, tint = 0xffd890): void {
    if (!QUALITY_PROFILE[saveStore.data.settings.quality].lights) return;
    const img = this.add.image(x, y, 'glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(9710).setAlpha(0).setScale((r * 2) / 64);
    rec.objects.push(img);
    this.lamps.push({ img, x, y, r, flicker });
  }

  // ───────────────────────────── atmosphere ─────────────────────────────

  private buildAtmosphere(): void {
    const { width, height } = this.scale;
    this.dark = this.add.rectangle(0, 0, width * 4, height * 4, 0x101848, 0).setScrollFactor(0).setDepth(9700).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.trainerLight = this.add.image(0, 0, 'glow').setTint(0xfff0c8).setBlendMode(Phaser.BlendModes.ADD).setDepth(9711).setAlpha(0).setScale(6);
    if (this.mapKind === 'valley') {
      this.fog = this.add.tileSprite(0, 0, width * 2, height * 2, 'fog').setScrollFactor(0).setDepth(9690).setAlpha(0).setTileScale(4);
      this.rain = this.add.particles(0, 0, 'px', {
        x: { min: -200, max: width + 200 }, y: -20, speedY: { min: 900, max: 1100 }, speedX: { min: -140, max: -100 }, lifespan: 900,
        scaleX: 1, scaleY: 6, alpha: { start: 0.55, end: 0.3 }, tint: 0xa8c8ff, quantity: 3, frequency: 25, emitting: false,
      }).setScrollFactor(0).setDepth(9695);
    }
  }

  /** Sky right now: a weather anomaly event overrides the normal cycle. */
  effectiveWeather(): WeatherKind {
    // a mountain blizzard / an eruption (EnvironmentController) counts as that weather (Regice, Groudon, Heatran)
    const env = this.env?.cycle.event;
    return this.worldEvents?.weatherOverride() ?? (env === 'blizzard' ? 'blizzard' : env === 'eruption' ? 'heatwave' : this.weather.kind);
  }

  /** Seconds of play (finer than the saved playTime, which advances in 20 s steps). */
  get playClock(): number {
    return 20 - this.saveT;
  }

  speciesName(id: string): string {
    return POKEMON.get(id)?.name ?? id;
  }

  /** Snow (blizzard), heat haze (heatwave) and distortion zones. */
  private updateAnomalyFx(wk: WeatherKind, amount: number, dt: number): void {
    if (this.mapKind !== 'valley') return;
    const cam = this.cameras.main;
    const theme = this.regionDef.theme ?? 'valley';
    // the frozen region always snows (heavier in a blizzard or when it "rains")
    const snowing = wk === 'blizzard' || theme === 'frozen';
    if (snowing && amount > 0) {
      if (!this.snow) {
        this.snow = this.add.particles(0, 0, 'px4', {
          x: { min: 0, max: this.scale.width }, y: -10, lifespan: 4200, speedY: { min: 60, max: 120 }, speedX: { min: -70, max: -20 },
          scale: { min: 0.6, max: 1.2 }, alpha: { start: 0.9, end: 0.4 }, quantity: Math.max(1, Math.round(3 * amount)), frequency: 40, tint: 0xffffff,
        }).setScrollFactor(0).setDepth(9690);
      } else if (!this.snow.emitting) this.snow.start();
    } else if (this.snow?.emitting) this.snow.stop();
    if (!this.heat) this.heat = this.add.rectangle(0, 0, this.scale.width * 4, this.scale.height * 4, 0xff8020, 0).setOrigin(0).setScrollFactor(0).setDepth(9680);
    const ha = wk === 'heatwave' || theme === 'volcanic' ? (theme === 'volcanic' ? 0.08 : 0.12) + Math.sin(this.time.now * 0.003) * 0.03 : 0;
    if (theme === 'volcanic' && Math.random() < 0.25 * amount) { const v = cam.worldView; this.renderer_.vfx.emit('fire', v.x + Math.random() * v.width, v.y + v.height, 1); }
    if (theme === 'sanctuary' && Math.random() < 0.3 * amount) { const v = cam.worldView; this.renderer_.vfx.emit('fairy', v.x + Math.random() * v.width, v.y + Math.random() * v.height, 1); }
    this.heat.setFillStyle(0xff8020, this.heat.fillAlpha + (ha - this.heat.fillAlpha) * Math.min(1, dt * 2));
    // distortion zones: pulsing violet rings + motes
    const zones = this.worldEvents?.distortions() ?? [];
    if (!this.distortG) this.distortG = this.add.graphics().setDepth(5);
    const g = this.distortG.clear();
    for (const z of zones) {
      const p = 1 + Math.sin(this.time.now * 0.004) * 0.06;
      g.fillStyle(0x8040c0, 0.14).fillCircle(z.x, z.y, z.r * p);
      g.lineStyle(3, 0xd090ff, 0.7).strokeCircle(z.x, z.y, z.r * p);
      if (Math.random() < 0.3) this.renderer_.vfx.emit('psychic', z.x + (Math.random() - 0.5) * z.r * 1.6, z.y + (Math.random() - 0.5) * z.r * 1.6, 1);
    }
    void cam;
  }

  // ───────────────────────────── event chests ─────────────────────────────

  addEventChest(uid: number, x: number, y: number): void {
    const id = 'evchest-' + uid;
    const sprite = this.add.image(x, y, 'ow_tiles', DUNGEON.chestClosed).setScale(SCALE).setDepth(y);
    const tx = Math.floor(x / TILE_PX), ty = Math.floor(y / TILE_PX);
    this.interactables.set(id, { kind: 'chest', id, x, y, label: 'Mở rương báu', obj: { kind: 'chest', id, x: tx, y: ty, data: { event: uid } }, sprite });
  }

  removeEventChest(uid: number): void {
    const it = this.interactables.get('evchest-' + uid);
    it?.sprite?.destroy(); it?.marker?.destroy();
    this.interactables.delete('evchest-' + uid);
    if (this.nearest?.id === 'evchest-' + uid) this.nearest = null;
  }

  isNight(): boolean {
    if (this.mapKind === 'dungeon') return true;
    const c = this.state.adv.clock;
    return c >= 19 * 60 || c < 5 * 60;
  }

  /** 0 = full day, 1 = deep night (smooth dusk/dawn) */
  darkness(): number {
    if (this.mapKind === 'dungeon') return 0.62;
    const h = this.state.adv.clock / 60;
    if (h >= 7 && h < 17) return 0;
    if (h >= 17 && h < 19.5) return ((h - 17) / 2.5) * 0.58;
    if (h >= 19.5 || h < 4.5) return 0.58;
    return (1 - (h - 4.5) / 2.5) * 0.58;
  }

  private updateAtmosphere(dt: number): void {
    const q = QUALITY_PROFILE[saveStore.data.settings.quality];
    const adv = this.state.adv;
    if (this.mapKind === 'valley' && !this.modal) {
      adv.clock = (adv.clock + dt * 2) % 1440; // 1 real second = 2 in-game minutes
      this.weather.t -= dt;
      if (this.weather.t <= 0) {
        const r = this.world.rng.next();
        const theme = this.regionDef.theme;
        const next: WeatherKind = theme === 'volcanic' ? (r < 0.6 ? 'clear' : r < 0.85 ? 'heatwave' : 'fog')
          : theme === 'frozen' ? (r < 0.55 ? 'clear' : r < 0.8 ? 'blizzard' : 'fog')
          : r < 0.6 ? 'clear' : r < 0.85 ? 'rain' : 'fog';
        if (next !== this.weather.kind) this.ui?.banner(next === 'rain' ? 'Trời bắt đầu mưa...' : next === 'fog' ? 'Sương mù kéo đến' : next === 'blizzard' ? 'Bão tuyết nổi lên...' : next === 'heatwave' ? 'Nắng nóng như thiêu đốt' : 'Trời quang đãng', '#c0d8ff');
        this.weather = { kind: next, t: this.world.rng.range(180, 360) };
      }
    }
    this.world.env.night = this.isNight();
    const wk = this.effectiveWeather();
    this.world.env.weather = wk;
    const wet = wk === 'rain' || wk === 'heavyRain' || wk === 'thunderstorm';
    const foggy = wk === 'fog' || wk === 'mysticFog';
    const dk = this.darkness() + (wk === 'thunderstorm' ? 0.25 : wet ? 0.15 : foggy ? 0.06 : 0);
    const col = this.mapKind === 'dungeon' ? (this.map as DungeonMap).def.tint ?? 0x2a1830 : this.state.adv.clock / 60 > 16 && this.state.adv.clock / 60 < 20 ? 0x603060 : 0x101848;
    this.dark.setFillStyle(col, Math.min(0.75, dk));
    // Lights only matter once it's actually dark (dusk onward)
    const lightA = dk < 0.2 ? 0 : Math.min(1, (dk - 0.2) * 2.2);
    const now = this.time.now;
    for (const l of this.lamps) l.img.setAlpha(lightA * (l.flicker ? 0.55 + Math.sin(now * 0.013 + l.x) * 0.08 : 0.5));
    const t = this.world.trainer;
    this.trainerLight.setPosition(t.x, t.y).setAlpha(lightA * 0.4).setVisible(q.lights);
    if (this.rain) {
      const raining = wet && q.weather > 0 && this.regionDef.theme !== 'frozen';
      const qty = Math.max(1, Math.round((wk === 'rain' ? 3 : 6) * q.weather));
      if (raining && (!this.rain.emitting || this.rain.quantity !== qty)) { this.rain.setQuantity(qty); if (!this.rain.emitting) this.rain.start(); }
      if (!raining && this.rain.emitting) this.rain.stop();
    }
    this.updateAnomalyFx(wk, q.weather, dt);
    if (this.fog) {
      const target = foggy && q.weather > 0 ? (wk === 'mysticFog' ? 0.7 : 0.55) * q.weather : 0;
      this.fog.setTint(wk === 'mysticFog' ? 0xc090ff : 0xffffff);
      this.fog.setAlpha(this.fog.alpha + (target - this.fog.alpha) * Math.min(1, dt));
      this.fog.tilePositionX += dt * 8; this.fog.tilePositionY += dt * 3;
    }
    // Ambient: fireflies at night; by day falling leaves in forests, pollen elsewhere
    this.ambientT -= dt;
    if (q.ambient > 0 && this.ambientT <= 0 && this.mapKind === 'valley') {
      this.ambientT = 0.35 / q.ambient;
      const v = this.cameras.main.worldView;
      const x = v.x + Math.random() * v.width, y = v.y + Math.random() * v.height;
      const hab = this.map.habitatAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
      this.renderer_.vfx.emit(this.isNight() ? 'fairy' : hab === 'forest' || hab === 'forest-grass' ? 'grass' : 'dust', x, y - v.height * 0.3, 1);
    }
  }

  // ───────────────────────────── input ─────────────────────────────

  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('TAB');
    const guard = (fn: () => void) => () => { if (!this.modal && this.blackoutT < 0) fn(); };
    kb.on('keydown-E', guard(() => this.interact()));
    kb.on('keydown-SPACE', guard(() => this.interact()));
    kb.on('keydown-F', guard(() => this.throwBall()));
    kb.on('keydown-R', guard(() => this.cycleBall()));
    kb.on('keydown-H', guard(() => this.quickHeal()));
    kb.on('keydown-G', guard(() => this.tryMega()));
    kb.on('keydown-TAB', () => this.ui?.toggleMenu('party'));
    kb.on('keydown-M', () => this.ui?.toggleMenu('map'));
    kb.on('keydown-P', () => { if (this.state.adv.campaign === 'vietnam') this.ui?.toggleMenu('passport'); });
    kb.on('keydown-J', () => this.ui?.toggleMenu('quests'));
    kb.on('keydown-V', () => this.ui?.toggleMenu('events'));
    kb.on('keydown-I', () => this.ui?.toggleMenu('bag'));
    kb.on('keydown-X', () => this.ui?.toggleMenu('dex'));
    kb.on('keydown-ESC', () => this.ui?.toggleMenu('settings'));
    // 1–5: ally commands · Shift + 1–6: summon / recall that party slot
    const DIGIT = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];
    const shifted = () => !!this.keys.SHIFT?.isDown;
    COMMANDS.forEach((c) => kb.on(`keydown-${c.key === '`' ? 'BACKTICK' : DIGIT[Number(c.key) - 1]}`, guard(() => { if (shifted() && c.key !== '`') this.summons?.toggleSlot(Number(c.key) - 1); else this.command(c.id); })));
    kb.on('keydown-SIX', guard(() => { if (shifted()) this.summons?.toggleSlot(5); }));
    kb.on('keydown-ZERO', guard(() => this.command('auto')));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.pointerWorld = { x: wp.x, y: wp.y, at: this.time.now };
    });
    if (new URLSearchParams(location.search).has('debug')) {
      kb.on('keydown-N', () => { this.state.adv.clock = (this.state.adv.clock + 180) % 1440; });
      kb.on('keydown-L', () => { this.state.addItems({ pokeball: 10, greatball: 5, potion: 5 }); this.ui?.banner('DEBUG: +items', '#fff'); });
    }
  }

  command(cmd: AllyCommand): void {
    let target: Unit | null = null;
    if (cmd === 'attack') {
      target = this.aimTarget(false);
      if (!target) { this.ui?.banner('Không có mục tiêu gần đó', '#ffb0a0'); return; }
    }
    this.world.setCommand(cmd, target);
    this.ui?.banner(`Lệnh: ${COMMANDS.find((c) => c.id === cmd)!.label}${target ? ' → ' + target.name : ''}`, '#a0d8ff');
  }

  /** Wild Pokémon under the mouse (desktop), otherwise the nearest one in range. */
  aimTarget(capturableOnly: boolean): Unit | null {
    const t = this.world.trainer;
    const ok = (e: Unit) => e.alive && !e.captured && (!capturableOnly || (!!e.wild && !e.noCapture) || this.isLegendCapturable(e));
    const usePointer = this.time.now - this.pointerWorld.at < 4000;
    let best: Unit | null = null, bd = Infinity;
    for (const e of this.world.enemies) {
      if (!ok(e)) continue;
      const d = usePointer ? Math.hypot(e.x - this.pointerWorld.x, e.y - this.pointerWorld.y) : Math.hypot(e.x - t.x, e.y - t.y);
      const limit = usePointer ? 70 : 420;
      if (d < limit && d < bd && Math.hypot(e.x - t.x, e.y - t.y) < 520) { bd = d; best = e; }
    }
    return best;
  }

  // ───────────────────────────── loop ─────────────────────────────

  update(_time: number, delta: number): void {
    music.play(this.musicMood());
    const t0 = performance.now();
    const w = this.world;
    const dt = Math.min(delta, 100) / 1000;
    const k = this.keys;
    let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (!ix && !iy) { ix = this.joystick.x; iy = this.joystick.y; }
    const frozen = this.modal || this.blackoutT >= 0 || this.captureFx?.phase === 'shaking';
    w.input.x = frozen ? 0 : ix; w.input.y = frozen ? 0 : iy;
    w.run = k.SHIFT.isDown || this.runHeld;

    let simMs = 0;
    if (!this.modal) {
      this.acc += dt;
      const s0 = performance.now();
      let n = 0;
      while (this.acc >= STEP && n < MAX_STEPS && w.state === 'playing') {
        w.step(STEP);
        this.worldEvents?.update(STEP);
        this.legendsMgr?.update(STEP);
        this.env?.update(STEP);
        this.spawns?.update(STEP);
        this.dungeon?.update(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n === MAX_STEPS) this.acc = 0;
      simMs = performance.now() - s0;
    }

    const events = w.drainEvents();
    this.coopHost?.update(performance.now(), this.modal, events);
    this.handleGameplayEvents(events);
    this.renderer_.handle(events);
    this.renderer_.render(delta);
    this.chunks.update(this.cameras.main.worldView);

    this.animT -= dt;
    if (this.animT <= 0) { this.animT = 0.45; this.animFrame ^= 1; this.chunks.animate(this.animFrame); }
    this.updateAtmosphere(dt);
    this.updateExploration();
    this.presence?.update(performance.now());
    this.updateInteractables();
    if (this.mapKind === 'valley') this.updatePuzzle();
    this.updateBattle();
    this.updateCapture(dt);
    if (!this.modal) this.updateMega(dt);
    if (this.mapKind === 'valley') this.updateWorldBoss();
    // Evolution prompts wait for a calm moment (never between dungeon waves / before the boss)
    const dungeonCalm = !this.dungeon || this.dungeon.phase === 'reward' || this.dungeon.phase === 'done';
    if (this.evoQueue.size && dungeonCalm && !this.modal && !this.evoBusy && !this.inCombat() && this.blackoutT < 0) void this.processEvolution();

    if (w.state === 'gameover' && this.blackoutT < 0) this.startBlackout();
    if (this.blackoutT >= 0) {
      this.blackoutT -= dt;
      if (this.blackoutT < 0) this.finishBlackout();
    }
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 20; this.state.adv.playTime += 20; this.persist(); }

    const p = this.perf;
    p.fps = this.game.loop.actualFps;
    p.frameMs = p.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    p.simMs = p.simMs * 0.9 + simMs * 0.1;
    p.entities = w.enemies.length + w.allies.length + 1;
    p.particles = this.renderer_.vfx.aliveParticles();
  }

  private handleGameplayEvents(events: ReturnType<World['drainEvents']>): void {
    for (const e of events) {
      if (e.t === 'dmg' && e.victimTeam === 'enemy') {
        for (const u of this.world.enemies) if (u.wild && u.hostile && !this.battleSince.has(u.id)) this.battleSince.set(u.id, this.time.now);
      }
      if (e.t === 'faint') {
        const ally = this.world.allies.find((a) => a.id === e.id);
        const owned = ally?.ownerUid ? this.state.owned(ally.ownerUid) : null;
        if (owned) addFriendship(owned, 'faint');
        continue;
      }
      if (e.t === 'bossWeakenedExpired') { if (this.legendCap?.unit.id === e.id) this.legendFlee('hồi sức'); continue; }
      const down = e.t === 'death' ? e : e.t === 'bossWeakened' ? { ...e, t: 'death' as const, elite: false, boss: true, wild: false } : null;
      if (!down || !down.id) continue;
      this.handleDown(down);
    }
  }

  /** An enemy is beaten (died, or a legendary boss went WEAKENED): EXP, friendship, rewards, quests. */
  private handleDown(e: Extract<WorldEvent, { t: 'death' }>): void {
    {
      this.worldEvents?.onResolved(e.id!, e.defId, e.x, e.y, false);
      const trainerOwned = !!e.tag?.startsWith('trainer:');
      // Friendship: a win against a trainer's Pokémon or a boss counts as a real battle for the active party
      if (trainerOwned || e.boss) for (const a of this.world.allies) if (!a.fainted && a.ownerUid) { const o = this.state.owned(a.ownerUid); if (o) addFriendship(o, 'battle'); }
      const exp = expYield(e.defId === 'onix' ? 'onix' : e.defId, e.level ?? 5, trainerOwned || e.tag === 'dungeon');
      const alive = this.world.allies.filter((a) => !a.fainted && a.ownerUid).map((a) => a.ownerUid!);
      this.state.earn((e.level ?? 5) * (trainerOwned ? 6 : 3));
      if (e.boss && this.bossSites().some((s) => s.id === e.defId)) this.onWorldBossDefeated(e.defId, e.level ?? 30);
      else if (e.boss && e.tag === 'roamer') this.legendsMgr?.onRoamerDefeated(e.defId, e.level ?? 40);
      for (const up of this.state.gainExp(alive, exp)) {
        this.evoQueue.add(up.uid);
        const ally = this.world.allies.find((a) => a.ownerUid === up.uid);
        if (ally) {
          this.world.setAllyLevel(ally, up.level);
          ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.2);
          this.renderer_.vfx.ring(ally.x, ally.y, 70, 0xffe060, 500);
          this.ui?.banner(`${ally.name} lên Lv${up.level}!`, '#ffe060');
          audio.play('levelup');
        }
      }
      for (const uid of this.state.gainEvs(alive, e.defId)) this.refreshIndividual(uid);
      this.questEvent({ type: 'defeat', target: e.defId });
      if (e.boss) this.questEvent({ type: 'boss', target: e.defId });
    }
  }

  // ───────────────────────────── legendary capture window ─────────────────────────────

  /** All phases cleared: the legendary stays, weakened, and can be caught with the boss's own rule. */
  openLegendCapture(id: string, level: number): void {
    const u = this.world.enemies.find((e) => e.alive && e.kind === 'boss' && e.defId === id && e.boss?.weakened);
    if (!u) return;
    if (this.state.adv.legends[id] === 'caught') {
      // already in the collection: no capture (never a duplicate) — it leaves after the fight
      this.time.delayedCall(1500, () => { if (u.alive) this.legendLeave(u, `${u.name} gật đầu rồi bay đi.`); });
      return;
    }
    const rule = legendRule(id);
    u.noCapture = false;
    this.legendCap = { unit: u, id, level, left: rule.maxAttempts, rule };
    this.ui.eventAlert(`${u.name} kiệt sức! Ném bóng (F) để thu phục — ${rule.maxAttempts} lượt, ${rule.window}s${rule.balls ? ' · chỉ ' + rule.balls.map((b) => ITEMS[b]?.name ?? b).join(', ') : ''}`, '#80ff90');
    this.persist();
  }

  /** Background music: legendary / other boss fights, dungeon, else the region's theme. */
  musicMood(): Mood {
    const b = this.world?.boss;
    if (b?.alive) return LEGENDS.has(b.defId) ? 'legend' : 'boss';
    if (this.mapKind === 'dungeon') return 'dungeon';
    const th = this.regionDef?.theme;
    return th === 'frozen' ? 'frozen' : th === 'volcanic' ? 'volcanic' : th === 'sanctuary' ? 'sanctuary' : th === 'swamp' ? 'swamp' : th === 'coast' ? 'coast' : 'valley';
  }

  /** Resumes a saved boss fight: HP, phase (mid-cinematic → that phase, ACTIVE), weakened capture window. */
  restoreBossFight(u: Unit): void {
    const f = this.state.adv.bossFights[u.defId];
    if (!f || !u.boss) return;
    u.hp = Math.max(1, Math.round(u.maxHp * Math.min(1, Math.max(0, f.hpFrac))));
    this.world.restoreBossPhase(u, f.phase);
    if (u.boss.pm.state === 'WEAKENED') {
      u.boss.weakened = true;
      this.openLegendCapture(u.defId, u.level);
      if (this.legendCap?.unit === u && f.captureLeft != null) this.legendCap.left = Math.max(1, f.captureLeft);
    } else if (u.boss.pm.state === 'DEFEATED') { delete this.state.adv.bossFights[u.defId]; }
  }

  isLegendCapturable(e: Unit): boolean {
    return !!this.legendCap && this.legendCap.unit === e && e.alive && !e.captured;
  }

  /** Window over / throws used up: it recovers and flies off (it can be fought and caught again later). */
  legendFlee(why: string): void {
    const c = this.legendCap;
    if (!c) return;
    this.legendCap = null;
    this.legendLeave(c.unit, `${c.unit.name} đã ${why} và bay đi! (sẽ quay lại sau)`);
  }

  private legendLeave(u: Unit, msg: string): void {
    this.renderer_.vfx.named('poof', u.x, u.y);
    u.boss?.pm.finish();
    this.world.removeEnemy(u);
    delete this.state.adv.bossFights[u.defId];
    this.ui.banner(msg, '#c0c8e0');
    this.persist();
  }

  private updateExploration(): void {
    if (this.mapKind !== 'valley') return;
    const t = this.world.trainer;
    const tx = Math.floor(t.x / TILE_PX), ty = Math.floor(t.y / TILE_PX);
    const idx = Math.floor(ty / this.map.chunk) * chunkCols(this.map) + Math.floor(tx / this.map.chunk);
    if (idx !== this.lastChunk) {
      this.lastChunk = idx;
      this.state.discoverChunk(idx);
    }
    const area = this.map.areaAt(tx, ty);
    const name = area?.name ?? '';
    if (name !== this.areaName) {
      this.areaName = name;
      if (area) {
        this.ui?.areaBanner(area.name);
        if (!this.state.adv.areas.includes(area.id)) {
          this.state.adv.areas.push(area.id);
          this.state.addWorldExp(25);
        }
        this.questEvent({ type: 'explore', target: area.id });
      }
    }
  }

  private updateInteractables(): void {
    const t = this.world.trainer;
    let best: Interactable | null = null, bd = 64;
    for (const it of this.interactables.values()) {
      if (it.kind === 'plate') continue;
      const d = Math.hypot(it.x - t.x, it.y - t.y);
      if (d < bd) { bd = d; best = it; }
      if (it.marker) {
        const giver = it.kind === 'npc' || it.kind === 'trainer' ? this.state.quests.forGiver(it.id) : [];
        const waiting = giver.some((q) => this.state.quests.states[q.id].status === 'available');
        const talkObjective = this.state.quests.active().some((q) => { const o = this.state.quests.currentObjective(q.id); return o?.type === 'talk' && o.target === it.id; });
        it.marker.setText(talkObjective ? '?' : waiting ? '!' : '').setY(it.y - 68 + Math.sin(this.time.now * 0.006) * 3);
      }
    }
    this.nearest = best;
  }

  private decorate(u: Unit, v: { body: Phaser.GameObjects.Sprite; deco: Phaser.GameObjects.Image | null }): void {
    if (!u.wild || u.fainted) { v.deco?.setVisible(false); return; }
    const m = u.wild.mode;
    const tex = m === 'sleep' ? 'zzz' : m === 'alert' || m === 'chase' ? 'alert' : null;
    if (!tex) { v.deco?.setVisible(false); v.body.anims.timeScale = m === 'eat' ? 0.6 : 1; return; }
    if (!v.deco) v.deco = this.add.image(0, 0, tex).setScale(3);
    v.deco.setTexture(tex).setVisible(true).setPosition(u.x + 10, u.y - u.radius - 30 + Math.sin(this.time.now * 0.008) * 3).setDepth(9050);
    if (m === 'sleep') v.body.anims.timeScale = 0.3;
  }

  // ───────────────────────────── quests ─────────────────────────────

  questEvent(ev: Parameters<AdventureState['notify']>[0]): void {
    const done = this.state.notify(ev);
    for (const q of done) this.completeQuest(q);
    if (done.length) this.persist();
  }

  private completeQuest(q: QuestDef): void {
    const lines = this.state.grant(q.rewards);
    this.applyParty();
    audio.play('victory');
    this.ui?.questComplete(q.title, lines);
  }

  // ───────────────────────────── interaction ─────────────────────────────

  async interact(): Promise<void> {
    const it = this.nearest;
    if (!it || this.modal) return;
    switch (it.kind) {
      case 'npc': return this.talk(it);
      case 'sign': return void (await this.say('Bảng gỗ', (it.obj.data as { text: string[] }).text));
      case 'chest': {
        const evUid = (it.obj.data as { event?: number } | undefined)?.event;
        if (evUid != null) { if (this.worldEvents?.openTreasure(evUid)) audio.play('victory'); return; }
        return this.openChest(it);
      }
      case 'building': return this.ui.openMenu('pc');
      case 'waypoint': return this.useWaypoint(it);
      case 'portal': return this.usePortal(it.obj.data as unknown as PortalDef);
      case 'cave': return this.enterCave((it.obj.data as { id?: string } | undefined)?.id ?? 'ancient-cave');
      case 'trainer': return this.challenge(it);
      case 'rescue': return this.rescue(it);
      case 'exit': return this.leaveDungeon(false);
      case 'remote': return this.presence?.challenge();
    }
  }

  /** Dialogue portrait: official trainer art if the pack is on, else the IcyEthics portrait. */
  portraitOf(npcId: string): string | undefined {
    return trainerArtKey(this, npcId) ?? PORTRAITS[npcId] ?? (npcId === 'shopkeeper' ? 'portrait-mycologist' : undefined);
  }

  /** NPC currently being talked to: every line of that conversation shows its portrait. */
  private talkingTo: string | null = null;

  async say(speaker: string, lines: string[], choices?: DialogueChoice[], portrait?: string): Promise<string | null> {
    this.modal = true;
    const r = await this.ui.dialogue(speaker, lines, choices, portrait ?? (this.talkingTo ? this.portraitOf(this.talkingTo) : undefined));
    this.modal = false;
    return r;
  }

  inCombat(): boolean {
    const t = this.world.trainer;
    return this.world.enemies.some((e) => e.alive && !e.captured && e.hostile && Math.hypot(e.x - t.x, e.y - t.y) < 600);
  }

  private async talk(it: Interactable): Promise<void> {
    const npc = it.obj.data as { id: string; name: string; lines: string[] };
    this.talkingTo = npc.id;
    try { await this.talkTo(npc, it); } finally { this.talkingTo = null; }
  }

  private async talkTo(npc: { id: string; name: string; lines: string[] }, it: Interactable): Promise<void> {
    void it;
    const qs = this.state.quests;
    const pt = this.portraitOf(npc.id);
    const say = (lines: string[], choices?: DialogueChoice[]) => this.say(npc.name, lines, choices, pt);
    if (npc.id === 'shopkeeper') return this.shop(npc.name);
    // 1) an active quest waiting for this NPC
    for (const q of qs.active()) {
      const obj = qs.currentObjective(q.id);
      if (obj?.type !== 'talk' || obj.target !== npc.id) continue;
      if ((q.id === 'q-main-1' || q.starter) && qs.states[q.id].step === 0) return this.starterIntro(npc.name, q, npc.id);
      const lastStep = qs.states[q.id].step === q.objectives.length - 1;
      await say(lastStep ? q.dialogue.complete : q.dialogue.progress ?? q.dialogue.offer);
      this.questEvent({ type: 'talk', target: npc.id });
      return;
    }
    // 2) offer an available quest
    const offer = qs.forGiver(npc.id).find((q) => qs.states[q.id].status === 'available');
    if (offer) {
      const r = await say(offer.dialogue.offer, [{ label: `Nhận nhiệm vụ: ${offer.title}`, value: 'yes' }, { label: 'Để sau', value: 'no' }]);
      if (r === 'yes') {
        this.state.startQuest(offer.id);
        this.state.trackedQuest = offer.id;
        this.ui.banner(`Nhiệm vụ mới: ${offer.title}`, '#ffd040');
        audio.play('levelup');
        this.persist();
      }
      return;
    }
    // 3) progress hint or idle chatter
    const active = qs.forGiver(npc.id).find((q) => qs.states[q.id].status === 'active');
    await say(active?.dialogue.progress ?? npc.lines);
  }

  private async shop(name: string): Promise<void> {
    for (;;) {
      const choices: DialogueChoice[] = SHOP.map((it) => ({
        label: `${ITEMS[it.id]?.name ?? it.id} — ${it.price} xu (đang có ${this.state.item(it.id)})`, value: it.id, disabled: this.state.money < it.price,
      }));
      choices.push({ label: 'Rời đi', value: 'leave' });
      const r = await this.say(name, [`Chào cháu! Cháu đang có ${this.state.money} xu. Cần mua gì nào?`], choices, this.portraitOf('shopkeeper'));
      if (!r || r === 'leave') return;
      const it = SHOP.find((x) => x.id === r)!;
      if (this.state.buy(it.id, it.price)) {
        audio.play('gem');
        this.ui.banner(`Đã mua ${ITEMS[it.id]?.name ?? it.id} (-${it.price} xu)`, '#ffe066');
        this.persist();
      }
    }
  }

  // ───────────────────────────── evolution ─────────────────────────────

  /** Time of day, habitat and weather for evolution rules. */
  evoEnv(): EvoEnv {
    const t = this.world.trainer;
    const tx = Math.floor(t.x / TILE_PX), ty = Math.floor(t.y / TILE_PX);
    return { night: this.isNight(), habitat: this.map.habitatAt(tx, ty), raining: this.weather.kind === 'rain' };
  }

  private async processEvolution(): Promise<void> {
    const uid = [...this.evoQueue][0];
    this.evoQueue.delete(uid);
    const targets = this.state.pendingEvolutions(uid, this.evoEnv());
    const p = this.state.owned(uid);
    if (!targets.length || !p) return;
    this.evoBusy = true;
    const fromName = POKEMON.get(p.species)!.name;
    // A real branch shows every valid target; nothing is picked at random
    const choices: DialogueChoice[] = targets.length === 1
      ? [{ label: 'Để nó tiến hóa!', value: targets[0] }]
      : targets.map((to) => ({ label: `Tiến hóa thành ${POKEMON.get(to)!.name}`, value: to }));
    choices.push({ label: 'Chưa phải lúc (hỏi lại ở cấp sau)', value: 'no' });
    const r = await this.say(fromName, [`Ồ? ${fromName} đang phát sáng...!`], choices);
    if (!r || r === 'no') {
      this.state.declineEvolution(uid);
      this.ui.banner(`${fromName} đã dừng tiến hóa`, '#c0c8e0');
      this.evoBusy = false;
      return;
    }
    await this.runEvolution(uid, r, fromName, POKEMON.get(r)!.name);
    this.evoBusy = false;
  }

  /** Evolution animation + permanent change + field update. */
  async runEvolution(uid: string, to: string, fromName: string, toName: string, stone?: string): Promise<boolean> {
    const p = this.state.owned(uid);
    if (!p) return false;
    const from = p.species;
    this.modal = true;
    await this.ui.playEvolution(from, to, fromName, toName, { level: p.level, ind: individualOf(p) });
    this.modal = false;
    if (!this.state.evolve(uid, to, stone, this.evoEnv())) return false;
    const ally = this.world.allies.find((a) => a.ownerUid === uid);
    if (ally) {
      if (this.megaUnit === ally) this.endMega(false);
      this.world.transformAlly(ally, to);
    }
    audio.play('victory');
    this.state.addWorldExp(80);
    this.questEvent({ type: 'evolve', target: to });
    this.persist();
    return true;
  }

  async useStone(stone: string): Promise<void> {
    const env = this.evoEnv();
    const cands = this.state.save.collection.filter((c) => this.state.stoneEvolution(c.uid, stone, env));
    if (!cands.length) { this.ui.banner(`Không có Pokémon nào phản ứng với ${ITEMS[stone]?.name ?? stone}`, '#ff9080'); return; }
    const r = await this.say(ITEMS[stone]?.name ?? stone, ['Dùng cho Pokémon nào?'],
      [...cands.map((c) => ({ label: `${POKEMON.get(c.species)!.name} Lv${c.level} → ${POKEMON.get(this.state.stoneEvolution(c.uid, stone, env)!)!.name}`, value: c.uid })), { label: 'Hủy', value: 'no' }]);
    if (!r || r === 'no') return;
    const c = this.state.owned(r)!;
    const to = this.state.stoneEvolution(r, stone, env)!;
    await this.runEvolution(r, to, POKEMON.get(c.species)!.name, POKEMON.get(to)!.name, stone);
  }

  // ───────────────────────────── equipment ─────────────────────────────

  equipItem(uid: string, itemId: string): boolean {
    if (!this.state.equip(uid, itemId)) return false;
    const ally = this.world.allies.find((a) => a.ownerUid === uid);
    if (ally) {
      if (this.megaUnit === ally) this.endMega(false);
      this.world.setHeld(ally, itemId);
    }
    this.persist();
    return true;
  }

  /** Field unit of a collection member picks up its new individual (EVs). */
  private refreshIndividual(uid: string): void {
    const p = this.state.owned(uid), ally = this.world.allies.find((a) => a.ownerUid === uid);
    if (p && ally) this.world.setIndividual(ally, individualOf(p));
  }

  useEvItem(uid: string, itemId: string): number {
    const applied = this.state.useEvItem(uid, itemId);
    if (applied) { this.refreshIndividual(uid); this.persist(); audio.play('heal'); }
    return applied;
  }

  unequipItem(uid: string): boolean {
    if (!this.state.unequip(uid)) return false;
    const ally = this.world.allies.find((a) => a.ownerUid === uid);
    if (ally) {
      if (this.megaUnit === ally) this.endMega(false);
      this.world.setHeld(ally, null);
    }
    this.persist();
    return true;
  }

  // ───────────────────────────── Mega Evolution ─────────────────────────────

  /** Best Mega candidate in the party, or the reason none is available. */
  megaStatus(): { ally?: Unit; form?: string; reason?: string } {
    const hasKey = this.state.item('key-stone') > 0;
    let reason = 'Không có Pokémon nào có thể Mega Tiến Hóa';
    for (const a of this.world.allies) {
      if (a.fainted || !megaFormsOf(a.megaFrom ?? a.defId).length) continue;
      const c = canMega(a.defId, a.heldId ?? undefined, hasKey, !!this.megaUnit, this.megaCd);
      if (c.ok) return { ally: a, form: c.form };
      reason = c.reason ?? reason;
    }
    return { reason };
  }

  tryMega(): void {
    if (this.megaUnit) { this.ui.banner(`${this.megaUnit.name} đang ở dạng Mega`, '#ffb0ff'); return; }
    const st = this.megaStatus();
    if (!st.ally || !st.form) { this.ui.banner(st.reason ?? 'Không thể Mega Tiến Hóa', '#ff9080'); return; }
    if (!this.inCombat()) { this.ui.banner('Chỉ có thể Mega Tiến Hóa khi đang chiến đấu', '#ff9080'); return; }
    const from = st.ally.name;
    this.world.transformAlly(st.ally, st.form, { mega: true });
    this.megaUnit = st.ally;
    this.megaT = MEGA_DURATION;
    this.megaIdle = 0;
    this.cameras.main.flash(300, 255, 220, 255);
    this.cameras.main.shake(400, 0.01);
    audio.play('boss');
    this.ui.megaBanner(from, st.ally.name);
  }

  endMega(startCooldown = true): void {
    const u = this.megaUnit;
    if (!u) return;
    this.world.revertMega(u);
    this.megaUnit = null;
    if (startCooldown) this.megaCd = MEGA_COOLDOWN;
    this.ui.banner(`${u.name} trở lại hình dạng ban đầu`, '#e0c0ff');
  }

  private updateMega(dt: number): void {
    if (this.megaCd > 0) this.megaCd -= dt;
    const u = this.megaUnit;
    if (!u) return;
    this.megaT -= dt;
    this.megaIdle = this.inCombat() ? 0 : this.megaIdle + dt;
    if (u.fainted || this.megaT <= 0 || this.megaIdle > MEGA_IDLE_REVERT || !this.world.allies.includes(u)) this.endMega();
  }

  // ───────────────────────────── world boss ─────────────────────────────

  /** Mega Venusaur's grove + the legendary shrines. At most one of them is active at a time. */
  bossSites(): { id: string; name: string; x: number; y: number; level: number; respawn: number; arena: number; requires: string[]; hint?: string; gift?: boolean; condition?: { time?: 'day' | 'night' | 'dawn'; weather?: string[]; friendship?: number } }[] {
    const d = this.regionDef;
    return [...(d.worldBoss ? [{ ...d.worldBoss, requires: d.worldBoss.requires ?? [] }] : []), ...(d.legendaries ?? [])];
  }

  /** Time / weather / party-lead friendship for legendary conditions. */
  legendEnv(): LegendEnv {
    const lead = this.state.party()[0];
    return { clock: this.state.adv.clock, weather: this.effectiveWeather(), leadFriendship: lead?.friendship ?? 0 };
  }

  private updateWorldBoss(): void {
    const t = this.world.trainer;
    const b = this.worldBoss;
    if (b) {
      const site = this.bossSites().find((s) => s.id === b.defId)!;
      const d = Math.hypot(t.x - (site.x + 0.5) * TILE_PX, t.y - (site.y + 0.5) * TILE_PX);
      if (!b.alive) { this.worldBoss = null; return; }
      if (d > 1400) { // reset when the player walks away (a capture window closes too)
        if (this.legendCap?.unit === b) this.legendCap = null;
        delete this.state.adv.bossFights[b.defId];
        this.world.removeEnemy(b); this.worldBoss = null;
      }
      return;
    }
    if (this.world.boss?.alive || this.modal) return;
    for (const s of this.bossSites()) {
      const cx = (s.x + 0.5) * TILE_PX, cy = (s.y + 0.5) * TILE_PX;
      if (Math.hypot(t.x - cx, t.y - cy) > s.arena || !this.chunks.isLoadedTile(s.x, s.y)) continue;
      if (!s.requires.every((f) => this.state.hasFlag(f))) {
        if (s.hint && !this.sealedHinted.has(s.id)) { this.sealedHinted.add(s.id); this.ui.banner(s.hint, '#c8d8ff'); }
        continue;
      }
      // a caught gift legend never comes back; time / weather / friendship conditions
      if (s.gift && this.state.adv.legends[s.id] === 'caught') continue;
      const miss = s.condition ? legendMissing({ ...s.condition, weather: s.condition.weather as WeatherKind[] | undefined }, this.legendEnv()) : [];
      if (miss.length) {
        const key = s.id + ':' + miss.join();
        if (!this.sealedHinted.has(key)) { this.sealedHinted.add(key); this.ui.banner(`${s.name}: cần ${miss.join(', ')}.${s.hint ? ' ' + s.hint : ''}`, '#c8d8ff'); }
        continue;
      }
      const last = this.state.adv.bossDefeatedAt[s.id];
      if (last != null && this.state.adv.playTime - last < s.respawn) continue;
      if (s.gift) { void this.legendGift(s.id, s.level); return; }
      if (s.id !== 'mega-venusaur' && this.state.adv.legends[s.id] !== 'caught') this.state.adv.legends[s.id] = 'active';
      const level = s.level + (this.state.worldLevel - 1) * 2;
      this.worldBoss = this.world.spawnBoss(s.id, level, false, { x: cx, y: cy });
      this.worldBoss.tag = 'worldboss';
      this.restoreBossFight(this.worldBoss);
      this.cameras.main.shake(700, 0.012);
      return;
    }
  }

  private onWorldBossDefeated(id: string, level: number): void {
    const rb = this.regionDef.worldBoss;
    if (rb?.id === id && rb.rewards) { this.onRegionalBossDefeated(rb as Required<typeof rb>); return; }
    if (id !== 'mega-venusaur') { this.onLegendaryDefeated(id, level); return; }
    const wb = this.regionDef.worldBoss!;
    const first = !this.state.hasFlag('boss:' + wb.id);
    this.state.adv.bossDefeatedAt[wb.id] = this.state.adv.playTime;
    const items: Record<string, number> = first ? { 'key-stone': 1, venusaurite: 1, 'miracle-seed': 1 } : { leftovers: 1, superpotion: 1 };
    this.state.addItems(items);
    this.state.earn(first ? 2000 : 800);
    this.state.addWorldExp(first ? 600 : 250);
    if (first) this.state.setFlag('boss:' + wb.id);
    const lines = [...Object.entries(items).map(([k, v]) => `+${v} ${ITEMS[k]?.name ?? k}`), `+${first ? 2000 : 800} xu`, first ? 'Vòng Mega đã được mở khóa! (phím G)' : 'Boss sẽ hồi sinh sau 10 phút chơi'];
    this.time.delayedCall(800, () => this.ui.questComplete('Đã đánh bại Mega Venusaur!', lines));
    this.persist();
  }

  /** Data-driven regional boss (Vietnam Odyssey): first clear → loot + money + story flag (badge); later → small loot. */
  private onRegionalBossDefeated(wb: NonNullable<RegionDef['worldBoss']> & { rewards: NonNullable<NonNullable<RegionDef['worldBoss']>['rewards']> }): void {
    const r = wb.rewards;
    const first = !this.state.hasFlag(r.flag);
    this.state.adv.bossDefeatedAt[wb.id] = this.state.adv.playTime;
    const items = first ? r.first : r.repeat;
    this.state.addItems(items);
    const money = first ? r.money : Math.round(r.money / 3);
    this.state.earn(money);
    this.state.addWorldExp(first ? 500 : 150);
    if (first) { this.state.setFlag(r.flag); this.state.setFlag('boss:' + wb.id); }
    const lines = [...Object.entries(items).map(([k, v]) => `+${v} ${ITEMS[k]?.name ?? k}`), `+${money} xu`, first ? r.message : 'Boss sẽ quay lại sau một thời gian'];
    this.time.delayedCall(800, () => this.ui.questComplete(`Đã đánh bại ${wb.name}!`, lines));
    this.persist();
  }

  /** Non-combat meeting (Celebi, Jirachi, Shaymin): a short scene, then it joins. */
  private async legendGift(id: string, level: number): Promise<void> {
    const name = POKEMON.get(id)?.name ?? id;
    const def = LEGENDS.get(id);
    this.renderer_.vfx.named('evolve', this.world.trainer.x + 80, this.world.trainer.y - 40, 80);
    audio.play('levelup');
    const r = await this.say(name, [def?.lore ?? '', `${name} nhìn bạn một lúc lâu... rồi tiến lại gần.`], [{ label: `Mời ${name} đồng hành`, value: 'yes' }, { label: 'Để nó tự do', value: 'no' }]);
    if (r !== 'yes') { this.state.adv.bossDefeatedAt[id] = this.state.adv.playTime; this.ui.banner(`${name} bay đi... (sẽ quay lại sau)`, '#c0c8e0'); return; }
    this.joinLegend(id, level, `${name} đã tin tưởng và gia nhập đội!`);
  }

  /** A legendary joins: persistent "caught" state + flag + quest event (one individual only). */
  joinLegend(id: string, level: number, message: string, ball?: BallId): void {
    if (this.state.adv.legends[id] === 'caught' && this.state.save.collection.some((c) => c.species === id)) return;
    this.state.adv.legends[id] = 'caught';
    this.state.setFlag('boss:' + id);
    const p = this.state.addPokemon(id, Math.max(1, level), ball ? 'wild' : 'gift');
    if (ball) p.ball = ball;
    this.applyParty();
    this.ui.questComplete(`${POKEMON.get(id)?.name ?? id}`, [message]);
    this.questEvent({ type: 'boss', target: id });
    this.persist();
  }

  /** First win: the legendary acknowledges the trainer and joins; later wins drop items. */
  private onLegendaryDefeated(id: string, level: number): void {
    const first = !this.state.hasFlag('boss:' + id);
    if (this.state.adv.legends[id] !== 'caught') this.state.adv.legends[id] = 'defeated';
    if (first && id === 'kyogre') { this.state.adv.eggs.push({ species: 'manaphy', hatchAt: this.state.adv.playTime + (LEGENDS.get('manaphy')?.hatch ?? 600) }); this.ui.banner('Kyogre để lại một quả trứng biển xanh thẳm...', '#80c0ff'); }
    this.state.adv.bossDefeatedAt[id] = this.state.adv.playTime;
    const items: Record<string, number> = first ? LEGEND_REWARDS[id] ?? { ultraball: 3, superpotion: 2 } : { superpotion: 2, ultraball: 2 };
    this.state.addItems(items);
    this.state.earn(first ? 3000 : 1000);
    this.state.addWorldExp(first ? 800 : 300);
    const name = POKEMON.get(id)?.name ?? id;
    const lines = [...Object.entries(items).map(([k, v]) => `+${v} ${ITEMS[k]?.name ?? k}`), `+${first ? 3000 : 1000} xu`];
    if (first) {
      // story progress never depends on a capture roll: beating every phase opens the next shrines
      this.state.setFlag('boss:' + id);
      lines.unshift(`${name} kiệt sức — ném bóng để thu phục!`);
      if (id === 'mewtwo') lines.push('Một tiếng cười vang lên ở Đồi Hoa phía nam làng...');
      else if (['articuno', 'zapdos', 'moltres'].every((b) => this.state.hasFlag('boss:' + b))) lines.push('Cả ba Thần Điểu đã công nhận bạn. Vết Nứt Tâm Linh ở Rìa Rừng Ngọc đã mở!');
    } else lines.push(this.state.adv.legends[id] === 'caught' ? `${name} sẽ quay lại sau một thời gian` : `${name} kiệt sức — ném bóng để thu phục!`);
    this.time.delayedCall(800, () => this.ui.questComplete(`Đã đánh bại ${name}!`, lines));
    this.openLegendCapture(id, level);
    this.persist();
  }

  private async starterIntro(name: string, q: QuestDef, npcId = 'prof'): Promise<void> {
    await this.say(name, q.dialogue.offer);
    if (this.state.save.collection.length === 0) {
      const choice = await this.say(name, ['Ta có ba Pokémon ở đây. Cháu muốn đồng hành cùng ai?'],
        (q.starter ?? STARTERS).map((s) => ({ label: `${POKEMON.get(s)!.name} (${POKEMON.get(s)!.types.join('/')})`, value: s })));
      const species = choice ?? (q.starter ?? STARTERS)[0];
      this.state.addPokemon(species, 5, 'starter');
      this.applyParty();
      this.state.addItems({ pokeball: 5, potion: 2 });
      this.ui.banner(`${POKEMON.get(species)!.name} đã gia nhập đội!`, '#7fe07f');
      this.renderer_.vfx.named('capture', this.world.trainer.x, this.world.trainer.y);
      await this.say(name, ['Đây là 5 Poké Ball và 2 Potion.', 'Nhấn F để ném bóng vào Pokémon hoang dã (ngắm bằng chuột, hoặc tự nhắm khi chơi cảm ứng).']);
    } else {
      this.state.addItems({ pokeball: 5 });
      await this.say(name, ['Cháu đã có Pokémon rồi à? Tuyệt! Cầm lấy 5 Poké Ball nhé.']);
    }
    this.questEvent({ type: 'talk', target: npcId });
  }

  private async openChest(it: Interactable): Promise<void> {
    const c = it.obj.data as { id: string; items: Record<string, number>; requiresFlag?: string };
    if (c.requiresFlag && !this.state.hasFlag(c.requiresFlag)) {
      await this.say('Rương cổ', ['Chiếc rương bị phong ấn bởi một phép thuật cổ xưa...']);
      return;
    }
    this.state.adv.chests.push(c.id);
    this.state.addItems(c.items);
    this.state.earn(150);
    (it.sprite as Phaser.GameObjects.Image)?.setFrame(DUNGEON.chestOpen).clearTint();
    this.interactables.delete(it.id);
    this.renderer_.vfx.emit('gold', it.x, it.y - 20, 24);
    audio.play('victory');
    this.ui.banner('Nhận được: ' + Object.entries(c.items).map(([k, v]) => `${v} ${ITEMS[k]?.name ?? k}`).join(', '), '#ffe066');
    this.state.addWorldExp(40);
    this.questEvent({ type: 'collect', target: c.id });
    this.coopHost?.grant({ items: { ...c.items }, currency: 150, note: 'Rương báu' });
    this.persist();
  }

  private async useWaypoint(it: Interactable): Promise<void> {
    const wp = it.obj.data as { id: string; name: string };
    const adv = this.state.adv;
    this.world.healParty();
    this.summons?.healRecalled();
    this.renderer_.vfx.named('heal', this.world.trainer.x, this.world.trainer.y);
    if (!adv.waypoints.includes(wp.id)) {
      adv.waypoints.push(wp.id);
      adv.lastWaypoint = wp.id;
      this.state.addWorldExp(60);
      (it.sprite as Phaser.GameObjects.Image)?.setTexture('waypoint');
      this.ui.banner(`Đã kích hoạt trạm dịch chuyển: ${wp.name}`, '#60d0ff');
      audio.play('levelup');
      this.questEvent({ type: 'activate', target: wp.id });
      this.persist();
      return;
    }
    adv.lastWaypoint = wp.id;
    const region = this.regionDef;
    const others = region.waypoints.filter((w) => w.id !== wp.id && adv.waypoints.includes(w.id));
    const r = await this.say(wp.name, ['Đội của bạn đã được hồi phục hoàn toàn.', others.length ? 'Dịch chuyển tới đâu?' : 'Kích hoạt thêm trạm khác để dịch chuyển nhanh.'],
      [...others.map((o) => ({ label: `→ ${o.name}`, value: o.id })), { label: 'Đóng', value: 'close' }]);
    if (r && r !== 'close') this.fastTravel(r);
  }

  fastTravel(id: string): boolean {
    const region = this.regionDef;
    const wp = region.waypoints.find((w) => w.id === id);
    if (!wp || !this.state.adv.waypoints.includes(id) || this.mapKind !== 'valley') return false;
    if (this.world.enemies.some((e) => e.hostile && e.alive && Math.hypot(e.x - this.world.trainer.x, e.y - this.world.trainer.y) < 420)) {
      this.ui.banner('Không thể dịch chuyển khi đang chiến đấu!', '#ff8080');
      return false;
    }
    this.cameras.main.flash(250, 160, 220, 255);
    this.world.teleport((wp.x + 0.5) * TILE_PX, (wp.y + 1.6) * TILE_PX);
    this.state.adv.lastWaypoint = id;
    this.world.setCommand('auto');
    audio.play('dash');
    this.persist();
    return true;
  }

  /** Travel to another region through a portal (story-gated). */
  async usePortal(p: PortalDef): Promise<void> {
    const locked = (p.requires ?? []).filter((f) => !this.state.hasFlag(f));
    if (locked.length) { await this.say(p.name, [p.hint ?? 'Cổng đang bị phong ấn.']); return; }
    const dest = regionDef(p.to);
    const rec = ENC_REGIONS.get(p.to === 'starter-valley' ? 'starter-valley' : p.to);
    // maps split into per-area regions (Vietnam Odyssey) show the range of their areas
    const lv = dest.areas.map((a) => a.level).filter(Boolean) as number[][];
    const range = rec ? `Lv${rec.level[0]}–${rec.level[1]} (khuyến nghị Lv${rec.recommended})` : lv.length ? `Lv${Math.min(...lv.map((l) => l[0]))}–${Math.max(...lv.map((l) => l[1]))}` : '';
    const r = await this.say(p.name, [`Cổng dẫn tới ${dest.name}.${range && p.to !== 'starter-valley' && dest.id !== this.regionDef.id ? ` Pokémon ở đó ${range}.` : ''}`],
      [{ label: `Đi tới ${dest.name}`, value: 'go' }, { label: 'Ở lại', value: 'no' }]);
    if (r !== 'go') return;
    this.travelTo(p.to, p.toX, p.toY);
  }

  /** Switches the overworld map (scene restart; events and roamers end with the old scene). */
  travelTo(region: string, tx: number, ty: number): void {
    const adv = this.state.adv;
    this.persist(); // first: persist() records the *current* position, which must not overwrite the destination
    adv.region = region;
    adv.pos = { x: Math.round((tx + 0.5) * TILE_PX), y: Math.round((ty + 0.5) * TILE_PX) };
    void saveStore.save();
    this.modal = true; // nothing may move (or persist the old position) during the fade
    this.cameras.main.fadeOut(400);
    this.time.delayedCall(420, () => gameModes.start(this, 'adventure', { map: 'valley' }));
  }

  private async enterCave(id: string): Promise<void> {
    const def = dungeonDef(id);
    const choices: DialogueChoice[] = (['normal', 'hard', 'expert'] as Difficulty[]).map((d) => {
      const cfg = def.difficulties[d];
      const locked = !!cfg.requires && !this.state.dungeonCleared(def.id, cfg.requires as Difficulty);
      const cleared = this.state.dungeonCleared(def.id, d);
      return { label: `${cfg.label} (Lv${cfg.level})${cleared ? ' ✓' : ''}${locked ? ' — cần hoàn thành ' + def.difficulties[cfg.requires!].label : ''}`, value: d, disabled: locked };
    });
    choices.push({ label: 'Quay lại', value: 'no' });
    const timed = (d: string) => def.difficulties[d]?.timeLimit;
    const r = await this.say(def.name, [...(def.intro ?? ['Không khí lạnh lẽo phả ra từ cửa hang...']), timed('normal') ? `Giới hạn: ${timed('normal')}s / ${timed('hard')}s / ${timed('expert')}s. Chọn độ khó:` : 'Chọn độ khó:'], choices);
    if (!r || r === 'no') return;
    this.persist();
    this.cameras.main.fadeOut(400);
    this.time.delayedCall(420, () => gameModes.start(this, 'adventure', { map: 'dungeon', difficulty: r as Difficulty, dungeonId: def.id }));
  }

  private onDungeonBossDefeated(): void {
    const d = this.map as DungeonMap;
    // Reward chest + exit portal appear in the boss room
    const cx = (d.chest.x + 0.5) * TILE_PX, cy = (d.chest.y + 0.5) * TILE_PX;
    const chest = this.add.image(cx, cy, 'ow_tiles', DUNGEON.chestClosed).setScale(SCALE).setDepth(cy);
    this.renderer_.vfx.emit('gold', cx, cy, 40);
    const obj: MapObject = { kind: 'chest', id: 'dungeon-reward', x: d.chest.x, y: d.chest.y };
    this.interactables.set('dungeon-reward', { kind: 'chest', id: 'dungeon-reward', x: cx, y: cy + 20, label: 'Mở rương phần thưởng', obj, sprite: chest });
    const old = this.interact.bind(this);
    this.interact = async () => {
      if (this.nearest?.id === 'dungeon-reward') return this.claimDungeonReward(chest);
      if (this.nearest?.id === 'dungeon-exit') return this.leaveDungeon(true);
      return old();
    };
    this.ui.banner(`${BOSSES.get((this.map as DungeonMap).def.boss.id)?.name ?? 'Boss'} đã bị đánh bại!`, '#ffe066');
  }

  private claimDungeonReward(chest: Phaser.GameObjects.Image): void {
    const r = this.dungeon?.openChest();
    if (!r) return;
    chest.setFrame(DUNGEON.chestOpen);
    this.interactables.delete('dungeon-reward');
    const firstClear = !this.state.dungeonCleared(this.map.id, this.difficulty);
    const dd = (this.map as DungeonMap).def;
    const extra = firstClear ? dd.difficulties[this.difficulty].firstClear ?? {} : {};
    const lines = this.state.grant({ items: { ...r.items, ...extra }, worldExp: r.worldExp, reputation: r.reputation });
    this.state.earn(r.exp);
    this.coopHost?.grant({ items: { ...r.items, ...extra }, currency: r.exp, note: 'Phần thưởng hầm ngục' });
    if (firstClear && Object.keys(extra).length) lines.push('(Thưởng hoàn thành lần đầu)');
    const alive = this.world.allies.filter((a) => a.ownerUid).map((a) => a.ownerUid!);
    for (const up of this.state.gainExp(alive, r.exp)) {
      const ally = this.world.allies.find((a) => a.ownerUid === up.uid);
      if (ally) this.world.setAllyLevel(ally, up.level);
    }
    lines.push(`+${r.exp} EXP cho mỗi Pokémon`);
    this.state.markDungeon(this.map.id, this.difficulty);
    this.ui.questComplete(`Hoàn thành ${this.map.name} (${dd.difficulties[this.difficulty].label})`, lines);
    const d = this.map as DungeonMap;
    const ex = (d.bossExit.x + 0.5) * TILE_PX, ey = (d.bossExit.y + 1) * TILE_PX;
    const portal = this.add.image(ex, ey, 'waypoint').setOrigin(0.5, 1).setScale(SCALE).setTint(0xffa060).setDepth(ey);
    this.interactables.set('dungeon-exit', { kind: 'exit', id: 'dungeon-exit', x: ex, y: ey + 14, label: 'Rời hang', obj: { kind: 'exit', id: 'dungeon-exit', x: d.bossExit.x, y: d.bossExit.y }, sprite: portal });
    this.persist();
  }

  leaveDungeon(completed: boolean): void {
    if (completed) {
      this.questEvent({ type: 'dungeon', target: this.map.id });
      this.questEvent({ type: 'dungeon', target: `${this.map.id}:${this.difficulty}` });
    }
    // back to the entrance of this dungeon, on its region map
    const home = Object.values(REGION_DEFS).find((r) => r.dungeons.some((g) => g.id === this.map.id)) ?? regionDef('starter-valley');
    const cave = home.dungeons.find((g) => g.id === this.map.id) ?? home.dungeons[0];
    this.state.adv.region = home.id;
    this.state.adv.pos = { x: Math.round((cave.x + 0.5) * TILE_PX), y: Math.round((cave.y + 2.5) * TILE_PX) };
    this.persist();
    this.cameras.main.fadeOut(400);
    this.time.delayedCall(420, () => gameModes.start(this, 'adventure', { map: 'valley' }));
  }

  private tagNpc(it: Interactable, name: string, trainer: boolean, beaten: boolean): void {
    it.nameTag?.setText(trainer ? `${beaten ? '✓' : '⚔'} ${name}` : name).setColor(!trainer ? '#e8f0ff' : beaten ? '#a0a8b8' : '#ffc070');
  }

  private async challenge(it: Interactable): Promise<void> {
    const tr = it.obj.data as RegionDef['trainers'][number];
    if (this.state.hasFlag('beat:' + tr.id)) return void (await this.say(tr.name, tr.win, undefined, this.portraitOf(tr.id)));
    if (this.battle) return;
    if (!this.world.allies.some((a) => !a.fainted)) return void (await this.say(tr.name, ['Anh/chị chưa có Pokémon nào sẵn sàng chiến đấu kìa!'], undefined, this.portraitOf(tr.id)));
    const r = await this.say(tr.name, tr.challenge, [{ label: 'Chấp nhận thách đấu', value: 'yes' }, { label: 'Để sau', value: 'no' }], this.portraitOf(tr.id));
    if (r !== 'yes') return;
    const units = tr.team.map(([sp, lv], i) => {
      const x = it.x + (i - (tr.team.length - 1) / 2) * 70, y = it.y + 90;
      return this.world.spawnWild(sp, lv, x, y, { wild: makeWildState(x, y, 'aggressive', { homeR: 40, aggroR: 600, leash: 700 }), hostile: true, tag: 'trainer:' + tr.id, noCapture: true, hpMult: 3 });
    });
    this.battle = { id: tr.id, units };
    this.ui.banner(`${tr.name} gửi ra ${units.map((u) => u.name).join(' & ')}!`, '#ffcc44');
    audio.play('boss');
  }

  private updateBattle(): void {
    const b = this.battle;
    if (!b || !b.units.every((u) => !u.alive)) return;
    this.battle = null;
    const tr = this.regionDef.trainers.find((t) => t.id === b.id)!;
    this.state.setFlag('beat:' + tr.id);
    const it = this.interactables.get(tr.id);
    if (it) this.tagNpc(it, tr.name, true, true);
    this.state.addItems(tr.rewards.items);
    this.state.adv.reputation += 5;
    this.state.earn(500);
    this.ui.banner(`Thắng ${tr.name}! Nhận ${Object.entries(tr.rewards.items ?? {}).map(([k, v]) => `${v} ${ITEMS[k]?.name ?? k}`).join(', ')}`, '#ffe066');
    audio.play('victory');
    this.questEvent({ type: 'trainer', target: tr.id });
    void this.say(tr.name, tr.win, undefined, this.portraitOf(tr.id));
  }

  private async rescue(it: Interactable): Promise<void> {
    const r = it.obj.data as RegionDef['rescue'];
    const nm = POKEMON.get(r.species)?.name ?? r.species, who = r.reporter ?? 'Kiểm lâm Hà';
    if (this.world.enemies.some((e) => e.tag === 'rescue' && e.alive)) return void (await this.say(nm, [`${nm} run rẩy vì lũ Pokémon hoang dã xung quanh... Hãy đánh đuổi chúng trước!`]));
    if (this.state.quests.states[r.quest ?? 'q-rescue']?.status !== 'active') return void (await this.say(nm, [`${nm} nhìn bạn đầy cảnh giác... Có lẽ nên hỏi ${who} trước.`]));
    this.state.setFlag('rescued:' + r.id);
    it.sprite?.destroy();
    this.interactables.delete(it.id);
    this.renderer_.vfx.named('heal', it.x, it.y);
    this.ui.banner(`${nm} đã được giải cứu! Hãy báo cho ${who}.`, '#ffe040');
    this.questEvent({ type: 'rescue', target: r.id });
  }

  private updatePuzzle(): void {
    const region = this.regionDef;
    const pz = region.puzzles[0];
    if (!pz || this.state.hasFlag('puzzle:' + pz.id)) return; // regions beyond the valley have no rune puzzle
    const t = this.world.trainer;
    let on = -1;
    pz.plates.forEach(([x, y], i) => { if (Math.hypot((x + 0.5) * TILE_PX - t.x, (y + 0.5) * TILE_PX - t.y) < 28) on = i; });
    if (on === this.plateOn) return;
    this.plateOn = on;
    if (on < 0) return;
    const plate = this.interactables.get(`plate:${pz.id}:${on}`)?.sprite as Phaser.GameObjects.Image | undefined;
    if (pz.order[this.plateProgress] === on) {
      this.plateProgress++;
      plate?.setFrame(DUNGEON.plateOn);
      this.renderer_.vfx.ring(t.x, t.y, 60, 0xc0a0ff, 400);
      audio.play('shield');
      if (this.plateProgress >= pz.order.length) {
        this.state.setFlag('puzzle:' + pz.id);
        this.ui.banner('Phong ấn của rương cổ đã được giải trừ!', '#d0b0ff');
        audio.play('victory');
        const chest = this.interactables.get(pz.chest ?? 'chest-ruins')?.sprite as Phaser.GameObjects.Image | undefined;
        chest?.clearTint();
        this.questEvent({ type: 'puzzle', target: pz.id });
        this.persist();
      }
    } else if (!pz.order.slice(0, this.plateProgress).includes(on)) {
      this.plateProgress = 0;
      for (let i = 0; i < pz.plates.length; i++) (this.interactables.get(`plate:${pz.id}:${i}`)?.sprite as Phaser.GameObjects.Image | undefined)?.setFrame(DUNGEON.plate);
      this.ui.banner('Các phiến đá tắt lịm... Thứ tự chưa đúng.', '#ff9080');
      audio.play('hurt');
    }
  }

  // ───────────────────────────── items & capture ─────────────────────────────

  cycleBall(): void {
    const order: BallId[] = [...BALL_ORDER];
    for (let i = 1; i <= order.length; i++) {
      const next = order[(order.indexOf(this.selectedBall) + i) % order.length];
      if (this.state.item(next) > 0 || i === order.length) { this.selectedBall = next; break; }
    }
    this.ui?.banner(`Đang chọn: ${BALLS[this.selectedBall].name} (${this.state.item(this.selectedBall)})`, '#ffffff');
  }

  quickHeal(): void {
    const id = ['superpotion', 'potion', 'oranberry'].find((i) => this.state.item(i) > 0);
    if (!id) { this.ui.banner('Không còn thuốc hồi phục', '#ff9080'); return; }
    this.useItem(id);
  }

  useItem(id: string): boolean {
    const hp = HEAL_POWER[id];
    if (!hp || !this.state.consume(id)) return false;
    const t = this.world.trainer;
    this.world.heal(t, id === 'oranberry' ? 40 : t.maxHp * hp.trainer);
    for (const a of this.world.allies) if (!a.fainted) this.world.heal(a, a.maxHp * hp.party);
    this.ui.banner(`Đã dùng ${ITEMS[id].name}`, '#80ff90');
    audio.play('heal');
    return true;
  }

  /** Capture chance (0..1) for the UI preview. */
  /** Context for the special balls: types, darkness, whether / how long the target has been fighting. */
  ballContext(u: Unit): BallContext {
    const since = this.battleSince.get(u.id);
    return { types: u.types, dark: this.isNight() || this.mapKind === 'dungeon', untouched: !u.hostile && u.hp >= u.maxHp, battleSeconds: since != null ? (this.time.now - since) / 1000 : 0 };
  }

  private battleSince = new Map<number, number>();

  previewChance(u: Unit, ball: BallId = this.selectedBall): number {
    if (this.isLegendCapturable(u)) return legendThrowChance(this.legendCap!.rule, ball, this.baseChance(u, ball));
    return this.baseChance(u, ball);
  }

  private baseChance(u: Unit, ball: BallId): number {
    return captureChance(u.maxHp, u.hp, captureRateOf(u.defId) * (u.alpha ? 0.5 : 1), ballMultiplier(ball, this.ballContext(u)), statusBonus(u.statuses.map((s) => s.kind), u.wild?.mode === 'sleep'));
  }

  throwBall(): void {
    if (this.captureFx) return;
    if (this.world.allies.length === 0) { this.ui.banner('Hãy gặp Giáo sư Tùng trước đã!', '#ffb0a0'); return; }
    if (this.state.item(this.selectedBall) <= 0) {
      const other = BALL_ORDER.find((b) => this.state.item(b) > 0);
      if (!other) { this.ui.banner('Hết bóng rồi! Mở rương hoặc làm nhiệm vụ để có thêm.', '#ff9080'); return; }
      this.selectedBall = other;
    }
    const target = this.aimTarget(true);
    const t = this.world.trainer;
    let tx: number, ty: number;
    if (target) { tx = target.x; ty = target.y; }
    else if (this.time.now - this.pointerWorld.at < 4000) {
      const dx = this.pointerWorld.x - t.x, dy = this.pointerWorld.y - t.y, d = Math.hypot(dx, dy) || 1;
      const r = Math.min(d, 380);
      tx = t.x + (dx / d) * r; ty = t.y + (dy / d) * r;
    } else { this.ui.banner('Không có Pokémon hoang dã nào trong tầm ném', '#ffb0a0'); return; }
    this.state.consume(this.selectedBall);
    const ballId = this.selectedBall;
    // the official art of the selected ball (personal pack), else the tinted pixel ball
    const art = itemIconKey(this, ballId);
    const ball = art.startsWith('oitem-')
      ? this.add.image(t.x, t.y - 20, art).setScale(2).setDepth(9200)
      : this.add.image(t.x, t.y - 20, 'pokeball_big').setScale(SCALE).setDepth(9200);
    if (!art.startsWith('oitem-')) { if (ballId === 'greatball') ball.setTint(0x7ab0ff); else if (ballId === 'ultraball') ball.setTint(0xffe070); }
    this.captureFx = { ball, phase: 'flying', target: null, ballId };
    audio.play('whip');
    const dist = Math.hypot(tx - t.x, ty - t.y);
    const dur = 250 + dist * 0.7;
    const sx = t.x, sy = t.y - 20;
    this.tweens.addCounter({
      from: 0, to: 1, duration: dur,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        ball.setPosition(sx + (tx - sx) * k, sy + (ty - sy) * k - Math.sin(k * Math.PI) * (60 + dist * 0.2)).setAngle(k * 720);
      },
      onComplete: () => this.ballLanded(tx, ty, target),
    });
  }

  private ballLanded(x: number, y: number, aimed: Unit | null): void {
    const fx = this.captureFx!;
    const ok = (e: Unit) => e.alive && !e.captured && ((!!e.wild && !e.noCapture) || this.isLegendCapturable(e)) && Math.hypot(e.x - x, e.y - y) < e.radius + 34;
    // Prefer the Pokémon the player aimed at; otherwise the one closest to where the ball landed
    let hit: Unit | null = aimed && ok(aimed) ? aimed : null;
    if (!hit) {
      let bd = Infinity;
      for (const e of this.world.enemies) if (ok(e) && Math.hypot(e.x - x, e.y - y) < bd) { bd = Math.hypot(e.x - x, e.y - y); hit = e; }
    }
    if (!hit) {
      this.renderer_.vfx.emit('dust', x, y, 6);
      this.tweens.add({ targets: fx.ball, alpha: 0, y: y + 10, duration: 400, onComplete: () => { fx.ball.destroy(); this.captureFx = null; } });
      this.ui.banner('Trượt rồi!', '#ffb0a0');
      return;
    }
    const legend = this.isLegendCapturable(hit) ? this.legendCap! : null;
    if (legend && legend.rule.balls && !legend.rule.balls.includes(fx.ballId)) {
      // the boss's rule: this ball cannot hold it — bounces off, no throw used
      this.renderer_.vfx.flash(hit.x, hit.y, 40, 0xffffff, 200);
      this.tweens.add({ targets: fx.ball, alpha: 0, y: y - 30, duration: 400, onComplete: () => { fx.ball.destroy(); this.captureFx = null; } });
      this.ui.banner(`${ITEMS[fx.ballId]?.name ?? fx.ballId} bật ra! ${hit.name} chỉ chịu: ${legend.rule.balls.map((b) => ITEMS[b]?.name ?? b).join(', ')}`, '#ffb0a0');
      return;
    }
    fx.target = hit;
    fx.phase = 'shaking';
    this.world.beginCapture(hit);
    this.renderer_.vfx.flash(hit.x, hit.y, 40, 0xff4040, 250);
    audio.play('shield');
    fx.ball.setPosition(hit.x, hit.y + 6).setAngle(0);
    // Alphas fight back harder against Poké Balls too: half the capture rate
    const roll = legend
      // (the unit is already inside the ball here, so the rule is applied directly, not through previewChance)
      ? (() => { const ok = this.world.rng.chance(legendThrowChance(legend.rule, fx.ballId, this.baseChance(hit, fx.ballId))); return { success: ok, shakes: ok ? 3 : this.world.rng.int(0, 2) }; })()
      : rollCapture(this.world.rng, hit.maxHp, hit.hp, captureRateOf(hit.defId) * (hit.alpha ? 0.5 : 1), ballMultiplier(fx.ballId, this.ballContext(hit)), statusBonus(hit.statuses.map((s) => s.kind), hit.wild?.mode === 'sleep'));
    const shakes = roll.success ? 3 : roll.shakes;
    let i = 0;
    const wobble = () => {
      if (i >= shakes) return this.finishCapture(roll.success);
      i++;
      this.tweens.add({ targets: fx.ball, angle: { from: -22, to: 22 }, duration: 160, yoyo: true, repeat: 1, onComplete: () => this.time.delayedCall(260, wobble) });
      audio.play('click');
    };
    this.time.delayedCall(350, wobble);
  }

  private finishCapture(success: boolean): void {
    const fx = this.captureFx!;
    const u = fx.target!;
    if (this.legendCap?.unit === u) { this.finishLegendCapture(success); return; }
    if (success) {
      this.world.endCapture(u, true);
      const p = this.state.addPokemon(u.defId, u.level, 'wild', u.shiny);
      p.ball = fx.ballId;
      if (fx.ballId === 'luxuryball') p.friendship = Math.min(255, (p.friendship ?? 70) + 50);
      this.worldEvents?.onResolved(u.id, u.defId, u.x, u.y, true);
      const joined = this.state.inParty(p.uid);
      if (joined) this.applyParty();
      this.renderer_.vfx.named('capture', u.x, u.y);
      audio.play('victory');
      this.ui.banner(`Đã thu phục ${u.name} (Lv${u.level})!${joined ? ' Gia nhập đội.' : ' Đã gửi vào bộ sưu tập.'}`, '#ffe040');
      this.state.addWorldExp(30);
      this.tweens.add({ targets: fx.ball, alpha: 0, duration: 600, delay: 400, onComplete: () => fx.ball.destroy() });
      this.questEvent({ type: 'capture', target: u.defId });
      this.coopHost?.grant({ pokemon: { species: u.defId, level: u.level, shiny: u.shiny, ball: fx.ballId }, note: 'Bắt Pokémon' });
      this.persist();
    } else {
      this.world.endCapture(u, false);
      this.renderer_.vfx.flash(u.x, u.y, 40, 0xffffff, 200);
      fx.ball.destroy();
      const flee = this.world.rng.chance(fleeChance(u.wild!.temperament, u.hp / u.maxHp));
      if (flee) { u.wild!.mode = 'flee'; u.wild!.t = 5; u.hostile = false; u.wild!.threat = this.world.trainer; }
      this.ui.banner(`${u.name} đã thoát khỏi bóng!${flee ? ' Nó bỏ chạy!' : ''}`, '#ff9080');
      audio.play('hurt');
    }
    this.captureFx = null;
  }

  /** A throw at a weakened legendary resolved. Success: it joins (once — never a duplicate). */
  private finishLegendCapture(success: boolean): void {
    const fx = this.captureFx!;
    const c = this.legendCap!;
    const u = c.unit;
    this.captureFx = null;
    if (success) {
      this.legendCap = null;
      u.boss?.pm.finish();
      this.world.endCapture(u, true);
      delete this.state.adv.bossFights[c.id];
      this.renderer_.vfx.named('capture', u.x, u.y);
      audio.play('victory');
      this.tweens.add({ targets: fx.ball, alpha: 0, duration: 600, delay: 400, onComplete: () => fx.ball.destroy() });
      this.joinLegend(c.id, Math.max(30, c.level - 8), `Đã thu phục ${u.name} bằng ${ITEMS[fx.ballId]?.name ?? fx.ballId}!`, fx.ballId);
      return;
    }
    this.world.endCapture(u, false);
    fx.ball.destroy();
    this.renderer_.vfx.flash(u.x, u.y, 50, 0xffffff, 200);
    audio.play('hurt');
    c.left--;
    if (c.left <= 0) { this.legendFlee('thoát khỏi bóng lần cuối'); return; }
    this.ui.banner(`${u.name} đã thoát khỏi bóng! Còn ${c.left} lượt.`, '#ff9080');
    this.persist();
  }

  private updateCapture(_dt: number): void {
    const fx = this.captureFx;
    if (fx?.phase === 'shaking' && fx.target && !fx.target.alive) { fx.ball.destroy(); this.captureFx = null; }
  }

  // ───────────────────────────── blackout ─────────────────────────────

  private startBlackout(): void {
    this.blackoutT = 1.6;
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.ui.banner('Bạn đã kiệt sức...', '#ff6060');
    if (this.battle) {
      const tr = this.regionDef.trainers.find((t) => t.id === this.battle!.id);
      for (const u of this.battle.units) if (u.alive) this.world.removeEnemy(u);
      this.battle = null;
      if (tr) this.time.delayedCall(1800, () => void this.say(tr.name, tr.lose, undefined, this.portraitOf(tr.id)));
    }
  }

  private finishBlackout(): void {
    if (this.mapKind === 'dungeon') { this.leaveDungeon(false); return; }
    const region = this.regionDef;
    const wp = region.waypoints.find((w) => w.id === this.state.adv.lastWaypoint) ?? region.waypoints[0];
    this.world.respawnTrainer((wp.x + 0.5) * TILE_PX, (wp.y + 1.6) * TILE_PX);
    this.summons?.healRecalled();
    this.world.setCommand('auto');
    this.cameras.main.fadeIn(600);
    this.ui.banner(`Đã hồi phục tại ${wp.name}`, '#80ff90');
    this.persist();
  }

  totals(): { chunks: number; chests: number; waypoints: number } {
    const region = this.regionDef;
    return { chunks: chunkCols(this.map) * chunkRows(this.map), chests: region.chests.length, waypoints: region.waypoints.length };
  }

  exitToMenu(): void {
    this.persist();
    gameModes.toMenu(this);
  }
}
