import Phaser from 'phaser';
import type { AllyCommand, Side, Unit } from '../core/world';
import { fitScale } from '../render/spriteRegistry';
import { shinyKey } from '../render/lazyCreatures';
import { net } from '../net/session';
import { saveStore } from '../systems/save';
import { audio } from '../systems/audio';
import { RULE_LABEL } from '../net/duel';
import { CMD_LABEL, DuelScene } from './DuelScene';
import { button, Button, COLORS, fmtTime, panel, text, uiScale } from './ui';
import { SkillBar } from '../ui/SkillBar';

// HUD of a duel: both parties (field / bench / fainted), the clock, orders, Mega, forfeit, result screen.

const CMDS: { id: AllyCommand; key: string }[] = [
  { id: 'auto', key: '`' }, { id: 'attack', key: '1' }, { id: 'defend', key: '2' }, { id: 'follow', key: '3' }, { id: 'hold', key: '4' }, { id: 'retreat', key: '5' },
];

interface Row { zone: Phaser.GameObjects.Zone; icon: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; state: Phaser.GameObjects.Text }

export class DuelUI extends Phaser.Scene {
  private duel!: DuelScene;
  private s = 1;
  private g!: Phaser.GameObjects.Graphics;
  private rows: [Row[], Row[]] = [[], []];
  private top!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private big!: Phaser.GameObjects.Text;
  private bannerT!: Phaser.GameObjects.Text;
  private bannerLife = 0;
  private cmdButtons: Button[] = [];
  private megaBtn!: Button;
  /** field Pokémon picked to leave on the next switch */
  private picked: Unit | null = null;
  private result: Phaser.GameObjects.Container | null = null;
  private skillBar!: SkillBar;

  constructor() {
    super('DuelUI');
  }

  init(d: { duel: DuelScene }): void {
    this.duel = d.duel;
    this.rows = [[], []];
    this.cmdButtons = [];
    this.picked = null;
    this.result = null;
  }

