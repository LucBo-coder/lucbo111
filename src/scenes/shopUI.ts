import Phaser from 'phaser';
import { AdventureState, ITEMS } from '../adventure/AdventureState';
import { ITEM_DEFS } from '../core/evolution';
import { POKEMON } from '../core/data';
import { evolutionUsersOf, MAX_STACK, maxBuy, megaOf, SHOP_CATEGORIES, ShopCategory, ShopEntry } from '../core/shop';
import { itemIconKey } from '../render/spriteRegistry';
import { audio } from '../systems/audio';
import { button, COLORS, DPR, panel, text, uiScale } from './ui';

// The Poké Mart window: category shelves, item cards with their pixel icon, a detail panel ("Dùng cho …") and a
// quantity picker (− / + / ×1 / ×5 / ×10 / Tối đa). Rebuilt on every change like the adventure menu.
// Landscape: list | detail; portrait phones: list above detail.

export interface ShopOffer extends ShopEntry {
  /** price before a discount (Travelling Merchant) */
  was?: number;
  /** units left (limited stock); undefined = unlimited */
  stock?: number;
}

export interface ShopOptions {
  title: string;
  greeting: string;
  offers: ShopOffer[];
  /** show the category shelves (the merchant's few goods are one list) */
  shelves?: boolean;
  /** called after each purchase (merchant: lower the stock) */
  onBought?: (offer: ShopOffer, qty: number) => void;
}

export interface ShopHost {
  scene: Phaser.Scene;
  state: AdventureState;
  persist(): void;
  banner(msg: string, color?: string): void;
}

interface Rect { x: number; y: number; w: number; h: number }

const fmt = (n: number) => n.toLocaleString('vi-VN');
const CAT_LABEL: Record<ShopCategory, string> = Object.fromEntries(SHOP_CATEGORIES.map((c) => [c.id, c.label])) as Record<ShopCategory, string>;

