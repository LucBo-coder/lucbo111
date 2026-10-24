import { ModStat, POKEMON, UPGRADES, UpgradeConfig } from './data';
import { Rng } from './rng';
import { Rarity } from './types';
import { evolutionsOf, megaFormsOf } from './evolution';

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export type Mods = Record<ModStat, number>;
export function emptyMods(): Mods {
  return { dmgMult: 0, cdr: 0, hpMult: 0, areaMult: 0, critBonus: 0, trainerSpeed: 0, magnet: 0, energyRegen: 0, extraProjectiles: 0 };
}

export interface RunView {
  mods: Mods;
  party: { uid: number; defId: string; name: string; level?: number; mega?: boolean; skills: { id: string; name: string; level: number }[] }[];
  /** Pokémon ids that may still join the party */
  recruitable: string[];
}

interface OfferBase {
  key: string;
  rarity: Rarity;
  title: string;
  description: string;
  icon: string;
  preview: string;
}
export type Offer =
  | (OfferBase & { kind: 'stat'; stat: ModStat; value: number })
  | (OfferBase & { kind: 'pokemon'; pokemonId: string })
  | (OfferBase & { kind: 'skill'; unitUid: number; slot: number; powerBonus: number })
  | (OfferBase & { kind: 'heal'; amount: number })
  | (OfferBase & { kind: 'evolve'; unitUid: number; to: string; mega: boolean });

/** Survivor run level that substitutes item-based evolutions (no items in a run) */
export const RUN_ITEM_EVO_LEVEL = 28;
export const RUN_MEGA_LEVEL = 32;

/** Evolution / Mega cards — run-only, never touch the permanent collection. */
function evolveOffer(view: RunView, rng: Rng, used: Set<string>): Offer | null {
  const opts: Offer[] = [];
  const anyMega = view.party.some((p) => p.mega);
  for (const p of view.party) {
    const lv = p.level ?? 0;
    if (p.mega) continue;
    for (const e of evolutionsOf(p.defId)) {
      if (e.unsupported) continue;
      const need = e.trigger === 'level-up' ? e.minLevel ?? 99 : RUN_ITEM_EVO_LEVEL;
      if (lv < need || used.has('evolve:' + p.uid)) continue;
      const to = POKEMON.get(e.to)!;
      opts.push({ kind: 'evolve', key: 'evolve:' + p.uid, unitUid: p.uid, to: e.to, mega: false, rarity: 'epic', title: `Tiến hóa: ${to.name}`, icon: e.to,
        description: `${p.name} tiến hóa thành ${to.name} (${to.types.join('/')}) — chỉ số, kỹ năng và đặc tính mới`, preview: e.trigger === 'level-up' ? `Điều kiện PokéAPI: Lv${e.minLevel}` : `Thay ${e.item}: Lv${RUN_ITEM_EVO_LEVEL} trong run` });
    }
    if (!anyMega && lv >= RUN_MEGA_LEVEL) {
      for (const m of megaFormsOf(p.defId)) {
        if (used.has('evolve:' + p.uid)) continue;
        const to = POKEMON.get(m.form)!;
        opts.push({ kind: 'evolve', key: 'evolve:' + p.uid + ':' + m.form, unitUid: p.uid, to: m.form, mega: true, rarity: 'legendary', title: to.name, icon: m.form,
          description: `${p.name} Mega Tiến Hóa đến hết run — ${to.passive.name}: ${to.passive.description}`, preview: 'Chỉ 1 Pokémon Mega mỗi run' });
      }
    }
  }
  return opts.length ? rng.pick(opts) : null;
}

const fmt = (v: number, percent: boolean) => (percent ? `${Math.round(v * 100)}%` : `${v}`);

function rollRarity(rng: Rng, cfg: UpgradeConfig, min: Rarity): Rarity {
  const minIdx = RARITY_ORDER.indexOf(min);
  const allowed = RARITY_ORDER.filter((_, i) => i >= minIdx);
  return rng.weighted(allowed, (r) => cfg.rarityWeights[r]) ?? min;
}

