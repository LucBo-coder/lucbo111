import Phaser from 'phaser';
import { openCoopMenu } from './coopMenu';
import { coopSession } from '../net/coop';
import { music } from '../systems/music';
import { BossHUDController } from '../ui/BossHUDController';
import cache from '../data/pokeapi/pokeapi-cache.json';
import fakemon from '../data/fakemon.json';
import { ITEMS } from '../adventure/AdventureState';
import { BALL_ORDER, BALLS, BallId } from '../core/capture';
import { getSkill, POKEMON } from '../core/data';
import { chunkCols, chunkRows } from '../core/map/mapProvider';
import { TILE_PX } from '../core/map/tiles';
import { levelProgress, OwnedPokemon } from '../core/progression';
import { CANDY_DEFS, candyDef, maxUsefulCandy, previewCandy } from '../core/candy';
import { evolutionsOf, ITEM_DEFS, MEGA_DURATION, megaFormsOf, missingConditions } from '../core/evolution';
import { skillUnlockLevel, unlockedSkills } from '../core/learnset';
import { ECOLOGY, RARITY_LABEL, REGIONS as ENC_REGIONS } from '../core/encounters';
import { REGION_DEFS } from '../core/map/regionDefs';
import { passportPages, ProvincePage, VN_PROVINCES } from '../adventure/passport';
import { LEGENDS } from '../core/legends';
import { EVENT_DEFS } from '../core/worldEvents';
import { individualOf } from '../core/progression';
import { Individual, NATURES, STAT_KEYS, StatKey } from '../core/stats';
import { EV_MAX_STAT, EV_MAX_TOTAL, evTotal } from '../core/ev';
import { moveAssets } from '../render/moveAssets';
import { loadFront, loadShinyFront, shinyKey } from '../render/lazyCreatures';
import { calcStats } from '../core/stats';
import { sheetKey } from '../render/animation';
import { bar, hpColor } from '../render/WorldRenderer';
import { audio } from '../systems/audio';
import { pokemonData, SpeciesData } from '../systems/pokemonDataProvider';
import { saveStore } from '../systems/save';
import { fitScale, itemIconKey, officialPack } from '../render/spriteRegistry';
import type { QualitySetting } from '../systems/saveSchema';
import { AdventureScene, COMMANDS } from './AdventureScene';
import { askText, button, COLORS, fmtTime, panel, RARITY_COLOR, ROLE_LABEL, text, TYPE_COLOR, typeBadge, DPR, uiScale } from './ui';
import { net } from '../net/session';
import { ShopOptions, ShopWindow } from './shopUI';
import { defaultLinkKind } from '../net/transport';

const STAT_VI: Record<string, string> = { hp: 'HP', atk: 'Công', def: 'Thủ', spa: 'Công ĐB', spd: 'Thủ ĐB', spe: 'Tốc' };

export interface DialogueChoice {
  label: string;
  value: string;
  disabled?: boolean;
}
const WEATHER_LABEL: Record<string, string> = {
  rain: 'Mưa', fog: 'Sương mù', thunderstorm: 'Giông sét!', blizzard: 'Bão tuyết!', heatwave: 'Sóng nhiệt!', heavyRain: 'Mưa xối xả!', mysticFog: 'Sương huyền bí!',
};
const BIOME_VI: Record<string, string> = { meadow: 'Đồng cỏ', forest: 'Rừng', lake: 'Hồ', rocky: 'Đồi đá', ruins: 'Tàn tích', farm: 'Nông trại', snow: 'Vùng tuyết', volcano: 'Núi lửa' };
const LEGEND_KIND_VI: Record<string, string> = { shrine: 'Điện thờ', roaming: 'Lang thang', gift: 'Gặp gỡ đặc biệt', egg: 'Nở từ trứng' };
const EVENT_COLOR: Record<string, number> = { outbreak: 0xffe060, alpha: 0xff6050, migration: 0x80d0ff, weather: 0xa0b0ff, ambush: 0xffa060, treasure: 0xffd080, distortion: 0xd080ff, merchant: 0x60e0a0, meteor: 0xfff0a0 };
const EVENT_NAME: Record<string, string> = Object.fromEntries(Object.entries(EVENT_DEFS).map(([k, v]) => [k, v.name]));
const EVENT_HINT: Record<string, string> = {
  outbreak: 'Đánh bại / thu phục 6 con cùng loài', alpha: 'Pokémon cực mạnh — hạ gục hoặc thu phục (khó bắt gấp đôi)', migration: 'Đàn Pokémon hiếm đang di chuyển — đuổi theo!',
  weather: 'Thời tiết thay đổi Pokémon xuất hiện & sức mạnh đòn', ambush: 'Đánh bại cả đội của huấn luyện viên', treasure: 'Hạ Pokémon canh giữ rồi mở rương (E)', distortion: 'Hạ 5 Pokémon trong vùng biến dạng',
  merchant: 'Tìm thương nhân (E) — hàng hiếm giảm 30%, số lượng có hạn', meteor: 'Nhặt các mảnh sao rơi (E) trước khi chúng tắt',
};
const REGION_NAMES: Record<string, string> = Object.fromEntries([...ENC_REGIONS.values()].map((r) => [r.id, r.name]));
type MenuTab = 'party' | 'pc' | 'dex' | 'bag' | 'quests' | 'events' | 'map' | 'passport' | 'settings';
const TABS: { id: MenuTab; label: string; key: string }[] = [
  { id: 'party', label: 'Đội hình', key: 'Tab' },
  { id: 'pc', label: 'PC', key: 'O' },
  { id: 'dex', label: 'Pokédex', key: 'X' },
  { id: 'bag', label: 'Túi đồ', key: 'I' },
  { id: 'quests', label: 'Nhiệm vụ', key: 'J' },
  { id: 'events', label: 'Sự kiện', key: 'V' },
  { id: 'map', label: 'Bản đồ', key: 'M' },
  { id: 'passport', label: 'Hộ chiếu', key: 'P' },
  { id: 'settings', label: 'Cài đặt', key: 'Esc' },
];
// Overworld maps (valley hub + regions behind portals); unlock = the valley portal's story flags
const REGIONS = [
  { id: 'starter-valley', name: 'Thung Lũng Khởi Nguyên', need: [] as string[], hint: '' },
  ...(REGION_DEFS['starter-valley'].portals ?? []).map((p) => ({ id: p.to, name: REGION_DEFS[p.to]?.name ?? p.to, need: p.requires ?? [], hint: p.hint ?? '' })),
];
// Vietnam Odyssey provinces (playable so far + the next one on the route)
const VN_REGIONS = VN_PROVINCES.map((p) => REGION_DEFS[p.id] ? p : { ...p, need: ['vn:not-in-this-version'], hint: 'chưa có trong phiên bản này' });
const SPECIES = { ...(cache.species as unknown as Record<string, SpeciesData>), ...(fakemon as unknown as Record<string, SpeciesData>) };
const MOVES = (cache as unknown as { moves: Record<string, { power: number | null; accuracy: number | null; shortEffect: string }> }).moves;

