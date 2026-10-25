import Phaser from 'phaser';
import { coopEventLabel } from '../core/coopEvents';
import { CoopMirror, coopSession, type CoopSnapshot } from '../net/coop';
import { applyCoopLoot, type CoopLoot } from '../net/coopRewards';
import { net } from '../net/session';
import type { DuelMon } from '../net/protocol';
import { WorldRenderer, SCALE } from '../render/WorldRenderer';
import { ChunkView, type ChunkRecord } from '../render/ChunkView';
import { ValleyMap } from '../core/map/valley';
import { regionDef } from '../core/map/regionDefs';
import { DungeonMap } from '../core/map/dungeonMap';
import { dungeonDef } from '../core/map/dungeons';
import { TILE_PX, DUNGEON } from '../core/map/tiles';
import { type AllyCommand } from '../core/world';
import { saveStore } from '../systems/save';
import { gameModes } from '../systems/gameMode';
import { button, text } from './ui';
import { music } from '../systems/music';

/** Guests render the host's world and send controls; their campaign save stays local. */
export class CoopGuestScene extends Phaser.Scene {
  mirror: CoopMirror | null = null;
  snapshot: CoopSnapshot | null = null;
  private renderer_: WorldRenderer | null = null;
  private chunks: ChunkView | null = null;
  private map: ValleyMap | DungeonMap | null = null;
  private party: DuelMon[] = [];
  private returnTo: 'adventure' | 'menu' = 'menu';
  private off: (() => void) | null = null;
  private offStatus: (() => void) | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private seq = 0;
  private sent = 0;
  private joined = 0;
  private received = 0;
  private command: AllyCommand = 'auto';
  private target?: number;
  private hud!: Phaser.GameObjects.Text;
  private scenery: Phaser.GameObjects.GameObject[] = [];
  private ended = false;
  private joy: { id: number; x: number; y: number; dx: number; dy: number } | null = null;
  private lootLine = '';
  private lootUntil = 0;

