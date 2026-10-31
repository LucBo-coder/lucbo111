import { ITEM_DEFS, evolutionsOf, megaFormsOf } from './evolution';
import { CANDY_DEFS } from './candy';
import { POKEMON } from './data';

// Poké Mart catalogue (no Phaser): every item sold, its price and the shelf (category) it sits on, plus the stock of
// the Travelling Merchant event. AdventureState spends the money; the shop window (scenes/shopUI.ts) only shows this.

export type ShopCategory = 'local' | 'balls' | 'healing' | 'candy' | 'evolution' | 'mega' | 'battle' | 'type' | 'training';

export const SHOP_CATEGORIES: { id: ShopCategory; label: string; icon: string; hint: string }[] = [
  { id: 'local', label: 'Đặc sản', icon: 'miracle-seed', hint: 'Hàng riêng của vùng, chỉ bán cho người nhà (danh tiếng cao nhất) — rẻ hơn 20%.' },
  { id: 'balls', label: 'Bóng', icon: 'pokeball', hint: 'Bóng thu phục — mỗi loại mạnh trong một hoàn cảnh riêng.' },
  { id: 'healing', label: 'Hồi phục', icon: 'potion', hint: 'Thuốc và quả hồi máu dùng ngay trên đường (phím H).' },
  { id: 'candy', label: 'Kẹo EXP', icon: 'rare-candy', hint: 'Kẹo kinh nghiệm cho Pokémon lên cấp nhanh.' },
  { id: 'evolution', label: 'Tiến hóa', icon: 'thunder-stone', hint: 'Đá tiến hóa và vật phẩm cầm để tiến hóa (cùng Dây Liên Kết).' },
  { id: 'mega', label: 'Đá Mega', icon: 'gengarite', hint: 'Pokémon cầm đá Mega + bạn có Vòng Mega → Mega Tiến Hóa (phím G).' },
  { id: 'battle', label: 'Chiến đấu', icon: 'life-orb', hint: 'Vật phẩm cầm tăng sức mạnh, phòng thủ hoặc hồi chiêu.' },
  { id: 'type', label: 'Tăng hệ', icon: 'charcoal', hint: 'Mỗi món tăng sát thương kỹ năng của một hệ.' },
  { id: 'training', label: 'Huấn luyện', icon: 'protein', hint: 'Vitamin, quả giảm EV và vật phẩm Power để luyện chỉ số (EV).' },
];

export const MAX_STACK = 999;

/** Items sold before 0.18 keep their prices; everything else uses its items.json price. */
const PRICE: Record<string, number> = {
  pokeball: 200, greatball: 600, ultraball: 1200, netball: 1000, duskball: 1000, quickball: 1000, timerball: 1000, luxuryball: 1000,
  potion: 300, superpotion: 700, oranberry: 150,
  'exp-candy-xs': 300, 'exp-candy-s': 1_200, 'exp-candy-m': 4_000, 'exp-candy-l': 12_000, 'exp-candy-xl': 30_000, 'rare-candy': 10_000,
  'charizardite-y': 9000,
  ...Object.fromEntries(['hp-up', 'protein', 'iron', 'calcium', 'zinc', 'carbos'].map((id) => [id, 1500])),
  ...Object.fromEntries(['pomeg-berry', 'kelpsy-berry', 'qualot-berry', 'hondew-berry', 'grepa-berry', 'tamato-berry'].map((id) => [id, 400])),
  ...Object.fromEntries(['power-weight', 'power-bracer', 'power-belt', 'power-lens', 'power-band', 'power-anklet', 'macho-brace'].map((id) => [id, 3000])),
  ...Object.fromEntries(['beedrillite', 'alakazite', 'slowbronite', 'gengarite', 'kangaskhanite', 'pinsirite', 'gyaradosite', 'aerodactylite', 'mewtwonite-x', 'mewtwonite-y'].map((id) => [id, 12000])),
};
const BALLS = ['pokeball', 'greatball', 'ultraball', 'netball', 'duskball', 'quickball', 'timerball', 'luxuryball'];
const HEALING = ['potion', 'superpotion', 'oranberry'];