function statOffer(view: RunView, rng: Rng, cfg: UpgradeConfig, rarity: Rarity, used: Set<string>): Offer | null {
  const candidates = cfg.stats.filter((s) => {
    if (used.has('stat:' + s.id)) return false;
    if (view.mods[s.stat] >= s.cap - 1e-9) return false;
    if (s.minRarity && RARITY_ORDER.indexOf(rarity) < RARITY_ORDER.indexOf(s.minRarity)) return false;
    return true;
  });
  if (!candidates.length) return null;
  const s = rng.pick(candidates);
  const scale = cfg.rarityScale[rarity];
  let value = s.percent ? Math.round(s.base * scale * 100) / 100 : rarity === 'legendary' ? 2 : 1;
  value = Math.min(value, Math.round((s.cap - view.mods[s.stat]) * 100) / 100);
  const cur = view.mods[s.stat];
  return {
    kind: 'stat', key: 'stat:' + s.id, stat: s.stat, value, rarity,
    title: s.name, icon: s.icon,
    description: s.desc.replace('{v}', fmt(value, s.percent)),
    preview: `${fmt(cur, s.percent)} → ${fmt(cur + value, s.percent)} (tối đa ${fmt(s.cap, s.percent)})`,
  };
}

function skillOffer(view: RunView, rng: Rng, cfg: UpgradeConfig, rarity: Rarity, used: Set<string>): Offer | null {
  const options: { uid: number; name: string; slot: number; skillName: string; level: number }[] = [];
  for (const p of view.party) {
    p.skills.forEach((s, slot) => {
      if (s.level < cfg.maxSkillLevel && !used.has(`skill:${p.uid}:${slot}`)) {
        options.push({ uid: p.uid, name: p.name, slot, skillName: s.name, level: s.level });
      }
    });
  }
  if (!options.length) return null;
  const o = rng.pick(options);
  const bonus = Math.round(0.15 * cfg.rarityScale[rarity] * 100) / 100;
  return {
    kind: 'skill', key: `skill:${o.uid}:${o.slot}`, unitUid: o.uid, slot: o.slot, powerBonus: bonus, rarity,
    title: `${o.skillName} +`, icon: 'skill',
    description: `${o.name}: ${o.skillName} +${Math.round(bonus * 100)}% sức mạnh, -4% hồi chiêu`,
    preview: `Cấp kỹ năng ${o.level} → ${o.level + 1} (tối đa ${cfg.maxSkillLevel})`,
  };
}

function pokemonOffer(view: RunView, rng: Rng, cfg: UpgradeConfig, used: Set<string>): Offer | null {
  if (view.party.length >= cfg.maxParty) return null;
  const ids = view.recruitable.filter((id) => !used.has('pokemon:' + id));
  if (!ids.length) return null;
  const def = POKEMON.get(rng.pick(ids))!;
  return {
    kind: 'pokemon', key: 'pokemon:' + def.id, pokemonId: def.id, rarity: def.rarity,
    title: def.name, icon: def.sprite,
    description: `${def.name} gia nhập đội (${def.types.join('/')} · ${def.role})`,
    preview: `Đội hình ${view.party.length} → ${view.party.length + 1}/${cfg.maxParty}`,
  };
}

/** Rolls `count` distinct offers. `minRarity` is used for boss rewards. */
export function rollOffers(view: RunView, rng: Rng, count = 3, minRarity: Rarity = 'common', cfg: UpgradeConfig = UPGRADES): Offer[] {
  const offers: Offer[] = [];
  const used = new Set<string>();
  let guard = 0;
  // An available evolution always gets the first card slot (it's the most exciting choice)
  if (minRarity === 'common' || minRarity === 'epic') {
    const evo = evolveOffer(view, rng, used);
    if (evo && (minRarity === 'common' || evo.rarity === 'legendary' || evo.rarity === 'epic')) { used.add(evo.key); used.add('evolve:' + (evo as { unitUid: number }).unitUid); offers.push(evo); }
  }
  while (offers.length < count && guard++ < 40) {
    const r = rng.next();
    const pokemonChance = view.party.length < 3 ? 0.4 : 0.18;
    let o: Offer | null = null;
    if (r < pokemonChance && minRarity === 'common') o = pokemonOffer(view, rng, cfg, used);
    else if (r < pokemonChance + 0.3) o = skillOffer(view, rng, cfg, rollRarity(rng, cfg, minRarity), used);
    if (!o) o = statOffer(view, rng, cfg, rollRarity(rng, cfg, minRarity), used);
    if (o && !used.has(o.key)) {
      used.add(o.key);
      offers.push(o);
    }
  }
  // Everything capped: always offer something useful rather than an empty screen.
  while (offers.length < count) {
    const key = 'heal:' + offers.length;
    offers.push({
      kind: 'heal', key, amount: 0.5, rarity: 'common', title: 'Oran Berry', icon: 'berry',
      description: 'Hồi 50% HP cho huấn luyện viên và cả đội', preview: 'Hồi phục tức thì',
    });
  }
  return offers;
}
