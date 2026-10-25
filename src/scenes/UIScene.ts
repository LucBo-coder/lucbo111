import Phaser from 'phaser';
import { openCoopMenu } from './coopMenu';
import { net } from '../net/session';
import { music } from '../systems/music';
import { POKEMON } from '../core/data';
import { Offer } from '../core/upgrades';
import { WORLD_H, WORLD_W } from '../core/world';
import { audio } from '../systems/audio';
import { saveStore } from '../systems/save';
import { fitScale } from '../render/spriteRegistry';
import { moveAssets } from '../render/moveAssets';
import { gameModes } from '../systems/gameMode';
import type { GameScene } from './GameScene';
import { button, COLORS, fmtTime, panel, RARITY_COLOR, RARITY_LABEL, text, TYPE_COLOR } from './ui';

interface PartyRow {
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
}

export class UIScene extends Phaser.Scene {
  private game_!: GameScene;
  private s = 1;
  private hud!: Phaser.GameObjects.Graphics;
  private mini!: Phaser.GameObjects.Graphics;
  private miniStatic!: Phaser.GameObjects.Graphics;
  private joyG!: Phaser.GameObjects.Graphics;
  private lvText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private perfText!: Phaser.GameObjects.Text;
  private synText!: Phaser.GameObjects.Text;
  private rows: PartyRow[] = [];
  private banners: Phaser.GameObjects.Text[] = [];
  private cards: Phaser.GameObjects.Container | null = null;
  private shownOffers: Offer[] | null = null;
  private cardsReadyAt = 0;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private joy: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  private frame = 0;
  private miniBox = { x: 0, y: 0, size: 0 };

  constructor() {
    super('UI');
  }

  init(data: { game: GameScene }): void {
    this.game_ = data.game;
    this.cards = null;
    this.shownOffers = null;
    this.pauseLayer = null;
    this.joy = null;
    this.rows = [];
    this.banners = [];
  }

  create(): void {
    this.build();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      const i = ['1', '2', '3'].indexOf(ev.key);
      if (i >= 0) this.pick(i);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      audio.unlock();
      if (over.length || this.cards || this.pauseLayer || this.joy) return;
      this.joy = { id: p.id, bx: p.x, by: p.y, x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.joy && p.id === this.joy.id) { this.joy.x = p.x; this.joy.y = p.y; }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.joy && p.id === this.joy.id) this.joy = null;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  private onResize(): void {
    const offers = this.shownOffers;
    const paused = !!this.pauseLayer;
    this.children.removeAll(true);
    this.cards = null;
    this.pauseLayer = null;
    this.shownOffers = null;
    this.rows = [];
    this.banners = [];
    this.build();
    if (offers) this.showCards(offers);
    if (paused) this.showPause(true);
  }

  private build(): void {
    const { width: W, height: H } = this.scale;
    const s = (this.s = Phaser.Math.Clamp(Math.min(W / 1100, H / 680), 0.55, 1.4));
    this.hud = this.add.graphics();
    this.lvText = text(this, 12 * s, 4 * s, '', 20 * s).setDepth(2);
    this.timerText = text(this, W / 2, 24 * s, '00:00', 40 * s).setOrigin(0.5, 0);
    this.killText = text(this, W / 2, 62 * s, '', 20 * s, COLORS.dim).setOrigin(0.5, 0);
    this.hpText = text(this, 16 * s, 34 * s, '', 18 * s);
    this.bossText = text(this, W / 2, H - 58 * s, '', 22 * s, '#ffb0a0').setOrigin(0.5, 1).setVisible(false);
    this.perfText = text(this, 10, H - 8, '', 16, '#a0ffa0').setOrigin(0, 1);

    const size = Math.round(150 * s);
    this.miniBox = { x: W - size - 12 * s, y: 30 * s, size };
    this.synText = text(this, W - 12 * s, 30 * s + size + 10 * s, '', 15 * s, '#ffd080').setOrigin(1, 0).setAlign('right');
    panel(this, this.miniBox.x - 4, this.miniBox.y - 4, size + 8, size + 8, COLORS.panelEdge, 0x0c1a10, 0.85);
    this.miniStatic = this.add.graphics();
    this.miniStatic.fillStyle(0x2a5a2c, 1);
    const k = size / WORLD_W;
    for (const o of this.game_.world.obstacles) this.miniStatic.fillRect(this.miniBox.x + o.x * k - 1, this.miniBox.y + o.y * k - 1, 2, 2);
    this.mini = this.add.graphics();

    button(this, W - 40 * s, this.miniBox.y + size + 34 * s, 56 * s, 40 * s, 'II', () => this.game_.togglePause());

    this.joyG = this.add.graphics().setDepth(50);
  }