/** Held items whose main use is an evolution (held during a Linking Cord trade or a level-up). */
function isEvolutionHeld(id: string): boolean {
  return evolutionUsersOf(id).length > 0;
}

export function categoryOf(id: string): ShopCategory | null {
  if (BALLS.includes(id)) return 'balls';
  if (HEALING.includes(id)) return 'healing';
  if (CANDY_DEFS.some((c) => c.id === id)) return 'candy';
  const d = ITEM_DEFS.get(id);
  if (!d) return null;
  if (d.kind === 'evoStone') return 'evolution';
  if (d.kind === 'megaStone') return 'mega';
  if (d.kind === 'evItem' || d.effect?.type === 'evPower') return 'training';
  if (d.kind === 'held') {
    if (isEvolutionHeld(id)) return 'evolution';
    return d.effect?.type === 'typeBoost' ? 'type' : 'battle';
  }
  return null; // key items are never sold
}

export interface ShopEntry { id: string; price: number; category: ShopCategory }

function buildCatalogue(): ShopEntry[] {
  const ids = [...BALLS, ...HEALING, ...CANDY_DEFS.map((c) => c.id), ...ITEM_DEFS.keys()];
  const out: ShopEntry[] = [];
  for (const id of new Set(ids)) {
    const category = categoryOf(id);
    const price = PRICE[id] ?? ITEM_DEFS.get(id)?.price ?? 0;
    // price 0 = story reward only (starter Mega Stones, Key Stone)
    if (!category || price <= 0) continue;
    out.push({ id, price, category });
  }
  const order = SHOP_CATEGORIES.map((c) => c.id);
  return out.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
}

let catalogue: ShopEntry[] | null = null;
/** Everything the Poké Mart sells, grouped by category (stable order inside a category). */
export function shopCatalogue(): ShopEntry[] {
  return (catalogue ??= buildCatalogue());
}

/** How many of an item can be bought with this money (stack cap included). */
export function maxBuy(money: number, price: number, owned: number, stock = Infinity): number {
  if (price <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(money / price), MAX_STACK - owned, stock));
}

const usersCache = new Map<string, string[]>();
/** "Pikachu → Raichu" lines for an evolution item / Mega Stone (what the shop shows under "Dùng cho"). */
export function evolutionUsersOf(id: string): string[] {
  const hit = usersCache.get(id);
  if (hit) return hit;
  const name = (sp: string) => POKEMON.get(sp)?.name ?? sp;
  const out: string[] = [];
  const d = ITEM_DEFS.get(id);
  if (d?.kind === 'megaStone' && d.megaFor) out.push(`${name(d.megaFor)} → ${name(d.form ?? '')}`);
  else if (d && (d.kind === 'evoStone' || d.kind === 'held')) {
    for (const p of POKEMON.values()) {
      if (p.mega) continue;
      for (const o of evolutionsOf(p.id)) {
        if (o.unsupported) continue;
        const uses = o.item === id || o.rule.heldItem === id;
        if (uses) out.push(`${name(p.id)} → ${name(o.to)}${o.rule.heldItem === id && o.item === 'linking-cord' ? ' (cầm + Dây Liên Kết)' : o.rule.heldItem === id ? ' (cầm khi lên cấp)' : ''}`);
      }
    }
  }
  const uniq = [...new Set(out)];
  usersCache.set(id, uniq);
  return uniq;
}

/** Mega forms reachable with a stone (for the "Mega" shelf details). */
export function megaOf(stone: string): { base: string; form: string } | null {
  const d = ITEM_DEFS.get(stone);
  if (!d?.megaFor) return null;
  return megaFormsOf(d.megaFor).some((f) => f.stone === stone) ? { base: d.megaFor, form: d.form! } : null;
}

// ───────────────────────────── the mart and the region's reputation (V30) ─────────────────────────────

