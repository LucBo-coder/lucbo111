// Chợ nổi Cái Răng (Vietnam Odyssey, pure): vendor boats that gather on the river at dawn. Each market day has its own
// limited stock (what was bought is saved per day), traders known in Cần Thơ ("Được tin cậy") get a small discount.
// No selling back: the market spends money, it never makes it.
import marketJson from '../data/vietnam/floating-market.json';
import { categoryOf, type ShopCategory } from './shop';

export interface MarketGood { id: string; price: number; stock: number }
export interface MarketBoat { id: string; name: string; x: number; y: number; pole: string; color: string; greet: string; goods: MarketGood[] }
export interface MarketDef { region: string; name: string; open: number; close: number; trustedTier: number; trustedDiscount: number; boats: MarketBoat[] }

export const FLOATING_MARKET = marketJson as MarketDef;

/** Open between `open` and `close` (in-game minutes after midnight). */
export function marketOpen(clockMin: number, m: MarketDef = FLOATING_MARKET): boolean {
  return clockMin >= m.open && clockMin < m.close;
}

/** Saved purchases of the current market day: `day` = in-game day number, `bought` = `${boat}:${item}` → units. */
export interface MarketSave { day: number; bought: Record<string, number> }

/** Today's ledger: a new day starts with a fresh, empty one. */
export function marketDay(save: MarketSave | undefined, day: number): MarketSave {
  return save && save.day === day ? save : { day, bought: {} };
}

export interface MarketOffer { id: string; price: number; was?: number; stock: number; category: ShopCategory }

/** A boat's offers for today: stock left after today's purchases; trusted traders pay less. */
export function boatOffers(boat: MarketBoat, ledger: MarketSave, trusted: boolean, m: MarketDef = FLOATING_MARKET): MarketOffer[] {
  return boat.goods.map((g) => {
    const price = trusted ? Math.max(10, Math.round((g.price * (1 - m.trustedDiscount)) / 10) * 10) : g.price;
    return {
      id: g.id, price, was: trusted ? g.price : undefined, category: categoryOf(g.id) ?? 'healing',
      stock: Math.max(0, g.stock - (ledger.bought[`${boat.id}:${g.id}`] ?? 0)),
    };
  });
}

export function recordPurchase(ledger: MarketSave, boat: string, item: string, qty: number): void {
  const k = `${boat}:${item}`;
  ledger.bought[k] = (ledger.bought[k] ?? 0) + qty;
}
