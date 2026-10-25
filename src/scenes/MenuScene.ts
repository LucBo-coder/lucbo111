import Phaser from 'phaser';
import { pmdPack } from '../render/pmdPack';
import { music } from '../systems/music';
import { getSkill, POKEMON } from '../core/data';
import { attributionLines } from '../systems/assets';
import { audio } from '../systems/audio';
import { gameModes } from '../systems/gameMode';
import { saveStore, SLOT_COUNT } from '../systems/save';
import { avatarTextureKey } from '../core/avatars';
import { fitScale, officialPack } from '../render/spriteRegistry';
import { playableSpecies } from '../core/data';
import { Campaign, newAdventure, QualitySetting, SlotSummary, starterEntry, survivorPool } from '../systems/saveSchema';
import { ITEM_DEFS } from '../core/evolution';
import { buyUpgrade, nextCost, PERM_UPGRADES, upgradeLevel } from '../core/permanentUpgrades';
import { regionDef } from '../core/map/regionDefs';
import { net } from '../net/session';
import { button, COLORS, fmtTime, panel, ROLE_LABEL, text, typeBadge, uiScale } from './ui';
import { openPlayerProfile } from './playerProfile';

import { GAME_VERSION } from '../version';
export { GAME_VERSION };

type View = 'home' | 'survivor' | 'settings' | 'credits' | 'slots' | 'confirm' | 'upgrades';
/** what the Load Game screen is opened for */
type SlotMode = 'load' | 'new';

