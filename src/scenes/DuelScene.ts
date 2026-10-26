import Phaser from 'phaser';
import arenaJson from '../data/world/pvp-arena.json';
import { ValleyMap, RegionDef } from '../core/map/valley';
import { TILE_PX, T } from '../core/map/tiles';
import { ChunkView, ChunkRecord } from '../render/ChunkView';
import { SCALE, WorldRenderer } from '../render/WorldRenderer';
import { ActiveSkillResult, AllyCommand, Side, STEP, Unit, World, WorldEvent } from '../core/world';
import { buildDuel, DuelMirror, packSnapshot, RULESETS, shareableEvents } from '../net/duel';
import type { DuelAction, DuelInput, NetMsg } from '../net/protocol';
import { DuelStart, net } from '../net/session';
import { remoteSlot, skillFailText } from '../net/skillWire';
import { music } from '../systems/music';
import { audio } from '../systems/audio';
import { saveStore } from '../systems/save';
import { recordDuel } from '../systems/saveSchema';
import { gameModes } from '../systems/gameMode';
import { ITEM_DEFS } from '../core/evolution';
import { DPR, uiScale } from './ui';

// Real-time duel between two players. The host (or the practice mode) runs the World; the guest draws a
// DuelMirror of the host's snapshots and sends its inputs. The HUD lives in DuelUI.

export type DuelRole = 'host' | 'guest' | 'practice';
export interface DuelSceneData {
  role: DuelRole;
  start: DuelStart;
  /** where to go afterwards: the lobby room, or back into the shared open world */
  returnTo: 'lobby' | 'adventure';
}

const SNAP_EVERY = 3; // steps → 20 snapshots / s
const INPUT_EVERY = 66; // ms → 15 inputs / s

