import Phaser from 'phaser';
import { coopEventLabel } from '../core/coopEvents';
import { TILE_PX } from '../core/map/tiles';
import type { Unit, AllyCommand } from '../core/world';
import { net } from '../net/session';
import { bar, hpColor } from '../render/WorldRenderer';
import { audio } from '../systems/audio';
import type { CoopGuestScene } from './CoopGuestScene';
import { button, COLORS, panel, text, DPR, uiScale } from './ui';
import { SkillBar } from '../ui/SkillBar';

/** Short labels so six (seven on touch) buttons fit a 390 px wide phone. */
const COMMAND_BUTTONS: { id: AllyCommand; label: string }[] = [
  { id: 'auto', label: 'Tự do' }, { id: 'attack', label: 'Tấn công' }, { id: 'defend', label: 'Bảo vệ' },
  { id: 'follow', label: 'Ngừng' }, { id: 'hold', label: 'Giữ' }, { id: 'retreat', label: 'Về' },
];

interface Box { x: number; y: number; w: number; h: number }

/** HUD overlay of the co-op guest: same look as the host's Adventure HUD, laid out for desktop and phones (both orientations). */
export class CoopGuestUI extends Phaser.Scene {
  private guest!: CoopGuestScene;
  private s = 1;
  private g!: Phaser.GameObjects.Graphics;
  private joyG!: Phaser.GameObjects.Graphics;
  private t: Record<string, Phaser.GameObjects.Text> = {};
  private icons: Phaser.GameObjects.Image[] = [];
  private cmdBoxes: { id: AllyCommand | 'run'; box: Box; view: Phaser.GameObjects.Container }[] = [];
  private left!: Box;
  private right!: Box;
  private mini: Box | null = null;
  private miniKey = '';
  private miniImg?: Phaser.GameObjects.Image;
  private miniFrame?: Phaser.GameObjects.Graphics;
  private touch = false;
  private joy: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  private skillBar!: SkillBar;
  private benchZones: Phaser.GameObjects.Zone[] = [];
  /** top edge of the skill bar (toasts on phones sit above it) */
  private skillTop = 0;

  constructor() { super('CoopGuestUI'); }
  init(d: { guest: CoopGuestScene }): void { this.guest = d.guest; this.joy = null; this.miniKey = ''; }

