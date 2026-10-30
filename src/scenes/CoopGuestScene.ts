import Phaser from 'phaser';
import { applyCoopDelta, CoopMirror, coopSession, obstacleSig, type CoopSnapshot, type CoopWire } from '../net/coop';
import { LatencySeries } from '../net/netStats';
import { applyCoopLoot, lootSeen, markLootSeen, type CoopLoot } from '../net/coopRewards';
import { net } from '../net/session';
import type { DuelMon } from '../net/protocol';
import { WorldRenderer, SCALE } from '../render/WorldRenderer';
import { ChunkView, type ChunkRecord } from '../render/ChunkView';
import { addWorldArt } from '../render/tileset';
import { ValleyMap } from '../core/map/valley';
import { regionDef } from '../core/map/regionDefs';
import { DungeonMap } from '../core/map/dungeonMap';
import { dungeonDef } from '../core/map/dungeons';
import { TILE_PX, DUNGEON } from '../core/map/tiles';
import { type AllyCommand, type Unit } from '../core/world';
import { skillFailText } from '../net/skillWire';
import { saveStore } from '../systems/save';
import { gameModes } from '../systems/gameMode';
import { music } from '../systems/music';
import { DPR } from './ui';

/** Guests render the host's world and send controls; their campaign save stays local. */
export class CoopGuestScene extends Phaser.Scene {
  mirror: CoopMirror | null = null;
  snapshot: CoopSnapshot | null = null;
  private renderer_: WorldRenderer | null = null;
  private chunks: ChunkView | null = null;
  map: ValleyMap | DungeonMap | null = null;
  private party: DuelMon[] = [];
  private returnTo: 'adventure' | 'menu' = 'menu';
  private off: (() => void) | null = null;
  private offStatus: (() => void) | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private seq = 0;
  private sent = 0;
  private joined = 0;
  private startedAt = 0;
  /** performance.now() of the last snapshot */
  receivedAt = 0;
  command: AllyCommand = 'auto';
  private target?: number;
  /** why the session ended (shown by the HUD); empty while playing */
  notice = '';
  runHeld = false;
  /** set by the HUD's virtual joystick */
  readonly joystick = { x: 0, y: 0 };
  private scenery: Phaser.GameObjects.GameObject[] = [];
  ended = false;
  private lootLine = '';
  private lootUntil = 0;
  /** the last complete snapshot (deltas apply to it), the obstacle version we hold, and whether we need a keyframe */
  private full: CoopSnapshot | null = null;
  private haveObs = '';
  private needKey = false;
  private trees: Phaser.GameObjects.Image[] = [];
  private treesFor = '';
  /** when each input left (by seq), input → acknowledgement latency, and the gap between snapshots */
  private inputAt = new Map<number, number>();
  readonly inputLag = new LatencySeries(120);
  readonly snapGap = new LatencySeries(120);
  /** how long the host held our last input before the snapshot that acknowledged it (its tick + batching) */
  readonly hostHold = new LatencySeries(120);
  /** own Pokémon the skill bar commands (host unit id), and a short message for the HUD */
  private focusId: number | null = null;
  private hintLine = '';
  private hintUntil = 0;