  // ───────────────────────────── per-frame HUD ─────────────────────────────

  update(): void {
    this.frame++;
    const gs = this.game_;
    const w = gs.world;
    const { width: W, height: H } = this.scale;
    const s = this.s;
    const g = this.hud;
    g.clear();

    // EXP bar (full width, top)
    g.fillStyle(0x000000, 0.7).fillRect(0, 0, W, 26 * s);
    g.fillStyle(0x3060ff, 1).fillRect(0, 2, W * (w.exp / w.expNext), 22 * s - 2);
    g.fillStyle(0x80b0ff, 0.6).fillRect(0, 2, W * (w.exp / w.expNext), 5 * s);
    this.lvText.setText(`Lv ${w.level}   EXP ${Math.floor(w.exp)}/${w.expNext}`);

    this.timerText.setText(fmtTime(w.time));
    this.killText.setText(`Hạ gục ${w.kills}   ·   Boss sau ${nextBoss(w.time)}`);

    // Trainer HP
    const t = w.trainer;
    const hx = 12 * s, hy = 34 * s, hw = 220 * s, hh = 22 * s;
    g.fillStyle(0x000000, 0.75).fillRect(hx - 2, hy - 2, hw + 4, hh + 4);
    g.fillStyle(0x502020, 1).fillRect(hx, hy, hw, hh);
    g.fillStyle(t.hp / t.maxHp > 0.3 ? 0xe04848 : 0xff2020, 1).fillRect(hx, hy, hw * (t.hp / t.maxHp), hh);
    g.fillStyle(0xffffff, 0.2).fillRect(hx, hy, hw * (t.hp / t.maxHp), 5 * s);
    this.hpText.setText(`HLV  ${Math.ceil(t.hp)}/${t.maxHp}`).setPosition(hx + 6 * s, hy + 1 * s);

    this.drawParty(g, s);
    // party type synergy (Survivor) under the minimap
    this.synText.setText(w.synergy.lines.length ? ['ĐỒNG HỆ', ...w.synergy.lines].join('\n') : '');
    this.drawBoss(g, W, H, s);
    if (this.frame % 3 === 0) this.drawMinimap();
    this.drawJoystick();

    // Level-up handling
    if (w.state === 'levelup' && w.currentOffers.length && this.shownOffers !== w.currentOffers) this.showCards(w.currentOffers);
    if (w.state !== 'levelup' && this.cards) this.hideCards();

    const p = gs.perf;
    if (saveStore.data.settings.showFps) {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      this.perfText.setText(`FPS ${p.fps.toFixed(0)} | frame ${p.frameMs.toFixed(1)}ms | sim ${p.simMs.toFixed(2)}ms | entities ${p.entities} | particles ${p.particles}${mem ? ` | heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : ''}`);
    } else this.perfText.setText('');

    // joystick → game input
    if (this.joy) {
      const dx = this.joy.x - this.joy.bx, dy = this.joy.y - this.joy.by;
      const d = Math.hypot(dx, dy), max = 60 * s;
      const m = d < 8 ? 0 : Math.min(1, d / max);
      gs.joystick.x = d ? (dx / d) * m : 0;
      gs.joystick.y = d ? (dy / d) * m : 0;
    } else { gs.joystick.x = 0; gs.joystick.y = 0; }
  }

  private drawParty(g: Phaser.GameObjects.Graphics, s: number): void {
    const allies = this.game_.world.allies;
    const x0 = 12 * s, y0 = 66 * s, rowH = 54 * s, pw = 230 * s;
    while (this.rows.length < allies.length) {
      const a = allies[this.rows.length];
      const icon = this.add.image(0, 0, POKEMON.get(a.defId)!.sprite).setScale(fitScale(this, POKEMON.get(a.defId)!.sprite, 40 * s));
      const name = text(this, 0, 0, '', 17 * s);
      this.rows.push({ icon, name });
    }
    allies.forEach((a, i) => {
      const y = y0 + i * (rowH + 4 * s);
      g.fillStyle(0x0b0d16, 0.72).fillRect(x0, y, pw, rowH);
      g.lineStyle(2, a.fainted ? 0x603030 : 0x3a4260, 1).strokeRect(x0, y, pw, rowH);
      const row = this.rows[i];
      if (row.icon.texture.key !== a.defId && this.textures.exists(a.defId)) row.icon.setTexture(a.defId).setScale(fitScale(this, a.defId, 40 * s));
      row.icon.setPosition(x0 + 24 * s, y + rowH / 2).setAlpha(a.fainted ? 0.3 : 1);
      if (a.fainted) row.icon.setTint(0x606060); else row.icon.clearTint();
      row.name.setText(a.fainted ? `${a.name}  hồi sinh ${Math.ceil(a.reviveT)}s` : `${a.name}  Lv${a.level}`).setPosition(x0 + 50 * s, y + 2 * s);
      const bx = x0 + 50 * s, bw = pw - 58 * s;
      const hf = a.hp / a.maxHp;
      g.fillStyle(0x000000, 0.8).fillRect(bx, y + 22 * s, bw, 7 * s);
      g.fillStyle(hf > 0.5 ? 0x50e060 : hf > 0.25 ? 0xf0d030 : 0xf04040, 1).fillRect(bx, y + 22 * s, bw * hf, 7 * s);
      if (a.shield > 0) g.fillStyle(0x80e0ff, 0.8).fillRect(bx, y + 22 * s, Math.min(bw, bw * (a.shield / a.maxHp)), 3 * s);
      g.fillStyle(0x000000, 0.8).fillRect(bx, y + 30 * s, bw, 3 * s);
      g.fillStyle(0x60a0ff, 1).fillRect(bx, y + 30 * s, bw * (a.energy / a.maxEnergy), 3 * s);
      // 4 skill cooldown squares
      const sq = 14 * s;
      a.skills.forEach((sl, j) => {
        const sx = bx + j * (sq + 5 * s), sy = y + 36 * s;
        const col = TYPE_COLOR[sl.def.type] ?? 0x888888;
        const affordable = a.energy >= sl.def.energyCost;
        g.fillStyle(col, affordable ? 1 : 0.35).fillRect(sx, sy, sq, sq);
        const frac = sl.cd > 0 && sl.cdMax ? Phaser.Math.Clamp(sl.cd / sl.cdMax, 0, 1) : 0;
        if (frac > 0) g.fillStyle(0x000000, 0.7).fillRect(sx, sy, sq, sq * frac);
        g.lineStyle(1, a.lastSkill === sl.def.id && a.animCast > 0 ? 0xffffff : 0x000000, 1).strokeRect(sx, sy, sq, sq);
        if (sl.level > 1) g.fillStyle(0xffe060, 1).fillRect(sx + sq - 4 * s, sy, 4 * s, 4 * s);
      });
    });
  }

  private drawBoss(g: Phaser.GameObjects.Graphics, W: number, H: number, s: number): void {
    const b = this.game_.world.boss;
    if (!b) { this.bossText.setVisible(false); return; }
    const bw = Math.min(W - 40, 560 * s), bh = 18 * s, x = (W - bw) / 2, y = H - 50 * s;
    g.fillStyle(0x000000, 0.8).fillRect(x - 3, y - 3, bw + 6, bh + 6);
    g.fillStyle(0x401010, 1).fillRect(x, y, bw, bh);
    g.fillStyle(b.boss!.phase === 2 ? 0xff6020 : 0xd03030, 1).fillRect(x, y, bw * (b.hp / b.maxHp), bh);
    g.fillStyle(0xffffff, 0.8).fillRect(x + bw * b.boss!.def.phase2Threshold - 1, y, 2, bh);
    this.bossText.setVisible(true).setPosition(W / 2, y - 4)
      .setText(`${b.name} Lv${b.level}${b.boss!.final ? ' · BOSS CUỐI' : ''}${b.boss!.phase === 2 ? ' · PHASE 2' : ''}`);
  }

  private drawMinimap(): void {
    const w = this.game_.world;
    const g = this.mini;
    const { x, y, size } = this.miniBox;
    const k = size / WORLD_W;
    g.clear();
    g.fillStyle(0xff4040, 1);
    let n = 0;
    for (const e of w.enemies) {
      if (n++ > 220) break;
      if (e.kind === 'boss') continue;
      g.fillStyle(e.elite ? 0xffa020 : 0xff4040, 1).fillRect(x + e.x * k - 1, y + e.y * k - 1, 2, 2);
    }
    if (w.boss) g.fillStyle(0xff2020, 1).fillCircle(x + w.boss.x * k, y + w.boss.y * k, 4);
    g.fillStyle(0x60ff80, 1);
    for (const a of w.allies) if (!a.fainted) g.fillRect(x + a.x * k - 1, y + a.y * k - 1, 3, 3);
    g.fillStyle(0xffffff, 1).fillRect(x + w.trainer.x * k - 2, y + w.trainer.y * k - 2, 4, 4);
    const v = this.game_.cameras.main.worldView;
    g.lineStyle(1, 0xffffff, 0.5).strokeRect(x + v.x * k, y + v.y * k, v.width * k, v.height * k);
    void WORLD_H;
  }

  private drawJoystick(): void {
    const g = this.joyG;
    g.clear();
    if (!this.joy) return;
    const s = this.s, max = 60 * s;
    const dx = this.joy.x - this.joy.bx, dy = this.joy.y - this.joy.by, d = Math.hypot(dx, dy);
    const k = d > max ? max / d : 1;
    g.fillStyle(0xffffff, 0.12).fillCircle(this.joy.bx, this.joy.by, max);
    g.lineStyle(3, 0xffffff, 0.35).strokeCircle(this.joy.bx, this.joy.by, max);
    g.fillStyle(0xffffff, 0.45).fillCircle(this.joy.bx + dx * k, this.joy.by + dy * k, 24 * s);
  }

  // ───────────────────────────── banners ─────────────────────────────

  banner(str: string, color = '#ffffff'): void {
    const { width: W } = this.scale;
    const s = this.s;
    if (this.banners.length >= 3) this.banners.shift()?.destroy();
    const t = text(this, W / 2, 0, str, 28 * s, color).setOrigin(0.5).setAlpha(0);
    this.banners.push(t);
    this.banners.forEach((b, i) => b.setY(110 * s + i * 34 * s));
    this.tweens.add({ targets: t, alpha: 1, duration: 150 });
    this.tweens.add({
      targets: t, alpha: 0, delay: 2300, duration: 400,
      onComplete: () => { this.banners = this.banners.filter((b) => b !== t); t.destroy(); },
    });
  }

  // ───────────────────────────── level-up cards ─────────────────────────────

  private showCards(offers: Offer[]): void {
    this.hideCards();
    this.joy = null;
    this.shownOffers = offers;
    this.cardsReadyAt = this.time.now + 300; // guard against accidental clicks
    const { width: W, height: H } = this.scale;
    const s = this.s;
    const w = this.game_.world;
    const c = this.add.container(0, 0).setDepth(100);
    c.add(this.add.rectangle(0, 0, W, H, 0x05060c, 0.72).setOrigin(0).setInteractive());
    const isBoss = w.pendingBossRewards > 0;
    c.add(text(this, W / 2, 70 * s, isBoss ? '★ PHẦN THƯỞNG BOSS ★' : `LÊN CẤP!  Lv ${w.level}`, 46 * s, isBoss ? '#ffd040' : '#ffffff').setOrigin(0.5));
    c.add(text(this, W / 2, 112 * s, 'Chọn 1 nâng cấp  (phím 1 · 2 · 3 hoặc chạm)', 20 * s, COLORS.dim).setOrigin(0.5));

    const portrait = W < H * 0.9;
    const cw = portrait ? Math.min(W - 32, 460) : Math.min(270 * s, (W - 80) / 3);
    const ch = portrait ? Math.min(150 * s, (H - 200 * s) / 3 - 12) : 330 * s;
    const gap = 16 * s;
    offers.forEach((o, i) => {
      const x = portrait ? (W - cw) / 2 : W / 2 - (cw * 3 + gap * 2) / 2 + i * (cw + gap);
      const y = portrait ? 140 * s + i * (ch + gap) : 150 * s;
      const card = this.add.container(x, y);
      const col = RARITY_COLOR[o.rarity];
      const bg = this.add.graphics();
      const draw = (hover: boolean) => {
        bg.clear();
        bg.fillStyle(0x000000, 0.5).fillRect(6, 8, cw, ch);
        bg.fillStyle(hover ? 0x2c3350 : 0x1c2134, 1).fillRect(0, 0, cw, ch);
        bg.fillStyle(col, 0.22).fillRect(0, 0, cw, 30 * s);
        bg.lineStyle(hover ? 5 : 3, col, 1).strokeRect(1.5, 1.5, cw - 3, ch - 3);
      };
      draw(false);
      card.add(bg);
      card.add(text(this, cw / 2, 15 * s, `[${i + 1}]  ${RARITY_LABEL[o.rarity]}`, 18 * s, '#' + col.toString(16).padStart(6, '0')).setOrigin(0.5));
      const pokemonSprite = o.kind === 'pokemon' ? POKEMON.get(o.pokemonId)?.sprite : undefined;
      // skill upgrade cards show that move's own pixel icon
      const skillDef = o.kind === 'skill' ? this.game_.world.allies.find((a) => a.id === o.unitUid)?.skills[o.slot]?.def : undefined;
      const iconKey = pokemonSprite ?? (skillDef ? moveAssets(skillDef).icon : this.textures.exists(o.icon) ? o.icon : 'icon_' + o.icon);
      const ix = portrait ? 50 * s : cw / 2, iy = portrait ? ch / 2 + 10 * s : 90 * s;
      const isCreature = !!pokemonSprite || o.kind === 'evolve';
      const tex = this.textures.exists(iconKey) ? iconKey : 'icon_skill';
      const icon = this.add.image(ix, iy, tex).setScale(isCreature ? fitScale(this, tex, 72 * s) : skillDef ? Math.max(1, Math.round(4 * s)) : 5 * s);
      card.add(icon);
      this.tweens.add({ targets: icon, y: iy - 5, yoyo: true, repeat: -1, duration: 500 + i * 60, ease: 'Sine.inOut' });
      const tx = portrait ? 100 * s : cw / 2;
      const ox = portrait ? 0 : 0.5;
      const wrap = portrait ? cw - 110 * s : cw - 24 * s;
      card.add(text(this, tx, portrait ? 36 * s : 140 * s, o.title, 28 * s, '#ffffff').setOrigin(ox, 0));
      card.add(text(this, tx, portrait ? 66 * s : 178 * s, o.description, 19 * s, '#d8def0').setOrigin(ox, 0).setWordWrapWidth(wrap).setAlign(portrait ? 'left' : 'center'));
      card.add(text(this, tx, portrait ? ch - 26 * s : ch - 40 * s, o.preview, 17 * s, '#9fe0a0').setOrigin(ox, 0).setWordWrapWidth(wrap).setAlign(portrait ? 'left' : 'center'));
      const zone = this.add.zone(0, 0, cw, ch).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => draw(true));
      zone.on('pointerout', () => draw(false));
      zone.on('pointerup', () => this.pick(i));
      card.add(zone);
      card.setAlpha(0).setY(y + 30);
      this.tweens.add({ targets: card, alpha: 1, y, duration: 220, delay: i * 70, ease: 'Back.out' });
      c.add(card);
    });
    this.cards = c;
  }

  private pick(i: number): void {
    if (!this.cards || this.time.now < this.cardsReadyAt) return;
    const w = this.game_.world;
    if (!w.currentOffers[i]) return;
    audio.play('click');
    if (w.chooseOffer(i)) {
      this.hideCards();
      // chained level-ups re-open next frame via update()
    }
  }

  private hideCards(): void {
    this.cards?.destroy();
    this.cards = null;
    this.shownOffers = null;
  }

  // ───────────────────────────── pause ─────────────────────────────

  showPause(show: boolean): void {
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    if (!show) return;
    this.joy = null;
    const { width: W, height: H } = this.scale;
    const s = this.s;
    const w = this.game_.world;
    const c = this.add.container(0, 0).setDepth(200);
    c.add(this.add.rectangle(0, 0, W, H, 0x05060c, 0.75).setOrigin(0).setInteractive());
    c.add(text(this, W / 2, H * 0.2, 'TẠM DỪNG', 56 * s, '#ffffff').setOrigin(0.5));
    const m = w.mods;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    c.add(text(this, W / 2, H * 0.2 + 52 * s,
      `Sát thương +${pct(m.dmgMult)} · Hồi chiêu -${pct(m.cdr)} · HP +${pct(m.hpMult)} · Phạm vi +${pct(m.areaMult)}\nChí mạng +${pct(m.critBonus)} · Tốc chạy +${pct(m.trainerSpeed)} · Nam châm +${pct(m.magnet)} · Năng lượng +${pct(m.energyRegen)} · Đạn +${m.extraProjectiles}`,
      18 * s, COLORS.dim).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 32));
    const bw = 300 * s, bh = 52 * s, by = H * 0.5;
    c.add(button(this, W / 2, by, bw, bh, '▶ Tiếp tục', () => this.game_.setPaused(false), 0x2f6a3a).container);
    const mus = button(this, W / 2 + bw * 0.26, by + bh + 14 * s, bw * 0.48, bh, `Nhạc: ${music.enabled ? 'BẬT' : 'TẮT'}`, () => { music.setEnabled(!music.enabled); saveStore.data.settings.music = music.enabled; void saveStore.save(); mus.setLabel(`Nhạc: ${music.enabled ? 'BẬT' : 'TẮT'}`); });
    c.add(mus.container);
    const snd = button(this, W / 2 - bw * 0.26, by + bh + 14 * s, bw * 0.48, bh, `Âm thanh: ${audio.enabled ? 'BẬT' : 'TẮT'}`, () => {
      audio.enabled = !audio.enabled;
      saveStore.data.settings.sfx = audio.enabled;
      void saveStore.save();
      snd.setLabel(`Âm thanh: ${audio.enabled ? 'BẬT' : 'TẮT'}`);
    });
    c.add(snd.container);
    const fps = button(this, W / 2, by + (bh + 14 * s) * 2, bw, bh, `Hiện FPS: ${saveStore.data.settings.showFps ? 'BẬT' : 'TẮT'}`, () => {
      saveStore.data.settings.showFps = !saveStore.data.settings.showFps;
      void saveStore.save();
      fps.setLabel(`Hiện FPS: ${saveStore.data.settings.showFps ? 'BẬT' : 'TẮT'}`);
    });
    c.add(fps.container);
    c.add(button(this, W / 2, by - bh - 12 * s, bw, bh, net.code ? `Co-op: ${net.code}` : 'Co-op cùng bạn', () => openCoopMenu(this, this.game_), 0x2f5a6a).container);
    c.add(button(this, W / 2, by + (bh + 14 * s) * 3, bw, bh, '✖ Bỏ cuộc', () => gameModes.toMenu(this), 0x6a2f2f).container);
    this.pauseLayer = c;
  }
}

function nextBoss(t: number): string {
  const times = [300, 600, 900];
  const n = times.find((x) => x > t);
  return n === undefined ? '—' : fmtTime(n - t);
}