  create(): void {
    this.touch = this.sys.game.device.input.touch;
    this.build();
    this.scale.on('resize', this.rebuild, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.rebuild, this));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      audio.unlock();
      if (over.length || this.joy) return;
      // left side: virtual joystick; elsewhere: tap an enemy to focus it
      if (p.x < this.scale.width * (this.touch ? 0.5 : 0.34)) this.joy = { id: p.id, bx: p.x, by: p.y, x: p.x, y: p.y };
      else this.guest.pickTarget(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (this.joy && p.id === this.joy.id) { this.joy.x = p.x; this.joy.y = p.y; } });
    const release = (p: Phaser.Input.Pointer) => { if (this.joy && p.id === this.joy.id) this.joy = null; };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.input.on('gameout', () => { this.joy = null; });
  }

  private rebuild(): void {
    this.children.removeAll(true);
    this.t = {}; this.icons = []; this.cmdBoxes = []; this.miniImg = undefined; this.miniFrame = undefined; this.miniKey = '';
    this.build();
  }

  private build(): void {
    const { width: W, height: H } = this.scale;
    // the long edge and the short edge both count, so a 390×844 phone gets the same scale upright or sideways
    const s = (this.s = uiScale(W, H, (w, h) => Phaser.Math.Clamp(Math.min(Math.max(w, h) / 1100, Math.min(w, h) / 520), 0.6, 1.4)));
    const narrow = W / DPR < 700;
    const gap = 12 * s;
    // left column: own HP + party; right column: leave, minimap, teammate, challenge
    const lw = Math.min(250 * s, (W - 3 * gap) * (narrow ? 0.52 : 0.4));
    const rw = Math.min(260 * s, W - lw - 3 * gap);
    this.left = { x: gap, y: 10 * s, w: lw, h: 0 };
    this.right = { x: W - gap - rw, y: 10 * s, w: rw, h: 0 };
    this.g = this.add.graphics();
    // never below 13 px: VT323 is unreadable smaller than that on a phone
    const T = (k: string, size: number, color: string = COLORS.text) => (this.t[k] = text(this, 0, 0, '', Math.max(13, size * s), color));
    T('hp', 16); T('room', 15, COLORS.dim); T('mate', 15); T('challenge', 14, '#ffe680'); T('state', 22, '#ffffff');
    T('loot', 17, '#ffe066'); T('boss', 18, '#ffb0a0'); T('help', 14, COLORS.dim); T('swcd', 13, '#ffd080'); T('wait', 22); T('hint', 16, '#ffd0c0');
    this.t.hint.setOrigin(0.5, 1).setStroke('#000', 4);
    for (let i = 0; i < 3; i++) T('p' + i, 14);
    // Adventure co-op: the Pokémon waiting in their balls — tap a row to send it out
    this.benchZones = [];
    for (let i = 0; i < 5; i++) {
      T('b' + i, 13, COLORS.dim);
      const z = this.add.zone(0, 0, 10, 10).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(21);
      z.on('pointerdown', () => this.guest.switchTo(i));
      this.benchZones.push(z);
    }
    this.t.state.setOrigin(0.5).setAlign('center');
    this.t.loot.setOrigin(0.5, 1).setAlign('center');
    this.t.boss.setOrigin(0.5, 1);
    this.t.wait.setOrigin(0.5).setAlign('center');
    this.t.challenge.setWordWrapWidth(rw - 16 * s, true);
    this.t.state.setWordWrapWidth(W - 40 * s, true);
    this.t.loot.setWordWrapWidth(Math.min(W - 40 * s, 640 * s), true);
    this.t.wait.setWordWrapWidth(Math.min(W - 60 * s, 520 * s), true);
    this.t.help.setWordWrapWidth(W - 2 * gap, true);

    const lh = Math.max(34, 40 * s);
    button(this, this.right.x + rw - 70 * s, this.right.y + lh / 2, 140 * s, lh, 'Rời co-op', () => this.guest.exit(), 0x6a2f2f).container.setDepth(20);
    // command bar along the bottom edge (+ run toggle on touch screens)
    const items: { id: AllyCommand | 'run'; label: string }[] = [...COMMAND_BUTTONS, ...(this.touch ? [{ id: 'run' as const, label: 'Chạy' }] : [])];
    const bh = Math.max(36, 44 * s);
    const bw = Math.min(120 * s, (W - 2 * gap - (items.length - 1) * 6) / items.length);
    const total = items.length * bw + (items.length - 1) * 6;
    // one font size for the whole bar, picked so the longest label fits its button
    const longest = Math.max(...items.map((it) => it.label.length));
    const size = Math.round(Math.max(12, Math.min(bh * 0.5, (bw - 8) / longest * 1.9)));
    items.forEach((it, i) => {
      const box = { x: (W - total) / 2 + i * (bw + 6), y: H - bh - 10 * s, w: bw, h: bh };
      const b = button(this, box.x + bw / 2, box.y + bh / 2, bw, bh, '', () => it.id === 'run' ? this.guest.toggleRun() : this.guest.setCommand(it.id), it.id === 'run' ? 0x2f4a6a : 0x2c3654);
      b.container.list.forEach((o) => { if (o instanceof Phaser.GameObjects.Text) o.setFontSize(size).setText(it.label); });
      b.container.setDepth(20);
      this.cmdBoxes.push({ id: it.id, box, view: b.container });
    });
    // active skills (the host casts them): tap = use now · right-click / long-press = keep it for yourself
    const gs = this.guest;
    this.skillBar = new SkillBar(this, {
      focusAlly: () => gs.focusAlly(),
      manualSkill: (j) => gs.manualSkill(j),
      cycleFocus: () => gs.cycleFocus(),
      globalCd: () => gs.mirror?.world.home.manualCd ?? 0,
      toggleReserved: (j) => gs.toggleReserved(j),
      isReserved: (u, j) => gs.isReserved(u, j),
    }, this.touch);
    const barW = 4 * Math.round(46 * s) + 3 * Math.round(6 * s);
    this.skillTop = H - bh - 10 * s - 120 * s;
    // phones: right edge (the left half is the joystick); wide screens: centred above the command bar
    this.skillBar.build(s, narrow ? { x: W - gap - barW, y: this.skillTop } : { centerX: W / 2, y: this.skillTop });
    this.joyG = this.add.graphics().setDepth(50);
  }

  /** The region / dungeon thumbnail, made once per map from the same tile colours as the host's minimap. */
  private ensureMinimap(top: number): number {
    const map = this.guest.map;
    const key = map ? `coop_map_${map.kind}_${map.id}` : '';
    if (!map) { this.miniImg?.setVisible(false); this.miniFrame?.setVisible(false); this.mini = null; return top; }
    const rw = this.right.w;
    const mh = Math.min(rw * map.heightTiles / map.widthTiles, 130 * this.s, this.scale.height * 0.22);
    const mw = mh * map.widthTiles / map.heightTiles;
    this.mini = { x: this.right.x + rw - mw, y: top, w: mw, h: mh };
    if (key !== this.miniKey) {
      this.miniKey = key;
      if (!this.textures.exists(key)) {
        const tex = this.textures.createCanvas(key, map.widthTiles, map.heightTiles)!;
        const ctx = tex.getContext(), img = ctx.createImageData(map.widthTiles, map.heightTiles);
        for (let y = 0; y < map.heightTiles; y++) for (let x = 0; x < map.widthTiles; x++) {
          const c = map.colorAt(x, y), i = (y * map.widthTiles + x) * 4;
          img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0); tex.refresh();
      }
      this.miniFrame?.destroy(); this.miniImg?.destroy();
      this.miniFrame = panel(this, this.mini.x - 4, this.mini.y - 4, mw + 8, mh + 8, COLORS.panelEdge, 0x0c1a10, 0.9).setDepth(-1);
      this.miniImg = this.add.image(this.mini.x, this.mini.y, key).setOrigin(0).setDisplaySize(mw, mh).setDepth(-1);
    }
    this.miniImg?.setVisible(true); this.miniFrame?.setVisible(true);
    return top + mh + 14 * this.s;
  }

  private icon(i: number, u: Unit, x: number, y: number, px: number): void {
    const key = this.textures.exists(u.defId) ? u.defId : this.textures.exists(u.defId + '_sheet') ? u.defId + '_sheet' : null;
    let img = this.icons[i];
    if (!key) { img?.setVisible(false); return; }
    if (!img) { img = this.add.image(0, 0, key, 0).setDepth(4); this.icons[i] = img; }
    if (img.texture.key !== key) img.setTexture(key, 0);
    const f = img.frame;
    img.setVisible(true).setPosition(x, y).setScale(px / Math.max(1, f.width, f.height)).setAlpha(u.fainted || !u.alive ? 0.35 : 1);
  }

  update(): void {
    const gs = this.guest;
    if (!gs?.scene.isActive()) return;
    const { width: W, height: H } = this.scale;
    const s = this.s, g = this.g;
    g.clear();
    const w = gs.mirror?.world, snap = gs.snapshot;
    this.drawJoystick();
    if (this.joy) {
      const dx = this.joy.x - this.joy.bx, dy = this.joy.y - this.joy.by, d = Math.hypot(dx, dy), m = d < 8 ? 0 : Math.min(1, d / (60 * s));
      gs.joystick.x = d ? (dx / d) * m : 0; gs.joystick.y = d ? (dy / d) * m : 0;
    } else { gs.joystick.x = 0; gs.joystick.y = 0; }

    // before the first snapshot (or after the session ended): one centred card, nothing else
    const waiting = !w || !snap;
    const notice = gs.notice;
    for (const k of ['hp', 'room', 'mate', 'challenge', 'boss', 'help', 'p0', 'p1', 'p2']) this.t[k].setVisible(!waiting);
    this.icons.forEach((i) => i.setVisible(!waiting && i.visible));
    for (const c of this.cmdBoxes) c.view.setVisible(!waiting);
    if (waiting || notice) {
      const msg = notice || (gs.waitedMs() > 15000
        ? 'Chưa nhận được trận co-op.\nKiểm tra chủ phòng đã chọn co-op, hoặc nhấn Rời co-op.'
        : `Đang chờ chủ phòng…\nPhòng ${net.code || '—'}${net.peerName ? ` · ${net.peerName}` : ''}`);
      this.t.wait.setText(msg).setPosition(W / 2, H * 0.42).setVisible(true);
      const b = this.t.wait.getBounds();
      g.fillStyle(0x0b0d16, 0.82).fillRect(b.x - 18 * s, b.y - 14 * s, b.width + 36 * s, b.height + 28 * s);
      g.lineStyle(2, notice ? 0xd06060 : 0xffcc33, 1).strokeRect(b.x - 18 * s, b.y - 14 * s, b.width + 36 * s, b.height + 28 * s);
      if (!notice && waiting) {
        const a = this.time.now / 160;
        for (let i = 0; i < 8; i++) g.fillStyle(0xffe680, ((i + Math.floor(a)) % 8) / 8).fillCircle(W / 2 + Math.cos(i * Math.PI / 4) * 14 * s, b.y - 40 * s + Math.sin(i * Math.PI / 4) * 14 * s, 3 * s);
      }
    } else this.t.wait.setVisible(false);
    this.skillBar.draw(g, waiting || !!notice);
    if (waiting) { this.t.state.setText(''); this.t.loot.setText(''); this.t.hint.setText(''); this.drawCommands(); return; }

    // ── left: own trainer + party ──
    const L = this.left, hw = L.w, t = w.trainer;
    const hpH = 24 * s;
    g.fillStyle(0x000000, 0.75).fillRect(L.x - 2, L.y - 2, hw + 4, hpH + 4);
    g.fillStyle(0x502020, 1).fillRect(L.x, L.y, hw, hpH);
    g.fillStyle(t.hp > 0 ? 0xe04848 : 0x603030, 1).fillRect(L.x, L.y, hw * Phaser.Math.Clamp(t.hp / Math.max(1, t.maxHp), 0, 1), hpH);
    this.fit(this.t.hp, `HLV ${Math.ceil(Math.max(0, t.hp))}/${t.maxHp} · Lv${w.level} · ${w.kills} hạ`, hw - 10 * s).setPosition(L.x + 6 * s, L.y + 2 * s);
    const rowH = 38 * s;
    w.allies.slice(0, 3).forEach((u, i) => {
      const y = L.y + hpH + 8 * s + i * (rowH + 4 * s);
      g.fillStyle(0x0b0d16, 0.78).fillRect(L.x, y, hw, rowH);
      g.lineStyle(2, u.fainted || !u.alive ? 0x803030 : 0x3a4260, 1).strokeRect(L.x, y, hw, rowH);
      this.icon(i, u, L.x + 20 * s, y + rowH / 2, 32 * s);
      const tx = L.x + 40 * s, bw = hw - 48 * s;
      this.fit(this.t['p' + i], `${u.name} Lv${u.level}${u.fainted || !u.alive ? ' ✕' : ''}`, bw).setPosition(tx, y + 1 * s).setVisible(true);
      bar(g, tx, y + 21 * s, bw, 6 * s, u.hp / Math.max(1, u.maxHp), hpColor(u.hp / Math.max(1, u.maxHp)));
      bar(g, tx, y + 30 * s, bw, 3 * s, u.energy / Math.max(1, u.maxEnergy), 0x60a0ff);
    });
    for (let i = w.allies.length; i < 3; i++) { this.t['p' + i].setText(''); this.icons[i]?.setVisible(false); }
    // the bench (Adventure rules): compact rows under the active Pokémon, HP + type + switch cooldown
    const bench = gs.bench(), cd = gs.switchCooldown();
    const by0 = L.y + hpH + 8 * s + Math.max(1, Math.min(3, w.allies.length)) * (rowH + 4 * s);
    const bh = 22 * s;
    for (let i = 0; i < 5; i++) {
      const b = bench[i], tx = this.t['b' + i], z = this.benchZones[i];
      if (!b) { tx.setVisible(false); z.disableInteractive(); continue; }
      const y = by0 + i * (bh + 3 * s);
      g.fillStyle(0x0b0d16, 0.62).fillRect(L.x, y, hw, bh);
      g.lineStyle(1, b.fainted ? 0x803030 : 0x2c3450, 1).strokeRect(L.x, y, hw, bh);
      bar(g, L.x + hw * 0.62, y + bh * 0.4, hw * 0.34, 5 * s, b.hp / Math.max(1, b.maxHp), b.fainted ? 0x603030 : hpColor(b.hp / Math.max(1, b.maxHp)));
      this.fit(tx, `${i + 2}. ${b.name} Lv${b.level}${b.fainted ? ' ✕' : ''}`, hw * 0.58).setPosition(L.x + 6 * s, y + 3 * s).setVisible(true)
        .setColor(b.fainted ? '#a06060' : cd > 0 ? COLORS.dim : COLORS.text);
      z.setPosition(L.x, y).setSize(hw, bh).setInteractive();
    }
    if (bench.length && cd > 0) this.fit(this.t.swcd, `Đổi Pokémon: chờ ${cd.toFixed(1)} s`, hw).setPosition(L.x, by0 + Math.min(5, bench.length) * (bh + 3 * s) + 2 * s).setVisible(true);
    else this.t.swcd.setVisible(false);

    // ── right: minimap, teammate card, challenge ──
    const R = this.right;
    let y = this.ensureMinimap(R.y + Math.max(34, 44 * s) + 10 * s);
    if (this.mini) this.drawMini(w);
    const mate = w.companion?.trainer;
    const ping = net.rtt;
    const pingCol = ping < 120 ? '#8fe3a3' : ping < 250 ? '#ffe066' : '#ff8070';
    const cardH = 44 * s;
    g.fillStyle(0x0b0d16, 0.78).fillRect(R.x, y, R.w, cardH);
    g.lineStyle(2, 0x3a4260, 1).strokeRect(R.x, y, R.w, cardH);
    this.fit(this.t.mate, `${net.peerName || 'Chủ phòng'}${mate && mate.hp <= 0 ? ' · gục' : ''}`, R.w - 70 * s).setPosition(R.x + 8 * s, y + 3 * s);
    this.t.room.setText(`${ping} ms`).setColor(pingCol).setPosition(R.x + R.w - 8 * s - this.t.room.width, y + 3 * s);
    if (mate) bar(g, R.x + 8 * s, y + 26 * s, R.w - 16 * s, 8 * s, mate.hp / Math.max(1, mate.maxHp), hpColor(mate.hp / Math.max(1, mate.maxHp)));
    y += cardH + 8 * s;
    this.t.challenge.setText(coopEventLabel(snap.challenge)).setPosition(R.x + 8 * s, y + 6 * s);
    const ch = this.t.challenge.height + 12 * s;
    g.fillStyle(0x201830, 0.7).fillRect(R.x, y, R.w, ch);
    g.lineStyle(1, 0xffcc33, 0.6).strokeRect(R.x, y, R.w, ch);

    // ── centre: state banner + loot toast ──
    const now = performance.now();
    const state = now - gs.receivedAt > 3000 ? 'Đang chờ chủ phòng / chuyển bản đồ…'
      : snap.paused || snap.state === 'levelup' ? 'Chủ phòng đang tạm dừng / chọn nâng cấp'
      : t.hp <= 0 ? 'Bạn đã gục!\nĐồng đội đứng gần 3 giây để cứu' : '';
    this.t.state.setText(state).setPosition(W / 2, H * 0.3);
    if (state) {
      const b = this.t.state.getBounds();
      g.fillStyle(0x000000, 0.6).fillRect(b.x - 12 * s, b.y - 8 * s, b.width + 24 * s, b.height + 16 * s);
    }
    const loot = gs.lootText();
    const barTop = this.cmdBoxes[0]?.box.y ?? H;
    const boss = w.enemies.find((e) => e.boss && e.alive);
    // phones: just above the command bar (the top edge is full); wide screens: top centre between the columns
    this.t.loot.setText(loot);
    this.t.loot.setPosition(W / 2, W / DPR < 700 ? this.skillTop - 24 * s : 12 * s + this.t.loot.height);
    this.t.hint.setText(gs.hintText()).setPosition(W / 2, this.skillTop - (W / DPR < 700 && loot ? 70 : 26) * s);
    if (loot) {
      const b = this.t.loot.getBounds();
      g.fillStyle(0x2a2008, 0.85).fillRect(b.x - 10 * s, b.y - 6 * s, b.width + 20 * s, b.height + 12 * s);
      g.lineStyle(2, 0xffcc33, 1).strokeRect(b.x - 10 * s, b.y - 6 * s, b.width + 20 * s, b.height + 12 * s);
    }

    // ── bottom: boss bar above the command bar, keyboard help on desktop ──
    if (boss) {
      const bw = Math.min(W - 40 * s, 520 * s), bx = (W - bw) / 2, by = barTop - 30 * s;
      g.fillStyle(0x000000, 0.8).fillRect(bx - 3, by - 3, bw + 6, 20 * s);
      g.fillStyle(boss.boss?.phase === 2 ? 0xff6020 : 0xd03030, 1).fillRect(bx, by, bw * Phaser.Math.Clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1), 14 * s);
      this.fit(this.t.boss, `${boss.name} Lv${boss.level}${boss.boss?.phase === 2 ? ' · PHASE 2' : ''}`, bw).setPosition(W / 2, by - 4 * s);
    } else this.t.boss.setText('');
    const target = gs.targetUnit();
    if (target) {
      const cam = gs.cameras.main;
      const sx = (target.x - cam.worldView.x) * cam.zoom, sy = (target.y - cam.worldView.y) * cam.zoom;
      g.lineStyle(2, 0xff6050, 0.9).strokeCircle(sx, sy, (target.radius + 12) * cam.zoom);
    }
    this.t.help.setText(this.touch ? '' : 'WASD di chuyển · Shift chạy · ` 1–5 lệnh đội · Nhấp quái để tấn công · Q chiêu · Shift+2–6 đổi Pokémon').setPosition(this.left.x, barTop - (boss ? 64 : 26) * s);
    this.drawCommands();
  }

  private drawMini(w: NonNullable<CoopGuestScene['mirror']>['world']): void {
    const m = this.mini!, map = this.guest.map!, g = this.g;
    const kx = m.w / map.widthTiles, ky = m.h / map.heightTiles;
    const dot = (u: Unit, color: number, r: number) => g.fillStyle(color, 1).fillRect(m.x + (u.x / TILE_PX) * kx - r, m.y + (u.y / TILE_PX) * ky - r, r * 2, r * 2);
    for (const e of w.enemies) if (e.alive && !e.captured) dot(e, e.boss ? 0xff40ff : e.hostile ? 0xff4040 : 0xffd080, e.boss ? 2.5 : 1);
    if (w.companion) dot(w.companion.trainer, 0x60c0ff, 2.5);
    dot(w.trainer, 0xffffff, 2.5);
  }

  /** Gold frame around the active team command (and the run toggle when held). */
  private drawCommands(): void {
    const gs = this.guest;
    for (const { id, box } of this.cmdBoxes) {
      if (id === 'run' ? gs.runHeld : gs.command === id) this.g.lineStyle(3, 0xffcc33, 1).strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
    }
  }

  private drawJoystick(): void {
    const g = this.joyG;
    g.clear();
    if (!this.joy) return;
    const s = this.s, max = 60 * s;
    const dx = this.joy.x - this.joy.bx, dy = this.joy.y - this.joy.by, d = Math.hypot(dx, dy), k = d > max ? max / d : 1;
    g.fillStyle(0xffffff, 0.12).fillCircle(this.joy.bx, this.joy.by, max);
    g.lineStyle(3, 0xffffff, 0.35).strokeCircle(this.joy.bx, this.joy.by, max);
    g.fillStyle(0xffffff, 0.45).fillCircle(this.joy.bx + dx * k, this.joy.by + dy * k, 24 * s);
  }

  /** One line that never runs past `max` px: shrink nothing, cut the end with an ellipsis instead. */
  private fit(t: Phaser.GameObjects.Text, str: string, max: number): Phaser.GameObjects.Text {
    t.setText(str);
    if (t.width <= max) return t;
    let lo = 0, hi = str.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; t.setText(str.slice(0, mid) + '…'); if (t.width <= max) lo = mid; else hi = mid - 1; }
    return t.setText(str.slice(0, lo) + '…');
  }
}
