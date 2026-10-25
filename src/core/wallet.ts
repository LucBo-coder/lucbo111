// Three separate currencies, one per game mode (no Phaser). Earned and spent only inside their own mode:
//  • survivor  — "ngọc": Survivor runs → Permanent Upgrades
//  • adventure — "xu":   classic Adventure (Thung Lũng Khởi Nguyên) + the online world → Poké Mart, merchants
//  • vietnam   — "đồng": Vietnam Odyssey → its shops
// Storage: `currency` stays the Adventure wallet (the online server reads/writes that field), `survivorCoins` and
// `vnCoins` hold the other two. Everything else goes through the helpers below.

export type Wallet = 'survivor' | 'adventure' | 'vietnam';

export const WALLETS: Record<Wallet, { name: string; unit: string; mode: string; color: string; hex: number }> = {
  survivor: { name: 'Ngọc Sinh tồn', unit: 'ngọc', mode: 'Sinh tồn', color: '#ff9a60', hex: 0xff9a60 },
  adventure: { name: 'Xu Phiêu lưu', unit: 'xu', mode: 'Phiêu lưu', color: '#ffe066', hex: 0xffe066 },
  vietnam: { name: 'Đồng Odyssey', unit: 'đồng', mode: 'Việt Nam Odyssey', color: '#ff8070', hex: 0xff8070 },
};

export interface WalletSave { currency: number; survivorCoins: number; vnCoins: number }

const FIELD: Record<Wallet, keyof WalletSave> = { survivor: 'survivorCoins', adventure: 'currency', vietnam: 'vnCoins' };

/** The wallet an Adventure save spends from (by its campaign). */
export function campaignWallet(campaign: string | null | undefined): Wallet {
  return campaign === 'vietnam' ? 'vietnam' : 'adventure';
}

export function balance(save: WalletSave, w: Wallet): number {
  return Math.max(0, Math.floor(Number(save[FIELD[w]]) || 0));
}

export function earnTo(save: WalletSave, w: Wallet, amount: number): void {
  save[FIELD[w]] = balance(save, w) + Math.max(0, Math.round(amount));
}

/** Takes `amount` if the wallet holds it; false (nothing taken) otherwise. */
export function spendFrom(save: WalletSave, w: Wallet, amount: number): boolean {
  amount = Math.max(0, Math.round(amount));
  if (balance(save, w) < amount) return false;
  save[FIELD[w]] = balance(save, w) - amount;
  return true;
}

/** "1.500 xu" / "20 ngọc" / "800 đồng". */
export function fmtCoins(amount: number, w: Wallet): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ${WALLETS[w].unit}`;
}