  constructor() { super('CoopGuest'); }
  init(d: { party: DuelMon[]; returnTo?: 'adventure' | 'menu' }): void {
    this.party = d.party; this.returnTo = d.returnTo ?? 'menu';
    this.mirror = null; this.snapshot = null; this.seq = 0; this.sent = this.joined = this.received = 0;
    this.command = 'auto'; this.target = undefined; this.ended = false; this.joy = null; this.scenery = [];
    this.lootLine = ''; this.lootUntil = 0;
  }
  create(): void {
    coopSession.active = true;
    net.setProfile(saveStore.playerName, saveStore.avatar);
    (window as unknown as { __coopGuest: CoopGuestScene }).__coopGuest = this;
    this.cameras.main.setBackgroundColor(0x1a3a1c);
    this.hud = text(this, 16, 14, 'Đang chờ chủ phòng…', 20, '#ffffff').setScrollFactor(0).setDepth(10000);
    const exit = button(this, this.scale.width - 80, 32, 140, 40, 'Rời co-op', () => this.exit(), 0x6a2f2f).container;
    exit.setScrollFactor(0).setDepth(10001);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    const commands: AllyCommand[] = ['auto', 'attack', 'defend', 'follow', 'hold', 'retreat'];
    ['BACKTICK', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((key, i) => this.input.keyboard!.on('keydown-' + key, () => { this.command = commands[i]; this.target = undefined; }));
    this.input.keyboard!.on('keydown-ESC', () => this.exit());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 80) return;
      if (p.x < this.scale.width / 3) this.joy = { id: p.id, x: p.x, y: p.y, dx: 0, dy: 0 };
      else {
        const u = this.mirror?.world.enemies.find(e => Math.hypot(e.x - p.worldX, e.y - p.worldY) < e.radius + 20);
        if (u) { this.command = 'attack'; this.target = u.id; }
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.joy?.id === p.id) { this.joy.dx = Phaser.Math.Clamp((p.x - this.joy.x) / 55, -1, 1); this.joy.dy = Phaser.Math.Clamp((p.y - this.joy.y) / 55, -1, 1); }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => { if (this.joy?.id === p.id) this.joy = null; });
    this.input.on('gameout', () => { this.joy = null; });
    this.off = net.on(m => {
      if (m.t === 'coopSnap') this.receive(m.s);
      if (m.t === 'coopLoot') this.receiveLoot(m.reward);
      if (m.t === 'coopEnd') { this.ended = true; this.hud.setText(m.reason + '\nNhấn Rời co-op để quay về.'); }
    });
    this.offStatus = net.onStatus(() => { if (!net.connected) { this.ended = true; this.hud.setText('Đã mất kết nối. Nhấn Rời co-op để quay về.'); } });
    this.events.once('shutdown', () => {
      this.off?.(); this.offStatus?.(); this.renderer_?.destroy(); this.chunks?.destroyAll();
      this.renderer_ = null; this.chunks = null; this.map = null;
    });
  }
  private receive(s: CoopSnapshot): void {
    if (this.ended || !s.guest?.length) return;
    if (this.snapshot?.epoch === s.epoch && s.n <= this.snapshot.n) return;
    const changed = !this.snapshot || this.snapshot.epoch !== s.epoch;
    if (changed) {
      this.renderer_?.destroy(); this.chunks?.destroyAll(); this.scenery.forEach(o => o.destroy()); this.scenery = [];
      this.mirror = new CoopMirror(s.map); this.mirror.apply(s);
      const w = this.mirror.world;
      this.renderer_ = new WorldRenderer(this, w, { banner: () => {} }, saveStore.data.settings.quality);
      this.map = s.map.kind === 'region' ? new ValleyMap(regionDef(s.map.id)) : s.map.kind === 'dungeon' ? new DungeonMap(dungeonDef(s.map.id)) : null;
      this.chunks = this.map ? new ChunkView(this, this.map, { onLoad: r => this.decorate(r), onUnload: () => {} }) : null;
      if (!this.map) {
        this.scenery.push(this.add.tileSprite(0, 0, s.map.width, s.map.height, 'grass').setOrigin(0).setTileScale(2).setDepth(-10));
        for (const o of s.obstacles) this.scenery.push(this.add.image(o.x, o.y + o.r * 0.4, 'tree').setOrigin(0.5, 0.92).setScale(3 * o.r / 26).setDepth(o.y));
      }
      this.cameras.main.setBounds(0, 0, s.map.width, s.map.height).startFollow(this.renderer_.trainerSprite(), true, 0.15, 0.15);
    } else this.mirror!.apply(s);
    if (this.map instanceof DungeonMap && s.map.doors) {
      const [d, q] = s.map.doors;
      if (this.map.doorOpen('D') !== d || this.map.doorOpen('Q') !== q) {
        this.map.setDoor('D', d); this.map.setDoor('Q', q); this.chunks?.refreshTiles();
      }
    }
    this.snapshot = s; this.received = performance.now();
    this.renderer_!.handle(s.events);
  }
  /** Host shared a drop: apply it to this player's own save immediately (progress survives a disconnect). */
  private receiveLoot(loot: CoopLoot): void {
    if (this.ended) return;
    const lines = applyCoopLoot(saveStore.data, loot);
    if (!lines.length) return;
    void saveStore.save();
    this.lootLine = `🎁 ${loot.note ? loot.note + ': ' : ''}${lines.join(' · ')}`;
    this.lootUntil = this.time.now + 6000;
  }
  private decorate(rec: ChunkRecord): void {
    for (const o of rec.mapObjects) {
      const x = o.x * TILE_PX, y = o.y * TILE_PX;
      if (o.kind === 'building' && o.tiles) {
        o.tiles.forEach((row, ry) => row.forEach((t, rx) => rec.objects.push(this.add.image(x + rx * TILE_PX, y + ry * TILE_PX, 'ow_tiles', t).setOrigin(0).setScale(SCALE).setDepth(y + (o.h ?? 1) * TILE_PX - 4))));
      } else if (o.kind === 'tree') rec.objects.push(this.add.image(x, y + 22, 'ow_tiles', o.tile).setOrigin(0.5, 1).setScale(SCALE).setDepth(y + 22));
      else if (o.kind === 'boulder') rec.objects.push(this.add.image(x, y + 6, 'boulder').setScale(SCALE).setDepth(y + 6));
      else if (o.tile != null || o.kind === 'chest') rec.objects.push(this.add.image(x + TILE_PX / 2, y + TILE_PX / 2, 'ow_tiles', o.kind === 'chest' ? DUNGEON.chestClosed : o.tile).setScale(SCALE).setDepth(y + TILE_PX / 2));
    }
  }
  update(_t: number, delta: number): void {
    if (this.ended) return;
    const now = performance.now();
    if (now - this.joined >= 1000) { net.send({ t: 'coopJoin', party: this.party, avatar: saveStore.avatar }); this.joined = now; }
    if (!this.snapshot || !this.mirror) {
      if (this.time.now > 15000) this.hud.setText('Chưa nhận được trận co-op. Kiểm tra chủ phòng đã chọn co-op.\nNhấn Rời co-op để quay về.');
      return;
    }
    music.play(this.mirror.world.enemies.some(e => e.kind === 'boss') ? 'boss' : 'battle');
    const k = this.keys;
    if (now - this.sent >= 66) {
      const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      net.send({ t: 'coopInput', epoch: this.snapshot.epoch, seq: ++this.seq, x: x || this.joy?.dx || 0, y: y || this.joy?.dy || 0, run: k.SHIFT.isDown, command: this.command, target: this.target });
      this.sent = now;
    }
    this.chunks?.update(this.cameras.main.worldView);
    this.mirror.interpolate(delta);
    this.renderer_?.render(delta);
    const w = this.mirror.world, s = this.snapshot;
    const status = now - this.received > 3000 ? 'Đang chờ chủ phòng / chuyển bản đồ…' : s.paused || s.state === 'levelup' ? 'Chủ phòng đang tạm dừng / chọn nâng cấp' : w.trainer.hp <= 0 ? 'Đã gục — đồng đội đứng gần 3 giây để cứu' : `${Math.ceil(w.trainer.hp)}/${w.trainer.maxHp} HP · Lv${w.level} · ${w.kills} hạ gục`;
    const loot = `\n${coopEventLabel(s.challenge)}` + (this.time.now < this.lootUntil ? `\n${this.lootLine}` : '');
    this.hud.setText(`CO-OP · ${net.peerName} · ${net.rtt} ms\n${status}\nWASD / kéo bên trái: di chuyển · Chạm quái: tấn công\nNhiệm vụ thuộc chủ phòng · chiến lợi phẩm và xu được chia cho bạn${loot}`);
  }
  exit(): void {
    coopSession.active = false; net.leave();
    if (this.returnTo === 'adventure') gameModes.start(this, 'adventure');
    else gameModes.toMenu(this);
  }
}