  constructor() { super('CoopGuest'); }
  init(d: { party: DuelMon[]; returnTo?: 'adventure' | 'menu' }): void {
    this.party = d.party; this.returnTo = d.returnTo ?? 'menu';
    this.mirror = null; this.snapshot = null; this.seq = 0; this.sent = this.joined = this.receivedAt = 0;
    this.command = 'auto'; this.target = undefined; this.ended = false; this.notice = ''; this.runHeld = false; this.scenery = [];
    this.joystick.x = this.joystick.y = 0; this.lootLine = ''; this.lootUntil = 0; this.map = null;
    this.full = null; this.haveObs = ''; this.needKey = false; this.trees = []; this.treesFor = ''; this.inputAt.clear();
    this.focusId = null; this.hintLine = ''; this.hintUntil = 0;
  }
  create(): void {
    coopSession.active = true;
    net.setProfile(saveStore.playerName, saveStore.avatar);
    (window as unknown as { __coopGuest: CoopGuestScene }).__coopGuest = this;
    this.cameras.main.setBackgroundColor(0x1a3a1c).setZoom(DPR);
    this.startedAt = performance.now();
    this.scene.launch('CoopGuestUI', { guest: this });
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    const commands: AllyCommand[] = ['auto', 'attack', 'defend', 'follow', 'hold', 'retreat'];
    ['BACKTICK', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((key, i) => this.input.keyboard!.on('keydown-' + key, () => this.setCommand(commands[i])));
    this.input.keyboard!.on('keydown-ESC', () => this.exit());
    this.input.keyboard!.on('keydown-Q', () => this.manualSkill('best'));
    this.input.keyboard!.on('keydown-T', () => this.cycleFocus());
    this.off = net.on(m => {
      if (m.t === 'coopSnap') this.receive(m.s);
      if (m.t === 'coopLoot') this.receiveLoot(m.reward, m.id);
      if (m.t === 'coopEnd') this.end(m.reason);
      if (m.t === 'skillRes') {
        const u = this.mirror?.world.allies.find((a) => a.id === m.unit);
        const msg = u && skillFailText(m.r, u.name, typeof m.slot === 'number' ? u.skills[m.slot]?.def.name ?? '' : '');
        if (msg) this.hint(msg);
      }
    });
    this.offStatus = net.onStatus(() => { if (!net.connected) this.end('Đã mất kết nối với chủ phòng.'); });
    this.events.once('shutdown', () => {
      this.scene.stop('CoopGuestUI');
      this.off?.(); this.offStatus?.(); this.renderer_?.destroy(); this.chunks?.destroyAll(); this.trees = [];
      this.renderer_ = null; this.chunks = null; this.map = null;
    });
  }
  private receive(wire: CoopWire): void {
    if (this.ended || !wire) return;
    const s = this.complete(wire);
    if (!s || !s.guest?.length) return;
    if (this.snapshot?.epoch === s.epoch && s.n <= this.snapshot.n) return;
    const now = performance.now();
    if (typeof s.ack === 'number') {
      // input → acknowledged snapshot: network both ways + the host's tick (what the player feels)
      const at = this.inputAt.get(s.ack);
      if (at !== undefined) { this.inputLag.add(now - at); for (const k of this.inputAt.keys()) if (k <= s.ack) this.inputAt.delete(k); }
    }
    if (typeof s.hold === 'number') this.hostHold.add(s.hold);
    if (this.receivedAt) this.snapGap.add(now - this.receivedAt);
    const changed = !this.snapshot || this.snapshot.epoch !== s.epoch;
    if (changed) {
      this.renderer_?.destroy(); this.chunks?.destroyAll(); this.scenery.forEach(o => o.destroy()); this.scenery = [];
      this.trees.forEach(o => o.destroy()); this.trees = []; this.treesFor = '';
      this.mirror = new CoopMirror(s.map); this.mirror.apply(s);
      const w = this.mirror.world;
      this.renderer_ = new WorldRenderer(this, w, { banner: () => {}, names: s.map.kind === 'survivor' ? 'notable' : 'all' }, saveStore.data.settings.quality);
      this.map = s.map.kind === 'region' ? new ValleyMap(regionDef(s.map.id)) : s.map.kind === 'dungeon' ? new DungeonMap(dungeonDef(s.map.id)) : null;
      this.chunks = this.map ? new ChunkView(this, this.map, { onLoad: r => this.decorate(r), onUnload: () => {} }) : null;
      const map = this.map;
      // the host's feet-area wall test (AdventureScene terrain.blocksMove), for predicting our own trainer
      const solidPx = (x: number, y: number) => !!map && map.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
      this.mirror.blocked = map ? (x, y) => solidPx(x, y + 6) || solidPx(x - 10, y + 8) || solidPx(x + 10, y + 8) : undefined;
      if (!this.map) {
        this.scenery.push(this.add.tileSprite(0, 0, s.map.width, s.map.height, 'grass').setOrigin(0).setTileScale(2).setDepth(-10));
      }
      this.cameras.main.setBounds(0, 0, s.map.width, s.map.height).startFollow(this.renderer_.trainerSprite(), true, 0.15, 0.15);
    } else this.mirror!.apply(s);
    // survivor trees: drawn once per obstacle version (the list may arrive after the first keyframe)
    if (!this.map && s.obstacles.length && this.treesFor !== (s.obsSig ?? '')) {
      this.trees.forEach(o => o.destroy());
      this.trees = s.obstacles.map(o => this.add.image(o.x, o.y + o.r * 0.4, 'tree').setOrigin(0.5, 0.92).setScale(3 * o.r / 26).setDepth(o.y));
      this.treesFor = s.obsSig ?? '';
    }
    if (this.map instanceof DungeonMap && s.map.doors) {
      const [d, q] = s.map.doors;
      if (this.map.doorOpen('D') !== d || this.map.doorOpen('Q') !== q) {
        this.map.setDoor('D', d); this.map.setDoor('Q', q); this.chunks?.refreshTiles();
      }
    }
    this.snapshot = s; this.receivedAt = performance.now();
    this.renderer_!.handle(s.events);
  }
  /** Keyframe or delta → complete snapshot (null while waiting for a usable keyframe). */
  private complete(w: CoopWire): CoopSnapshot | null {
    if ('d' in w) {
      const s = applyCoopDelta(this.full, w);
      if (!s) { this.needKey = true; return null; }
      this.full = s; return s;
    }
    let s: CoopSnapshot = w;
    if (w.noObs) s = { ...w, obstacles: this.full && this.full.obsSig === w.obsSig ? this.full.obstacles : [] };
    else this.haveObs = obstacleSig(s.obstacles);
    if (w.noObs && !s.obstacles.length) this.haveObs = '';
    this.full = s; this.needKey = false;
    return s;
  }
  /** Host shared a drop: apply it to this player's own save immediately (progress survives a disconnect). */
  private receiveLoot(loot: CoopLoot, id?: string): void {
    if (this.ended) return;
    // a grant re-sent after a relay drop: already in this save → only acknowledge again
    if (id && lootSeen(saveStore.data, id)) { net.send({ t: 'coopLootAck', id }); return; }
    const lines = applyCoopLoot(saveStore.data, loot);
    if (id) { markLootSeen(saveStore.data, id); net.send({ t: 'coopLootAck', id }); }
    if (!lines.length) { if (id) void saveStore.save(); return; }
    void saveStore.save();
    this.lootLine = `🎁 ${loot.note ? loot.note + ': ' : ''}${lines.join(' · ')}`;
    this.lootUntil = this.time.now + 6000;
  }
  private decorate(rec: ChunkRecord): void {
    for (const o of rec.mapObjects) {
      const x = o.x * TILE_PX, y = o.y * TILE_PX;
      // cottages / old trees: the same Adventure Awaits image as the host, else the tile fallback
      const art = (o.kind === 'building' || o.kind === 'tree') ? addWorldArt(this, o) : null;
      if (art) rec.objects.push(art.setDepth(o.kind === 'building' ? y + (o.h ?? 1) * TILE_PX - 4 : y + 22));
      else if (o.kind === 'building' && o.tiles) {
        o.tiles.forEach((row, ry) => row.forEach((t, rx) => rec.objects.push(this.add.image(x + rx * TILE_PX, y + ry * TILE_PX, 'ow_tiles', t).setOrigin(0).setScale(SCALE).setDepth(y + (o.h ?? 1) * TILE_PX - 4))));
      } else if (o.kind === 'tree') rec.objects.push(this.add.image(x, y + 22, 'ow_tiles', o.tile).setOrigin(0.5, 1).setScale(SCALE).setDepth(y + 22));
      else if (o.kind === 'boulder') rec.objects.push(this.add.image(x, y + 6, 'boulder').setScale(SCALE).setDepth(y + 6));
      else if (o.tile != null || o.kind === 'chest') rec.objects.push(this.add.image(x + TILE_PX / 2, y + TILE_PX / 2, 'ow_tiles', o.kind === 'chest' ? DUNGEON.chestClosed : o.tile).setScale(SCALE).setDepth(y + TILE_PX / 2));
    }
  }
  update(_t: number, delta: number): void {
    if (this.ended) return;
    const now = performance.now();
    if (now - this.joined >= 1000) { net.send({ t: 'coopJoin', party: this.party, avatar: saveStore.avatar, obs: this.haveObs, need: this.needKey }); this.joined = now; }
    if (!this.snapshot || !this.mirror) return;
    music.play(this.mirror.world.enemies.some(e => e.kind === 'boss') ? 'boss' : 'battle');
    const k = this.keys;
    if (now - this.sent >= 66) {
      const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      const ix = x || this.joystick.x, iy = y || this.joystick.y, run = k.SHIFT.isDown || this.runHeld;
      net.send({ t: 'coopInput', epoch: this.snapshot.epoch, seq: ++this.seq, x: ix, y: iy, run, command: this.command, target: this.target });
      this.mirror.input(this.seq, ix, iy, run, now);
      this.inputAt.set(this.seq, now);
      if (this.inputAt.size > 120) this.inputAt.delete(this.inputAt.keys().next().value!);
      this.sent = now;
    }
    this.chunks?.update(this.cameras.main.worldView);
    this.mirror.interpolate(delta);
    this.renderer_?.render(delta);
    if (this.target != null && !this.targetUnit()) { this.target = undefined; if (this.command === 'attack') this.command = 'auto'; }
  }
  // ── used by the HUD (CoopGuestUI) ──
  private end(reason: string): void { this.ended = true; this.notice = `${reason}\nNhấn Rời co-op để quay về.`; }
  /** game-side latency for the stats overlay (ms) */
  netStats() { return { inputToAck: this.inputLag.summary(), snapshotGap: this.snapGap.summary(), hostHold: this.hostHold.summary() }; }
  waitedMs(): number { return performance.now() - this.startedAt; }
  lootText(): string { return this.time.now < this.lootUntil ? this.lootLine : ''; }
  hintText(): string { return this.time.now < this.hintUntil ? this.hintLine : ''; }
  private hint(t: string): void { this.hintLine = t; this.hintUntil = this.time.now + 2200; }
  // ── active skills: the host casts them (it runs the world); the bar shows the state it sends back ──
  focusAlly(): Unit | null {
    const field = this.mirror?.world.allies ?? [];
    return field.find((a) => a.id === this.focusId && !a.fainted && a.alive) ?? field.find((a) => !a.fainted && a.alive) ?? null;
  }
  cycleFocus(): void {
    const field = (this.mirror?.world.allies ?? []).filter((a) => !a.fainted && a.alive);
    if (field.length < 2) return;
    const next = field[(field.indexOf(this.focusAlly()!) + 1) % field.length];
    this.focusId = next.id;
    this.hint(`Điều khiển: ${next.name}`);
  }
  manualSkill(slot: number | 'best'): void {
    const u = this.focusAlly();
    if (!u || !this.snapshot || this.ended) return;
    net.send({ t: 'coopSkill', epoch: this.snapshot.epoch, unit: u.id, slot });
  }
  isReserved(u: Unit, slot: number): boolean { return !!(u.reserved & (1 << slot)); }
  toggleReserved(slot: number): void {
    const u = this.focusAlly();
    if (!u || !this.snapshot || slot >= u.skills.length) return;
    const on = !this.isReserved(u, slot);
    u.reserved = on ? u.reserved | (1 << slot) : u.reserved & ~(1 << slot); // the next snapshot confirms it
    net.send({ t: 'coopReserve', epoch: this.snapshot.epoch, unit: u.id, mask: u.reserved });
    this.hint(on ? `Giữ ${u.skills[slot].def.name} cho bạn tự dùng` : `${u.skills[slot].def.name}: trả lại cho AI`);
  }
  setCommand(c: AllyCommand): void { this.command = c; this.target = undefined; }
  toggleRun(): void { this.runHeld = !this.runHeld; }
  targetUnit() { return this.target == null ? undefined : this.mirror?.world.enemies.find(e => e.id === this.target && e.alive); }
  /** Tap / click on an enemy (screen coordinates): the team focuses it. */
  pickTarget(sx: number, sy: number): void {
    const p = this.cameras.main.getWorldPoint(sx, sy);
    const u = this.mirror?.world.enemies.find(e => e.alive && !e.captured && Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 20);
    if (u) { this.command = 'attack'; this.target = u.id; }
  }
  exit(): void {
    coopSession.active = false; net.leave();
    if (this.returnTo === 'adventure') gameModes.start(this, 'adventure');
    else gameModes.toMenu(this);
  }
}