export class ShopWindow {
  private c: Phaser.GameObjects.Container | null = null;
  private cat: ShopCategory | null;
  private page = 0;
  private sel: string | null = null;
  qty = 1;
  private s = 1;
  private portrait = false;
  private perPage = 1;
  private readonly onWheel = (_p: unknown, _o: unknown, _dx: number, dy: number) => this.turnPage(dy > 0 ? 1 : -1);
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') this.buy();
    else if (e.key === 'ArrowRight' || e.key === '+') this.setQty(this.qty + 1);
    else if (e.key === 'ArrowLeft' || e.key === '-') this.setQty(this.qty - 1);
    else if (e.key === 'PageDown') this.turnPage(1);
    else if (e.key === 'PageUp') this.turnPage(-1);
  };

  constructor(private host: ShopHost, private opts: ShopOptions, private onClose: () => void) {
    this.cat = opts.shelves === false ? null : this.categories()[0] ?? null;
    this.sel = this.visible()[0]?.id ?? null;
    host.scene.input.on('wheel', this.onWheel);
    host.scene.input.keyboard?.on('keydown', this.onKey);
    this.render();
  }

  private get scene() { return this.host.scene; }
  private get st() { return this.host.state; }

  /** Shelves that have something on them, in catalogue order. */
  categories(): ShopCategory[] {
    return SHOP_CATEGORIES.map((c) => c.id).filter((id) => this.opts.offers.some((o) => o.category === id));
  }

  /** Offers of the open shelf. */
  visible(): ShopOffer[] {
    return this.cat ? this.opts.offers.filter((o) => o.category === this.cat) : this.opts.offers;
  }

  selected(): ShopOffer | undefined {
    return this.opts.offers.find((o) => o.id === this.sel);
  }

  /** How many of the selected item can be bought right now. */
  maxQty(): number {
    const o = this.selected();
    return o ? maxBuy(this.st.money, o.price, this.st.item(o.id), o.stock ?? Infinity) : 0;
  }

  // ───────────────────────────── actions (also used by tests) ─────────────────────────────

  openShelf(cat: ShopCategory): void {
    this.cat = cat;
    this.page = 0;
    this.sel = this.visible()[0]?.id ?? null;
    this.qty = 1;
    this.render();
  }

  select(id: string): void {
    const o = this.opts.offers.find((x) => x.id === id);
    if (!o) return;
    if (this.cat && o.category !== this.cat) { this.cat = o.category; }
    const i = this.visible().indexOf(o);
    this.page = Math.floor(i / Math.max(1, this.perPage));
    this.sel = id;
    this.qty = 1;
    this.render();
  }

  setQty(n: number): void {
    this.qty = Phaser.Math.Clamp(Math.floor(n), 1, Math.max(1, this.maxQty()));
    this.render();
  }

  buy(): boolean {
    const o = this.selected();
    if (!o) return false;
    const qty = this.qty;
    if (qty > this.maxQty()) {
      this.host.banner(o.stock === 0 ? 'Món này đã bán hết' : this.st.item(o.id) + qty > MAX_STACK ? `Mỗi món mang tối đa ${MAX_STACK}` : `Không đủ ${this.st.unit}`, '#ff9080');
      return false;
    }
    if (!this.st.buy(o.id, o.price, qty)) return false;
    if (o.stock != null) o.stock -= qty;
    audio.play('gem');
    this.host.banner(`Đã mua ${qty} ${ITEMS[o.id]?.name ?? o.id} (−${fmt(o.price * qty)} ${this.st.unit})`, '#ffe066');
    this.opts.onBought?.(o, qty);
    this.host.persist();
    this.qty = 1;
    this.render();
    return true;
  }

  close(): void {
    this.scene.input.off('wheel', this.onWheel);
    this.scene.input.keyboard?.off('keydown', this.onKey);
    this.c?.destroy();
    this.c = null;
    this.onClose();
  }

  private turnPage(d: number): void {
    const pages = Math.max(1, Math.ceil(this.visible().length / Math.max(1, this.perPage)));
    this.page = (this.page + d + pages) % pages;
    this.render();
  }

  // ───────────────────────────── layout ─────────────────────────────

  render(): void {
    this.c?.destroy();
    const { width: W, height: H } = this.scene.scale;
    this.portrait = H > W * 1.15;
    const s = (this.s = this.portrait
      ? uiScale(W, H, (w, h) => Phaser.Math.Clamp(Math.min((w - 16) / 540, (h - 16) / 900), 0.55, 1.4))
      : uiScale(W, H, (w, h) => Phaser.Math.Clamp(Math.min(w / 1100, h / 680), 0.6, 1.4)));
    const c = (this.c = this.scene.add.container(0, 0).setDepth(120));
    c.add(this.scene.add.rectangle(0, 0, W, H, 0x05060c, 0.8).setOrigin(0).setInteractive());
    const pw = this.portrait ? W - 16 * DPR : Math.min(W - 16 * DPR, 1100 * s), ph = this.portrait ? H - 16 * DPR : Math.min(H - 16 * DPR, 680 * s);
    const x0 = (W - pw) / 2, y0 = (H - ph) / 2;
    c.add(panel(this.scene, x0, y0, pw, ph, 0xe0b040, 0x161a28, 0.98));
    // header: shop name, greeting, money, close
    c.add(text(this.scene, x0 + 18 * s, y0 + 12 * s, this.opts.title, 26 * s, '#ffe080'));
    c.add(text(this.scene, x0 + 18 * s, y0 + 44 * s, this.opts.greeting, 15 * s, '#c8d0e8').setWordWrapWidth(pw - 280 * s).setMaxLines(2));
    c.add(text(this.scene, x0 + pw - 62 * s, y0 + 16 * s, `${fmt(this.st.money)} ${this.st.unit}`, 24 * s, '#ffe066').setOrigin(1, 0));
    c.add(this.scene.add.image(x0 + pw - 62 * s - this.measure(`${fmt(this.st.money)} ${this.st.unit}`, 24 * s) - 16 * s, y0 + 29 * s, 'item-pokeball').setScale(this.px(10, 22 * s)));
    c.add(button(this.scene, x0 + pw - 30 * s, y0 + 28 * s, 40 * s, 36 * s, '✕', () => this.close(), 0x6a2f2f).container);
    // shelves
    let top = y0 + 80 * s;
    if (this.cat) {
      const cats = this.categories();
      const perRow = this.portrait ? 4 : cats.length;
      const tw = (pw - 32 * s) / perRow, th = 42 * s;
      cats.forEach((id, i) => {
        const def = SHOP_CATEGORIES.find((x) => x.id === id)!;
        const cx = x0 + 16 * s + tw / 2 + (i % perRow) * tw, cy = top + th / 2 + Math.floor(i / perRow) * (th + 6 * s);
        const b = button(this.scene, cx, cy, tw - 6 * s, th, def.label, () => this.openShelf(id), id === this.cat ? 0x8a6a2a : 0x262c44);
        const label = b.container.list[1] as Phaser.GameObjects.Text;
        label.setFontSize(Math.round(17 * s)).setX(12 * s);
        b.container.add(this.scene.add.image(-tw / 2 + 22 * s, 0, itemIconKey(this.scene, def.icon)).setScale(this.px(this.iconW(def.icon), 24 * s)));
        c.add(b.container);
      });
      top += Math.ceil(cats.length / perRow) * (th + 6 * s) + 6 * s;
    }
    const body: Rect = { x: x0 + 16 * s, y: top, w: pw - 32 * s, h: y0 + ph - 14 * s - top };
    const gap = 12 * s;
    const [L, D]: [Rect, Rect] = this.portrait
      ? [{ ...body, h: body.h * 0.45 }, { x: body.x, y: body.y + body.h * 0.45 + gap, w: body.w, h: body.h * 0.55 - gap }]
      : [{ ...body, w: body.w * 0.56 }, { x: body.x + body.w * 0.56 + gap, y: body.y, w: body.w * 0.44 - gap, h: body.h }];
    this.buildList(c, L);
    this.buildDetail(c, D);
  }

  private buildList(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, list = this.visible();
    const hint = this.cat ? SHOP_CATEGORIES.find((x) => x.id === this.cat)!.hint : `${list.length} món hàng hiếm, giảm giá — số lượng có hạn.`;
    c.add(text(this.scene, r.x, r.y, hint, 15 * s, COLORS.dim).setWordWrapWidth(r.w).setMaxLines(1));
    const cols = 3, cw = r.w / cols, chh = 76 * s, gy = r.y + 26 * s;
    const rows = Math.max(1, Math.floor((r.h - 26 * s - 40 * s) / (chh + 6 * s)));
    this.perPage = cols * rows;
    const pages = Math.max(1, Math.ceil(list.length / this.perPage));
    this.page = Phaser.Math.Clamp(this.page, 0, pages - 1);
    list.slice(this.page * this.perPage, (this.page + 1) * this.perPage).forEach((o, i) => {
      const x = r.x + (i % cols) * cw, y = gy + Math.floor(i / cols) * (chh + 6 * s), w = cw - 6 * s;
      const sel = o.id === this.sel;
      const afford = this.st.money >= o.price && o.stock !== 0;
      const g = this.scene.add.graphics();
      g.fillStyle(sel ? 0x3a4670 : 0x1e2436, 1).fillRect(x, y, w, chh);
      g.lineStyle(2, sel ? 0xffd040 : afford ? 0x3a4260 : 0x2a2e3c, 1).strokeRect(x, y, w, chh);
      c.add(g);
      const ik = itemIconKey(this.scene, o.id);
      c.add(this.scene.add.image(x + 28 * s, y + chh / 2, ik).setScale(this.px(this.iconW(o.id), 40 * s)).setAlpha(afford ? 1 : 0.55));
      c.add(text(this.scene, x + 54 * s, y + 6 * s, ITEMS[o.id]?.name ?? o.id, 15 * s, afford ? '#ffffff' : '#9098b0').setWordWrapWidth(w - 58 * s).setMaxLines(2).setLineSpacing(-2));
      c.add(text(this.scene, x + 54 * s, y + chh - 24 * s, `${fmt(o.price)} ${this.st.unit}`, 16 * s, afford ? '#ffe066' : '#a08050'));
      const own = this.st.item(o.id);
      const tag = o.stock != null ? `còn ${o.stock}` : own ? `có ${own}` : '';
      if (tag) c.add(text(this.scene, x + w - 6 * s, y + chh - 22 * s, tag, 13 * s, o.stock === 0 ? '#ff8070' : '#a0d8ff').setOrigin(1, 0));
      if (o.was) c.add(text(this.scene, x + w - 4 * s, y + 4 * s, `−${Math.round((1 - o.price / o.was) * 100)}%`, 14 * s, '#ff7060').setOrigin(1, 0));
      const z = this.scene.add.zone(x, y, w, chh).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { audio.play('click'); this.select(o.id); });
      c.add(z);
    });
    if (pages > 1) {
      const by = r.y + r.h - 18 * s;
      c.add(button(this.scene, r.x + 60 * s, by, 110 * s, 32 * s, '◀ Trước', () => this.turnPage(-1)).container);
      c.add(text(this.scene, r.x + r.w / 2, by, `Trang ${this.page + 1}/${pages}`, 16 * s).setOrigin(0.5));
      c.add(button(this.scene, r.x + r.w - 60 * s, by, 110 * s, 32 * s, 'Sau ▶', () => this.turnPage(1)).container);
    }
  }

  private buildDetail(c: Phaser.GameObjects.Container, r: Rect): void {
    const s = this.s, o = this.selected();
    c.add(panel(this.scene, r.x, r.y, r.w, r.h, COLORS.panelEdge, 0x1c2134, 1));
    if (!o) { c.add(text(this.scene, r.x + 16 * s, r.y + 16 * s, 'Kệ hàng trống.', 18 * s, COLORS.dim)); return; }
    const it = ITEMS[o.id], def = ITEM_DEFS.get(o.id);
    const ik = itemIconKey(this.scene, o.id);
    const iconBox = this.portrait ? 64 * s : 84 * s;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x10131e, 1).fillRect(r.x + 14 * s, r.y + 14 * s, iconBox, iconBox).lineStyle(2, 0x3a4260, 1).strokeRect(r.x + 14 * s, r.y + 14 * s, iconBox, iconBox);
    c.add(bg);
    c.add(this.scene.add.image(r.x + 14 * s + iconBox / 2, r.y + 14 * s + iconBox / 2, ik).setScale(this.px(this.iconW(o.id), iconBox - 16 * s)));
    const tx = r.x + iconBox + 28 * s, tw = r.w - iconBox - 42 * s;
    c.add(text(this.scene, tx, r.y + 10 * s, it?.name ?? o.id, (this.portrait ? 20 : 24) * s, '#ffffff').setWordWrapWidth(tw).setMaxLines(this.portrait ? 1 : 2));
    c.add(text(this.scene, tx, r.y + 14 * s + iconBox - 44 * s, `${CAT_LABEL[o.category]} · ${o.was ? `${fmt(o.price)} ${this.st.unit} (gốc ${fmt(o.was)} ${this.st.unit})` : `${fmt(o.price)} ${this.st.unit}`}`, 15 * s, '#ffe066').setWordWrapWidth(tw).setMaxLines(1));
    const own = this.st.item(o.id);
    c.add(text(this.scene, tx, r.y + 14 * s + iconBox - 22 * s, `Đang có: ${own}${o.stock != null ? ` · còn ${o.stock} trong kho` : ''}`, 15 * s, '#a0d8ff'));
    // description + what it is for
    const buyTop = r.y + r.h - 160 * s;
    let y = r.y + iconBox + 26 * s;
    const lines: [string, string, number][] = [[it?.desc ?? '', '#e0e4f0', 16]];
    const users = def ? evolutionUsersOf(o.id) : [];
    if (def?.kind === 'megaStone') {
      const m = megaOf(o.id);
      const ks = this.st.item('key-stone') > 0;
      if (m) lines.push([`Dạng Mega: ${POKEMON.get(m.base)?.name} → ${POKEMON.get(m.form)?.name}`, '#ffb0ff', 15]);
      lines.push([ks ? 'Vòng Mega: đã có ✓' : 'Vòng Mega: chưa có — cần để Mega Tiến Hóa (nhận từ cốt truyện)', ks ? '#80ff90' : '#ff9080', 14]);
    } else if (users.length) {
      const shown = users.slice(0, 6).join(' · ');
      lines.push([`Dùng cho: ${shown}${users.length > 6 ? ` · …+${users.length - 6}` : ''}`, '#a0ffb0', 14]);
    }
    for (const [str, color, size] of lines) {
      if (!str || y >= buyTop - 16 * s) continue;
      const t = text(this.scene, r.x + 16 * s, y, str, size * s, color).setWordWrapWidth(r.w - 32 * s);
      const lineH = t.height / Math.max(1, t.getWrappedText().length);
      t.setMaxLines(Math.max(1, Math.floor((buyTop - 8 * s - y) / lineH)));
      c.add(t);
      y += t.height + 8 * s;
    }
    // purchase box: quantity, quick picks, total, buy
    const max = this.maxQty();
    this.qty = Phaser.Math.Clamp(this.qty, 1, Math.max(1, max));
    const qy = r.y + r.h - 158 * s;
    c.add(text(this.scene, r.x + 16 * s, qy, 'Số lượng', 17 * s, '#d0d8f0').setOrigin(0, 0.5));
    const qx = r.x + Math.min(r.w * 0.5, 170 * s);
    c.add(button(this.scene, qx - 54 * s, qy, 44 * s, 36 * s, '−', () => this.setQty(this.qty - 1)).container);
    const qbg = this.scene.add.graphics();
    qbg.fillStyle(0x0c0e16, 1).fillRect(qx - 28 * s, qy - 18 * s, 56 * s, 36 * s).lineStyle(2, 0x4a5478, 1).strokeRect(qx - 28 * s, qy - 18 * s, 56 * s, 36 * s);
    c.add(qbg);
    c.add(text(this.scene, qx, qy, String(this.qty), 22 * s, '#ffffff').setOrigin(0.5));
    c.add(button(this.scene, qx + 54 * s, qy, 44 * s, 36 * s, '+', () => this.setQty(this.qty + 1)).container);
    c.add(text(this.scene, r.x + r.w - 16 * s, qy, `tối đa ${max}`, 14 * s, COLORS.dim).setOrigin(1, 0.5));
    const picks: [string, number][] = [['×1', 1], ['×5', 5], ['×10', 10], ['Tối đa', Math.max(1, max)]];
    const pw = (r.w - 32 * s) / picks.length;
    picks.forEach(([l, n], i) => c.add(button(this.scene, r.x + 16 * s + pw / 2 + i * pw, qy + 44 * s, pw - 8 * s, 34 * s, l, () => this.setQty(n), this.qty === n ? 0x4a5a8a : 0x262c44).container));
    const total = o.price * this.qty;
    const ok = max >= this.qty && max > 0;
    c.add(text(this.scene, r.x + 16 * s, qy + 72 * s, `Tổng: ${fmt(total)} ${this.st.unit}`, 18 * s, ok ? '#ffe066' : '#ff8070'));
    c.add(text(this.scene, r.x + r.w - 16 * s, qy + 74 * s, `còn lại ${fmt(Math.max(0, this.st.money - total))} ${this.st.unit}`, 14 * s, COLORS.dim).setOrigin(1, 0));
    const why = o.stock === 0 ? 'Đã bán hết' : own >= MAX_STACK ? `Đã đầy (${MAX_STACK})` : `Không đủ ${this.st.unit}`;
    c.add(button(this.scene, r.x + r.w / 2, r.y + r.h - 26 * s, r.w - 32 * s, 40 * s, ok ? `Mua ×${this.qty} — ${fmt(total)} ${this.st.unit}` : why, () => this.buy(), ok ? 0x2f7a3a : 0x3a3c48).container);
  }

  // ───────────────────────────── helpers ─────────────────────────────

  /** Source width of an item icon (pixel icons are 10 px, official art is larger). */
  private iconW(id: string): number {
    const key = itemIconKey(this.scene, id);
    return this.scene.textures.exists(key) ? this.scene.textures.get(key).getSourceImage().width : 10;
  }

  /** Scale so a `src`-px texture is about `target` px, whole multiples for small pixel art (stays crisp). */
  private px(src: number, target: number): number {
    const k = target / Math.max(1, src);
    return k >= 2 ? Math.floor(k) : k;
  }

  private measure(str: string, size: number): number {
    const t = text(this.scene, 0, 0, str, size);
    const w = t.width;
    t.destroy();
    return w;
  }
}