export class MenuScene extends Phaser.Scene {
  private selected = 'charmander';
  private view: View = 'home';
  private page = 0;
  private slotMode: SlotMode = 'load';
  /** slot summaries (null = empty), refreshed every time the slot screen opens */
  private slots: (SlotSummary | null)[] = [];
  /** pending destructive action of the confirm view */
  private pending: { title: string; body: string; ok: string; run: () => void } | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.view = 'home';
    net.setProfile(saveStore.playerName, saveStore.avatar);
    this.build();
    this.scale.on('resize', this.rebuild, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.rebuild, this));
    // Enter: home → Survivor starter select → start
    this.input.keyboard?.on('keydown-ENTER', () => { if (this.view === 'survivor') this.startSurvivor(); else if (this.view === 'home') this.go('survivor'); });
    this.input.keyboard?.on('keydown-ESC', () => { if (this.view !== 'home') this.go('home'); });
  }

  update(): void {
    music.play('menu');
  }

  private go(v: View): void {
    this.view = v;
    this.rebuild();
  }

  private rebuild(): void {
    this.tweens.killAll();
    this.children.removeAll(true);
    this.build();
  }

  private startSurvivor(): void {
    audio.unlock();
    gameModes.start(this, 'survivor', { starter: this.selected });
  }

  /**
   * fresh = NEW GAME: the slot is wiped completely (collection, Pokédex, bag, money, quests, legendaries,
   * Survivor stats & unlocks…) — nothing carries over. Otherwise the active slot is continued.
   */
  async startAdventure(fresh: boolean, slot: number = saveStore.slot, campaign: Campaign = 'classic'): Promise<void> {
    audio.unlock();
    if (fresh) {
      await saveStore.newGame(slot);
      // the slot's journey: classic valley or Vietnam Odyssey (starts at Cà Mau)
      saveStore.data.adventure = newAdventure(campaign);
    }
    else if (slot !== saveStore.slot) await saveStore.loadSlot(slot);
    gameModes.start(this, 'adventure', { map: 'valley' });
  }

  /** Main-lobby profile editor: avatar picker + rename. Both are stored device-wide. */
  openProfile(): void {
    openPlayerProfile(this, () => this.rebuild());
  }

  /** Opens the slot screen (Load Game / New Game). */
  /** Campaign a "new game" from the slot screen starts */
  private newCampaign: Campaign = 'classic';

  async openSlots(mode: SlotMode, campaign: Campaign = this.newCampaign): Promise<void> {
    this.slotMode = mode;
    this.newCampaign = campaign;
    this.slots = await saveStore.listSlots();
    this.go('slots');
  }

  private confirm(title: string, body: string, ok: string, run: () => void): void {
    this.pending = { title, body, ok, run };
    this.go('confirm');
  }

  private build(): void {
    const { width: W, height: H } = this.scale;
    // portrait phones lay out in one column: scale against a narrow reference instead of 960 px
    const s = uiScale(W, H, (w, h) => (w < h ? Math.min(w / 470, h / 995, 1.4) : Math.min(w / 960, h / 640, 1.6)));
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.buildBackdrop(W, H, s);
    this.buildLogo(W, s);
    const sub = this.view === 'survivor' ? 'Chọn Pokémon khởi đầu' : this.view === 'upgrades' ? 'Nâng cấp vĩnh viễn (Sinh tồn)' : this.view === 'slots' ? (this.slotMode === 'new' ? (this.newCampaign === 'vietnam' ? 'Việt Nam Odyssey — chọn ô lưu' : 'Chơi mới — chọn ô lưu') : 'Tải game') : 'Auto-Battle Roguelite · Open World Adventure';
    text(this, W / 2, 96 * s, sub, 22 * s, '#c8d4f0').setOrigin(0.5);
    switch (this.view) {
      case 'home': return this.buildHome(W, H, s);
      case 'survivor': return this.buildSurvivor(W, H, s);
      case 'settings': return this.buildSettings(W, H, s);
      case 'credits': return this.buildCredits(W, H, s);
      case 'slots': return this.buildSlots(W, H, s);
      case 'upgrades': return this.buildUpgrades(W, H, s);
      case 'confirm': return this.buildConfirm(W, H, s);
    }
  }

  /** Animated title backdrop: night-to-dawn sky, twinkling stars, layered hills, a scrolling meadow with a Pokémon parade. */
  private buildBackdrop(W: number, H: number, s: number): void {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x0b1330, 0x0b1330, 0x2a4a66, 0x2a4a66, 1).fillRect(0, 0, W, H);
    for (let i = 0; i < 46; i++) {
      const x = (i * 197.3) % W, y = ((i * 89.7) % (H * 0.5));
      const star = this.add.rectangle(x, y, i % 5 ? 2 : 3, i % 5 ? 2 : 3, 0xffffff, 0.5 + (i % 3) * 0.15);
      this.tweens.add({ targets: star, alpha: 0.1, duration: 900 + (i % 7) * 300, yoyo: true, repeat: -1, delay: (i % 11) * 140 });
    }
    // two hill layers (sine silhouettes), the near one slightly brighter
    const hills = this.add.graphics();
    for (const [base, amp, col, k] of [[H * 0.66, 34 * s, 0x1b2f3e, 0.006], [H * 0.74, 26 * s, 0x1f4030, 0.011]] as const) {
      hills.fillStyle(col, 1).beginPath().moveTo(0, H);
      for (let x = 0; x <= W; x += 8) hills.lineTo(x, base - Math.sin(x * k + base) * amp - Math.sin(x * k * 2.7) * amp * 0.4);
      hills.lineTo(W, H).closePath().fillPath();
    }
    // meadow strip
    const gy = H * 0.8;
    const grass = this.add.tileSprite(0, gy, W, H - gy, 'ow_tiles', 0).setOrigin(0).setTileScale(3 * Math.max(0.7, s));
    this.tweens.add({ targets: grass, tilePositionX: 48, duration: 2400, repeat: -1 });
    this.add.rectangle(0, gy, W, 4, 0x6ac060, 0.9).setOrigin(0);
    // the parade: a few Pokémon of the active slot's Collection (or classics) walking across
    const owned = [...new Set(saveStore.data.collection.map((c) => c.species))].filter((sp) => POKEMON.has(sp) && !POKEMON.get(sp)!.mega);
    const parade = (owned.length >= 3 ? owned : ['pikachu', 'eevee', 'charmander', 'squirtle', 'bulbasaur', 'jigglypuff']).slice(0, 6);
    parade.forEach((sp, i) => {
      if (!this.textures.exists(sp + '_sheet')) return;
      const spr = this.add.sprite(-60 - i * 110 * s, gy + (H - gy) * 0.45 + (i % 2) * 8 * s, sp + '_sheet', 0).setScale(-fitScale(this, sp, 68 * s), fitScale(this, sp, 68 * s));
      if (this.anims.exists(sp + ':walk')) spr.play(sp + ':walk');
      this.tweens.add({ targets: spr, x: W + 60 + (parade.length - i) * 110 * s, duration: 16000 + i * 400, repeat: -1, delay: 0 });
    });
    // readability veil behind the content (lighter on the home screen)
    this.add.rectangle(0, 0, W, H, 0x05060c, this.view === 'home' ? 0.18 : 0.42).setOrigin(0);
  }

  private titleShown = false;

  /** Logo: slowly turning Poké Ball emblem, gold title with a soft float (bounces in the first time). */
  private buildLogo(W: number, s: number): void {
    const emb = this.add.container(W / 2, 46 * s);
    const ball = this.add.graphics();
    const r = 46 * s;
    ball.fillStyle(0xe03030, 0.22).slice(0, 0, r, Math.PI, 0, false).fillPath();
    ball.fillStyle(0xffffff, 0.16).slice(0, 0, r, 0, Math.PI, false).fillPath();
    ball.lineStyle(4 * s, 0x000000, 0.25).strokeCircle(0, 0, r).lineBetween(-r, 0, r, 0);
    ball.fillStyle(0xffffff, 0.25).fillCircle(0, 0, r * 0.22);
    emb.add(ball);
    this.tweens.add({ targets: emb, angle: 360, duration: 24000, repeat: -1 });
    const title = text(this, W / 2, 46 * s, 'POKÉMON SURVIVOR', 62 * s, '#ffd640').setOrigin(0.5);
    title.setStroke('#5a2a08', Math.max(4, Math.round(9 * s))).setShadow(0, 4 * s, '#000000', 0, true, true);
    if (!this.titleShown) {
      this.titleShown = true;
      title.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 520, ease: 'Back.out' });
    }
    this.tweens.add({ targets: title, y: 46 * s - 4 * s, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  /** Everything created since `from` (scene display list index) goes into one container that slides in. */
  private slideIn(from: number, delay: number, dy = 36): Phaser.GameObjects.Container {
    const objs = this.children.list.slice(from);
    const c = this.add.container(0, dy).setAlpha(0);
    c.add(objs);
    this.tweens.add({ targets: c, y: 0, alpha: 1, duration: 380, delay, ease: 'Cubic.out' });
    return c;
  }

  private modeCard(x: number, y: number, cw: number, ch: number, s: number, o: { title: string; edge: number; fill: number; band: number; color: string; desc: string; stats: string; statColor: string; art: () => void }): void {
    panel(this, x, y, cw, ch, o.edge, o.fill);
    // coloured title band
    const band = this.add.graphics();
    band.fillGradientStyle(o.band, o.band, o.fill, o.fill, 0.9).fillRect(x + 4, y + 4, cw - 8, 44 * s);
    text(this, x + cw / 2, y + 10 * s, o.title, 32 * s, o.color).setOrigin(0.5, 0);
    o.art();
    text(this, x + cw / 2, y + 136 * s, o.desc, 16 * s, '#c8d0e8').setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(cw - 28 * s);
    const st = this.add.graphics();
    st.fillStyle(0x000000, 0.28).fillRect(x + 14 * s, y + 182 * s, cw - 28 * s, 26 * s);
    text(this, x + cw / 2, y + 186 * s, o.stats, 15 * s, o.statColor).setOrigin(0.5, 0).setWordWrapWidth(cw - 32 * s).setAlign('center');
  }

  /** Main-lobby player card: avatar, name, current-save summary and the profile action. */
  private buildPlayerBar(x: number, y: number, w: number, h: number, s: number, portrait: boolean): void {
    const sv = saveStore.data;
    panel(this, x, y, w, h, 0xffcc33, 0x232a3e);
    // avatar: the chosen profile drawing inside a gold ring; tapping it opens the profile editor
    const r = Math.min(22 * s, h / 2 - 5 * s), ax = x + 10 * s + r, ay = y + h / 2;
    const av = this.add.graphics();
    av.fillStyle(0x0c0f1a, 1).fillCircle(ax, ay, r);
    av.lineStyle(2 * s, 0xffd040, 1).strokeCircle(ax, ay, r);
    av.lineStyle(1 * s, 0xffffff, 0.18).strokeCircle(ax, ay, r - 3 * s);
    const avatar = avatarTextureKey(saveStore.avatar);
    if (this.textures.exists(avatar)) {
      const tr = this.add.image(ax, ay - 1 * s, avatar).setScale(fitScale(this, avatar, 36 * s));
      this.tweens.add({ targets: tr, y: tr.y - 2 * s, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    // small pencil badge so the avatar reads as editable
    const bx = ax + r * 0.72, by = ay + r * 0.72;
    const badge = this.add.graphics();
    badge.fillStyle(0x0c0f1a, 1).fillCircle(bx, by, 8 * s);
    badge.lineStyle(1.5 * s, 0xffd040, 1).strokeCircle(bx, by, 8 * s);
    text(this, bx, by - 0.5 * s, '✎', 11 * s, '#ffe680').setOrigin(0.5);
    this.add.zone(ax, ay, r * 2 + 6 * s, r * 2 + 6 * s).setInteractive({ useHandCursor: true }).on('pointerup', () => this.openProfile());
    const bw = Math.min(132 * s, w * 0.34), bh = Math.min(36 * s, h - 18 * s);
    button(this, x + w - 10 * s - bw / 2, ay, bw, bh, '✎ Hồ sơ', () => this.openProfile(), 0x3a4260);
    const nx = x + 16 * s + r * 2 + 10 * s;
    const tw = w - (nx - x) - bw - 24 * s;
    text(this, nx, y + 6 * s, saveStore.playerName, 25 * s, '#ffe680').setWordWrapWidth(tw);
    const adv = sv.adventure;
    const parts = [`Ô ${saveStore.slot}`, `${sv.collection.length} Pokémon`];
    if (!portrait) {
      parts.push(`Pokédex ${sv.pokedex.caught.length}`);
      if (adv?.started) parts.push(fmtTime(adv.playTime));
    }
    parts.push(`${sv.currency} xu`);
    if (!portrait && sv.pvp) parts.push(`PvP ${sv.pvp.wins}–${sv.pvp.losses}`);
    text(this, nx, y + 34 * s, parts.join(' · '), 14 * s, '#a8b8d8').setWordWrapWidth(tw);
  }

  private buildHome(W: number, H: number, s: number): void {
    const sv = saveStore.data;
    const portrait = W < H;
    const cw = portrait ? Math.min(W - 24, 440 * s) : 390 * s, ch = 280 * s;
    const gap = 28 * s;
    // Player card (device profile) sits between the subtitle and the mode cards.
    const barW = portrait ? W - 24 : cw * 2 + gap, barH = 60 * s;
    let n0 = this.children.length;
    this.buildPlayerBar((W - barW) / 2, 106 * s, barW, barH, s, portrait);
    this.slideIn(n0, 0, 16);
    const top = 106 * s + barH + 12 * s;
    const pos = (i: number) => portrait ? { x: (W - cw) / 2, y: top + i * (ch + gap) } : { x: W / 2 - cw - gap / 2 + i * (cw + gap), y: top };

    // SURVIVOR card
    n0 = this.children.length;
    const a = pos(0);
    this.modeCard(a.x, a.y, cw, ch, s, {
      title: 'SINH TỒN', edge: 0xff7040, fill: 0x2a1c1c, band: 0x7a3020, color: '#ffc090',
      desc: 'Sống sót 15 phút trước làn sóng kẻ địch.\nLên cấp, chọn nâng cấp, hạ 3 Boss.',
      stats: `Kỷ lục ${fmtTime(sv.stats.bestTime)} · ${sv.stats.runs} trận · ${survivorPool(sv).length} Pokémon`, statColor: '#e0b090',
      art: () => ['charmander', 'squirtle', 'bulbasaur'].forEach((sp, i) => {
        const img = this.add.sprite(a.x + cw / 2 + (i - 1) * 80 * s, a.y + 94 * s, sp + '_sheet', 0).setScale(fitScale(this, sp, 76 * s));
        if (this.anims.exists(sp + ':walk')) img.play(sp + ':walk');
        this.tweens.add({ targets: img, y: img.y - 5 * s, duration: 600 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }),
    });
    button(this, a.x + cw / 2, a.y + ch - 36 * s, cw - 60 * s, 48 * s, '▶ CHƠI SINH TỒN', () => this.go('survivor'), 0x8a3a24);
    this.slideIn(n0, 60);

    // ADVENTURE card
    n0 = this.children.length;
    const b = pos(1);
    const adv = sv.adventure;
    const vnSlot = adv?.campaign === 'vietnam';
    const started = !!adv?.started && !vnSlot;
    this.modeCard(b.x, b.y, cw, ch, s, {
      title: 'PHIÊU LƯU', edge: 0x60d0ff, fill: 0x18242e, band: 0x1e5a78, color: '#b0ecff',
      desc: '6 vùng đất, 4 hầm ngục, 35 huyền thoại.\nThu phục, làm nhiệm vụ, chinh phục Rayquaza.',
      stats: started ? `Ô ${saveStore.slot} · ${sv.collection.length} Pokémon · Pokédex ${sv.pokedex.caught.length} · ${fmtTime(adv!.playTime)}` : vnSlot ? `Ô ${saveStore.slot} đang chơi Việt Nam Odyssey` : `Ô ${saveStore.slot} · chưa bắt đầu hành trình`, statColor: '#a0d8e8',
      art: () => {
        for (let i = 0; i < 5; i++) this.add.image(b.x + cw / 2 + (i - 2) * 50 * s, b.y + 96 * s, 'ow_tiles', [4, 16, 104, 16, 28][i]).setScale(3 * s);
        const avatarKey = avatarTextureKey(saveStore.avatar);
        const trKey = this.textures.exists(avatarKey) ? avatarKey : 'trainer_sheet';
        const tr = this.add.image(b.x + cw / 2, b.y + 98 * s, trKey, 0).setScale(fitScale(this, trKey, 58 * s));
        this.tweens.add({ targets: tr, y: tr.y - 4 * s, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      },
    });
    const third = (cw - 40 * s) / 3;
    if (started) button(this, b.x + 14 * s + third / 2, b.y + ch - 36 * s, third, 48 * s, '▶ Tiếp tục', () => void this.startAdventure(false), 0x1e6a8a);
    button(this, b.x + cw / 2 + (started ? 0 : -third / 2 - 3 * s), b.y + ch - 36 * s, third, 48 * s, 'Tải game', () => void this.openSlots('load'), 0x3a3a5a);
    button(this, b.x + cw - 14 * s - third / 2, b.y + ch - 36 * s, third, 48 * s, 'Chơi mới', () => void this.openSlots('new', 'classic'), started ? 0x3a3a5a : 0x1e6a8a);
    this.slideIn(n0, 160);

    // VIỆT NAM ODYSSEY strip: the special mode (own maps, story and progress per save slot)
    n0 = this.children.length;
    const sy = portrait ? top + 2 * (ch + gap) - gap / 2 : top + ch + 18 * s;
    const sw = portrait ? cw : cw * 2 + gap, sx = (W - sw) / 2, sh = 74 * s;
    panel(this, sx, sy, sw, sh, 0xffd040, 0x3a1c14);
    const flag = this.add.graphics();
    flag.fillStyle(0xda251d, 1).fillRect(sx + 12 * s, sy + 14 * s, 66 * s, 46 * s);
    const st = (cx: number, cy: number, r: number) => { const pts: Phaser.Math.Vector2[] = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.38 : r; pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)); } return pts; };
    flag.fillStyle(0xffde00, 1).fillPoints(st(sx + 45 * s, sy + 38 * s, 16 * s), true);
    text(this, sx + 90 * s, sy + 8 * s, 'VIỆT NAM ODYSSEY', 28 * s, '#ffe060');
    const vnStarted = vnSlot && !!adv?.started;
    const vnInfo = vnStarted ? `Ô ${saveStore.slot} · ${regionDef(adv!.region).name} · ${sv.collection.length} Pokémon · ${adv!.flags.filter((f) => f.startsWith('badge:')).length} huy hiệu` : 'Hành trình từ Mũi Cà Mau: Cà Mau → An Giang (bản thử nghiệm)';
    text(this, sx + 90 * s, sy + 40 * s, vnInfo, 15 * s, '#f0c8a0').setWordWrapWidth(sw - (portrait ? 100 : 380) * s);
    const vb = portrait ? 0 : 1;
    if (vb) {
      if (vnStarted) button(this, sx + sw - 250 * s, sy + sh / 2, 150 * s, 44 * s, '▶ Tiếp tục', () => void this.startAdventure(false), 0xa8322a);
      button(this, sx + sw - 88 * s, sy + sh / 2, 150 * s, 44 * s, 'Chơi mới', () => void this.openSlots('new', 'vietnam'), vnStarted ? 0x5a3a2a : 0xa8322a);
    } else {
      // portrait: the strip itself is the button row below
      if (vnStarted) button(this, sx + sw * 0.27, sy + sh + 28 * s, sw * 0.46, 40 * s, '▶ Tiếp tục VN', () => void this.startAdventure(false), 0xa8322a);
      button(this, sx + sw * (vnStarted ? 0.75 : 0.5), sy + sh + 28 * s, sw * 0.46, 40 * s, 'Chơi mới VN', () => void this.openSlots('new', 'vietnam'), 0xa8322a);
    }
    this.slideIn(n0, 220);

    // footer: secondary actions, version, tip
    n0 = this.children.length;
    const by = portrait ? sy + sh + 80 * s : sy + sh + 34 * s;
    const bw4 = Math.min(210 * s, (W - 60) / 4), gx = (i: number) => W / 2 + (i - 1.5) * (bw4 + 10 * s);
    button(this, gx(0), by, bw4, 42 * s, '⚙ Cài đặt', () => this.go('settings'), 0x2c3654);
    button(this, gx(1), by, bw4, 42 * s, '🌐 Chơi online', () => { audio.unlock(); gameModes.start(this, 'online', { entry: 'OnlineHub' }); }, 0x8a2f4a);
    button(this, gx(2), by, bw4, 42 * s, portrait ? '★ Nâng cấp' : '★ Nâng cấp vĩnh viễn', () => this.go('upgrades'), 0x6a5424);
    button(this, gx(3), by, bw4, 42 * s, portrait ? 'Thế giới online' : '🌐 Thế giới online', () => { audio.unlock(); this.scene.start('ServerWorld'); }, 0x28604e);
    text(this, 10, H - 8, '© Ghi công', 16 * s, '#a8b4d8').setOrigin(0, 1).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.go('credits'));
    text(this, W / 2, H - 20 * s, 'Pokémon tự chiến đấu — bạn di chuyển, chỉ huy và thu phục.  ·  Enter: Sinh tồn', 15 * s, '#a8b4d8').setOrigin(0.5).setWordWrapWidth(W - 120).setAlign('center');
    text(this, W - 10, H - 8, `v${GAME_VERSION}`, 14 * s, '#7a86a8').setOrigin(1, 1);
    this.slideIn(n0, 260, 20);
  }

  private buildSurvivor(W: number, H: number, s: number): void {
    const pool = survivorPool(saveStore.data, playableSpecies()).filter((id) => POKEMON.has(id));
    if (!pool.includes(this.selected)) this.selected = pool[0];
    const cols = W < H ? 2 : Math.min(5, Math.max(3, Math.ceil(pool.length / 2)));
    const cw = Math.min(210 * s, (W - 40) / cols - 10), ch = 150 * s;
    const top = 120 * s;
    const pages0 = pool.length > cols * 2 ? 2 : 1;
    const maxRows = Math.max(1, Math.floor((H - top - (pages0 > 1 ? 180 : 130) * s) / (ch + 10 * s)));
    const per = cols * maxRows, pages = Math.ceil(pool.length / per);
    this.page = Math.min(this.page, pages - 1);
    const shown = pool.slice(this.page * per, (this.page + 1) * per);
    const rows = Math.ceil(shown.length / cols);
    shown.forEach((id, i) => {
      const p = POKEMON.get(id)!;
      const x = W / 2 - (cols * (cw + 10 * s)) / 2 + (i % cols) * (cw + 10 * s) + 5 * s, y = top + Math.floor(i / cols) * (ch + 10 * s);
      const sel = id === this.selected;
      panel(this, x, y, cw, ch, sel ? COLORS.accent : COLORS.panelEdge, sel ? 0x2a3048 : COLORS.panel);
      const spr = this.add.sprite(x + 38 * s, y + 48 * s, id + '_sheet', 0).setScale(fitScale(this, id, 60 * s));
      spr.play(id + (sel ? ':walk' : ':idle'));
      text(this, x + 76 * s, y + 10 * s, p.name, 22 * s, sel ? '#ffe680' : COLORS.text);
      let bx = x + 76 * s;
      for (const t of p.types) { const b = typeBadge(this, bx, y + 38 * s, t, 12 * s); bx += b.width + 4; }
      text(this, x + 76 * s, y + 60 * s, ROLE_LABEL[p.role], 16 * s, COLORS.dim);
      text(this, x + 10 * s, y + 92 * s, p.skills.map((k) => getSkill(k).name).join(' · '), 14 * s, COLORS.dim).setWordWrapWidth(cw - 20 * s);
      // equipment of the Collection entry it starts from (held items work in Survivor too)
      const held = starterEntry(saveStore.data, id)?.held;
      if (held) text(this, x + 10 * s, y + ch - 24 * s, `Trang bị: ${ITEM_DEFS.get(held)?.name ?? held}`, 14 * s, '#ffd080').setWordWrapWidth(cw - 20 * s);
      const z = this.add.zone(x, y, cw, ch).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { audio.unlock(); audio.play('click'); if (this.selected === id) this.startSurvivor(); else { this.selected = id; this.rebuild(); } });
    });
    let by = top + Math.min(rows, maxRows) * (ch + 10 * s) + 30 * s;
    if (pages > 1) {
      button(this, W / 2 - 110 * s, by, 80 * s, 40 * s, '◀', () => { this.page = (this.page + pages - 1) % pages; this.rebuild(); });
      text(this, W / 2, by, `Trang ${this.page + 1}/${pages}`, 20 * s).setOrigin(0.5);
      button(this, W / 2 + 110 * s, by, 80 * s, 40 * s, '▶', () => { this.page = (this.page + 1) % pages; this.rebuild(); });
      by += 54 * s;
    }
    button(this, W / 2 + 130 * s, by, 240 * s, 52 * s, '▶ BẮT ĐẦU', () => this.startSurvivor(), 0x2f6a3a);
    button(this, W / 2 - 130 * s, by, 200 * s, 52 * s, '← Quay lại', () => this.go('home'));
    text(this, W / 2, by + 46 * s, 'Pokémon bắt được ở chế độ Phiêu lưu cũng xuất hiện ở đây. Đạt 10:00 hoặc hạ 2 Boss để mang Pokémon chiêu mộ được về Bộ sưu tập (Lv5).', 15 * s, COLORS.dim).setOrigin(0.5, 0).setWordWrapWidth(W - 40).setAlign('center');
  }

  private buildSettings(W: number, H: number, s: number): void {
    const set = saveStore.data.settings;
    const x = W / 2;
    text(this, x, 140 * s, 'Chất lượng đồ họa', 24 * s).setOrigin(0.5);
    (['low', 'medium', 'high'] as QualitySetting[]).forEach((q, i) => {
      button(this, x + (i - 1) * 180 * s, 190 * s, 170 * s, 44 * s, { low: 'Thấp', medium: 'Trung bình', high: 'Cao' }[q], () => { set.quality = q; void saveStore.save(); this.rebuild(); }, set.quality === q ? 0x4a6a3a : 0x2c3654);
    });
    const mus = button(this, x + 82 * s, 270 * s, 156 * s, 44 * s, `Nhạc: ${music.enabled ? 'BẬT' : 'TẮT'}`, () => { music.setEnabled(!music.enabled); saveStore.data.settings.music = music.enabled; void saveStore.save(); mus.setLabel(`Nhạc: ${music.enabled ? 'BẬT' : 'TẮT'}`); });
    void mus;
    const snd = button(this, x - 82 * s, 270 * s, 156 * s, 44 * s, `Âm thanh: ${audio.enabled ? 'BẬT' : 'TẮT'}`, () => {
      audio.enabled = !audio.enabled; set.sfx = audio.enabled; void saveStore.save(); snd.setLabel(`Âm thanh: ${audio.enabled ? 'BẬT' : 'TẮT'}`);
    });
    const fps = button(this, x, 324 * s, 320 * s, 44 * s, `Hiện FPS: ${set.showFps ? 'BẬT' : 'TẮT'}`, () => {
      set.showFps = !set.showFps; void saveStore.save(); fps.setLabel(`Hiện FPS: ${set.showFps ? 'BẬT' : 'TẮT'}`);
    });
    const g1 = button(this, x, 378 * s, 420 * s, 44 * s, `Sinh tồn: toàn bộ Gen 1 — ${set.gen1Survivor ? 'BẬT' : 'TẮT'}`, () => {
      set.gen1Survivor = !set.gen1Survivor; void saveStore.save(); g1.setLabel(`Sinh tồn: toàn bộ Gen 1 — ${set.gen1Survivor ? 'BẬT' : 'TẮT'}`);
    });
    if (pmdPack.available) {
      button(this, x, 486 * s, 420 * s, 40 * s, `Hoạt ảnh PMD 8 hướng (cá nhân): ${set.pmdSprites !== false ? 'BẬT' : 'TẮT'}`, () => {
        set.pmdSprites = set.pmdSprites === false; void saveStore.save().then(() => location.reload());
      });
    }
    if (officialPack.available) {
      button(this, x, 432 * s, 420 * s, 44 * s, `Sprite chính thức (cá nhân): ${set.officialSprites ? 'BẬT' : 'TẮT'}`, () => {
        set.officialSprites = !set.officialSprites; set.officialChosen = true; void saveStore.save().then(() => location.reload());
      });
      text(this, x, 466 * s, 'Đổi sprite sẽ tải lại trang. Gói nằm ở public/assets/official (không đưa lên git / không chia sẻ).', 15 * s, COLORS.dim).setOrigin(0.5, 0).setWordWrapWidth(W - 40).setAlign('center');
    } else {
      text(this, x, 432 * s, 'Sprite chính thức: chưa có gói — chạy  node scripts/fetch-official-sprites.mjs  (dùng cá nhân)', 15 * s, COLORS.dim).setOrigin(0.5, 0).setWordWrapWidth(W - 40).setAlign('center');
    }
    button(this, x, Math.min(H - 50 * s, 560 * s), 240 * s, 46 * s, '← Quay lại', () => this.go('home'));
  }

  private buildCredits(W: number, H: number, s: number): void {
    const lines = [
      'ĐỒ HỌA MÔI TRƯỜNG',
      ...attributionLines(),
      '',
      'DỮ LIỆU POKÉMON: PokéAPI (pokeapi.co) — cache cục bộ, theo Fair Use Policy',
      'Sprite Pokémon, HLV, hiệu ứng, âm thanh: vẽ/tổng hợp bằng code (nguyên bản)',
      'Font: VT323 (SIL Open Font License)',
      '',
      ...(pmdPack.available ? ['Hoạt ảnh Pokémon (gói cá nhân): PMDCollab SpriteCollab — CC BY-NC 4.0, nhiều họa sĩ (nút bên dưới)'] : []),
      'Dự án fan phi thương mại. Pokémon và tên các Pokémon là thương hiệu của',
      'Nintendo / Game Freak / The Pokémon Company.' + (pmdPack.available || officialPack.available ? ' Gói ảnh cá nhân: không chia sẻ.' : ' Không dùng hình ảnh chính thức.'),
    ];
    panel(this, W / 2 - Math.min(W - 24, 760 * s) / 2, 130 * s, Math.min(W - 24, 760 * s), 330 * s);
    lines.forEach((l, i) => text(this, W / 2, 150 * s + i * 30 * s, l, (i === 0 ? 22 : 17) * s, i === 0 ? '#ffe080' : COLORS.text).setOrigin(0.5, 0).setWordWrapWidth(W - 48));
    button(this, W / 2 - (pmdPack.available ? 140 * s : 0), Math.min(H - 50 * s, 500 * s), 240 * s, 46 * s, '← Quay lại', () => this.go('home'));
    // CC BY-NC attribution: the full list of SpriteCollab artists of the PMD pack
    if (pmdPack.available) button(this, W / 2 + 140 * s, Math.min(H - 50 * s, 500 * s), 260 * s, 46 * s, 'Họa sĩ SpriteCollab', () => window.open('assets/pmd/CREDITS.md', '_blank'), 0x3a4a6a);
  }

  private buildUpgrades(W: number, H: number, s: number): void {
    const sv = saveStore.data;
    const cw = Math.min(W - 32, 720 * s), rh = Math.min(62 * s, (H - 280 * s) / PERM_UPGRADES.length - 6 * s);
    const x = (W - cw) / 2, top = 128 * s;
    text(this, W / 2, top - 8 * s, `Xu: ${sv.currency}  ·  áp dụng cho mọi trận Sinh tồn của ô ${saveStore.slot}`, 18 * s, '#ffe080').setOrigin(0.5, 1);
    PERM_UPGRADES.forEach((u, i) => {
      const y = top + 6 * s + i * (rh + 6 * s);
      const lv = upgradeLevel(sv.permanentUpgrades, u.id), cost = nextCost(sv.permanentUpgrades, u.id);
      panel(this, x, y, cw, rh, lv >= u.max ? 0xffd640 : COLORS.panelEdge, COLORS.panel);
      text(this, x + 14 * s, y + 6 * s, `${u.name}  ${'■'.repeat(lv)}${'□'.repeat(u.max - lv)}`, 20 * s);
      text(this, x + 14 * s, y + rh - 22 * s, u.description, 14 * s, COLORS.dim);
      const can = cost != null && sv.currency >= cost;
      button(this, x + cw - 90 * s, y + rh / 2, 160 * s, rh - 16 * s, cost == null ? 'Tối đa' : `${cost} xu`, () => {
        if (!buyUpgrade(sv, u.id)) { audio.play('hurt'); return; }
        audio.play('levelup');
        void saveStore.save();
        this.rebuild();
      }, can ? 0x2f6a3a : 0x3a3a54);
    });
    const by = top + 6 * s + PERM_UPGRADES.length * (rh + 6 * s) + 26 * s;
    button(this, W / 2, by, 220 * s, 44 * s, '← Quay lại', () => this.go('home'));
  }

  private buildSlots(W: number, H: number, s: number): void {
    const cw = Math.min(W - 32, 720 * s), rh = Math.min(118 * s, (H - 260 * s) / SLOT_COUNT - 10 * s);
    const x = (W - cw) / 2;
    const top = 124 * s;
    for (let n = 1; n <= SLOT_COUNT; n++) {
      const sum = this.slots[n - 1] ?? null;
      const y = top + (n - 1) * (rh + 10 * s);
      const active = n === saveStore.slot;
      panel(this, x, y, cw, rh, active ? COLORS.accent : COLORS.panelEdge, active ? 0x2a3048 : COLORS.panel);
      text(this, x + 16 * s, y + 10 * s, `Ô ${n}${active ? '  (đang dùng)' : ''}`, 24 * s, active ? '#ffe680' : COLORS.text);
      if (sum) {
        const when = sum.savedAt ? new Date(sum.savedAt).toLocaleString('vi-VN') : '—';
        text(this, x + 16 * s, y + 40 * s, `${sum.campaign === 'vietnam' ? '[Việt Nam] ' : ''}${regionDef(sum.region).name} · ${fmtTime(sum.playTime)} · lưu lúc ${when}`, 16 * s, COLORS.dim).setWordWrapWidth(cw - 200 * s);
        text(this, x + 16 * s, y + 62 * s, `${sum.collection} Pokémon · Pokédex ${sum.caught} · ${sum.badges} huyền thoại · ${sum.money} xu · ${sum.runs} trận Sinh tồn`, 15 * s, '#90c0d0').setWordWrapWidth(cw - 200 * s);
        sum.party.slice(0, 6).forEach((sp, i) => {
          if (this.textures.exists(sp + '_sheet')) this.add.sprite(x + 34 * s + i * 44 * s, y + rh - 18 * s, sp + '_sheet', 0).setScale(fitScale(this, sp, 40 * s));
        });
      } else text(this, x + 16 * s, y + 44 * s, 'Trống', 18 * s, COLORS.dim);
      const bx = x + cw - 90 * s;
      if (this.slotMode === 'load') {
        if (sum) {
          button(this, bx, y + rh / 2 - 22 * s, 150 * s, 38 * s, '▶ Tải', () => void this.loadSlot(n, sum), 0x2a5a7a);
          button(this, bx, y + rh / 2 + 22 * s, 150 * s, 38 * s, 'Xóa', () => this.confirm(`Xóa ô ${n}?`, 'Toàn bộ dữ liệu của ô này bị xóa vĩnh viễn. Không thể hoàn tác.', 'Xóa', () => void saveStore.deleteSlot(n).then(() => this.openSlots('load'))), 0x7a3a2a);
        } else button(this, bx, y + rh / 2, 150 * s, 38 * s, 'Chơi mới ở đây', () => void this.startAdventure(true, n, this.newCampaign), 0x2a5a7a);
      } else {
        button(this, bx, y + rh / 2, 150 * s, 42 * s, sum ? 'Ghi đè' : '▶ Chơi mới', () => {
          if (!sum) { void this.startAdventure(true, n, this.newCampaign); return; }
          this.confirm(`Chơi mới ở ô ${n}?`,
            'Mọi thứ trong ô này bị XÓA SẠCH và bắt đầu lại từ đầu:\nPokémon, Pokédex, túi đồ, tiền, nhiệm vụ, trạm, huyền thoại, trứng,\nthành tích & Pokémon mở khóa của Sinh tồn. Không thể hoàn tác.',
            'Xóa & chơi mới', () => void this.startAdventure(true, n, this.newCampaign));
        }, sum ? 0x7a3a2a : 0x2a5a7a);
      }
    }
    const by = top + SLOT_COUNT * (rh + 10 * s) + 24 * s;
    button(this, W / 2 - 130 * s, by, 220 * s, 44 * s, '← Quay lại', () => this.go('home'));
    button(this, W / 2 + 130 * s, by, 220 * s, 44 * s, this.slotMode === 'load' ? 'Chơi mới…' : 'Tải game…', () => void this.openSlots(this.slotMode === 'load' ? 'new' : 'load'), 0x3a3a54);
    text(this, W / 2, by + 34 * s, 'Cài đặt (đồ họa, âm thanh, sprite) dùng chung cho mọi ô. Tiến trình Sinh tồn thuộc về ô đang dùng.', 14 * s, COLORS.dim).setOrigin(0.5, 0).setWordWrapWidth(W - 40).setAlign('center');
  }

  /** Load: a slot with a started adventure goes straight in, a Survivor-only slot just becomes active. */
  private async loadSlot(n: number, sum: SlotSummary): Promise<void> {
    if (sum.adventureStarted) { await this.startAdventure(false, n); return; }
    await saveStore.loadSlot(n);
    this.go('home');
  }

  private buildConfirm(W: number, H: number, s: number): void {
    const p = this.pending;
    if (!p) { this.go('home'); return; }
    panel(this, W / 2 - 300 * s, H / 2 - 120 * s, 600 * s, 240 * s, 0xff8060);
    text(this, W / 2, H / 2 - 90 * s, p.title, 28 * s).setOrigin(0.5);
    text(this, W / 2, H / 2 - 30 * s, p.body, 16 * s, COLORS.dim).setOrigin(0.5).setAlign('center').setWordWrapWidth(560 * s);
    button(this, W / 2 - 140 * s, H / 2 + 70 * s, 220 * s, 46 * s, 'Hủy', () => void this.openSlots(this.slotMode));
    button(this, W / 2 + 140 * s, H / 2 + 70 * s, 240 * s, 46 * s, p.ok, () => { this.pending = null; p.run(); }, 0x7a3a2a);
  }
}