export class DuelScene extends Phaser.Scene {
  role: DuelRole = 'practice';
  start!: DuelStart;
  returnTo: 'lobby' | 'adventure' = 'lobby';
  world!: World;
  mirror: DuelMirror | null = null;
  renderer_!: WorldRenderer;
  private chunks!: ChunkView;
  private map!: ValleyMap;
  private acc = 0;
  private snapN = 0;
  private evBuf: WorldEvent[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastInput = '';
  private lastInputAt = 0;
  private inputSeq = 0;
  /** host: units by id (the guest's orders name host ids) */
  private byId = new Map<number, Unit>();
  private off: (() => void) | null = null;
  private offStatus: (() => void) | null = null;
  /** practice opponent's next decision */
  private aiT = 1;
  ended: { result: 'win' | 'loss' | 'draw'; note: string } | null = null;
  /** touch joystick (DuelUI) */
  joystick = { x: 0, y: 0 };
  /** seconds since the duel started (countdown before the first step) */
  countdown = 3;

  constructor() {
    super('Duel');
  }

  init(d: DuelSceneData): void {
    this.role = d.role;
    this.start = d.start;
    this.returnTo = d.returnTo;
    this.acc = 0; this.snapN = 0; this.evBuf = []; this.lastInput = ''; this.inputSeq = 0; this.aiT = 1;
    this.ended = null; this.mirror = null; this.byId.clear(); this.countdown = 3; this.focusId = null; this.joystick = { x: 0, y: 0 };
  }

  create(): void {
    const st = this.start;
    if (this.role === 'guest') {
      this.mirror = new DuelMirror(st.seed, st.rules, st.host, st.guest, st.roster);
      this.world = this.mirror.world;
    } else {
      const b = buildDuel(st.seed, st.rules, st.host, st.guest);
      this.world = b.world;
      for (const list of b.order) for (const u of list) this.byId.set(u.id, u);
    }
    (window as unknown as { __duel: DuelScene }).__duel = this;
    // Keep the profile current and wear it in the arena; the opponent's trainer uses the avatar they announced.
    net.setProfile(saveStore.playerName, saveStore.avatar);
    this.world.trainer.avatar = saveStore.avatar;
    if (this.role !== 'practice' && this.world.rival) this.world.rival.trainer.avatar = net.peerAvatar;

    // arena map: paved ground + stone pillars (obstacles for both the host simulation and the drawing)
    this.map = new ValleyMap(arenaJson as unknown as RegionDef);
    const map = this.map;
    if (this.role !== 'guest') {
      const solidPx = (x: number, y: number) => map.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
      this.world.terrain = {
        blocksMove: (x, y) => solidPx(x, y + 6),
        blocksShot: (x, y) => map.shotSolidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
        isWater: (x, y) => map.terrainAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)) === T.Water,
      };
    }
    this.renderer_ = new WorldRenderer(this, this.world, {
      banner: (t, c) => this.ui()?.banner(t, c),
      decorate: (u, v) => {
        // Red shadow marks the opponent so both players read the arena the same way without recolouring the avatar.
        if (u.kind === 'trainer') {
          if (u === this.world.trainer) v.shadow.clearTint();
          else v.shadow.setTint(0xff9090);
        }
      },
    }, saveStore.data.settings.quality);
    this.chunks = new ChunkView(this, map, { onLoad: (r) => this.onChunkLoad(r), onUnload: () => {} });
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x1f4a24);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    cam.fadeIn(300);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    const kb = this.input.keyboard!;
    const CMD: Record<string, AllyCommand> = { BACKTICK: 'auto', ONE: 'attack', TWO: 'defend', THREE: 'follow', FOUR: 'hold', FIVE: 'retreat' };
    for (const [k, c] of Object.entries(CMD)) kb.on('keydown-' + k, () => this.order(c));
    kb.on('keydown-G', () => this.megaAny());
    kb.on('keydown-Z', () => this.switchIn(0));
    kb.on('keydown-X', () => this.switchIn(1));
    kb.on('keydown-C', () => this.switchIn(2));
    kb.on('keydown-Q', () => this.manualSkill('best'));
    kb.on('keydown-T', () => this.cycleFocus());
    // click / tap an opposing Pokémon: everyone attacks it
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.ended) return;
      const wx = p.worldX, wy = p.worldY;
      const foe = this.world.rival!.allies.find((u) => !u.fainted && Math.hypot(u.x - wx, u.y - wy) < u.radius + 18);
      if (foe) this.order('attack', foe);
    });

    if (this.role !== 'practice') {
      this.off = net.on((m) => this.receive(m));
      this.offStatus = net.onStatus(() => {
        if (net.status === 'closed' && !this.ended) this.finish('win', 'Đối thủ đã mất kết nối / rời trận');
      });
    }
    this.events.once('shutdown', () => this.cleanup());
    this.scene.launch('DuelUI', { duel: this });
    audio.play('levelup');
  }

  private cleanup(): void {
    this.off?.(); this.offStatus?.();
    this.off = this.offStatus = null;
    this.scale.off('resize', this.applyZoom, this);
    this.chunks.destroyAll();
    this.renderer_.destroy();
    this.scene.stop('DuelUI');
  }

  ui(): (Phaser.Scene & { banner(t: string, c: string): void }) | null {
    return this.scene.get('DuelUI') as never;
  }

  /** The whole arena in view when it fits reasonably; on small screens follow the trainer. */
  private applyZoom(): void {
    const cam = this.cameras.main, { width: W, height: H } = this.scale;
    const aw = this.map.widthTiles * TILE_PX, ah = this.map.heightTiles * TILE_PX;
    // leave room for the party columns (DuelUI) on both sides and the order bar at the bottom
    const ui = uiScale(W, H, (w, h) => Math.max(0.6, Math.min(w / 1280, h / 720, 1.4)));
    const fit = Math.min((W - 2 * 236 * ui) / aw, (H - 130 * ui) / ah);
    if (fit >= 0.45 * DPR) {
      cam.removeBounds();
      cam.setZoom(fit); cam.stopFollow();
      cam.centerOn(aw / 2, ah / 2 + (10 * ui) / fit);
    } else {
      // narrow screens (phones): follow the trainer, the columns overlap the field edges
      cam.setBounds(0, 0, aw, ah);
      cam.setZoom(DPR * Math.max(0.5, Math.min(0.8, W / DPR / 900)));
      cam.startFollow(this.renderer_.trainerSprite(), true, 0.12, 0.12);
    }
  }

  private onChunkLoad(rec: ChunkRecord): void {
    for (const o of rec.mapObjects) {
      if (o.kind !== 'pillar') continue;
      const cx = o.x * TILE_PX + TILE_PX / 2, cy = o.y * TILE_PX + TILE_PX / 2;
      rec.objects.push(this.add.image(cx, cy, 'ow_tiles', o.tile).setScale(SCALE).setDepth(cy));
      if (this.role !== 'guest') this.world.addObstacle({ x: cx, y: cy, r: o.collideR ?? 16, kind: 'rock', tag: 'arena' });
    }
  }

  // ───────────────────────────── loop ─────────────────────────────

  update(_t: number, delta: number): void {
    music.play(this.ended ? 'menu' : 'boss');
    const dt = Math.min(delta, 100) / 1000;
    this.chunks.update(this.cameras.main.worldView);
    if (this.countdown > 0) { this.countdown -= dt; this.renderer_.render(delta); return; }
    const inp = this.readInput();
    if (this.role === 'guest') {
      this.sendInput({ ...inp, x: -inp.x }); // the guest's picture is mirrored left ↔ right
      this.mirror!.interpolate(performance.now());
      if (!this.ended && this.world.duel?.winner) this.finishFromWinner();
    } else if (!this.ended) {
      const w = this.world;
      w.home.input = { x: inp.x, y: inp.y }; w.home.run = inp.run;
      if (this.role === 'practice') this.practiceAI(dt);
      this.acc += dt;
      while (this.acc >= STEP && w.state === 'playing') {
        w.step(STEP);
        this.acc -= STEP;
        const ev = w.drainEvents();
        this.renderer_.handle(ev);
        if (this.role === 'host') {
          this.evBuf.push(...shareableEvents(ev));
          if (w.steps % SNAP_EVERY === 0) this.sendSnapshot();
        }
      }
      if (w.state === 'duelOver') {
        if (this.role === 'host') this.sendSnapshot();
        this.finishFromWinner();
      }
    }
    this.renderer_.render(delta);
  }

  private readInput(): DuelInput {
    const k = this.keys;
    let x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (!x && !y) { x = this.joystick.x; y = this.joystick.y; }
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, run: k.SHIFT.isDown };
  }

  private sendInput(inp: DuelInput): void {
    const key = `${inp.x},${inp.y},${inp.run}`, now = performance.now();
    if (key === this.lastInput && now - this.lastInputAt < 500) return;
    if (now - this.lastInputAt < INPUT_EVERY && key !== this.lastInput && this.lastInput !== '') return;
    this.lastInput = key; this.lastInputAt = now;
    net.send({ t: 'input', seq: ++this.inputSeq, input: inp });
  }

  private sendSnapshot(): void {
    net.send({ t: 'snap', s: packSnapshot(this.world, ++this.snapN), ev: this.evBuf });
    this.evBuf = [];
  }

  private receive(m: NetMsg): void {
    if (this.role === 'host') {
      const r = this.world.rival!;
      if (m.t === 'input' && m.input) {
        const clamp = (v: number) => Math.max(-1, Math.min(1, Number(v) || 0));
        r.input = { x: clamp(m.input.x), y: clamp(m.input.y) };
        r.run = !!m.input.run;
      } else if (m.t === 'act') this.apply(r, m.act, (id) => this.byId.get(id));
    } else if (this.role === 'guest' && m.t === 'skillRes') {
      const u = this.mirror!.unit(m.unit);
      const msg = u && skillFailText(m.r, u.name, typeof m.slot === 'number' ? u.skills[m.slot]?.def.name ?? '' : '');
      if (msg) { this.ui()?.banner(msg, '#ffb0a0'); audio.play('click'); }
    } else if (this.role === 'guest' && m.t === 'snap') {
      this.mirror!.push(m.s, performance.now());
      this.renderer_.handle(this.mirror!.flipEvents((m.ev ?? []) as WorldEvent[]));
    }
  }

  // ───────────────────────────── orders ─────────────────────────────

  /** My side as drawn (host / practice: home; guest: home of the mirror). */
  get mine(): Side {
    return this.world.home;
  }

  order(cmd: AllyCommand, target: Unit | null = null): void {
    if (this.ended) return;
    if (cmd === 'attack' && !target) {
      // no explicit target: the nearest standing opponent of my trainer
      const t = this.world.trainer;
      target = this.world.rival!.allies.filter((u) => !u.fainted).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0] ?? null;
      if (!target) return;
    }
    this.act({ a: 'cmd', cmd, target: target ? this.netId(target) : undefined });
    this.ui()?.banner(`Lệnh: ${CMD_LABEL[cmd]}${target ? ' → ' + target.name : ''}`, '#a0d8ff');
  }

  /** Bench member `i` comes in for my selected (or weakest) Pokémon on the field. */
  switchIn(i: number, out: Unit | null = null): void {
    const side = this.mine, inc = side.bench.filter((b) => !b.fainted)[i];
    if (!inc) return;
    const standing = side.allies.filter((a) => !a.fainted);
    const leaving = out ?? (standing.length >= this.start.rules.fieldMax ? standing.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] : null);
    if (side.switchCd > 0) { this.ui()?.banner(`Chờ ${Math.ceil(side.switchCd)} s để đổi tiếp`, '#ffb080'); return; }
    this.act({ a: 'switch', out: leaving ? this.netId(leaving) : null, inc: this.netId(inc) });
  }

  megaAny(): void {
    const u = this.mine.allies.find((a) => !a.fainted && this.canMega(a));
    if (u) this.act({ a: 'mega', unit: this.netId(u) });
    else this.ui()?.banner('Không có Pokémon nào Mega Tiến Hóa được (cần Mega Stone đúng loài, 1 lần mỗi trận)', '#ffb080');
  }

  canMega(u: Unit): boolean {
    if (this.mine.megaUsed || u.megaFrom) return false;
    return !!u.heldId && ITEM_MEGA[u.heldId] === u.defId;
  }

  forfeit(): void {
    if (this.ended) return;
    if (this.role === 'guest') net.send({ t: 'act', act: { a: 'forfeit' } });
    else if (this.role === 'host') { this.world.duel!.winner = 'rival'; this.world.state = 'duelOver'; this.sendSnapshot(); }
    this.finish('loss', 'Bạn đã đầu hàng');
  }

  // ───────────────────────────── active skills ─────────────────────────────

  /** my Pokémon the skill bar commands (local unit id) */
  private focusId: number | null = null;

  focusAlly(): Unit | null {
    const field = this.mine.allies;
    return field.find((a) => a.id === this.focusId && !a.fainted) ?? field.find((a) => !a.fainted) ?? null;
  }

  cycleFocus(): void {
    const field = this.mine.allies.filter((a) => !a.fainted);
    if (field.length < 2) return;
    const next = field[(field.indexOf(this.focusAlly()!) + 1) % field.length];
    this.focusId = next.id;
    this.ui()?.banner(`Điều khiển: ${next.name}`, '#a0d8ff');
  }

  /** Cast now (host / practice) or ask the host (guest: it answers only when the skill does not go off). */
  manualSkill(slot: number | 'best'): void {
    const u = this.focusAlly();
    if (!u || this.ended || this.countdown > 0) return;
    this.act({ a: 'skill', unit: this.netId(u), slot });
  }

  private skillFeedback(u: Unit, slot: number | 'best', r: ActiveSkillResult): void {
    const msg = skillFailText(r, u.name, typeof slot === 'number' ? u.skills[slot]?.def.name ?? '' : '');
    if (msg) { this.ui()?.banner(msg, '#ffb0a0'); audio.play('click'); }
  }

  isReserved(u: Unit, slot: number): boolean {
    return !!(u.reserved & (1 << slot));
  }

  /** Keeps a skill for the player for the rest of the duel (the AI stops using it), or hands it back. */
  toggleReserved(slot: number): void {
    const u = this.focusAlly();
    if (!u || slot >= u.skills.length || this.ended) return;
    const on = !this.isReserved(u, slot);
    const mask = on ? u.reserved | (1 << slot) : u.reserved & ~(1 << slot);
    u.reserved = mask; // shown at once; on a guest the next snapshot confirms it
    this.act({ a: 'reserve', unit: this.netId(u), mask });
    this.ui()?.banner(on ? `Giữ ${u.skills[slot].def.name} cho bạn tự dùng` : `${u.skills[slot].def.name}: trả lại cho AI`, '#a0d8ff');
  }

  private netId(u: Unit): number {
    return this.role === 'guest' ? this.mirror!.hostId(u) ?? -1 : u.id;
  }

  private act(a: DuelAction): void {
    if (this.role === 'guest') net.send({ t: 'act', act: a });
    else this.apply(this.world.home, a, (id) => this.byId.get(id));
  }

  /** Host / practice: an order of one side, units named by id. Anything inconsistent is ignored. */
  private apply(side: Side, a: DuelAction, unit: (id: number) => Unit | undefined): void {
    const w = this.world;
    if (!a || typeof a !== 'object') return;
    switch (a.a) {
      case 'cmd': {
        if (!CMD_LABEL[a.cmd]) return;
        const tgt = a.target != null ? unit(a.target) : undefined;
        const enemySide = side === w.home ? w.rival! : w.home;
        w.setCommand(a.cmd, tgt && enemySide.allies.includes(tgt) ? tgt : null, side);
        break;
      }
      case 'switch': {
        const out = a.out != null ? unit(a.out) ?? null : null, inc = a.inc != null ? unit(a.inc) ?? null : null;
        w.duelSwitch(side, out, inc);
        break;
      }
      case 'mega': { const u = unit(a.unit); if (u) w.duelMega(side, u); break; }
      case 'skill': {
        const u = unit(a.unit);
        const slot = u && side.allies.includes(u) ? remoteSlot(u, a.slot) : null;
        if (!u || slot == null) return;
        const r = w.requestSkill(u, slot, side);
        if (side === w.home) this.skillFeedback(u, slot, r);
        else if (r !== 'cast' && r !== 'queued') net.send({ t: 'skillRes', r, unit: u.id, slot });
        break;
      }
      case 'reserve': {
        const u = unit(a.unit);
        if (!u || !side.allies.includes(u) || !Number.isInteger(a.mask)) return;
        for (let i = 0; i < u.skills.length; i++) w.setReserved(u, i, !!(a.mask & (1 << i)));
        break;
      }
      case 'forfeit':
        if (side === w.rival && !this.ended) { w.duel!.winner = 'home'; w.state = 'duelOver'; this.sendSnapshot(); this.finish('win', 'Đối thủ đã đầu hàng'); }
        break;
    }
  }

  /** Practice opponent: switches out a badly hurt Pokémon, Mega Evolves when it can, otherwise free fight. */
  private practiceAI(dt: number): void {
    if ((this.aiT -= dt) > 0) return;
    this.aiT = 1.2;
    const w = this.world, r = w.rival!;
    const mega = r.allies.find((u) => !u.fainted && !r.megaUsed && u.heldId && ITEM_MEGA[u.heldId] === u.defId);
    if (mega) w.duelMega(r, mega);
    const hurt = r.allies.find((u) => !u.fainted && u.hp / u.maxHp < 0.25);
    const fresh = r.bench.find((b) => !b.fainted && b.hp / b.maxHp > 0.6);
    if (hurt && fresh && w.rng.chance(0.5)) w.duelSwitch(r, hurt, fresh);
  }

  // ───────────────────────────── end ─────────────────────────────

  private finishFromWinner(): void {
    const win = this.world.duel?.winner;
    if (!win || this.ended) return;
    this.finish(win === 'home' ? 'win' : win === 'rival' ? 'loss' : 'draw', this.world.time >= this.start.rules.timeLimit ? 'Hết giờ — so lượng HP còn lại' : '');
  }

  finish(result: 'win' | 'loss' | 'draw', note: string): void {
    if (this.ended) return;
    this.ended = { result, note };
    const opp = this.role === 'guest' ? this.start.hostName : this.role === 'host' ? this.start.guestName : 'Máy (luyện tập)';
    recordDuel(saveStore.data, { opp, result, rules: this.start.rules.id, at: Date.now(), online: this.role !== 'practice', note: note || undefined });
    void saveStore.save();
    audio.play(result === 'win' ? 'victory' : 'gameover');
    (this.scene.get('DuelUI') as unknown as { showResult?: () => void })?.showResult?.();
  }

  /** Leave the duel screen (lobby keeps the connection; the open world re-enters the player's map). */
  exit(): void {
    if (this.returnTo === 'adventure') gameModes.start(this, 'adventure', { map: 'valley' });
    else { this.scene.stop('DuelUI'); this.scene.start('Lobby', { resume: true }); }
  }
}

export const CMD_LABEL: Record<AllyCommand, string> = { auto: 'Tự do', attack: 'Tấn công', defend: 'Bảo vệ HLV', follow: 'Đi theo', hold: 'Giữ vị trí', retreat: 'Rút lui' };

/** Mega Stone → the species that can hold it (from items.json `megaFor`). */
const ITEM_MEGA: Record<string, string> = Object.fromEntries([...ITEM_DEFS.values()].filter((i) => i.kind === 'megaStone' && i.megaFor).map((i) => [i.id, i.megaFor!]));

/** Rules of the default practice duel. */
export const PRACTICE_RULES = RULESETS.standard;