export class AdventureUI extends Phaser.Scene {
  private adv!: AdventureScene;
  private s = 1;
  private hud!: Phaser.GameObjects.Graphics;
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private partyIcons: Phaser.GameObjects.Image[] = [];
  /** per party row: slot frame (UI pack), ball badge, tap zone (summon / recall) */
  private partyRows: { frame: Phaser.GameObjects.Image | null; ball: Phaser.GameObjects.Image; zone: Phaser.GameObjects.Zone }[] = [];
  private miniG!: Phaser.GameObjects.Graphics;
  private banners: Phaser.GameObjects.Text[] = [];
  private dialogueLayer: Phaser.GameObjects.Container | null = null;
  private menu: Phaser.GameObjects.Container | null = null;
  /** the open Poké Mart / merchant window */
  shop: ShopWindow | null = null;
  private menuTab: MenuTab | null = null;
  private joy: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  private joyG!: Phaser.GameObjects.Graphics;
  private touch = false;
  private frame = 0;
  private miniBox = { x: 0, y: 0, w: 0, h: 0 };
  private selected: { party?: string; dex?: string; quest?: string } = {};
  private mapView = { zoom: 1, ox: 0, oy: 0 };
  private dexStatus = '';
  private dexPage = 0;
  private partyPage = 0;
  private questPage = 0;
  /** the HUD is laid out for a portrait phone */
  private portraitHud = false;
  /** the open menu is laid out for a portrait phone (stacked columns) */
  private portraitMenu = false;
  private bagPage = 0;
  private passportPage = 0;
  // PC storage browser
  private pcBox = 0;
  private pcSelected: string | null = null;
  private pcMoveUid: string | null = null;
  private pcFilter: 'all' | 'favorite' | 'shiny' = 'all';
  private pcQuery = '';
  private pcResultPage = 0;
  private pcSort: 'level' | 'name' | 'recent' | 'favorite' = 'level';
  // candy dialog
  private candyDialog: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('AdvUI');
  }

  init(data: { adv: AdventureScene }): void {
    this.adv = data.adv;
    this.dialogueLayer = null;
    this.menu = null;
    this.menuTab = null;
    this.joy = null;
    this.banners = [];
    this.partyIcons = [];
    this.texts = {};
  }

  bossHud: BossHUDController | null = null;
  private envTint: Phaser.GameObjects.Rectangle | null = null;

  create(): void {
    this.touch = this.sys.game.device.input.touch;
    this.build();
    this.scale.on('resize', this.rebuild, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.rebuild, this));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      audio.unlock();
      if (over.length || this.menu || this.dialogueLayer || this.joy) return;
      this.joy = { id: p.id, bx: p.x, by: p.y, x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (this.joy && p.id === this.joy.id) { this.joy.x = p.x; this.joy.y = p.y; } });
    const rel = (p: Phaser.Input.Pointer) => { if (this.joy && p.id === this.joy.id) this.joy = null; };
    this.input.on('pointerup', rel);
    this.input.on('pointerupoutside', rel);
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (this.menuTab !== 'bag' || !this.menu || dy === 0) return;
      this.bagPage = Math.max(0, this.bagPage + (dy > 0 ? 1 : -1));
      this.openMenu('bag');
    });
  }

  private rebuild(): void {
    const tab = this.menuTab;
    this.children.removeAll(true);
    this.dialogueLayer = null;
    this.menu = null;
    this.menuTab = null;
    this.banners = [];
    this.partyIcons = [];
    this.partyRows = [];
    this.texts = {};
    this.build();
    if (tab) this.openMenu(tab);
  }

  private build(): void {
    const { width: W, height: H } = this.scale;
    this.bossHud = new BossHUDController(this);
    // full-screen tint while a regional event runs (blizzard white-out, eruption glow)
    this.envTint = this.add.rectangle(0, 0, W, H, 0xffffff, 0).setOrigin(0).setDepth(-10);
    const s = (this.s = uiScale(W, H, (w, h) => Phaser.Math.Clamp(h > w ? Math.min(w / 620, h / 1000) : Math.min(w / 1100, h / 680), 0.55, 1.4)));
    this.hud = this.add.graphics();
    const T = (k: string, x: number, y: number, size: number, color: string = COLORS.text) => (this.texts[k] = text(this, x, y, '', size * s, color));
    T('hp', 16 * s, 12 * s, 18);
    T('clock', W / 2, 8 * s, 26).setOrigin(0.5, 0);
    T('area', W / 2, 40 * s, 18, COLORS.dim).setOrigin(0.5, 0);
    T('quest', 0, 0, 18, '#ffe680');
    T('obj', 0, 0, 16, '#e8ecff');
    T('events', 0, 0, 15, '#f0d8ff');
    T('balls', 0, 0, 18);
    T('cmd', 0, 0, 16, '#a0d8ff');
    T('prompt', W / 2, H - 90 * s, 22, '#ffffff').setOrigin(0.5);
    T('chance', 0, 0, 18, '#ffe040').setOrigin(0.5);
    T('perf', 10, H - 8, 15, '#a0ffa0').setOrigin(0, 1);
    T('boss', W / 2, H - 58 * s, 22, '#ffb0a0').setOrigin(0.5, 1);
    T('mega', 0, 0, 18, '#ffb0ff').setOrigin(0.5, 0);
    T('money', 16 * s, H - 78 * s, 18, '#ffe066');
    T('online', W / 2, 62 * s, 16, '#ffd0a0').setOrigin(0.5, 0);

    // Minimap (whole-region thumbnail with fog of war)
    const key = this.ensureMapTexture();
    const mw = Math.round(170 * s), mh = Math.round((mw * this.adv.map.heightTiles) / this.adv.map.widthTiles);
    this.miniBox = { x: W - mw - 12 * s, y: 12 * s, w: mw, h: mh };
    panel(this, this.miniBox.x - 4, this.miniBox.y - 4, mw + 8, mh + 8, COLORS.panelEdge, 0x0c1a10, 0.9);
    this.add.image(this.miniBox.x, this.miniBox.y, key).setOrigin(0).setDisplaySize(mw, mh);
    this.miniG = this.add.graphics();
    const mz = this.add.zone(this.miniBox.x, this.miniBox.y, mw, mh).setOrigin(0).setInteractive({ useHandCursor: true });
    mz.on('pointerup', () => this.openMenu('map'));

    // Buttons (always clickable; bigger action cluster on touch devices)
    const by = this.miniBox.y + mh + 26 * s;
    const small: [string, () => void][] = [['≡', () => this.toggleMenu('settings')], ['Đội', () => this.toggleMenu('party')], ['Q', () => this.toggleMenu('quests')], ['Túi', () => this.toggleMenu('bag')]];
    small.forEach(([l, fn], i) => button(this, W - 30 * s - i * 54 * s, by, 48 * s, 36 * s, l, fn));
    // portrait phones: the HP bar and the minimap fill the top row, so the clock sits left of the buttons and the
    // area name under them (the quest tracker moves down one line)
    this.portraitHud = H > W * 1.15;
    if (this.portraitHud) {
      this.texts.clock.setOrigin(1, 0.5).setPosition(W - 30 * s - 3 * 54 * s - 34 * s, by).setFontSize(22 * s);
      this.texts.area.setOrigin(1, 0).setPosition(W - 12 * s, by + 22 * s);
    }
    if (this.touch || W / DPR < 900) {
      const R = 34 * s;
      const cx = W - 70 * s, cy = H - 80 * s;
      const big: [string, number, number, () => void][] = [
        ['E', cx, cy, () => void this.adv.interact()],
        ['◓', cx - 82 * s, cy + 6 * s, () => this.adv.throwBall()],
        ['Lệnh', cx - 30 * s, cy - 78 * s, () => this.cycleCommand()],
        ['Chạy', cx - 150 * s, cy + 20 * s, () => { this.adv.runHeld = !this.adv.runHeld; this.banner(this.adv.runHeld ? 'Chạy: BẬT' : 'Chạy: TẮT', '#fff'); }],
        ['Map', cx + 10 * s, cy - 150 * s, () => this.toggleMenu('map')],
        ['MEGA', cx - 110 * s, cy - 80 * s, () => this.adv.tryMega()],
      ];
      for (const [l, x, y, fn] of big) {
        const b = button(this, x, y, R * 1.7, R * 1.5, l, fn, 0x2f4a6a);
        b.container.setAlpha(0.85);
      }
    }
    this.joyG = this.add.graphics().setDepth(50);
  }

  private ensureMapTexture(): string {
    const m = this.adv.map;
    const key = 'map_' + m.id + (m.kind === 'dungeon' ? '' : '');
    if (this.textures.exists(key) && m.kind !== 'dungeon') return key;
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, m.widthTiles, m.heightTiles)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(m.widthTiles, m.heightTiles);
    for (let y = 0; y < m.heightTiles; y++) for (let x = 0; x < m.widthTiles; x++) {
      const c = m.colorAt(x, y), i = (y * m.widthTiles + x) * 4;
      img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    return key;
  }

  // ───────────────────────────── per-frame HUD ─────────────────────────────

  update(): void {
    this.frame++;
    const a = this.adv;
    if (!a.world) return;
    const w = a.world;
    const { width: W, height: H } = this.scale;
    const s = this.s;
    const g = this.hud;
    g.clear();

    // Trainer + party
    const t = w.trainer;
    const hw = 210 * s;
    g.fillStyle(0x000000, 0.75).fillRect(12 * s - 2, 10 * s - 2, hw + 4, 24 * s + 4);
    g.fillStyle(0x502020, 1).fillRect(12 * s, 10 * s, hw, 24 * s);
    g.fillStyle(0xe04848, 1).fillRect(12 * s, 10 * s, hw * (t.hp / t.maxHp), 24 * s);
    this.texts.hp.setText(`HLV  ${Math.ceil(t.hp)}/${t.maxHp}   ·   Cấp thế giới ${a.state.worldLevel}`).setPosition(18 * s, 12 * s);
    const party = a.state.party();
    while (this.partyIcons.length > party.length) this.partyIcons.pop()!.destroy();
    while (this.partyRows.length > party.length) { const r = this.partyRows.pop()!; r.frame?.destroy(); r.ball.destroy(); r.zone.destroy(); }
    party.forEach((p, i) => {
      const y = 44 * s + i * 40 * s;
      const ally = w.allies.find((u) => u.ownerUid === p.uid);
      const inBall = !!a.summons?.isRecalled(p.uid);
      let row = this.partyRows[i];
      if (!row) {
        // tap / click a row: summon it from its ball, or recall it (keyboard: Shift + 1–6)
        const zone = this.add.zone(12 * s, y, hw, 36 * s).setOrigin(0).setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => { audio.unlock(); a.summons?.toggleSlot(i); });
        const frame = this.textures.exists('bossui-party_slot_small') ? this.add.image(32 * s, y + 18 * s, 'bossui-party_slot_small').setScale((36 * s) / 87) : null;
        row = { frame, ball: this.add.image(0, 0, 'item_held').setVisible(false), zone };
        this.partyRows[i] = row;
      }
      row.zone.setPosition(12 * s, y);
      row.frame?.setPosition(32 * s, y + 18 * s).setAlpha(inBall ? 0.6 : 1);
      if (inBall) {
        const bk = itemIconKey(this, p.ball ?? 'pokeball');
        if (row.ball.texture.key !== bk) row.ball.setTexture(bk);
        row.ball.setVisible(true).setPosition(44 * s, y + 28 * s).setScale((16 * s) / Math.max(1, row.ball.width)).setDepth(5);
      } else row.ball.setVisible(false);
      g.fillStyle(0x0b0d16, 0.75).fillRect(12 * s, y, hw, 36 * s);
      g.lineStyle(2, ally?.fainted ? 0x803030 : a.state.isActive(p.uid) ? 0xffcc33 : 0x3a4260, 1).strokeRect(12 * s, y, hw, 36 * s);
      let icon = this.partyIcons[i];
      const ik = p.shiny ? shinyKey(p.species) : p.species;
      if (!icon) { icon = this.add.image(0, 0, ik); this.partyIcons[i] = icon; }
      if (icon.texture.key !== ik) icon.setTexture(ik);
      icon.setScale(fitScale(this, ik, 34 * s));
      icon.setPosition(32 * s, y + 18 * s).setAlpha(ally?.fainted ? 0.35 : inBall ? 0.5 : 1).setDepth(4);
      const k = 'p' + i;
      if (!this.texts[k]) this.texts[k] = text(this, 0, 0, '', 15 * s);
      this.texts[k].setText(`${POKEMON.get(p.species)?.name} Lv${p.level}${ally?.fainted ? `  ✕ ${Math.ceil(ally.reviveT)}s` : a.state.isActive(p.uid) ? '  ★ ngoài bóng' : inBall ? '  · trong bóng' : ''}`).setPosition(52 * s, y + 1 * s);
      const bx = 52 * s, bw = hw - 112 * s;
      if (ally) bar(g, bx, y + 21 * s, bw, 6 * s, ally.hp / ally.maxHp, hpColor(ally.hp / ally.maxHp));
      else if (inBall) bar(g, bx, y + 21 * s, bw, 6 * s, p.hpFrac ?? 1, 0x8890a8); // HP kept in the ball (no healing)
      // animated EXP bar: eases toward the real value; on level-up it fills, flashes gold, then restarts from 0
      const target = levelProgress(p);
      let ea = this.expAnim.get(p.uid);
      if (!ea) { ea = { shown: target, level: p.level, flash: 0 }; this.expAnim.set(p.uid, ea); }
      const dtS = this.game.loop.delta / 1000;
      if (p.level > ea.level) { ea.shown = Math.min(1, ea.shown + dtS * 2.5); if (ea.shown >= 1) { ea.level = p.level; ea.shown = 0; ea.flash = 0.6; } }
      else ea.shown += (target - ea.shown) * Math.min(1, dtS * 4);
      if (ea.flash > 0) ea.flash -= dtS;
      bar(g, bx, y + 29 * s, bw, 4 * s, ea.shown, ea.flash > 0 && Math.floor(ea.flash * 10) % 2 === 0 ? 0xffe060 : 0x60a0ff);
      // 4 skill cooldown squares (type colour, dark fill = remaining cooldown, dim = not enough energy)
      if (ally) ally.skills.forEach((sl, j) => {
        const sq = 12 * s, sx = 12 * s + hw - 4 * (sq + 3 * s) - 2 * s + j * (sq + 3 * s), sy = y + 19 * s;
        g.fillStyle(TYPE_COLOR[sl.def.type] ?? 0x888888, ally.energy >= sl.def.energyCost ? 1 : 0.35).fillRect(sx, sy, sq, sq);
        const frac = sl.cd > 0 && sl.cdMax ? Phaser.Math.Clamp(sl.cd / sl.cdMax, 0, 1) : 0;
        if (frac > 0) g.fillStyle(0x000000, 0.7).fillRect(sx, sy, sq, sq * frac);
        g.lineStyle(1, ally.lastSkill === sl.def.id && ally.animCast > 0 ? 0xffffff : 0x000000, 1).strokeRect(sx, sy, sq, sq);
      });
    });
    for (let i = party.length; i < 6; i++) this.texts['p' + i]?.setText('');

    // Clock / weather / area
    const c = a.state.adv.clock;
    const night = a.isNight();
    const wk = a.effectiveWeather();
    const wx = WEATHER_LABEL[wk] ?? (night ? 'Đêm' : 'Nắng');
    this.texts.clock.setText(a.mapKind === 'dungeon' ? a.map.name : `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(Math.floor(c % 60)).padStart(2, '0')}  ${wx}`);
    const tl = a.dungeon?.timeLeft;
    this.texts.area.setText(a.mapKind === 'dungeon' ? `Phase: ${phaseLabel(a.dungeon?.phase)}${tl != null ? `  ·  ⏱ ${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}` : ''}` : a.areaName).setColor(tl != null && tl < 30 ? '#ff7050' : COLORS.dim);

    // Quest tracker
    const qid = a.state.trackedQuest;
    const qdef = qid ? a.state.quests.def(qid) : undefined;
    const obj = qid ? a.state.quests.currentObjective(qid) : null;
    const qy = this.miniBox.y + this.miniBox.h + (this.portraitHud ? 76 : 52) * s;
    if (qdef && obj) {
      const st = a.state.quests.states[qid!];
      const prog = obj.count > 1 ? ` (${st.progress}/${obj.count})` : '';
      let dist = '';
      if (obj.marker && a.mapKind === 'valley' && (obj.marker.region ?? 'starter-valley') === a.regionDef.id) {
        const mx = (obj.marker.x + 0.5) * TILE_PX, my = (obj.marker.y + 0.5) * TILE_PX;
        const d = Math.hypot(mx - t.x, my - t.y) / TILE_PX;
        const ang = Math.atan2(my - t.y, mx - t.x);
        dist = `  ${arrow(ang)} ${Math.round(d)}m`;
      }
      this.texts.quest.setText(`◆ ${qdef.title}`).setOrigin(1, 0).setPosition(W - 12 * s, qy);
      this.texts.obj.setText(`${obj.text.replace(/\(\d+\/\d+\)/, '')}${prog}${dist}`).setOrigin(1, 0).setPosition(W - 12 * s, qy + 22 * s).setWordWrapWidth(300 * s);
      g.fillStyle(0x000000, 0.45).fillRect(W - 12 * s - 320 * s, qy - 4 * s, 324 * s, 50 * s);
    } else { this.texts.quest.setText(''); this.texts.obj.setText(''); }

    // Active world events: name, region, countdown, goal progress (short, right column, never over the field centre)
    const evs = a.worldEvents?.views() ?? [];
    if (evs.length && a.mapKind === 'valley') {
      const ey = qy + 58 * s;
      const lines = evs.map((e) => `✦ ${e.name} · ${e.regionName} · ${fmtTime(e.left)}${e.goal ? `  (${e.progress}/${e.goal})` : ''}`);
      this.texts.events.setText(lines.join('\n')).setOrigin(1, 0).setPosition(W - 12 * s, ey);
      g.fillStyle(0x200830, 0.55).fillRect(W - 12 * s - 360 * s, ey - 4 * s, 364 * s, lines.length * 20 * s + 8 * s);
    } else this.texts.events.setText('');

    // Mega Evolution HUD (button + remaining time)
    const mx = W - 120 * s, my = H - 200 * s;
    if (a.megaUnit) {
      const f = Math.max(0, a.megaT / MEGA_DURATION);
      g.fillStyle(0x000000, 0.7).fillRect(mx - 80 * s, my - 4 * s, 170 * s, 30 * s);
      g.fillStyle(Phaser.Display.Color.HSVToRGB((this.time.now * 0.0003) % 1, 0.7, 1).color, 1).fillRect(mx - 78 * s, my + 18 * s, 166 * s * f, 6 * s);
      this.setMegaText(`MEGA ${a.megaUnit.name} ${Math.ceil(a.megaT)}s`, mx + 5 * s, my);
    } else {
      const st = a.megaStatus();
      const ready = !!st.ally && a.state.item('key-stone') > 0;
      this.setMegaText(a.state.item('key-stone') > 0 ? (ready ? '[G] MEGA sẵn sàng' : a.megaCd > 0 ? `MEGA hồi ${Math.ceil(a.megaCd)}s` : '') : '', mx + 5 * s, my);
    }
    this.texts.money?.setText(`${a.state.money} xu`);

    // Items + command
    const ball = a.selectedBall;
    this.texts.balls.setText(`[F] ${BALLS[ball].name} ×${a.state.item(ball)}   [R] đổi   [H] thuốc ×${a.state.item('potion') + a.state.item('superpotion') + a.state.item('oranberry')}`)
      .setPosition(16 * s, H - 30 * s);
    const cmd = COMMANDS.find((cc) => cc.id === w.command)!;
    this.texts.cmd.setText(`Lệnh đội: ${cmd.label}${w.commandTarget ? ' → ' + w.commandTarget.name : ''}   (\` 1-5)`).setPosition(16 * s, H - 54 * s);

    // Online session (shared open world)
    this.texts.online.setText(net.status === 'hosting' ? `ONLINE · Phòng ${net.code} — chờ bạn vào` : net.connected ? `${coopSession.active ? 'CO-OP' : 'ONLINE'} · Đang chơi cùng ${net.peerName} · ${net.rtt} ms${coopSession.active || a.presence?.visible() ? '' : ' · ở vùng khác'}` : '');

    // Interaction prompt
    const n = a.nearest;
    this.texts.prompt.setText(n && !a.modal ? `[E] ${n.label}` : '').setPosition(W / 2, H - 92 * s);

    // Capture preview over the aimed wild Pokémon
    const target = a.modal || a.captureFx ? null : a.aimTarget(true);
    if (target && w.allies.length) {
      const cam = a.cameras.main;
      const sx = (target.x - cam.worldView.x) * cam.zoom, sy = (target.y - cam.worldView.y) * cam.zoom;
      const pct = Math.round(a.previewChance(target) * 100);
      this.texts.chance.setText(`${target.name} Lv${target.level} · bắt ${pct}%`).setPosition(sx, sy - 64 * cam.zoom).setColor(pct > 50 ? '#80ff90' : pct > 20 ? '#ffe040' : '#ff9080');
      g.lineStyle(2, 0xffe040, 0.8).strokeCircle(sx, sy, 30 * cam.zoom);
    } else this.texts.chance.setText('');

    const ev = a.env?.cycle.event;
    this.envTint?.setFillStyle(ev === 'eruption' ? 0xff4010 : 0xe8f4ff, ev === 'blizzard' ? 0.22 + Math.sin(this.time.now * 0.002) * 0.04 : ev === 'eruption' ? 0.08 + Math.sin(this.time.now * 0.004) * 0.03 : 0);

    // Boss HUD (Rayquaza UI pack) — falls back to the plain bar if the pack failed to load
    const b = w.boss;
    if (this.bossHud?.ok) {
      this.bossHud.update(w, { note: a.legendCap ? `Còn ${a.legendCap.left} lượt` : undefined });
      this.texts.boss.setText('');
    } else if (b) {
      const bw = Math.min(W - 40, 520 * s), bx = (W - bw) / 2, y = H - 50 * s;
      g.fillStyle(0x000000, 0.8).fillRect(bx - 3, y - 3, bw + 6, 24 * s);
      g.fillStyle(b.boss!.phase === 2 ? 0xff6020 : 0xd03030, 1).fillRect(bx, y, bw * (b.hp / b.maxHp), 18 * s);
      this.texts.boss.setText(`${b.name} Lv${b.level}${b.boss!.phase === 2 ? ' · PHASE 2' : ''}`).setPosition(W / 2, y - 4);
    } else this.texts.boss.setText('');

    if (this.frame % 4 === 0) this.drawMinimap();
    this.drawJoystick();
    const p = a.perf;
    this.texts.perf.setText(saveStore.data.settings.showFps ? `FPS ${p.fps.toFixed(0)} | frame ${p.frameMs.toFixed(1)}ms | sim ${p.simMs.toFixed(2)}ms | entity ${p.entities} | particle ${p.particles} | chunk ${a.chunks.loaded.size}${heap()}` : '');

    if (this.joy) {
      const dx = this.joy.x - this.joy.bx, dy = this.joy.y - this.joy.by, d = Math.hypot(dx, dy), m = d < 8 ? 0 : Math.min(1, d / (60 * s));
      a.joystick.x = d ? (dx / d) * m : 0; a.joystick.y = d ? (dy / d) * m : 0;
    } else { a.joystick.x = 0; a.joystick.y = 0; }
  }

  private setMegaText(str: string, x: number, y: number): void {
    this.texts.mega?.setText(str).setPosition(x, y);
  }

  private drawMinimap(): void {
    const a = this.adv, m = a.map, g = this.miniG;
    const { x, y, w, h } = this.miniBox;
    const kx = w / m.widthTiles, ky = h / m.heightTiles;
    g.clear();
    if (m.kind === 'overworld') {
      // fog of war per chunk
      const cols = chunkCols(m), rows = chunkRows(m), n = m.chunk;
      const disc = new Set(a.state.discoveredList());
      g.fillStyle(0x0a0c14, 0.97);
      for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) if (!disc.has(cy * cols + cx)) g.fillRect(x + cx * n * kx, y + cy * n * ky, n * kx + 0.5, n * ky + 0.5);
    }
    for (const e of a.world.enemies) {
      if (!e.alive || e.captured) continue;
      g.fillStyle(e.hostile ? 0xff4040 : 0xffd080, 1).fillRect(x + (e.x / TILE_PX) * kx - 1, y + (e.y / TILE_PX) * ky - 1, 2, 2);
    }
    const t = a.world.trainer;
    g.fillStyle(0xffffff, 1).fillRect(x + (t.x / TILE_PX) * kx - 2, y + (t.y / TILE_PX) * ky - 2, 4, 4);
    const obj = a.state.trackedQuest ? a.state.quests.currentObjective(a.state.trackedQuest) : null;
    if (obj?.marker && m.kind === 'overworld' && (obj.marker.region ?? 'starter-valley') === a.regionDef.id) g.fillStyle(0xffe040, 1).fillCircle(x + (obj.marker.x + 0.5) * kx, y + (obj.marker.y + 0.5) * ky, 3);
    // world event markers (treasure only as an approximate ring)
    if (m.kind === 'overworld') for (const e of a.worldEvents?.views() ?? []) {
      if (!e.x) continue;
      const ex = x + (e.x / TILE_PX) * kx, ey = y + (e.y / TILE_PX) * ky;
      if (e.approx) g.lineStyle(1, 0xffd080, 0.9).strokeCircle(ex, ey, (e.approx / TILE_PX) * kx);
      else g.fillStyle(EVENT_COLOR[e.type] ?? 0xd090ff, 1).fillTriangle(ex, ey - 4, ex - 4, ey + 3, ex + 4, ey + 3);
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

  private cycleCommand(): void {
    const i = COMMANDS.findIndex((c) => c.id === this.adv.world.command);
    this.adv.command(COMMANDS[(i + 1) % COMMANDS.length].id);
  }

  // ───────────────────────────── banners & popups ─────────────────────────────

  banner(str: string, color = '#ffffff'): void {
    const { width: W } = this.scale;
    const s = this.s;
    if (this.banners.length >= 3) this.banners.shift()?.destroy();
    const t = text(this, W / 2, 0, str, 24 * s, color).setOrigin(0.5).setAlpha(0).setDepth(80);
    this.banners.push(t);
    const top = Math.max(100 * s, this.bossHud?.bottom() ?? 0);
    this.banners.forEach((b, i) => b.setY(top + i * 30 * s));
    this.tweens.add({ targets: t, alpha: 1, duration: 150 });
    this.tweens.add({ targets: t, alpha: 0, delay: 2600, duration: 400, onComplete: () => { this.banners = this.banners.filter((b) => b !== t); t.destroy(); } });
  }

  private alerts: Phaser.GameObjects.Container[] = [];
  private expAnim = new Map<string, { shown: number; level: number; flash: number }>();

  /** Short pixel-panel alert for world events / rare encounters (top centre, under the clock, max 2 stacked). */
  eventAlert(str: string, color = '#f0d8ff'): void {
    const { width: W } = this.scale;
    const s = this.s;
    if (this.alerts.length >= 2) this.alerts.shift()?.destroy();
    const t = text(this, 0, 0, str, 17 * s, color).setOrigin(0.5).setWordWrapWidth(Math.min(W - 40 * s, 640 * s)).setAlign('center');
    const w = t.width + 28 * s, h = t.height + 14 * s;
    const bg = this.add.graphics();
    bg.fillStyle(0x140a24, 0.88).fillRect(-w / 2, -h / 2, w, h);
    bg.lineStyle(2, Phaser.Display.Color.HexStringToColor(color).color, 1).strokeRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    const c = this.add.container(W / 2, 0, [bg, t]).setDepth(85).setAlpha(0);
    this.alerts.push(c);
    const top = Math.max(72 * s, this.bossHud?.bottom() ?? 0);
    this.alerts.forEach((a, i) => a.setY(top + h / 2 + i * (h + 6 * s)));
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    this.tweens.add({ targets: c, alpha: 0, delay: 3800, duration: 400, onComplete: () => { this.alerts = this.alerts.filter((x) => x !== c); c.destroy(); } });
    audio.play('shield');
  }

  /** Event Journal: running events with countdown/goal, then history. */
  private buildEvents(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, a = this.adv;
    const save = a.state.adv.events;
    const views = a.worldEvents?.views() ?? [];
    c.add(text(this, r.x, r.y, `ĐANG DIỄN RA (${views.length})`, 20 * s, '#ffe080'));
    if (!views.length) c.add(text(this, r.x, r.y + 30 * s, 'Không có sự kiện nào. Sự kiện phụ được kiểm tra mỗi 5 phút chơi, sự kiện lớn mỗi 15 phút (không phải lần nào cũng xảy ra).', 15 * s, COLORS.dim).setWordWrapWidth(r.w));
    views.forEach((e, i) => {
      const y = r.y + 32 * s + i * 46 * s;
      c.add(panel(this, r.x, y, r.w, 40 * s, EVENT_COLOR[e.type] ?? 0xd090ff, 0x1c2134, 1));
      c.add(text(this, r.x + 12 * s, y + 4 * s, `${e.name} — ${e.regionName}`, 17 * s));
      c.add(text(this, r.x + 12 * s, y + 22 * s, `${EVENT_HINT[e.type]}   ·   còn ${fmtTime(e.left)}${e.goal ? `   ·   tiến độ ${e.progress}/${e.goal}` : ''}`, 13 * s, COLORS.dim));
    });
    const hy = r.y + 50 * s + Math.max(1, views.length) * 46 * s;
    c.add(text(this, r.x, hy, `NHẬT KÝ (đã hoàn thành ${save.completed})`, 20 * s, '#ffe080'));
    const OUT: Record<string, string> = { completed: 'hoàn thành', expired: 'hết giờ', cleanup: 'kết thúc' };
    save.history.slice(0, 12).forEach((h, i) => {
      const reg = REGION_NAMES[h.region] ?? h.region;
      c.add(text(this, r.x + 8 * s, hy + 28 * s + i * 22 * s, `${fmtTime(h.start)}  ${EVENT_NAME[h.type] ?? h.type} · ${reg} · ${OUT[h.outcome]}`, 15 * s, h.outcome === 'completed' ? '#a0ffb0' : '#c0c8e0'));
    });
  }

  private areaText: Phaser.GameObjects.Text | null = null;

  areaBanner(name: string): void {
    const { width: W, height: H } = this.scale;
    if (this.areaText?.active) this.areaText.destroy(); // only the latest region name is shown
    const t = (this.areaText = text(this, W / 2, H * 0.3, name, 44 * this.s, '#fff4d0').setOrigin(0.5).setAlpha(0).setDepth(70));
    this.tweens.add({ targets: t, alpha: 1, duration: 500, yoyo: true, hold: 1400, onComplete: () => t.destroy() });
  }

  questComplete(title: string, lines: string[]): void {
    const { width: W, height: H } = this.scale;
    const s = this.s;
    const pw = 460 * s, ph = (90 + lines.length * 24) * s;
    // below the boss HUD while a boss fight is on
    const c = this.add.container(W / 2, Math.max(H * 0.32, (this.bossHud?.bottom() ?? 0) + ph / 2 + 8 * s)).setDepth(90).setAlpha(0);
    c.add(panel(this, -pw / 2, -ph / 2, pw, ph, 0xffcc33, 0x1c2134, 0.95));
    c.add(text(this, 0, -ph / 2 + 22 * s, '★ HOÀN THÀNH ★', 26 * s, '#ffd640').setOrigin(0.5));
    c.add(text(this, 0, -ph / 2 + 50 * s, title, 22 * s).setOrigin(0.5));
    lines.forEach((l, i) => c.add(text(this, 0, -ph / 2 + (80 + i * 24) * s, l, 18 * s, '#9fe0a0').setOrigin(0.5)));
    this.tweens.add({ targets: c, alpha: 1, duration: 250, yoyo: true, hold: 3200, onComplete: () => c.destroy() });
  }

  /** Classic evolution sequence: silhouettes alternate faster and faster, then the new form is revealed. */
  /**
   * GBA-style evolution: darkened screen, rotating light, orbiting pixel sparkles, white silhouettes alternating
   * faster and faster, flash burst, reveal, then the stat changes and newly learned skills.
   * Any key / click skips straight to the reveal; another one closes the result card.
   */
  async playEvolution(from: string, to: string, fromName: string, toName: string, info?: { level: number; ind?: Individual }): Promise<void> {
    await Promise.all([loadFront(from), loadFront(to)]); // official 96×96 art, fetched on demand
    return new Promise((resolve) => {
      const { width: W, height: H } = this.scale;
      const s = this.s;
      const c = this.add.container(0, 0).setDepth(300);
      const bg = this.add.rectangle(0, 0, W, H, 0x05060c, 0.92).setOrigin(0).setInteractive();
      c.add(bg);
      const sparks = this.add.graphics();
      const rays = this.add.graphics();
      c.add(rays);
      const art = (n: string) => (this.textures.exists('front-' + n) ? 'front-' + n : n);
      const scale = (n: string) => (180 * s) / Math.max(1, this.textures.get(n).getSourceImage().height);
      const a = this.add.image(W / 2, H * 0.45, art(from)).setScale(scale(art(from)));
      const b = this.add.image(W / 2, H * 0.45, art(to)).setScale(scale(art(to))).setAlpha(0);
      c.add([a, b]);
      c.add(sparks);
      const label = text(this, W / 2, H * 0.78, `Ồ! ${fromName} đang tiến hóa!`, 32 * s).setOrigin(0.5);
      const hint = text(this, W / 2, H - 24 * s, 'Nhấn phím bất kỳ / chạm để bỏ qua', 14 * s, COLORS.dim).setOrigin(0.5);
      c.add([label, hint]);
      audio.play('levelup');
      let t = 0, flips = 0, revealed = false, done = false;
      const finish = () => { if (done) return; done = true; ev.remove(); this.input.keyboard?.off('keydown', onKey); c.destroy(); resolve(); };
      const skip = () => {
        if (t < 400) return;
        if (!revealed) t = 3200; // jump to the reveal
        else if (t > 3600) finish();
      };
      const onKey = () => skip();
      this.input.keyboard?.on('keydown', onKey);
      bg.on('pointerdown', skip);
      const cx = W / 2, cy = H * 0.45;
      const ev = this.time.addEvent({
        delay: 30, loop: true, callback: () => {
          t += 30;
          rays.clear();
          for (let i = 0; i < 12; i++) {
            const ang = (i / 12) * Math.PI * 2 + t * 0.001;
            rays.fillStyle(0xffffff, 0.06 + Math.min(0.2, t / 12000)).slice(cx, cy, Math.max(W, H), ang, ang + 0.12).fillPath();
          }
          // orbiting pixel sparkles that tighten towards the Pokémon until the burst
          sparks.clear();
          if (!revealed) {
            const rad = (150 - Math.min(110, t * 0.03)) * s;
            for (let i = 0; i < 16; i++) {
              const ang = (i / 16) * Math.PI * 2 + t * 0.004 * (i % 2 ? 1 : -1);
              const px = 3 * s * (1 + ((i + Math.floor(t / 90)) % 3 === 0 ? 1 : 0));
              sparks.fillStyle(i % 3 ? 0xfff6c0 : 0xa0e0ff, 0.9).fillRect(cx + Math.cos(ang) * rad - px / 2, cy + Math.sin(ang) * rad * 0.8 - px / 2, px, px);
            }
          }
          // alternation speeds up: 500ms → 60ms
          const period = Math.max(60, 500 - t * 0.12);
          if (t > flips * period && t < 3200) {
            flips++;
            const showNew = flips % 2 === 0;
            a.setVisible(!showNew).setTintFill(0xffffff); b.setVisible(showNew).setAlpha(1).setTintFill(0xffffff);
            audio.play('click');
          }
          if (t >= 3200 && !revealed) {
            revealed = true;
            this.cameras.main.flash(400, 255, 255, 255);
            a.setVisible(false); b.setVisible(true).setAlpha(1).clearTint();
            label.setText(`Chúc mừng! ${fromName} đã tiến hóa thành ${toName}!`).setColor('#ffe080').setY(H * 0.7);
            audio.play('victory');
            if (info) c.add(this.evolutionSummary(from, to, info.level, info.ind, W / 2, H * 0.76));
            hint.setText('Nhấn phím bất kỳ / chạm để tiếp tục');
          }
          if (t >= (info ? 9000 : 5200)) finish();
        },
      });
    });
  }

  /** Before → after stats and newly learned skills, shown after the reveal. */
  private evolutionSummary(from: string, to: string, level: number, ind: Individual | undefined, x: number, y: number): Phaser.GameObjects.Container {
    const s = this.s;
    const c = this.add.container(0, 0);
    const a = calcStats(POKEMON.get(from)!.baseStats, level, ind), b = calcStats(POKEMON.get(to)!.baseStats, level, ind);
    const names: [keyof typeof a, string][] = [['hp', 'HP'], ['atk', 'Công'], ['def', 'Thủ'], ['spa', 'Công ĐB'], ['spd', 'Thủ ĐB'], ['spe', 'Tốc']];
    const line = names.map(([k, n]) => `${n} ${a[k]}→${b[k]} (${b[k] - a[k] >= 0 ? '+' : ''}${b[k] - a[k]})`).join('   ');
    c.add(text(this, x, y, line, 15 * s, '#c8f0c8').setOrigin(0.5, 0));
    const known = new Set(unlockedSkills(from, level));
    const learned = unlockedSkills(to, level).filter((id) => !known.has(id));
    const tdef = POKEMON.get(to)!;
    c.add(text(this, x, y + 24 * s, `Hệ: ${tdef.types.join(' / ')}   ·   Đặc tính: ${tdef.passive.name}`, 15 * s, '#c8e0ff').setOrigin(0.5, 0));
    if (learned.length) {
      const row = learned.map((id) => getSkill(id));
      const total = row.length * 150 * s;
      row.forEach((sk, i) => {
        const ix = x - total / 2 + i * 150 * s;
        c.add(this.add.image(ix + 10 * s, y + 60 * s, moveAssets(sk).icon).setScale(Math.max(1, Math.round(2 * s))));
        c.add(text(this, ix + 30 * s, y + 52 * s, `Mới: ${sk.name}`, 15 * s, '#ffe080'));
      });
    }
    return c;
  }

  megaBanner(from: string, to: string): void {
    const { width: W, height: H } = this.scale;
    const s = this.s;
    const c = this.add.container(0, 0).setDepth(95);
    const g = this.add.graphics();
    const cols = [0xff4060, 0xffc040, 0x60ff80, 0x40a0ff, 0xc060ff];
    cols.forEach((col, i) => g.fillStyle(col, 0.85).fillRect(0, H * 0.36 + i * 8 * s, W, 8 * s));
    c.add(g);
    c.add(text(this, W / 2, H * 0.36 + 20 * s, `${from} Mega Tiến Hóa → ${to}!`, 34 * s, '#ffffff').setOrigin(0.5));
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 200, yoyo: true, hold: 1800, onComplete: () => c.destroy() });
  }

  // ───────────────────────────── dialogue ─────────────────────────────

  dialogue(speaker: string, lines: string[], choices?: DialogueChoice[], portrait?: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.dialogueLayer?.destroy();
      const { width: W, height: H } = this.scale;
      const s = this.s;
      const pw = Math.min(W - 24, 760 * s), ph = 150 * s;
      const x0 = (W - pw) / 2, y0 = H - ph - 16 * s;
      const c = this.add.container(0, 0).setDepth(150);
      c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.25).setOrigin(0).setInteractive());
      c.add(panel(this, x0, y0, pw, ph, 0xe0c070, 0x141826, 0.96));
      const hasPortrait = !!portrait && this.textures.exists(portrait);
      if (hasPortrait) {
        // trainer art (official Showdown sprite when the personal pack is on, else IcyEthics art)
        const img = this.add.image(x0 + 12 * s, y0 - 4 * s, portrait!).setOrigin(0, 1);
        img.setScale((150 * s) / img.height);
        c.add(img);
      }
      c.add(text(this, x0 + (hasPortrait ? 170 : 18) * s, y0 - 18 * s, speaker, 22 * s, '#ffe080'));
      const body = text(this, x0 + 18 * s, y0 + 16 * s, '', 21 * s).setWordWrapWidth(pw - 36 * s);
      const hint = text(this, x0 + pw - 16 * s, y0 + ph - 10 * s, '▼ E / chạm', 16 * s, COLORS.dim).setOrigin(1, 1);
      c.add([body, hint]);
      this.dialogueLayer = c;
      let li = 0, shown = 0, done = false;
      let choiceBtns: Phaser.GameObjects.GameObject[] = [];
      let choicePage = 0;
      let choicesVisible = false;
      const rowH = 48 * s;
      // Only render rows fitting ABOVE the dialogue box, never outside the viewport.
      const pageSize = Math.max(1, Math.min(6, Math.floor((y0 - 58 * s) / rowH)));
      const pageCount = Math.max(1, Math.ceil((choices?.length ?? 0) / pageSize));
      const finish = (v: string | null) => {
        if (done) return;
        done = true;
        this.input.keyboard?.off('keydown', onKey);
        this.input.off('wheel', onChoiceWheel);
        tick.remove();
        c.destroy();
        if (this.dialogueLayer === c) this.dialogueLayer = null;
        resolve(v);
      };
      const renderChoices = () => {
        if (!choices) return;
        choiceBtns.forEach((b) => b.destroy());
        choiceBtns = [];
        const visible = choices.slice(choicePage * pageSize, (choicePage + 1) * pageSize);
        const bh = 40 * s;
        const total = visible.length * rowH;
        const top = y0 - total - 46 * s;
        visible.forEach((ch, i) => {
          const b = button(this, W / 2, top + i * rowH + bh / 2, Math.min(pw, 560 * s), bh,
            `${choicePage * pageSize + i + 1}. ${ch.label}`,
            () => { if (!ch.disabled) finish(ch.value); }, ch.disabled ? 0x3a3a44 : 0x2c3654);
          if (ch.disabled) b.container.setAlpha(0.5);
          c.add(b.container);
          choiceBtns.push(b.container);
        });
        if (pageCount > 1) {
          const navY = y0 - 19 * s;
          const prev = button(this, W / 2 - 155 * s, navY, 95 * s, 26 * s, '◀ Trước', () => { choicePage = (choicePage + pageCount - 1) % pageCount; renderChoices(); });
          const next = button(this, W / 2 + 155 * s, navY, 95 * s, 26 * s, 'Sau ▶', () => { choicePage = (choicePage + 1) % pageCount; renderChoices(); });
          const pageLabel = text(this, W / 2, navY, `${choicePage + 1}/${pageCount}`, 18 * s).setOrigin(0.5);
          c.add([prev.container, next.container, pageLabel]);
          choiceBtns.push(prev.container, next.container, pageLabel);
        }
      };
      const showChoices = () => {
        if (!choices || choicesVisible) return;
        choicesVisible = true;
        hint.setText('Cuộn chuột / ◀ ▶');
        renderChoices();
      };
      const onChoiceWheel = (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
        if (!choicesVisible || pageCount < 2 || !dy) return;
        choicePage = Phaser.Math.Clamp(choicePage + (dy > 0 ? 1 : -1), 0, pageCount - 1);
        renderChoices();
      };
      this.input.on('wheel', onChoiceWheel);
      const advance = () => {
        const line = lines[li] ?? '';
        if (shown < line.length) { shown = line.length; body.setText(line); return; }
        if (li < lines.length - 1) { li++; shown = 0; return; }
        if (choices) showChoices();
        else finish(null);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'e' || ev.key === 'E' || ev.key === ' ' || ev.key === 'Enter') advance();
        const n = parseInt(ev.key, 10);
        const idx = choicePage * pageSize + n - 1;
        if (choicesVisible && choices && n >= 1 && n <= pageSize && idx < choices.length && !choices[idx].disabled) finish(choices[idx].value);
        if (choicesVisible && ev.key === 'ArrowRight') { choicePage = Math.min(pageCount - 1, choicePage + 1); renderChoices(); }
        if (choicesVisible && ev.key === 'ArrowLeft') { choicePage = Math.max(0, choicePage - 1); renderChoices(); }
        if (ev.key === 'Escape' && choices) finish(null);
      };
      this.input.keyboard?.on('keydown', onKey);
      c.list[0].on('pointerup', advance);
      const tick = this.time.addEvent({
        delay: 22, loop: true, callback: () => {
          const line = lines[li] ?? '';
          if (shown < line.length) { shown = Math.min(line.length, shown + 2); body.setText(line.slice(0, shown)); }
          else if (li === lines.length - 1 && choices) showChoices();
        },
      });
    });
  }

  // ───────────────────────────── menus ─────────────────────────────

  toggleMenu(tab: MenuTab): void {
    if (this.dialogueLayer) return;
    if (this.shop) { this.shop.close(); return; } // Esc / menu keys first leave the shop
    if (this.menu && this.menuTab === tab) this.closeMenu();
    else this.openMenu(tab);
  }

  /** Opens the shop window; resolves when the player leaves it. */
  openShop(opts: ShopOptions): Promise<void> {
    if (this.dialogueLayer) return Promise.resolve();
    this.shop?.close();
    this.closeMenu();
    this.joy = null;
    this.adv.modal = true;
    return new Promise((done) => {
      const a = this.adv;
      this.shop = new ShopWindow({ scene: this, state: a.state, persist: () => a.persist(), banner: (m, col) => this.banner(m, col) }, opts, () => {
        this.shop = null;
        a.modal = false;
        done();
      });
    });
  }

  closeMenu(): void {
    this.shop?.close();
    this.menu?.destroy();
    this.menu = null;
    this.menuTab = null;
    this.adv.modal = false;
  }

  openMenu(tab: MenuTab): void {
    if (this.dialogueLayer) return;
    this.shop?.close();
    this.menu?.destroy();
    this.joy = null;
    this.adv.modal = true;
    this.menuTab = tab;
    const { width: W, height: H } = this.scale;
    // portrait phones: the menu fills the screen, columns stack (list above detail) and the text gets bigger
    // than the HUD scale, which is limited by the narrow width
    const hud = this.s;
    this.portraitMenu = H > W * 1.15;
    const s = (this.s = this.portraitMenu ? uiScale(W, H, (w, h) => Phaser.Math.Clamp(Math.min((w - 16) / 540, (h - 16) / 900), 0.55, 1.4)) : hud);
    const c = this.add.container(0, 0).setDepth(120);
    this.menu = c;
    c.add(this.add.rectangle(0, 0, W, H, 0x05060c, 0.8).setOrigin(0).setInteractive());
    const pw = this.portraitMenu ? W - 16 * DPR : Math.min(W - 16, 1040 * s), ph = this.portraitMenu ? H - 16 * DPR : Math.min(H - 16, 640 * s);
    const x0 = (W - pw) / 2, y0 = (H - ph) / 2;
    c.add(panel(this, x0, y0, pw, ph, COLORS.panelEdge, 0x161a28, 0.97));
    const tabs = this.tabs();
    const rows = this.portraitMenu ? 2 : 1, perRow = Math.ceil(tabs.length / rows);
    const tw = (pw - 70 * s) / perRow;
    tabs.forEach((t, i) => {
      const b = button(this, x0 + 10 * s + tw / 2 + (i % perRow) * tw, y0 + 26 * s + Math.floor(i / perRow) * 42 * s, tw - 6 * s, 36 * s, t.label, () => this.openMenu(t.id), t.id === tab ? 0x4a5a8a : 0x262c44);
      c.add(b.container);
    });
    c.add(button(this, x0 + pw - 30 * s, y0 + 26 * s, 40 * s, 36 * s, '✕', () => this.closeMenu(), 0x6a2f2f).container);
    const top = 56 * s + (rows - 1) * 42 * s;
    const body = { x: x0 + 16 * s, y: y0 + top, w: pw - 32 * s, h: ph - top - 16 * s };
    try {
      this.buildTab(c, tab, body);
    } finally {
      this.s = hud;
    }
  }

  /** Menu body columns: list | detail side by side, or list above detail on portrait phones. */
  private split(r: Rect, frac: number, top: number): [Rect, Rect] {
    const gap = 12 * this.s;
    if (!this.portraitMenu) {
      const lw = r.w * frac;
      return [{ x: r.x, y: r.y, w: lw, h: r.h }, { x: r.x + lw + gap, y: r.y, w: r.w - lw - gap, h: r.h }];
    }
    const lh = r.h * top;
    return [{ x: r.x, y: r.y, w: r.w, h: lh }, { x: r.x, y: r.y + lh + gap, w: r.w, h: r.h - lh - gap }];
  }

  private buildTab(c: Phaser.GameObjects.Container, tab: MenuTab, body: Rect): void {
    switch (tab) {
      case 'party': this.buildParty(c, body); break;
      case 'pc': this.buildPc(c, body); break;
      case 'dex': this.buildDex(c, body); break;
      case 'bag': this.buildBag(c, body); break;
      case 'quests': this.buildQuests(c, body); break;
      case 'map': this.buildMap(c, body); break;
      case 'passport': this.buildPassport(c, body); break;
      case 'events': this.buildEvents(c, body); break;
      case 'settings': this.buildSettings(c, body); break;
    }
  }

  private buildParty(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, st = this.adv.state;
    const coll = st.save.collection;
    const [L, D] = this.split(r, 0.46, 0.3), lw = L.w;
    c.add(text(this, r.x, r.y, `Bộ sưu tập (${coll.length}) · Đội hình ${st.adv.party.length}/6 — chạm để xem, nút bên phải để thêm/rút`, 17 * s, COLORS.dim).setWordWrapWidth(r.w));
    if (!coll.length) { c.add(text(this, r.x, r.y + 40 * s, 'Chưa có Pokémon. Hãy gặp Giáo sư Tùng ở làng!', 22 * s)); return; }
    const cols = 3, cw = lw / cols, chh = 70 * s;
    const perPage = cols * Math.max(1, Math.floor((L.h - 70 * s) / (chh + 6 * s)));
    const pages = Math.ceil(coll.length / perPage);
    this.partyPage = Math.min(this.partyPage, pages - 1);
    coll.slice(this.partyPage * perPage, (this.partyPage + 1) * perPage).forEach((p, i) => {
      const x = r.x + (i % cols) * cw, y = r.y + 30 * s + Math.floor(i / cols) * (chh + 6 * s);
      const inParty = st.inParty(p.uid);
      const sel = this.selected.party === p.uid;
      const g = this.add.graphics();
      g.fillStyle(sel ? 0x34406a : 0x20263a, 1).fillRect(x, y, cw - 6 * s, chh);
      g.lineStyle(2, inParty ? 0xffcc33 : 0x3a4260, 1).strokeRect(x, y, cw - 6 * s, chh);
      c.add(g);
      const ck = p.shiny ? shinyKey(p.species) : p.species;
      c.add(this.add.image(x + 26 * s, y + chh / 2, ck).setScale(fitScale(this, ck, 44 * s)));
      c.add(text(this, x + 50 * s, y + 8 * s, POKEMON.get(p.species)?.name ?? p.species, 17 * s));
      c.add(text(this, x + 50 * s, y + 30 * s, `Lv${p.level}${inParty ? '  ★ Đội' : ''}${p.shiny ? '  ✦ Shiny' : ''}`, 15 * s, p.shiny ? '#fff0a0' : inParty ? '#ffe080' : COLORS.dim));
      const z = this.add.zone(x, y, cw - 6 * s, chh).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { this.selected.party = p.uid; this.openMenu('party'); });
      c.add(z);
    });
    if (pages > 1) {
      c.add(button(this, r.x + 60 * s, L.y + L.h - 18 * s, 100 * s, 30 * s, '◀', () => { this.partyPage = (this.partyPage + pages - 1) % pages; this.openMenu('party'); }).container);
      c.add(text(this, r.x + lw / 2, L.y + L.h - 18 * s, `${this.partyPage + 1}/${pages}`, 18 * s).setOrigin(0.5));
      c.add(button(this, r.x + lw - 60 * s, L.y + L.h - 18 * s, 100 * s, 30 * s, '▶', () => { this.partyPage = (this.partyPage + 1) % pages; this.openMenu('party'); }).container);
    }
    const sel = coll.find((p) => p.uid === this.selected.party) ?? coll[0];
    this.pokemonDetails(c, this.portraitMenu ? D : { x: D.x, y: D.y + 26 * s, w: D.w, h: D.h - 26 * s }, sel);
  }

  /** Pokémon Center PC: boxes, search, filters, sorting, moves, withdraw and favourite. */
  private buildPc(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, st = this.adv.state, pc = st.pc;
    c.add(text(this, r.x, r.y, `PC · ${pc.boxes.length} box × ${pc.boxSize} ô · Đội hình ${st.adv.party.length}/6 · ${st.pcPokemon().length} trong PC`, 17 * s, COLORS.dim));
    if (!this.adv.pcNearby()) {
      c.add(panel(this, r.x, r.y + 34 * s, r.w, 120 * s, 0x6a5a2f, 0x24201a, 1));
      c.add(text(this, r.x + 20 * s, r.y + 54 * s, 'Máy PC chỉ dùng được tại Trung tâm Pokémon hoặc trạm nghiên cứu của thị trấn.', 20 * s, '#ffe080').setWordWrapWidth(r.w - 40 * s));
      c.add(text(this, r.x + 20 * s, r.y + 104 * s, 'Đi tới cửa có nhãn “PC” rồi nhấn E / nút tương tác.', 16 * s, '#d0d8f0'));
      return;
    }

    this.pcBox = Phaser.Math.Clamp(this.pcBox, 0, pc.boxes.length - 1);
    const box = pc.boxes[this.pcBox];
    const [L, D] = this.split(r, 0.61, 0.5), leftW = L.w;
    const unplaced = st.unplacedPokemon();
    const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = norm(this.pcQuery.trim());
    const matches = (p: OwnedPokemon) => {
      if (this.pcFilter === 'favorite' && !p.favorite) return false;
      if (this.pcFilter === 'shiny' && !p.shiny) return false;
      if (!q) return true;
      const name = norm(POKEMON.get(p.species)?.name ?? p.species);
      const nick = norm(p.nickname ?? '');
      return name.includes(q) || nick.includes(q) || p.species.toLowerCase().includes(q);
    };
    const searching = !!q || this.pcFilter !== 'all';
    const pool = searching ? st.save.collection.filter(matches).sort((a, b) => b.level - a.level) : null;
    const perPage = 30;
    const pages = pool ? Math.max(1, Math.ceil(pool.length / perPage)) : 1;
    this.pcResultPage = Phaser.Math.Clamp(this.pcResultPage, 0, pages - 1);
    const shown: (string | null)[] = pool
      ? pool.slice(this.pcResultPage * perPage, (this.pcResultPage + 1) * perPage).map((p) => p.uid)
      : box.slots.slice();
    while (shown.length < perPage) shown.push(null);

    // grid
    const cols = 6, top = r.y + 34 * s;
    const cw = (leftW - 8 * s) / cols;
    const chh = Math.min(cw * 0.92, (L.h - 150 * s) / 5);
    shown.forEach((uid, i) => {
      const x = r.x + (i % cols) * cw, y = top + Math.floor(i / cols) * chh;
      const p = uid ? st.owned(uid) : undefined;
      const selected = !!uid && this.pcSelected === uid;
      const moving = !!uid && this.pcMoveUid === uid;
      const g = this.add.graphics();
      g.fillStyle(selected ? 0x34406a : moving ? 0x4a3a5a : p ? 0x20263a : 0x171b28, 1).fillRect(x + 2 * s, y + 2 * s, cw - 5 * s, chh - 4 * s);
      g.lineStyle(2, selected ? 0xffcc33 : moving ? 0xff80e0 : p ? 0x3a4260 : 0x252a3a, 1).strokeRect(x + 2 * s, y + 2 * s, cw - 5 * s, chh - 4 * s);
      c.add(g);
      if (p) {
        const ik = p.shiny ? shinyKey(p.species) : p.species;
        c.add(this.add.image(x + cw / 2, y + chh * 0.42, ik).setScale(fitScale(this, ik, Math.min(46 * s, chh * 0.55))));
        const label = p.nickname ?? POKEMON.get(p.species)?.name ?? p.species;
        c.add(text(this, x + cw / 2, y + chh - 28 * s, `${p.favorite ? '★ ' : ''}${label}`, Math.min(14 * s, cw * 0.22), p.favorite ? '#ffe080' : '#ffffff').setOrigin(0.5, 0).setFixedSize(cw - 8 * s, 16 * s).setAlign('center'));
        c.add(text(this, x + cw / 2, y + chh - 14 * s, `Lv${p.level}`, Math.min(12 * s, cw * 0.2), COLORS.dim).setOrigin(0.5, 0));
      } else {
        c.add(text(this, x + cw / 2, y + chh / 2, '·', 18 * s, '#3a4260').setOrigin(0.5));
      }
      const z = this.add.zone(x + 2 * s, y + 2 * s, cw - 5 * s, chh - 4 * s).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => {
        if (this.pcMoveUid) {
          if (!pool && uid !== this.pcMoveUid) {
            if (!st.moveInPc(this.pcMoveUid, this.pcBox, i)) this.banner('Ô này không hợp lệ', '#ff9080');
          } else if (uid === this.pcMoveUid) {
            this.banner('Đã hủy di chuyển', '#a0d8ff');
          } else this.banner('Hãy thoát tìm kiếm để di chuyển trong box', '#ff9080');
          this.pcMoveUid = null;
          this.adv.applyParty();
          this.adv.persist();
          this.openMenu('pc');
          return;
        }
        this.pcSelected = uid ?? null;
        this.openMenu('pc');
      });
      c.add(z);
    });

    // navigation / tools
    const by = L.y + L.h - 30 * s;
    if (pool) {
      c.add(text(this, r.x, by, `Kết quả: ${pool.length} · lọc ${this.pcFilter === 'all' ? 'tất cả' : this.pcFilter === 'favorite' ? 'yêu thích' : 'shiny'}${q ? ` · “${this.pcQuery}”` : ''}`, 15 * s, '#a0d8ff'));
      if (pages > 1) {
        c.add(button(this, r.x + leftW - 170 * s, by, 80 * s, 30 * s, '◀', () => { this.pcResultPage = (this.pcResultPage + pages - 1) % pages; this.openMenu('pc'); }).container);
        c.add(text(this, r.x + leftW - 90 * s, by, `${this.pcResultPage + 1}/${pages}`, 15 * s).setOrigin(0.5));
        c.add(button(this, r.x + leftW - 20 * s, by, 80 * s, 30 * s, '▶', () => { this.pcResultPage = (this.pcResultPage + 1) % pages; this.openMenu('pc'); }).container);
      }
      c.add(button(this, r.x + leftW - 280 * s, by, 150 * s, 30 * s, 'Xóa tìm/lọc', () => { this.pcQuery = ''; this.pcFilter = 'all'; this.pcResultPage = 0; this.openMenu('pc'); }, 0x6a3a2f).container);
    } else {
      c.add(button(this, r.x + 26 * s, by, 44 * s, 30 * s, '◀', () => { this.pcBox = (this.pcBox + pc.boxes.length - 1) % pc.boxes.length; this.pcSelected = null; this.pcMoveUid = null; this.openMenu('pc'); }).container);
      c.add(text(this, r.x + 120 * s, by, `Box ${this.pcBox + 1}/${pc.boxes.length} · ${box.name}`, 16 * s, '#ffe080').setOrigin(0.5));
      c.add(button(this, r.x + 214 * s, by, 44 * s, 30 * s, '▶', () => { this.pcBox = (this.pcBox + 1) % pc.boxes.length; this.pcSelected = null; this.pcMoveUid = null; this.openMenu('pc'); }).container);
      c.add(button(this, r.x + leftW - 370 * s, by, 92 * s, 30 * s, 'Đổi tên', () => {
        void askText(this, 'Tên box:', box.name, 24).then((name) => {
          if (name != null) { st.renameBox(this.pcBox, name); this.openMenu('pc'); }
        });
      }).container);
      c.add(button(this, r.x + leftW - 265 * s, by, 100 * s, 30 * s, `Xếp: ${this.pcSort.toUpperCase()}`, () => {
        const order: ('level' | 'name' | 'recent' | 'favorite')[] = ['level', 'name', 'recent', 'favorite'];
        this.pcSort = order[(order.indexOf(this.pcSort) + 1) % order.length];
        st.sortPc(this.pcBox, this.pcSort);
        this.openMenu('pc');
      }).container);
      c.add(button(this, r.x + leftW - 155 * s, by, 92 * s, 30 * s, `Lọc: ${this.pcFilter === 'all' ? 'Tất cả' : this.pcFilter === 'favorite' ? '★' : '✦'}`, () => {
        this.pcFilter = this.pcFilter === 'all' ? 'favorite' : this.pcFilter === 'favorite' ? 'shiny' : 'all';
        this.pcResultPage = 0;
        this.openMenu('pc');
      }).container);
      c.add(button(this, r.x + leftW - 45 * s, by, 80 * s, 30 * s, 'Tìm', () => {
        void askText(this, 'Tìm Pokémon (tên, biệt danh, loài):', this.pcQuery, 24).then((raw) => {
          if (raw != null) { this.pcQuery = raw.trim(); this.pcResultPage = 0; this.openMenu('pc'); }
        });
      }).container);
    }
    if (unplaced.length) c.add(text(this, r.x, r.y + 18 * s, `⚠ ${unplaced.length} Pokémon chưa xếp (kho đầy) — vẫn an toàn trong bộ sưu tập`, 13 * s, '#ffb060'));

    // right detail panel
    const dx = D.x, dw = D.w;
    const dy = this.portraitMenu ? D.y - 26 * s : r.y; // detail rows are laid out from here
    const p = this.pcSelected ? st.owned(this.pcSelected) : undefined;
    c.add(panel(this, dx, dy + 26 * s, dw, r.y + r.h - dy - 26 * s, COLORS.panelEdge, 0x1c2134, 1));
    if (!p) {
      c.add(text(this, dx + 16 * s, dy + 44 * s, 'Chọn một Pokémon để xem chi tiết.\n\n• Chạm ô trống để bỏ chọn\n• “Di chuyển” rồi chạm ô đích để đổi chỗ\n• Tìm/lọc xem toàn bộ kho\n• PC tự lưu mọi thay đổi', 17 * s, '#c8d0e8').setWordWrapWidth(dw - 32 * s));
      return;
    }
    const def = POKEMON.get(p.species)!;
    const stt = st.pcLocation(p.uid) ? `PC Box ${st.pcLocation(p.uid)!.box + 1} · ô ${st.pcLocation(p.uid)!.slot + 1}` : st.inParty(p.uid) ? (st.isActive(p.uid) ? 'Đang ở ngoài bóng ★' : 'Trong đội · trong bóng') : 'Chưa xếp';
    c.add(text(this, dx + 14 * s, dy + 38 * s, `${def.name}${p.nickname ? ` “${p.nickname}”` : ''}`, 24 * s));
    c.add(text(this, dx + 14 * s, dy + 68 * s, `Lv${p.level} · ${stt} · ${p.shiny ? '✦ Shiny' : 'thường'}`, 15 * s, p.shiny ? '#fff0a0' : '#a0d8ff'));
    const ik = p.shiny ? shinyKey(p.species) : p.species;
    c.add(this.add.image(dx + 66 * s, dy + 142 * s, ik).setScale(fitScale(this, ik, 110 * s)));
    let bx = dx + 128 * s;
    for (const t of def.types) { const b = typeBadge(this, bx, dy + 100 * s, t, 14 * s); c.add(b); bx += b.width + 6; }
    const ind = individualOf(p);
    const stats = calcStats(def.baseStats, p.level, ind);
    c.add(text(this, dx + 128 * s, dy + 126 * s, `HP ${Math.floor(stats.hp * 4)} · Atk ${stats.atk} · Def ${stats.def}\nSpA ${stats.spa} · SpD ${stats.spd} · Spe ${stats.spe}\nIV ${STAT_KEYS.map((k) => ind.ivs[k]).join('/')} · Thân thiết ${p.friendship ?? 0}/255`, 13 * s, '#d8e0f8').setWordWrapWidth(dw - 146 * s));
    c.add(text(this, dx + 14 * s, dy + 210 * s, `EXP ${p.exp}/${levelProgress(p) >= 1 ? 'MAX' : '—'} · Bắt lúc ${new Date(p.caughtAt).toLocaleDateString('vi-VN')}\nNguồn: ${p.origin}${p.held ? ` · Đang giữ ${ITEM_DEFS.get(p.held)?.name ?? p.held}` : ''}`, 14 * s, COLORS.dim).setWordWrapWidth(dw - 28 * s));
    let by2 = dy + 274 * s;
    if (st.pcLocation(p.uid)) {
      c.add(button(this, dx + dw / 2, by2, dw - 36 * s, 34 * s, `Rút vào đội (${st.adv.party.length}/6)`, () => {
        if (!st.withdrawFromPc(p.uid)) this.banner('Đội hình đã đủ 6 hoặc Pokémon không có trong PC', '#ff9080');
        else this.banner(`${def.name} đã vào đội (trong bóng)`, '#80ff90');
        this.adv.applyParty(); this.adv.persist(); this.openMenu('pc');
      }, 0x2f6a3a).container);
      by2 += 44 * s;
      c.add(button(this, dx + dw / 2, by2, dw - 36 * s, 34 * s, this.pcMoveUid === p.uid ? 'Đang di chuyển…' : 'Di chuyển / đổi chỗ', () => {
        this.pcQuery = ''; this.pcFilter = 'all';
        this.pcMoveUid = this.pcMoveUid === p.uid ? null : p.uid;
        this.banner(this.pcMoveUid ? 'Chạm ô trống hoặc Pokémon khác trong box để đổi chỗ' : 'Đã hủy di chuyển', '#a0d8ff');
        this.openMenu('pc');
      }, 0x4a3a6a).container);
      by2 += 44 * s;
    } else {
      c.add(button(this, dx + dw / 2, by2, dw - 36 * s, 34 * s, st.inParty(p.uid) ? 'Gửi vào PC (khỏi đội)' : 'Thêm vào đội', () => {
        const ok = st.togglePartyMember(p.uid);
        if (!ok) this.banner(st.inParty(p.uid) ? 'Cần giữ ít nhất 1 Pokémon trong đội' : 'Đội hình đã đủ 6', '#ff9080');
        else this.banner(st.inParty(p.uid) ? `${def.name} vào đội` : `${def.name} đã gửi vào PC`, '#80ff90');
        this.adv.applyParty(); this.adv.persist(); this.openMenu('pc');
      }, 0x2f6a3a).container);
      by2 += 44 * s;
    }
    c.add(button(this, dx + dw / 2, by2, dw - 36 * s, 34 * s, p.favorite ? '★ Bỏ yêu thích' : '☆ Đánh dấu yêu thích', () => {
      st.toggleFavorite(p.uid); this.openMenu('pc');
    }, p.favorite ? 0x6a5a2f : 0x2c3654).container);
    by2 += 44 * s;
    c.add(button(this, dx + dw / 2, by2, dw - 36 * s, 34 * s, 'Đổi biệt danh', () => {
      void askText(this, 'Biệt danh (để trống = bỏ):', p.nickname ?? '', 20).then((raw) => {
        if (raw != null) { st.renamePokemon(p.uid, raw); this.openMenu('pc'); }
      });
    }).container);
  }

  private pokemonDetails(c: Phaser.GameObjects.Container, r: Rect, p: OwnedPokemon): void {
    const s = this.s, st = this.adv.state;
    const def = POKEMON.get(p.species)!;
    const api = SPECIES[p.species];
    c.add(panel(this, r.x, r.y, r.w, r.h, RARITY_COLOR[def.rarity], 0x1c2134, 1));
    // official front art is fetched on first view; the panel refreshes once it arrives
    const fkey = (p.shiny ? 'front-shiny-' : 'front-') + p.species;
    if (officialPack.active && !this.textures.exists(fkey)) void (p.shiny ? loadShinyFront(p.species) : loadFront(p.species)).then(() => { if (this.menuTab === 'party' && this.textures.exists(fkey)) this.openMenu('party'); });
    if (this.textures.exists(fkey)) {
      c.add(this.add.image(r.x + 60 * s, r.y + 64 * s, fkey).setScale(fitScale(this, fkey, 110 * s)));
    } else {
      const spr = this.add.sprite(r.x + 60 * s, r.y + 64 * s, sheetKey(p.species), 0).setScale(fitScale(this, p.species, 96 * s));
      spr.play(`${p.species}:walk`);
      c.add(spr);
    }
    c.add(text(this, r.x + 120 * s, r.y + 12 * s, `${def.name}  Lv${p.level}`, 26 * s, '#ffffff'));
    let bx = r.x + 120 * s;
    for (const t of def.types) { const b = typeBadge(this, bx, r.y + 44 * s, t, 14 * s); c.add(b); bx += b.width + 6; }
    c.add(text(this, bx + 8 * s, r.y + 44 * s, `${ROLE_LABEL[def.role]} · ${api?.genus ?? ''}`, 16 * s, COLORS.dim));
    const g = this.add.graphics();
    c.add(g);
    bar(g, r.x + 120 * s, r.y + 72 * s, r.w - 140 * s, 6 * s, levelProgress(p), 0x60a0ff);
    const where = st.isActive(p.uid) ? '★ đang ở ngoài bóng' : st.pcLocation(p.uid) ? `PC Box ${st.pcLocation(p.uid)!.box + 1}` : st.inParty(p.uid) ? 'trong đội · trong bóng' : 'chưa xếp';
    c.add(text(this, r.x + 120 * s, r.y + 80 * s, `EXP ${p.exp} · ${where} · nhóm tăng trưởng ${api?.growthRate ?? '?'} (PokéAPI)`, 14 * s, st.isActive(p.uid) ? '#ffe060' : COLORS.dim));
    const ind = individualOf(p);
    const stats = calcStats(def.baseStats, p.level, ind);
    const nat = NATURES[ind.nature];
    c.add(text(this, r.x + 14 * s, r.y + 220 * s + 2,
      `Tính cách: ${nat?.name ?? ind.nature}${nat?.plus ? ` (+${STAT_VI[nat.plus]} / -${STAT_VI[nat.minus!]})` : ' (trung tính)'}   ·   Thân thiết: ${p.friendship ?? 0}/255   ·   IV ${STAT_KEYS.map((k) => ind.ivs[k]).join('/')}`,
      13 * s, '#d8c8ff'));
    const rows: [string, number, number][] = [['HP', Math.floor(stats.hp * 4), def.baseStats.hp], ['Tấn công', stats.atk, def.baseStats.atk], ['Phòng thủ', stats.def, def.baseStats.def], ['Tấn công ĐB', stats.spa, def.baseStats.spa], ['Phòng thủ ĐB', stats.spd, def.baseStats.spd], ['Tốc độ', stats.spe, def.baseStats.spe]];
    rows.forEach(([n, v, b], i) => {
      const y = r.y + 106 * s + i * 18 * s;
      c.add(text(this, r.x + 14 * s, y, `${n}`, 15 * s, COLORS.dim));
      c.add(text(this, r.x + 120 * s, y, `${v}`, 15 * s));
      bar(g, r.x + 160 * s, y + 6 * s, 120 * s, 5 * s, b / 150, b > 80 ? 0x50e060 : b > 50 ? 0xf0d030 : 0xf08040);
    });
    const evs = ind.evs;
    c.add(text(this, r.x + 300 * s, r.y + 196 * s, `EV ${STAT_KEYS.map((k) => evs?.[k] ?? 0).join('/')}  ·  tổng ${evs ? evTotal(evs) : 0}/${EV_MAX_TOTAL}`, 13 * s, '#ffd8a0'));
    c.add(text(this, r.x + 300 * s, r.y + 108 * s, `Đặc tính: ${def.passive.name}\n${def.passive.description}\nAbility (PokéAPI): ${(api?.abilities ?? []).map((a) => a.name + (a.hidden ? '*' : '')).join(', ')}`, 14 * s, '#c8e0ff').setWordWrapWidth(r.w - 314 * s));
    def.skills.forEach((id, i) => {
      const sk = getSkill(id), mv = MOVES[id];
      const y = r.y + 240 * s + i * 38 * s;
      const unlock = skillUnlockLevel(p.species, i);
      const locked = unlock > p.level;
      const icon = this.add.image(r.x + 26 * s, y + 12 * s, moveAssets(sk).icon).setScale(Math.max(1, Math.round(2 * s)));
      if (locked) icon.setTint(0x505060);
      c.add(icon);
      c.add(typeBadge(this, r.x + 46 * s, y, sk.type, 12 * s));
      const cat = sk.category === 'physical' ? 'Vật lý' : sk.category === 'special' ? 'Đặc biệt' : 'Trạng thái';
      const acc = sk.accuracy ? ` · CX ${sk.accuracy}%` : '';
      const rng = sk.range ? ` · tầm ${sk.range}` : '';
      c.add(text(this, r.x + 130 * s, y - 2 * s, locked ? `${sk.name}  — mở khóa ở Lv${unlock}` : `${sk.name}  ${cat}${sk.power ? ' · ' + sk.power : ''}${acc} · CD ${sk.cooldown}s${rng}`, 15 * s, locked ? '#8088a0' : '#ffffff'));
      c.add(text(this, r.x + 130 * s, y + 16 * s, mv?.shortEffect ?? '', 13 * s, COLORS.dim).setWordWrapWidth(r.w - 150 * s));
    });
    c.add(text(this, r.x + 14 * s, r.y + r.h - 58 * s, api?.flavorText ?? '', 14 * s, '#a8b0c8').setWordWrapWidth(r.w - 28 * s));
    // Equipment & evolution
    const held = p.held ? ITEM_DEFS.get(p.held) : undefined;
    const ctx = st.evoContext(p.uid, this.adv.evoEnv());
    const evo = evolutionsOf(p.species).map((e) => {
      const to = POKEMON.get(e.to)?.name ?? e.to;
      if (e.unsupported) return `${to}: ${e.unsupported}`;
      const miss = ctx ? missingConditions(e, ctx) : [];
      return `${to}: ${e.conditions.join(' + ')}${miss.length ? ` (còn thiếu: ${miss.join(', ')})` : ' ✓'}`;
    });
    const megas = megaFormsOf(p.species).map((m) => `${POKEMON.get(m.form)?.name} (cầm ${ITEM_DEFS.get(m.stone)?.name})`);
    c.add(text(this, r.x + 14 * s, r.y + r.h - 128 * s, `Trang bị: ${held ? held.name : 'không có'}`, 16 * s, held ? '#ffe080' : COLORS.dim));
    c.add(text(this, r.x + 14 * s, r.y + r.h - 98 * s, `Tiến hóa: ${evo.length ? evo.join(' · ') : 'dạng cuối'}${megas.length ? '   ·   Mega: ' + megas.join(', ') : ''}`, 14 * s, '#a0ffb0').setWordWrapWidth(r.w - 28 * s));
    c.add(button(this, r.x + r.w - 270 * s, r.y + r.h - 116 * s, 86 * s, 32 * s, 'Dùng kẹo', () => void this.pickCandy(p.uid)).container);
    c.add(button(this, r.x + r.w - 160 * s, r.y + r.h - 116 * s, 120 * s, 32 * s, 'Trang bị', () => void this.pickEquip(p.uid)).container);
    if (p.held) c.add(button(this, r.x + r.w - 60 * s, r.y + r.h - 116 * s, 80 * s, 32 * s, 'Gỡ', () => { this.adv.unequipItem(p.uid); this.openMenu('party'); }, 0x6a3a2f).container);
    const inParty = st.inParty(p.uid);
    c.add(button(this, r.x + r.w - 110 * s, r.y + 26 * s, 190 * s, 38 * s, inParty ? 'Rút khỏi đội' : 'Thêm vào đội', () => {
      if (!st.togglePartyMember(p.uid)) this.banner(inParty ? 'Cần giữ ít nhất 1 Pokémon trong đội' : 'Đội hình đã đủ 6', '#ff9080');
      this.adv.applyParty();
      this.adv.persist();
      this.openMenu('party');
    }, inParty ? 0x6a3a2f : 0x2f6a3a).container);
  }

  private async pickEquip(uid: string): Promise<void> {
    const st = this.adv.state;
    const list = st.equippable();
    this.closeMenu();
    if (!list.length) { this.banner('Túi không có trang bị nào (mua ở cửa hàng, mở rương, đánh Boss)', '#ff9080'); this.openMenu('party'); return; }
    const r = await this.adv.say('Trang bị', ['Chọn vật phẩm để cầm:'], [...list.map((id) => ({ label: `${ITEM_DEFS.get(id)!.name} ×${st.item(id)} — ${ITEM_DEFS.get(id)!.desc}`, value: id })), { label: 'Hủy', value: 'no' }]);
    if (r && r !== 'no') { this.adv.equipItem(uid, r); audio.play('shield'); }
    this.selected.party = uid;
    this.openMenu('party');
  }

  private async pickEquipTarget(itemId: string): Promise<void> {
    const st = this.adv.state;
    this.closeMenu();
    const r = await this.adv.say(ITEM_DEFS.get(itemId)!.name, ['Cho Pokémon nào cầm?'], [...st.save.collection.map((c) => ({ label: `${POKEMON.get(c.species)!.name} Lv${c.level}${c.held ? ` (đang cầm ${ITEM_DEFS.get(c.held)?.name})` : ''}`, value: c.uid })), { label: 'Hủy', value: 'no' }]);
    if (r && r !== 'no') this.adv.equipItem(r, itemId);
    this.openMenu('bag');
  }

  /**
   * Candy chooser for one Pokémon (from the party/PC detail). Lists only candies the bag actually has
   * and that can still do something, then opens the quantity dialog.
   */
  private async pickCandy(uid: string): Promise<void> {
    const st = this.adv.state, p = st.owned(uid);
    this.closeMenu();
    if (!p) return;
    const list = CANDY_DEFS.filter((c) => st.item(c.id) > 0 && maxUsefulCandy(p, c.id) > 0);
    if (!list.length) {
      this.banner('Túi không có kẹo nào dùng được cho Pokémon này (hoặc đã đạt Lv100)', '#ff9080');
      this.openMenu('party');
      return;
    }
    const r = await this.adv.say('Dùng kẹo', [`${POKEMON.get(p.species)?.name} Lv${p.level} — chọn loại kẹo:`], [
      ...list.map((c) => ({ label: `${c.name} ×${st.item(c.id)} — ${c.desc}`, value: c.id })),
      { label: 'Hủy', value: 'no' },
    ]);
    if (r && r !== 'no') this.openCandyDialog(uid, r, 'party');
    else this.openMenu('party');
  }

  private async pickCandyTarget(candyId: string): Promise<void> {
    const st = this.adv.state, def = candyDef(candyId);
    this.closeMenu();
    if (!def) return;
    const mons = [...st.save.collection].sort((a, b) => Number(st.inParty(b.uid)) - Number(st.inParty(a.uid)) || b.level - a.level);
    if (!mons.length) { this.banner('Chưa có Pokémon nào', '#ff9080'); this.openMenu('bag'); return; }
    const r = await this.adv.say(def.name, [`Túi còn ${st.item(candyId)}. Dùng cho Pokémon nào?`], [
      ...mons.map((p) => ({
        label: `${POKEMON.get(p.species)?.name} Lv${p.level} · EXP ${p.exp}${maxUsefulCandy(p, candyId) > 0 ? '' : ' · tối đa/không dùng được'}`,
        value: p.uid,
      })),
      { label: 'Hủy', value: 'no' },
    ]);
    if (r && r !== 'no') this.openCandyDialog(r, candyId, 'bag');
    else this.openMenu('bag');
  }

  private closeCandyDialog(): void {
    this.candyDialog?.destroy();
    this.candyDialog = null;
  }

  /** Quantity + live preview. The actual EXP/level math always comes from core/candy (server-shared). */
  private openCandyDialog(uid: string, candyId: string, from: 'bag' | 'party', qty = 1): void {
    const st = this.adv.state, p = st.owned(uid), def = candyDef(candyId);
    if (!p || !def) return;
    this.closeMenu();
    this.closeCandyDialog();
    const max = Math.min(st.item(candyId), maxUsefulCandy(p, candyId));
    const n = Phaser.Math.Clamp(Math.floor(qty), max > 0 ? 1 : 0, Math.max(1, max));
    const preview = previewCandy(p, candyId, n);
    const { width: W, height: H } = this.scale;
    const s = this.s;
    const c = this.add.container(0, 0).setDepth(130);
    this.candyDialog = c;
    this.adv.modal = true;
    c.add(this.add.rectangle(0, 0, W, H, 0x05060c, 0.82).setOrigin(0).setInteractive());
    const pw = Math.min(W - 24, 620 * s), ph = Math.min(H - 24, 430 * s);
    const x0 = (W - pw) / 2, y0 = (H - ph) / 2;
    c.add(panel(this, x0, y0, pw, ph, def.color, 0x1a1f30, 1));
    c.add(this.add.image(x0 + 42 * s, y0 + 42 * s, itemIconKey(this, candyId)).setScale(2.4 * s));
    c.add(text(this, x0 + 70 * s, y0 + 22 * s, def.name, 26 * s, '#ffffff'));
    c.add(text(this, x0 + 70 * s, y0 + 52 * s, `Túi còn ${st.item(candyId)} · dùng được tối đa ${max}`, 15 * s, COLORS.dim));
    c.add(button(this, x0 + pw - 30 * s, y0 + 30 * s, 40 * s, 34 * s, '✕', () => this.closeCandyDialog(), 0x6a2f2f).container);

    const ik = p.shiny ? shinyKey(p.species) : p.species;
    c.add(this.add.image(x0 + pw / 2, y0 + 116 * s, ik).setScale(fitScale(this, ik, 92 * s)));
    c.add(text(this, x0 + pw / 2, y0 + 164 * s, `${POKEMON.get(p.species)?.name} Lv${p.level} · EXP ${p.exp}`, 20 * s).setOrigin(0.5));
    c.add(text(this, x0 + pw / 2, y0 + 192 * s, `→ Lv${preview.afterLevel} · +${preview.expGained} EXP${preview.levels ? ` · +${preview.levels} cấp` : ''}${def.kind === 'rare' ? ' · +1 cấp / viên' : ''}`, 18 * s, '#ffe060').setOrigin(0.5));

    const qy = y0 + 236 * s;
    c.add(button(this, x0 + pw / 2 - 120 * s, qy, 44 * s, 36 * s, '−', () => this.openCandyDialog(uid, candyId, from, Math.max(1, n - 1)), 0x2c3654).container);
    c.add(text(this, x0 + pw / 2, qy, `×${n}`, 28 * s, '#ffffff').setOrigin(0.5));
    c.add(button(this, x0 + pw / 2 + 120 * s, qy, 44 * s, 36 * s, '+', () => this.openCandyDialog(uid, candyId, from, Math.min(max, n + 1)), 0x2c3654).container);
    c.add(button(this, x0 + pw / 2, qy + 46 * s, 140 * s, 32 * s, `Tất cả (${max})`, () => this.openCandyDialog(uid, candyId, from, Math.max(1, max)), 0x4a5a8a).container);
    c.add(button(this, x0 + pw / 2, y0 + ph - 50 * s, 220 * s, 44 * s, max > 0 ? `Dùng ${n} ${def.name}` : 'Không thể dùng', () => {
      if (max <= 0) return;
      const res = this.adv.useCandy(uid, candyId, n);
      this.closeCandyDialog();
      if (res.used > 0) {
        audio.play('levelup');
        this.banner(`${def.name} ×${res.used}: +${res.expGained} EXP · Lv${res.afterLevel}${res.evolutions.length ? ' · tiến hóa sẵn sàng!' : ''}`, '#ffe060');
      } else {
        this.banner('Không có tác dụng (đã đạt giới hạn cấp)', '#ff9080');
      }
      if (res.evolutions.length) return; // let AdventureScene run the evolution cinematic
      this.openMenu(from);
    }, max > 0 ? 0x2f6a3a : 0x3a3a4a).container);
    c.add(text(this, x0 + pw / 2, y0 + ph - 18 * s, 'Mẹo: giữ nhiều viên rồi dùng một lần — không cần bấm từng viên.', 13 * s, COLORS.dim).setOrigin(0.5));
  }

  private async pickEvTarget(itemId: string): Promise<void> {
    const st = this.adv.state, def = ITEM_DEFS.get(itemId)!, stat = def.ev!.stat as StatKey;
    this.closeMenu();
    const r = await this.adv.say(def.name, [def.desc, 'Dùng cho Pokémon nào?'], [...st.save.collection.map((c) => ({
      label: `${POKEMON.get(c.species)!.name} Lv${c.level} — EV ${STAT_VI[stat]} ${c.evs?.[stat] ?? 0}/${EV_MAX_STAT} (tổng ${c.evs ? evTotal(c.evs) : 0}/${EV_MAX_TOTAL})`, value: c.uid,
    })), { label: 'Hủy', value: 'no' }]);
    if (r && r !== 'no') {
      const p = st.owned(r)!, applied = this.adv.useEvItem(r, itemId);
      this.banner(applied ? `${POKEMON.get(p.species)!.name}: EV ${STAT_VI[stat]} ${applied > 0 ? '+' : ''}${applied}` : 'Không có tác dụng (EV đã ở giới hạn 0 / 252 / 510)', applied ? '#80ff90' : '#ff9080');
    }
    this.openMenu('bag');
  }

  private buildDex(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, sv = this.adv.state.save;
    const list = Object.values(SPECIES).sort((a, b) => a.id - b.id);
    const caught = new Set(sv.pokedex.caught), seen = new Set(sv.pokedex.seen);
    c.add(text(this, r.x, r.y, `Đã thấy ${seen.size} · Đã bắt ${caught.size} / ${list.length} loài trong dữ liệu`, 17 * s, COLORS.dim));
    const [L, D] = this.split(r, 0.5, 0.4), lw = L.w, cols = 4, cw = lw / cols, chh = 42 * s;
    const perPage = cols * Math.max(1, Math.floor((L.h - 70 * s) / (chh + 4 * s)));
    const pages = Math.ceil(list.length / perPage);
    this.dexPage = Math.min(this.dexPage, pages - 1);
    if (pages > 1) {
      c.add(button(this, r.x + 50 * s, L.y + L.h - 16 * s, 90 * s, 28 * s, '◀', () => { this.dexPage = (this.dexPage + pages - 1) % pages; this.openMenu('dex'); }).container);
      c.add(text(this, r.x + lw / 2, L.y + L.h - 16 * s, `${this.dexPage + 1}/${pages}`, 16 * s).setOrigin(0.5));
      c.add(button(this, r.x + lw - 50 * s, L.y + L.h - 16 * s, 90 * s, 28 * s, '▶', () => { this.dexPage = (this.dexPage + 1) % pages; this.openMenu('dex'); }).container);
    }
    list.slice(this.dexPage * perPage, (this.dexPage + 1) * perPage).forEach((sp, i) => {
      const x = r.x + (i % cols) * cw, y = r.y + 28 * s + Math.floor(i / cols) * (chh + 4 * s);
      const known = seen.has(sp.name) || caught.has(sp.name);
      const g = this.add.graphics();
      g.fillStyle(this.selected.dex === sp.name ? 0x34406a : 0x20263a, 1).fillRect(x, y, cw - 6 * s, chh);
      c.add(g);
      const tex = this.textures.exists(sp.name) ? sp.name : sp.name === 'onix' ? 'onix_head' : 'icon_pokeball';
      const img = this.add.image(x + 20 * s, y + chh / 2, tex);
      img.setScale(Math.min(2 * s, (chh - 6 * s) / img.height));
      if (!known) img.setTintFill(0x101018);
      c.add(img);
      c.add(text(this, x + 40 * s, y + 2 * s, `#${String(sp.id).padStart(3, '0')}`, 12 * s, COLORS.dim));
      c.add(text(this, x + 40 * s, y + 18 * s, known ? sp.displayName : '???', 14 * s, caught.has(sp.name) ? '#ffe080' : '#ffffff'));
      if (caught.has(sp.name)) c.add(this.add.image(x + cw - 18 * s, y + 12 * s, 'icon_pokeball').setScale(1.6 * s));
      const z = this.add.zone(x, y, cw - 6 * s, chh).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { this.selected.dex = sp.name; this.dexStatus = ''; this.openMenu('dex'); });
      c.add(z);
    });
    const firstKnown = list.find((sp) => seen.has(sp.name) || caught.has(sp.name)) ?? list[0];
    const sel = SPECIES[this.selected.dex ?? firstKnown.name];
    const known = seen.has(sel.name) || caught.has(sel.name);
    const dx = D.x, dw = D.w;
    const dy = this.portraitMenu ? D.y - 24 * s : r.y; // detail rows are laid out from here
    c.add(panel(this, dx, dy + 24 * s, dw, r.y + r.h - dy - 24 * s, COLORS.panelEdge, 0x1c2134, 1));
    if (!known) { c.add(text(this, dx + 20 * s, dy + 50 * s, '???\nChưa gặp loài này. Khám phá thêm để ghi nhận vào Pokédex.', 20 * s).setWordWrapWidth(dw - 40 * s)); return; }
    c.add(text(this, dx + 16 * s, dy + 34 * s, `#${String(sel.id).padStart(3, '0')} ${sel.displayName}`, 26 * s));
    c.add(text(this, dx + 16 * s, dy + 64 * s, sel.genus, 17 * s, COLORS.dim));
    let bx = dx + 16 * s;
    for (const t of sel.types) { const b = typeBadge(this, bx, dy + 88 * s, t, 14 * s); c.add(b); bx += b.width + 6; }
    c.add(text(this, dx + 16 * s, dy + 116 * s, `Cao ${(sel.heightDm / 10).toFixed(1)}m · Nặng ${(sel.weightHg / 10).toFixed(1)}kg · Tỉ lệ bắt ${sel.captureRate}/255 · ${sel.growthRate}`, 15 * s, '#c8e0ff').setWordWrapWidth(dw - 32 * s));
    const g = this.add.graphics();
    c.add(g);
    (['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).forEach((k, i) => {
      const y = dy + 150 * s + i * 20 * s;
      c.add(text(this, dx + 16 * s, y, ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'][i] + ' ' + sel.baseStats[k], 15 * s));
      bar(g, dx + 100 * s, y + 6 * s, dw - 130 * s, 6 * s, sel.baseStats[k] / 160, 0x60c0ff);
    });
    const evo = sel.evolutions.map((e) => `${e.from} → ${e.to}${e.minLevel ? ' (Lv' + e.minLevel + ')' : ''}`).join(',  ');
    const megaForms = megaFormsOf(sel.name).map((m) => `${POKEMON.get(m.form)?.name} (${POKEMON.get(m.form)?.types.join('/')})`);
    c.add(text(this, dx + 16 * s, dy + 280 * s, `Tiến hóa: ${evo || 'không có'}${megaForms.length ? '\nMega: ' + megaForms.join(', ') : ''}${POKEMON.get(sel.name)?.fakemon ? '\nFakemon nguyên bản của IcyEthics (không có trong PokéAPI)' : ''}`, 15 * s, '#d0ffd0').setWordWrapWidth(dw - 32 * s));
    // Encounter info (V3 §4.3): habitat, rarity, time, weather, method — never an exact position
    const eco = ECOLOGY.get(sel.name);
    if (eco) {
      const leg = LEGENDS.get(sel.name);
      const method = leg ? `${LEGEND_KIND_VI[leg.kind]}${leg.kind === 'roaming' ? ' — ' + (this.adv.legendsMgr?.roamHint(sel.name) ?? '') : leg.name ? ' — ' + leg.name : ''}`
        : eco.method === 'event' ? 'Chỉ qua sự kiện (bùng phát / thời tiết dị thường / vùng biến dạng)' : eco.method === 'wild' ? 'Hoang dã' : 'Tiến hóa';
      const prefer = Object.entries(eco.weather).filter(([, v]) => (v ?? 1) > 1).map(([k]) => WEATHER_LABEL[k] ?? k).join(', ');
      const info = leg
        ? `Huyền thoại · ${method}${leg.time ? ' · ' + (leg.time === 'night' ? 'ban đêm' : leg.time === 'dawn' ? 'bình minh' : 'ban ngày') : ''}${caught.has(sel.name) ? '\n' + leg.lore : ''}`
        : `Môi trường: ${eco.biomes.map((b) => BIOME_VI[b] ?? b).join(', ')} · Độ hiếm: ${RARITY_LABEL[eco.rarity]} · ${eco.time === 'night' ? 'Ban đêm' : 'Mọi lúc'}${prefer ? ' · Ưa: ' + prefer : ''}\nCách gặp: ${method}${eco.minLevel > 1 ? ` (từ Lv${eco.minLevel})` : ''}${sv.pokedex.shiny?.includes(sel.name) ? '  ·  ✦ Đã bắt Shiny' : ''}`;
      c.add(text(this, dx + 16 * s, dy + 322 * s, info, 14 * s, '#f0d8ff').setWordWrapWidth(dw - 32 * s));
    }
    c.add(text(this, dx + 16 * s, dy + 372 * s, sel.flavorText, 16 * s, '#e0e4f0').setWordWrapWidth(dw - 32 * s));
    c.add(text(this, dx + 16 * s, r.y + r.h - 70 * s, this.dexStatus || 'Dữ liệu từ PokéAPI (cache cục bộ).', 14 * s, COLORS.dim).setWordWrapWidth(dw - 220 * s));
    c.add(button(this, dx + dw - 100 * s, r.y + r.h - 40 * s, 180 * s, 36 * s, 'Làm mới PokéAPI', () => {
      this.dexStatus = 'Đang kết nối pokeapi.co...';
      this.openMenu('dex');
      pokemonData.refresh(sel.name).then((d) => {
        this.dexStatus = `Đã đồng bộ ${d.displayName} từ PokéAPI lúc ${new Date().toLocaleTimeString()} (đã lưu vào IndexedDB).`;
        if (this.menuTab === 'dex') this.openMenu('dex');
      }).catch(() => {
        this.dexStatus = 'Không kết nối được PokéAPI — đang dùng dữ liệu cache.';
        if (this.menuTab === 'dex') this.openMenu('dex');
      });
    }).container);
  }

  private buildBag(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, st = this.adv.state;
    const base = [...BALL_ORDER, 'potion', 'superpotion', 'oranberry'];
    const extra = Object.keys(st.save.inventory).filter((k) => !base.includes(k) && st.item(k) > 0 && ITEMS[k]);
    const ids = [...base, ...extra];
    c.add(text(this, r.x, r.y, `Xu: ${st.money}   ·   Vật phẩm: ${ids.filter((i) => st.item(i) > 0).length}`, 18 * s, '#ffe066'));
    const cols = this.portraitMenu ? 1 : 2, cw = r.w / cols - 6 * s, rh = 54 * s;
    const rowsPerPage = Math.max(1, Math.floor((r.h - 92 * s) / (rh + 6 * s)));
    const perPage = cols * rowsPerPage;
    const pages = Math.max(1, Math.ceil(ids.length / perPage));
    this.bagPage = Phaser.Math.Clamp(this.bagPage, 0, pages - 1);
    ids.slice(this.bagPage * perPage, (this.bagPage + 1) * perPage).forEach((id, i) => {
      const x = r.x + (i % cols) * (cw + 12 * s), y = r.y + 26 * s + Math.floor(i / cols) * (rh + 6 * s);

      const it = ITEMS[id];
      const def = ITEM_DEFS.get(id);
      c.add(panel(this, x, y, cw, rh, def?.kind === 'megaStone' || def?.kind === 'key' ? 0xff80e0 : COLORS.panelEdge, 0x1c2134, 1));
      // pixel item icon (balls, potions, berry, stones, Mega Stones, held charms)
      // official item art (personal pack) when available, else the original pixel icon
      const ikey = itemIconKey(this, id);
      const official = ikey.startsWith('oitem-');
      const icon = this.add.image(x + 26 * s, y + rh / 2, ikey).setScale(official ? Math.max(1, Math.round(1.5 * s)) : Math.max(1, Math.round(3 * s)));
      c.add(icon);
      c.add(text(this, x + 52 * s, y + 4 * s, `${it.name}  ×${st.item(id)}`, 17 * s));
      c.add(text(this, x + 52 * s, y + 26 * s, it.desc, 13 * s, COLORS.dim).setWordWrapWidth(cw - 170 * s));
      if (st.item(id) <= 0) return;
      let label = '', fn: (() => void) | null = null;
      if (it.kind === 'ball') { label = this.adv.selectedBall === id ? 'Đang dùng' : 'Chọn'; fn = () => { this.adv.selectedBall = id as BallId; this.openMenu('bag'); }; }
      else if (it.kind === 'heal') { label = 'Dùng'; fn = () => { this.adv.useItem(id); this.openMenu('bag'); }; }
      else if (it.kind === 'stone') { label = 'Dùng'; fn = () => { this.closeMenu(); void this.adv.useStone(id); }; }
      else if (it.kind === 'held') { label = 'Trang bị'; fn = () => void this.pickEquipTarget(id); }
      else if (it.kind === 'ev') { label = 'Dùng'; fn = () => void this.pickEvTarget(id); }
      else if (it.kind === 'candy') { label = 'Dùng'; fn = () => void this.pickCandyTarget(id); }
      if (fn) c.add(button(this, x + cw - 62 * s, y + rh / 2, 110 * s, 32 * s, label, fn).container);
    });
    if (pages > 1) {
      const cy = r.y + r.h - 26 * s;
      c.add(button(this, r.x + r.w / 2 - 135 * s, cy, 110 * s, 34 * s, '◀ Trước', () => {
        this.bagPage = Math.max(0, this.bagPage - 1); this.openMenu('bag');
      }).container);
      c.add(text(this, r.x + r.w / 2, cy, `Trang ${this.bagPage + 1}/${pages} · Cuộn chuột`, 17 * s).setOrigin(0.5));
      c.add(button(this, r.x + r.w / 2 + 135 * s, cy, 110 * s, 34 * s, 'Sau ▶', () => {
        this.bagPage = Math.min(pages - 1, this.bagPage + 1); this.openMenu('bag');
      }).container);
    }

  }

  private buildQuests(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, st = this.adv.state, qs = st.quests;
    const list = qs.defs.filter((d) => qs.states[d.id].status === 'active' || qs.states[d.id].status === 'completed' || qs.states[d.id].status === 'available');
    const [L, D] = this.split(r, 0.42, 0.4), lw = L.w;
    list.sort((a, b) => order(qs.states[a.id].status) - order(qs.states[b.id].status));
    const perPage = Math.max(1, Math.floor((L.h - 40 * s) / (46 * s)));
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    this.questPage = Phaser.Math.Clamp(this.questPage, 0, pages - 1);
    if (pages > 1) {
      c.add(button(this, r.x + 50 * s, L.y + L.h - 16 * s, 90 * s, 28 * s, '◀', () => { this.questPage = (this.questPage + pages - 1) % pages; this.openMenu('quests'); }).container);
      c.add(text(this, r.x + lw / 2, L.y + L.h - 16 * s, `${this.questPage + 1}/${pages}`, 16 * s).setOrigin(0.5));
      c.add(button(this, r.x + lw - 50 * s, L.y + L.h - 16 * s, 90 * s, 28 * s, '▶', () => { this.questPage = (this.questPage + 1) % pages; this.openMenu('quests'); }).container);
    }
    list.slice(this.questPage * perPage, (this.questPage + 1) * perPage).forEach((d, i) => {
      const y = r.y + i * 46 * s;
      const stt = qs.states[d.id].status;
      const g = this.add.graphics();
      g.fillStyle(this.selected.quest === d.id ? 0x34406a : 0x20263a, 1).fillRect(r.x, y, lw, 40 * s);
      c.add(g);
      c.add(text(this, r.x + 10 * s, y + 4 * s, `${stt === 'completed' ? '✓' : stt === 'available' ? '!' : st.trackedQuest === d.id ? '◆' : '•'} ${d.title}`, 18 * s, stt === 'completed' ? '#80c080' : stt === 'available' ? '#ffe080' : '#ffffff'));
      c.add(text(this, r.x + 10 * s, y + 22 * s, `${kindLabel(d.kind)} · ${stt === 'available' ? 'Có thể nhận' : stt === 'completed' ? 'Đã xong' : 'Đang làm'}`, 13 * s, COLORS.dim));
      const z = this.add.zone(r.x, y, lw, 40 * s).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { this.selected.quest = d.id; this.openMenu('quests'); });
      c.add(z);
    });
    const sel = qs.def(this.selected.quest ?? st.trackedQuest ?? list[0]?.id ?? '');
    const dx = D.x, dw = D.w, dy = D.y;
    c.add(panel(this, dx, dy, dw, D.h, COLORS.panelEdge, 0x1c2134, 1));
    if (!sel) { c.add(text(this, dx + 16 * s, dy + 16 * s, 'Chưa có nhiệm vụ.', 20 * s)); return; }
    const state = qs.states[sel.id];
    c.add(text(this, dx + 16 * s, dy + 12 * s, sel.title, 26 * s));
    c.add(text(this, dx + 16 * s, dy + 46 * s, sel.description, 17 * s, '#d0d8f0').setWordWrapWidth(dw - 32 * s));
    sel.objectives.forEach((o, i) => {
      const done = state.status === 'completed' || i < state.step;
      const cur = state.status === 'active' && i === state.step;
      const prog = cur && o.count > 1 ? ` (${state.progress}/${o.count})` : '';
      c.add(text(this, dx + 24 * s, dy + 110 * s + i * 28 * s, `${done ? '☑' : cur ? '▶' : '☐'} ${o.text.replace(/\(\d+\/\d+\)/, '')}${prog}`, 18 * s, done ? '#80c080' : cur ? '#ffe080' : COLORS.dim));
    });
    const rw = sel.rewards;
    const rewards = [...Object.entries(rw.items ?? {}).map(([k, v]) => `${v} ${ITEMS[k]?.name ?? k}`), rw.worldExp ? `${rw.worldExp} EXP thế giới` : '', rw.reputation ? `${rw.reputation} danh tiếng` : '', rw.pokemon ? `${POKEMON.get(rw.pokemon.species)?.name} Lv${rw.pokemon.level}` : ''].filter(Boolean);
    c.add(text(this, dx + 16 * s, r.y + r.h - 90 * s, `Phần thưởng: ${rewards.join(', ')}`, 16 * s, '#9fe0a0').setWordWrapWidth(dw - 32 * s));
    if (state.status === 'active') c.add(button(this, dx + dw - 100 * s, r.y + r.h - 30 * s, 170 * s, 36 * s, st.trackedQuest === sel.id ? 'Đang theo dõi' : 'Theo dõi', () => { st.trackedQuest = sel.id; this.openMenu('quests'); }).container);
  }

  private buildMap(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, a = this.adv, m = a.map, st = a.state;
    const key = this.ensureMapTexture();
    const side = this.portraitMenu ? r.w : 250 * s;
    const vw = this.portraitMenu ? r.w : r.w - side - 12 * s, vh = this.portraitMenu ? r.h - 540 * s : r.h - 10 * s;
    const base = Math.min(vw / m.widthTiles, vh / m.heightTiles);
    const k = base * this.mapView.zoom;
    const view = this.add.container(r.x, r.y);
    c.add(view);
    const maskG = this.make.graphics({}, false).fillRect(r.x, r.y, vw, vh);
    view.setMask(maskG.createGeometryMask());
    const inner = this.add.container(this.mapView.ox, this.mapView.oy);
    view.add(inner);
    inner.add(this.add.image(0, 0, key).setOrigin(0).setScale(k));
    const g = this.add.graphics();
    inner.add(g);
    const region = this.adv.regionDef;
    if (m.kind === 'overworld') {
      const cols = chunkCols(m), rows = chunkRows(m), n = m.chunk, disc = new Set(st.discoveredList());
      g.fillStyle(0x0a0c14, 1); // undiscovered chunks reveal nothing
      for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) if (!disc.has(cy * cols + cx)) g.fillRect(cx * n * k, cy * n * k, n * k + 1, n * k + 1);
      const isDisc = (tx: number, ty: number) => disc.has(Math.floor(ty / n) * cols + Math.floor(tx / n));
      for (const wpt of region.waypoints) {
        if (!isDisc(wpt.x, wpt.y)) continue;
        const on = st.adv.waypoints.includes(wpt.id);
        const x = (wpt.x + 0.5) * k, y = (wpt.y + 0.5) * k;
        g.fillStyle(on ? 0x40d0ff : 0x607080, 1).fillTriangle(x, y - 8, x - 6, y + 4, x + 6, y + 4);
        if (on) {
          const z = this.add.zone(x - 12, y - 12, 24, 24).setOrigin(0).setInteractive({ useHandCursor: true });
          z.on('pointerup', () => { if (a.fastTravel(wpt.id)) this.closeMenu(); });
          inner.add(z);
          inner.add(text(this, x, y + 8, wpt.name, 13 * s, '#a0e8ff').setOrigin(0.5, 0));
        }
      }
      for (const d of region.dungeons) if (isDisc(d.x, d.y)) {
        g.fillStyle(0xd08040, 1).fillRect((d.x + 0.5) * k - 5, (d.y + 0.5) * k - 5, 10, 10);
        const bossQ = st.quests.states['q-main-3']?.status === 'active';
        inner.add(text(this, (d.x + 0.5) * k, (d.y + 0.5) * k - 24, bossQ ? 'BOSS' : d.name, 13 * s, bossQ ? '#ff6060' : '#ffd0a0').setOrigin(0.5));
      }
      for (const e of a.worldEvents?.views() ?? []) {
        if (!e.x) continue;
        const ex = (e.x / TILE_PX) * k, ey = (e.y / TILE_PX) * k;
        if (e.approx) g.lineStyle(2, 0xffd080, 0.9).strokeCircle(ex, ey, (e.approx / TILE_PX) * k);
        else g.fillStyle(EVENT_COLOR[e.type] ?? 0xd090ff, 1).fillTriangle(ex, ey - 9, ex - 8, ey + 6, ex + 8, ey + 6);
        inner.add(text(this, ex, ey + 8, `${e.name} ${fmtTime(e.left)}`, 13 * s, '#f0d8ff').setOrigin(0.5, 0));
      }
      for (const q of st.quests.active()) {
        const o = st.quests.currentObjective(q.id);
        if (!o?.marker || (o.marker.region ?? 'starter-valley') !== a.regionDef.id) continue;
        g.fillStyle(q.id === st.trackedQuest ? 0xffe040 : 0xc0a040, 1).fillCircle((o.marker.x + 0.5) * k, (o.marker.y + 0.5) * k, q.id === st.trackedQuest ? 6 : 4);
      }
    }
    const t = a.world.trainer;
    g.fillStyle(0xffffff, 1).fillCircle((t.x / TILE_PX) * k, (t.y / TILE_PX) * k, 5);
    g.lineStyle(2, 0x000000, 1).strokeCircle((t.x / TILE_PX) * k, (t.y / TILE_PX) * k, 5);
    // pan by drag, zoom by wheel/buttons
    const pan = this.add.zone(r.x, r.y, vw, vh).setOrigin(0).setInteractive();
    c.addAt(pan, 2);
    let drag: { x: number; y: number; ox: number; oy: number } | null = null;
    pan.on('pointerdown', (p: Phaser.Input.Pointer) => { drag = { x: p.x, y: p.y, ox: this.mapView.ox, oy: this.mapView.oy }; });
    pan.on('pointermove', (p: Phaser.Input.Pointer) => { if (drag && p.isDown) { this.mapView.ox = drag.ox + p.x - drag.x; this.mapView.oy = drag.oy + p.y - drag.y; inner.setPosition(this.mapView.ox, this.mapView.oy); } });
    pan.on('pointerup', () => { drag = null; });
    pan.on('wheel', (_p: Phaser.Input.Pointer, _dx: number, dy: number) => this.zoomMap(dy < 0 ? 1.25 : 0.8));
    const sx = this.portraitMenu ? r.x : r.x + vw + 12 * s, sy = this.portraitMenu ? r.y + vh + 8 * s : r.y;
    c.add(button(this, sx + 40 * s, sy + 20 * s, 70 * s, 34 * s, '+', () => this.zoomMap(1.25)).container);
    c.add(button(this, sx + 120 * s, sy + 20 * s, 70 * s, 34 * s, '−', () => this.zoomMap(0.8)).container);
    c.add(button(this, sx + 200 * s, sy + 20 * s, 70 * s, 34 * s, '⌖', () => { this.mapView = { zoom: 1, ox: 0, oy: 0 }; this.openMenu('map'); }).container);
    const tot = a.totals();
    c.add(text(this, sx, sy + 50 * s, `Khám phá: ${st.explorationPercent(tot.chunks, tot.chests, tot.waypoints)}%\nCấp thế giới: ${st.worldLevel}\nDanh tiếng: ${st.adv.reputation}\nTrạm: ${st.adv.waypoints.length}/${tot.waypoints} · Rương: ${st.adv.chests.length}/${tot.chests}\nThời gian chơi: ${fmtTime(st.adv.playTime)}`, 16 * s, '#d0d8f0'));
    const vn = st.adv.campaign === 'vietnam';
    c.add(text(this, sx, sy + 170 * s, vn ? 'HÀNH TRÌNH VIỆT NAM' : 'CÁC VÙNG', 18 * s, '#ffe080'));
    const rowH = (this.portraitMenu ? 52 : 40) * s; // a wrapped hint takes two lines
    if (vn) c.add(button(this, sx + 110 * s, sy + 216 * s + VN_REGIONS.length * rowH, 200 * s, 34 * s, 'Mở Hộ chiếu (P)', () => this.openMenu('passport'), 0x7a3a2a).container);
    (vn ? VN_REGIONS : REGIONS).forEach((rg, i) => {
      const unlocked = rg.need.every((f) => st.hasFlag(f));
      const cur = rg.id === a.regionDef.id;
      const lv = ENC_REGIONS.get(rg.id);
      const status = cur ? 'đang ở đây' : unlocked ? `đã mở — đi qua cổng${lv ? ` · Lv${lv.level[0]}–${lv.level[1]}` : ''}` : `khóa · ${rg.hint}`;
      c.add(text(this, sx, sy + 196 * s + i * rowH, `${cur ? '▶' : unlocked ? '○' : '–'} ${rg.name}`, 16 * s, cur ? '#80ff90' : unlocked ? '#ffe080' : COLORS.dim));
      c.add(text(this, sx + 14 * s, sy + 214 * s + i * rowH, status, 13 * s, COLORS.dim).setWordWrapWidth(side - 20 * s));
    });
    c.add(text(this, r.x + 8 * s, r.y + vh - 22 * s, 'Kéo để di chuyển · cuộn/nút để thu phóng · chạm trạm xanh để dịch chuyển', 14 * s, COLORS.dim));
  }

  /** Menu tabs of this save: the Passport only exists in the Vietnam Odyssey. */
  private tabs(): typeof TABS {
    return this.adv.state.adv.campaign === 'vietnam' ? TABS : TABS.filter((t) => t.id !== 'passport');
  }

  private buildPassport(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, st = this.adv.state;
    const pages = passportPages(st.adv, st.quests.defs.map((d) => d.id));
    const visited = pages.filter((p) => p.visited).length, badges = pages.filter((p) => p.badge).length;
    c.add(text(this, r.x, r.y, 'HỘ CHIẾU HÀNH TRÌNH VIỆT NAM', 22 * s, '#ffe080'));
    c.add(text(this, r.x, r.y + 30 * s, `Tỉnh đã đến: ${visited}/${pages.filter((p) => p.playable).length} · Huy hiệu: ${badges} · Thời gian chơi: ${fmtTime(st.adv.playTime)}`, 16 * s, '#d0d8f0'));
    const per = this.portraitMenu ? 1 : 3, total = Math.max(1, Math.ceil(pages.length / per));
    this.passportPage = Math.min(this.passportPage, total - 1);
    const shown = pages.slice(this.passportPage * per, this.passportPage * per + per);
    const top = r.y + 62 * s, ch = r.h - 62 * s - (total > 1 ? 44 * s : 4 * s), gap = 12 * s;
    const cw = (r.w - gap * (per - 1)) / per;
    shown.forEach((p, i) => this.passportCard(c, { x: r.x + i * (cw + gap), y: top, w: cw, h: ch }, p));
    if (total > 1) {
      c.add(button(this, r.x + 60 * s, r.y + r.h - 18 * s, 100 * s, 30 * s, '◀', () => { this.passportPage = (this.passportPage + total - 1) % total; this.openMenu('passport'); }).container);
      c.add(text(this, r.x + r.w / 2, r.y + r.h - 18 * s, `${this.passportPage + 1}/${total}`, 16 * s, COLORS.dim).setOrigin(0.5));
      c.add(button(this, r.x + r.w - 60 * s, r.y + r.h - 18 * s, 100 * s, 30 * s, '▶', () => { this.passportPage = (this.passportPage + 1) % total; this.openMenu('passport'); }).container);
    }
  }

  private passportCard(c: Phaser.GameObjects.Container, r: Rect, p: ProvincePage): void {
    const s = this.s, live = p.visited;
    c.add(panel(this, r.x, r.y, r.w, r.h, live ? 0xc08040 : 0x3a4058, live ? 0x2a2218 : 0x161a26, 0.98));
    c.add(text(this, r.x + 14 * s, r.y + 12 * s, p.def.name.toUpperCase(), 22 * s, live ? '#ffe0a0' : COLORS.dim));
    // stamp: red circle with the first-visit date, or why the province is still closed
    const sx = r.x + r.w - 50 * s, sy = r.y + 46 * s, g = this.add.graphics();
    c.add(g);
    if (live) {
      g.lineStyle(3 * s, 0xd03030, 0.9).strokeCircle(sx, sy, 34 * s).lineStyle(1.5 * s, 0xd03030, 0.9).strokeCircle(sx, sy, 28 * s);
      const d = p.firstVisit ? new Date(p.firstVisit) : null;
      c.add(text(this, sx, sy - 8 * s, 'ĐÃ ĐẾN', 13 * s, '#ff6060').setOrigin(0.5).setAngle(-12));
      c.add(text(this, sx, sy + 9 * s, d ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}` : '—', 11 * s, '#ff8080').setOrigin(0.5).setAngle(-12));
    } else c.add(text(this, r.x + 14 * s, r.y + 44 * s, !p.playable ? 'Chưa có trong phiên bản này' : p.unlocked ? 'Đường đã mở — chưa đặt chân tới' : `Khóa · ${p.def.hint}`, 14 * s, COLORS.dim).setWordWrapWidth(r.w - 28 * s));
    if (!p.playable) return;
    const line = (label: string, n: { done: number; total: number }) => n.total ? `${n.done >= n.total ? '☑' : '☐'} ${label}: ${n.done}/${n.total}` : '';
    const rows = [
      line('Khu vực', p.areas), line('Nhiệm vụ', p.quests), line('Huấn luyện viên', p.trainers), line('Rương', p.chests),
      line('Trạm dịch chuyển', p.waypoints), line('Câu đố', p.puzzles), line('Giải cứu', p.rescues),
      p.boss ? `${p.boss.defeated ? '☑' : '☐'} Boss: ${p.boss.name}` : '',
      ...p.landmarks.map((l) => `${l.got ? '★' : '☆'} ${l.name}`),
    ].filter(Boolean);
    c.add(text(this, r.x + 14 * s, r.y + 90 * s, rows.join('\n'), 15 * s, live ? '#e8dcc0' : COLORS.dim).setLineSpacing(5 * s).setWordWrapWidth(r.w - 24 * s));
    const by = r.y + r.h - 64 * s;
    if (p.def.badge) {
      const bg = this.add.graphics();
      c.add(bg);
      bg.fillStyle(p.badge ? 0xf0c040 : 0x2a2e40, 1).fillCircle(r.x + 28 * s, by + 8 * s, 12 * s);
      bg.lineStyle(2 * s, p.badge ? 0xfff0a0 : 0x4a5068, 1).strokeCircle(r.x + 28 * s, by + 8 * s, 12 * s);
      c.add(text(this, r.x + 48 * s, by, p.badge ? p.def.badge.name : `${p.def.badge.name} (chưa có)`, 15 * s, p.badge ? '#ffe080' : COLORS.dim));
    }
    const bw = r.w - 28 * s, pg = this.add.graphics();
    c.add(pg);
    pg.fillStyle(0x10121a, 1).fillRect(r.x + 14 * s, by + 30 * s, bw, 10 * s).fillStyle(0xd0a040, 1).fillRect(r.x + 14 * s, by + 30 * s, bw * p.completion / 100, 10 * s);
    c.add(text(this, r.x + r.w - 14 * s, by + 44 * s, `Hoàn thành ${p.completion}%`, 13 * s, '#d0c090').setOrigin(1, 0));
  }

  /** Shared open world: create / join / leave a room from inside the Adventure. */
  async onlineMenu(): Promise<void> {
    this.closeMenu();
    const a = this.adv;
    if (net.connected || net.status === 'hosting') { coopSession.active = false; net.leave(); a.coopHost?.destroy(); a.coopHost = null; a.presence?.destroy(); a.presence = null; this.banner('Đã rời phòng online', '#c0c8e0'); return; }
    const r = await a.say('Chơi online cùng bạn', ['Hai người cùng đi trong thế giới mở (mỗi người giữ Pokémon hoang dã, nhiệm vụ, đồ của mình) và thách đấu nhau bằng cách lại gần rồi nhấn E.', defaultLinkKind() === 'relay' ? 'Kết nối qua máy chủ online; người tạo phòng đọc mã cho bạn mình.' : 'Kết nối trực tiếp qua WebRTC; người tạo phòng đọc mã cho bạn mình.'],
      [{ label: 'Tạo phòng', value: 'host' }, { label: 'Vào phòng bằng mã', value: 'join' }, { label: 'Hủy', value: 'no' }]);
    const kind = defaultLinkKind();
    net.setProfile(saveStore.playerName, saveStore.avatar);
    try {
      if (r === 'host') {
        const code = await net.host(kind);
        this.banner(`Mã phòng: ${code} — đưa mã này cho bạn của bạn`, '#ffe080');
        const off = net.onStatus(() => { if (net.connected) { off(); a.startPresence(); this.banner(`${net.peerName} đã vào phòng!`, '#80ff90'); } else if (net.status !== 'hosting') off(); });
      } else if (r === 'join') {
        const code = await askText(this, 'Nhập mã phòng (6 ký tự)', '', 6);
        if (!code) return;
        this.banner('Đang kết nối…', '#a0d8ff');
        await net.join(code, kind);
        a.startPresence();
        this.banner(`Đã vào phòng của ${net.peerName || 'bạn'}!`, '#80ff90');
      }
    } catch (e) {
      this.banner(e instanceof Error ? e.message : String(e), '#ff9080');
    }
  }

  private zoomMap(f: number): void {
    this.mapView.zoom = Phaser.Math.Clamp(this.mapView.zoom * f, 1, 4);
    this.openMenu('map');
  }

  private buildSettings(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, set = saveStore.data.settings;
    c.add(text(this, r.x, r.y + 6 * s, 'Chất lượng đồ họa', 22 * s));
    (['low', 'medium', 'high'] as QualitySetting[]).forEach((q, i) => {
      c.add(button(this, r.x + 90 * s + i * 170 * s, r.y + 56 * s, 160 * s, 40 * s, { low: 'Thấp', medium: 'Trung bình', high: 'Cao' }[q], () => {
        set.quality = q;
        this.adv.renderer_.setQuality(q);
        void saveStore.save();
        this.openMenu('settings');
      }, set.quality === q ? 0x4a6a3a : 0x2c3654).container);
    });
    c.add(text(this, r.x, r.y + 84 * s, 'Thấp: tắt mưa/sương, đèn đêm, cây đung đưa, giảm 65% hạt. Áp dụng ngay cho hiệu ứng; cây/đèn áp dụng khi tải lại vùng.', 15 * s, COLORS.dim).setWordWrapWidth(r.w));
    const mus = button(this, r.x + 238 * s, r.y + 140 * s, 144 * s, 40 * s, `Nhạc: ${music.enabled ? 'BẬT' : 'TẮT'}`, () => { music.setEnabled(!music.enabled); saveStore.data.settings.music = music.enabled; void saveStore.save(); mus.setLabel(`Nhạc: ${music.enabled ? 'BẬT' : 'TẮT'}`); });
    c.add(mus.container);
    const snd = button(this, r.x + 82 * s, r.y + 140 * s, 144 * s, 40 * s, `Âm thanh: ${audio.enabled ? 'BẬT' : 'TẮT'}`, () => {
      audio.enabled = !audio.enabled; set.sfx = audio.enabled; void saveStore.save(); snd.setLabel(`Âm thanh: ${audio.enabled ? 'BẬT' : 'TẮT'}`);
    });
    c.add(snd.container);
    const fps = button(this, r.x + 160 * s, r.y + 190 * s, 300 * s, 40 * s, `Hiện FPS: ${set.showFps ? 'BẬT' : 'TẮT'}`, () => {
      set.showFps = !set.showFps; void saveStore.save(); fps.setLabel(`Hiện FPS: ${set.showFps ? 'BẬT' : 'TẮT'}`);
    });
    c.add(fps.container);
    c.add(text(this, r.x, r.y + r.h - 60 * s, officialPack.available
      ? `Sprite chính thức (cá nhân): ${set.officialSprites ? 'BẬT' : 'TẮT'}${officialPack.active !== set.officialSprites ? ' — áp dụng khi tải lại' : ''}`
      : 'Sprite chính thức: chưa có gói (chạy node scripts/fetch-official-sprites.mjs)', 15 * s, COLORS.dim).setWordWrapWidth(r.w - 340 * s));
    if (officialPack.available) {
      c.add(button(this, r.x + r.w - 260 * s, r.y + r.h - 50 * s, 200 * s, 36 * s, set.officialSprites ? 'Tắt sprite chính thức' : 'Bật sprite chính thức', () => {
        set.officialSprites = !set.officialSprites; set.officialChosen = true; void saveStore.save(); this.openMenu('settings');
      }).container);
      c.add(button(this, r.x + r.w - 70 * s, r.y + r.h - 50 * s, 120 * s, 36 * s, 'Tải lại', () => { this.adv.persist(); window.setTimeout(() => location.reload(), 300); }).container);
    }
    c.add(button(this, r.x + 160 * s, r.y + 240 * s, 300 * s, 40 * s, 'Lưu game', () => { this.adv.persist(); this.banner('Đã lưu', '#80ff90'); }).container);
    c.add(button(this, r.x + 160 * s, r.y + 290 * s, 300 * s, 40 * s, 'Lưu & về menu chính', () => { this.closeMenu(); this.adv.exitToMenu(); }, 0x6a2f2f).container);
    c.add(button(this, r.x + 160 * s, r.y + 340 * s, 300 * s, 40 * s, net.connected ? `Co-op / phòng ${net.code}` : net.status === 'hosting' ? `Phòng ${net.code}` : 'Co-op: cùng đánh quái', () => openCoopMenu(this, this.adv), 0x2f5a6a).container);
    c.add(button(this, r.x + 160 * s, r.y + 388 * s, 300 * s, 36 * s, 'Đi chung / thách đấu PvP', () => void this.onlineMenu(), 0x3a3a5a).container);
    c.add(text(this, this.portraitMenu ? r.x : r.x + 340 * s, r.y + (this.portraitMenu ? 440 : 130) * s,
      'ĐIỀU KHIỂN\nWASD/←↑→↓ di chuyển · Shift chạy\nE/Space tương tác · F ném bóng (ngắm chuột)\nR đổi loại bóng · H dùng thuốc\n` 1-5 lệnh đội: Tự do / Tấn công / Bảo vệ /\n   Đi theo / Giữ vị trí / Rút lui\nTab đội hình · X Pokédex · I túi · J nhiệm vụ\nM bản đồ · Esc menu', 16 * s, '#d0d8f0'));
  }
}

interface Rect { x: number; y: number; w: number; h: number }

function arrow(a: number): string {
  const dirs = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  return dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
function order(st: string): number {
  return st === 'active' ? 0 : st === 'available' ? 1 : 2;
}
function kindLabel(k: string): string {
  return ({ main: 'Chính tuyến', side: 'Phụ', exploration: 'Khám phá', capture: 'Thu phục', trainer: 'Thách đấu', dungeon: 'Hầm ngục', boss: 'Boss' } as Record<string, string>)[k] ?? k;
}
function phaseLabel(p?: string): string {
  return ({ entrance: 'Lối vào', waves: 'Đợt quái', hazard: 'Hành lang đá rơi', puzzle: 'Câu đố phiến đá', bossWait: 'Cửa Boss đã mở', boss: 'Trận Boss', reward: 'Nhận thưởng', done: 'Hoàn thành' } as Record<string, string>)[p ?? ''] ?? '';
}
function heap(): string {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? ` | heap ${(m.usedJSHeapSize / 1048576).toFixed(0)}MB` : '';
}