  create(): void {
    this.build();
    this.scale.on('resize', this.rebuild, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.rebuild, this));
  }

  private rebuild(): void {
    this.children.removeAll(true);
    this.rows = [[], []];
    this.cmdButtons = [];
    this.result = null;
    this.build();
    if (this.duel.ended) this.showResult();
  }

  private build(): void {
    const { width: W, height: H } = this.scale;
    const s = (this.s = uiScale(W, H, (w, h) => Math.max(0.6, Math.min(w / 1280, h / 720, 1.4))));
    this.g = this.add.graphics();
    const st = this.duel.start, guest = this.duel.role === 'guest';
    const me = guest ? st.guestName : st.hostName, opp = this.duel.role === 'practice' ? 'Máy (luyện tập)' : guest ? st.hostName : st.guestName;
    this.top = text(this, 12 * s, 8 * s, '', 20 * s, '#e8f0ff');
    this.top.setText(`${me}  vs  ${opp}`);
    this.clock = text(this, W / 2, 8 * s, '', 26 * s, '#ffe080').setOrigin(0.5, 0);
    text(this, W - 12 * s, 10 * s, RULE_LABEL[st.rules.id].split(' — ')[0], 16 * s, COLORS.dim).setOrigin(1, 0);
    this.big = text(this, W / 2, H / 2 - 40 * s, '', 96 * s, '#ffe060').setOrigin(0.5).setStroke('#000', 8);
    this.bannerT = text(this, W / 2, 44 * s, '', 20 * s, '#ffffff').setOrigin(0.5, 0).setStroke('#000', 4).setAlpha(0);

    // party columns
    for (const side of [0, 1] as const) {
      for (let i = 0; i < 6; i++) {
        const x = side === 0 ? 10 * s : W - 230 * s, y = 52 * s + i * 46 * s;
        const zone = this.add.zone(x, y, 220 * s, 42 * s).setOrigin(0).setInteractive({ useHandCursor: side === 0 });
        if (side === 0) zone.on('pointerup', () => this.clickRow(i));
        this.rows[side].push({
          zone,
          icon: this.add.image(x + 22 * s, y + 21 * s, '__DEFAULT').setVisible(false),
          name: text(this, x + 44 * s, y + 2 * s, '', 16 * s, '#ffffff'),
          state: text(this, x + 216 * s, y + 2 * s, '', 13 * s, COLORS.dim).setOrigin(1, 0),
        });
      }
    }

    // orders
    const bw = Math.min(118 * s, (W - 260 * s) / 6);
    CMDS.forEach((c, i) => {
      const b = button(this, W / 2 - bw * 3 + bw * (i + 0.5), H - 30 * s, bw - 6 * s, 40 * s, `${c.key} ${CMD_LABEL[c.id]}`, () => { audio.unlock(); this.duel.order(c.id); });
      this.cmdButtons.push(b);
    });
    this.megaBtn = button(this, W - 150 * s, H - 30 * s, 110 * s, 40 * s, 'G  MEGA', () => this.duel.megaAny(), 0x7a2f6a);
    button(this, W - 50 * s, H - 30 * s, 80 * s, 40 * s, 'Hàng', () => this.duel.forfeit(), 0x6a2f2f);
    text(this, 12 * s, H - 76 * s, 'Chạm Pokémon đối thủ: cả đội tấn công nó · Chạm con dự bị để đổi (Z X C) · WASD di chuyển', 14 * s, COLORS.dim);
    // active skills of the focused Pokémon: tap = use now · right-click / long-press = keep it for yourself
    const d = this.duel;
    this.skillBar = new SkillBar(this, {
      focusAlly: () => d.focusAlly(),
      manualSkill: (j) => d.manualSkill(j),
      cycleFocus: () => d.cycleFocus(),
      globalCd: () => d.mine.manualCd,
      toggleReserved: (j) => d.toggleReserved(j),
      isReserved: (u, j) => d.isReserved(u, j),
    }, this.sys.game.device.input.touch);
    this.skillBar.build(s, { centerX: W / 2, y: H - 150 * s });
  }

  banner(t: string, color: string): void {
    this.bannerT?.setText(t).setColor(color).setAlpha(1);
    this.bannerLife = 2.2;
  }

  private sideUnits(side: Side): Unit[] {
    return [...side.allies, ...side.bench];
  }

  /** My party rows: field member = pick it to leave; bench member = switch it in. */
  private clickRow(i: number): void {
    audio.unlock();
    const side = this.duel.mine, u = this.sideUnits(side)[i];
    if (!u || u.fainted || this.duel.ended) return;
    if (side.allies.includes(u)) { this.picked = this.picked === u ? null : u; return; }
    const benchIdx = side.bench.filter((b) => !b.fainted).indexOf(u);
    this.duel.switchIn(benchIdx, this.picked && side.allies.includes(this.picked) ? this.picked : null);
    this.picked = null;
  }

  update(_t: number, delta: number): void {
    const s = this.s, d = this.duel, w = d.world;
    if (!w) return;
    const g = this.g;
    g.clear();
    const left = Math.max(0, d.start.rules.timeLimit - w.time);
    this.clock.setText(d.countdown > 0 ? 'Chuẩn bị…' : fmtTime(left)).setColor(left < 20 ? '#ff7060' : '#ffe080');
    const ping = d.role === 'practice' ? '' : net.connected ? `  ·  ping ${net.rtt} ms` : '  ·  mất kết nối';
    this.top.setText(this.top.text.split('  ·  ')[0] + ping);
    if (d.countdown > 0) this.big.setText(String(Math.ceil(d.countdown))).setAlpha(1);
    else if (d.countdown > -0.8) { this.big.setText('ĐẤU!'); d.countdown -= delta / 1000; }
    else this.big.setAlpha(0);
    if (this.bannerLife > 0) { this.bannerLife -= delta / 1000; if (this.bannerLife <= 0) this.bannerT.setAlpha(0); }

    ([w.home, w.rival!] as Side[]).forEach((side, si) => {
      const units = this.sideUnits(side);
      this.rows[si].forEach((r, i) => {
        const u = units[i];
        const x = r.zone.x, y = r.zone.y;
        if (!u) { r.icon.setVisible(false); r.name.setText(''); r.state.setText(''); return; }
        const onField = side.allies.includes(u);
        g.fillStyle(0x0b0d16, 0.8).fillRect(x, y, 220 * s, 42 * s);
        g.lineStyle(2, u === this.picked ? 0xffe060 : u.fainted ? 0x803030 : onField ? (si === 0 ? 0x60b0ff : 0xff7060) : 0x3a4260, 1).strokeRect(x, y, 220 * s, 42 * s);
        const key = u.shiny ? shinyKey(u.defId) : u.defId;
        if (r.icon.texture.key !== key && this.textures.exists(key)) r.icon.setTexture(key);
        r.icon.setVisible(true).setScale(fitScale(this, r.icon.texture.key, 34 * s)).setAlpha(u.fainted ? 0.35 : onField ? 1 : 0.7);
        r.name.setText(`${u.name} Lv${u.level}`);
        r.state.setText(u.fainted ? 'Gục' : onField ? (u.megaFrom ? 'MEGA' : 'Sân') : 'Dự bị');
        const f = u.fainted ? 0 : u.hp / u.maxHp;
        g.fillStyle(0x301818, 1).fillRect(x + 44 * s, y + 26 * s, 168 * s, 8 * s);
        g.fillStyle(f > 0.5 ? 0x50d060 : f > 0.2 ? 0xf0c030 : 0xf04040, 1).fillRect(x + 44 * s, y + 26 * s, 168 * s * f, 8 * s);
      });
    });
    const mine = d.mine;
    this.skillBar.draw(g, !!d.ended || d.countdown > 0);
    this.cmdButtons.forEach((b, i) => b.container.setAlpha(mine.command === CMDS[i].id ? 1 : 0.62));
    const megaOk = !mine.megaUsed && mine.allies.some((u) => !u.fainted && d.canMega(u));
    this.megaBtn.container.setAlpha(megaOk ? 1 : 0.35);
    if (mine.switchCd > 0) {
      g.fillStyle(0x000000, 0.5).fillRect(10 * s, 52 * s + 6 * 46 * s, 220 * s, 18 * s);
      g.fillStyle(0x80b0ff, 1).fillRect(10 * s, 52 * s + 6 * 46 * s, 220 * s * (1 - mine.switchCd / 4), 18 * s);
    }
  }

  showResult(): void {
    if (this.result) return;
    const { width: W, height: H } = this.scale, s = this.s, d = this.duel, e = d.ended!;
    const c = this.add.container(0, 0).setDepth(100);
    this.result = c;
    c.add(this.add.rectangle(0, 0, W, H, 0x05060c, 0.72).setOrigin(0).setInteractive());
    const pw = Math.min(W - 20, 560 * s), ph = 300 * s, x0 = (W - pw) / 2, y0 = (H - ph) / 2;
    c.add(panel(this, x0, y0, pw, ph, e.result === 'win' ? 0xffd040 : e.result === 'loss' ? 0xff6060 : 0x80a0c0, 0x161a28, 0.97));
    c.add(text(this, W / 2, y0 + 20 * s, e.result === 'win' ? 'CHIẾN THẮNG!' : e.result === 'loss' ? 'THẤT BẠI' : 'HÒA', 54 * s, e.result === 'win' ? '#ffe060' : e.result === 'loss' ? '#ff8080' : '#c0d8ff').setOrigin(0.5, 0));
    if (e.note) c.add(text(this, W / 2, y0 + 86 * s, e.note, 18 * s, COLORS.dim).setOrigin(0.5, 0));
    const r = saveStore.data.pvp;
    if (r && d.role !== 'practice') c.add(text(this, W / 2, y0 + 120 * s, `Thành tích online: ${r.wins} thắng · ${r.losses} thua · ${r.draws} hòa`, 18 * s, '#d0d8f0').setOrigin(0.5, 0));
    if (d.role === 'practice') c.add(text(this, W / 2, y0 + 120 * s, 'Trận luyện tập không tính vào thành tích online', 16 * s, COLORS.dim).setOrigin(0.5, 0));
    const again = d.returnTo === 'adventure' ? 'Về thế giới' : d.role === 'practice' ? 'Về sảnh' : 'Về phòng (đấu lại)';
    c.add(button(this, W / 2, y0 + ph - 50 * s, 260 * s, 50 * s, again, () => d.exit(), 0x2f5a8a).container);
  }
}