/** Discount at the mart of a region by its reputation tier (0 Người lạ · 1 Quen mặt · 2 Được tin cậy · 3 Người nhà). */
export const REP_DISCOUNT = [0, 0, 0.1, 0.15];
/** Tier that opens the region's specialty shelf, and that shelf's discount. */
export const SPECIALTY_TIER = 3;
export const SPECIALTY_DISCOUNT = 0.2;

const STONE_OF: Record<string, string> = {
  fire: 'fire-stone', water: 'water-stone', grass: 'leaf-stone', electric: 'thunder-stone', ice: 'ice-stone',
  fairy: 'moon-stone', normal: 'moon-stone', dark: 'dusk-stone', ghost: 'dusk-stone', psychic: 'dawn-stone', fighting: 'dawn-stone',
};
const discounted = (price: number, d: number) => Math.max(50, Math.round((price * (1 - d)) / 50) * 50);

/** The region's specialties: the type items and evolution stone that go with its guardian's types (sold items only). */
export function specialtiesFor(types: string[]): string[] {
  const sold = new Set(shopCatalogue().map((e) => e.id));
  const out: string[] = [];
  for (const t of types) {
    for (const [id, d] of ITEM_DEFS) if (d.effect?.type === 'typeBoost' && (d.effect as { pokeType?: string }).pokeType === t && sold.has(id)) out.push(id);
    if (STONE_OF[t] && sold.has(STONE_OF[t])) out.push(STONE_OF[t]);
  }
  return [...new Set(out)].slice(0, 5);
}

export interface RepShopEntry extends ShopEntry { was?: number }

/**
 * The mart of a region for the player's reputation there: the whole catalogue (a tier discount from Được tin cậy), and
 * at Người nhà a "Đặc sản" shelf with the guardian's type items and stone at 20 % off (they leave their usual shelf).
 */
export function repShop(tier: number, guardianTypes: string[]): RepShopEntry[] {
  const d = REP_DISCOUNT[Math.max(0, Math.min(REP_DISCOUNT.length - 1, tier))];
  const local = tier >= SPECIALTY_TIER ? new Set(specialtiesFor(guardianTypes)) : new Set<string>();
  const out: RepShopEntry[] = [];
  for (const e of shopCatalogue()) {
    if (local.has(e.id)) continue;
    out.push(d ? { ...e, was: e.price, price: discounted(e.price, d) } : e);
  }
  const special = shopCatalogue().filter((e) => local.has(e.id)).map((e) => ({ ...e, category: 'local' as const, was: e.price, price: discounted(e.price, SPECIALTY_DISCOUNT) }));
  return [...special, ...out];
}

// ───────────────────────────── Travelling Merchant (world event) ─────────────────────────────

export interface MerchantOffer extends ShopEntry {
  /** price before the event discount */
  was: number;
  /** units left (limited stock) */
  stock: number;
}

export const MERCHANT_DISCOUNT = 0.3;

/** Six rare goods at 30 % off, a few of each: Mega Stones, rare evolution items, candies, strong balls. */
export function merchantStock(pick: <T>(list: T[]) => T, int: (a: number, b: number) => number): MerchantOffer[] {
  const cat = shopCatalogue();
  const pools: [ShopCategory[], number, [number, number]][] = [
    [['mega'], 2, [1, 1]], [['evolution'], 2, [1, 2]], [['candy'], 1, [2, 4]], [['balls', 'battle'], 1, [1, 3]],
  ];
  const out: MerchantOffer[] = [];
  for (const [cats, n, [lo, hi]] of pools) {
    const pool = cat.filter((e) => cats.includes(e.category) && e.price >= 1000 && !out.some((o) => o.id === e.id));
    for (let i = 0; i < n && pool.length; i++) {
      const e = pick(pool);
      pool.splice(pool.indexOf(e), 1);
      out.push({ ...e, was: e.price, price: Math.round((e.price * (1 - MERCHANT_DISCOUNT)) / 50) * 50, stock: int(lo, hi) });
    }
  }
  return out;
}
