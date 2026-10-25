import questsJson from '../data/world/quests.json';
import vnQuestsJson from '../data/vietnam/quests.json';
import { POKEMON } from '../core/data';
import { addExp, addFriendship, individualOf, makeOwned, OwnedPokemon } from '../core/progression';
import { availableEvolutions, EvoContext, evolutionsOf, evaluate, ITEM_DEFS } from '../core/evolution';
import { unlockedSkills } from '../core/learnset';
import { legendQuests } from '../core/legends';
import { calcStats, StatKey } from '../core/stats';
import { applyEvGain, addEv, evGain, zeroEvs } from '../core/ev';
import { QuestDef, QuestEvent, QuestManager, QuestRewards } from '../core/quests';
import { applyCandy, CandyOutcome, CANDY_DEFS, candyDef, maxUsefulCandy } from '../core/candy';
import {
  buildPcForCollection, firstFreePcSlot, PcLocation, PcStorage, pcHasRoom, pcLocationOf, pcUids,
  placeInPc, removeFromPc,
} from '../core/pc';
import { AdventureSave, Difficulty, newAdventure, registerCaught, SaveData } from '../systems/saveSchema';

// Adventure progression wrapper around the shared save. No Phaser here (unit-tested).

/** World state relevant to evolution rules (time of day, current habitat, weather). */
export interface EvoEnv {
  night?: boolean;
  habitat?: string | null;
  raining?: boolean;
}

export const ITEMS: Record<string, { name: string; desc: string; kind: 'ball' | 'heal' | 'held' | 'stone' | 'key' | 'ev' | 'candy' }> = {
  pokeball: { name: 'Poké Ball', desc: 'Bóng thu phục cơ bản (×1.0).', kind: 'ball' },
  greatball: { name: 'Great Ball', desc: 'Tỉ lệ thu phục cao hơn (×1.5).', kind: 'ball' },
  ultraball: { name: 'Ultra Ball', desc: 'Tỉ lệ thu phục rất cao (×2.0).', kind: 'ball' },
  netball: { name: 'Net Ball', desc: '×3.5 với Pokémon hệ Bọ hoặc Nước.', kind: 'ball' },
  duskball: { name: 'Dusk Ball', desc: '×3.5 vào ban đêm hoặc trong hang.', kind: 'ball' },
  quickball: { name: 'Quick Ball', desc: '×4 nếu ném trước khi Pokémon kịp giao chiến.', kind: 'ball' },
  timerball: { name: 'Timer Ball', desc: 'Giao chiến càng lâu càng dễ bắt (tối đa ×4 sau 30 giây).', kind: 'ball' },
  luxuryball: { name: 'Luxury Ball', desc: '×1 — Pokémon bắt được thân thiết hơn ngay từ đầu (+50).', kind: 'ball' },
  potion: { name: 'Potion', desc: 'Hồi 40% HP cho cả đội đang ra trận.', kind: 'heal' },
  superpotion: { name: 'Super Potion', desc: 'Hồi 75% HP cho cả đội đang ra trận.', kind: 'heal' },
  oranberry: { name: 'Oran Berry', desc: 'Hồi 40 HP cho huấn luyện viên và 20% cho đội.', kind: 'heal' },
};
// Held items, evolution stones, Mega Stones and the Key Stone come from items.json
for (const it of ITEM_DEFS.values()) ITEMS[it.id] = { name: it.name, desc: it.desc, kind: it.kind === 'held' || it.kind === 'megaStone' ? 'held' : it.kind === 'evoStone' ? 'stone' : it.kind === 'evItem' ? 'ev' : 'key' } as never;
// Exp. Candy / Rare Candy (V7). Their use is validated by AdventureState.useCandy / the server.
for (const c of CANDY_DEFS) ITEMS[c.id] = { name: c.name, desc: c.desc, kind: 'candy' };
export const SHOP: { id: string; price: number }[] = [
  { id: 'pokeball', price: 200 }, { id: 'greatball', price: 600 }, { id: 'ultraball', price: 1200 },
  { id: 'netball', price: 1000 }, { id: 'duskball', price: 1000 }, { id: 'quickball', price: 1000 }, { id: 'timerball', price: 1000 }, { id: 'luxuryball', price: 1000 },
  { id: 'potion', price: 300 }, { id: 'superpotion', price: 700 }, { id: 'oranberry', price: 150 },
  { id: 'exp-candy-xs', price: 300 }, { id: 'exp-candy-s', price: 1_200 }, { id: 'exp-candy-m', price: 4_000 },
  { id: 'exp-candy-l', price: 12_000 }, { id: 'exp-candy-xl', price: 30_000 }, { id: 'rare-candy', price: 10_000 },
  { id: 'thunder-stone', price: 2100 }, { id: 'leaf-stone', price: 2100 },
  { id: 'charcoal', price: 600 }, { id: 'mystic-water', price: 600 }, { id: 'miracle-seed', price: 600 }, { id: 'magnet', price: 600 },
  { id: 'fire-stone', price: 2100 }, { id: 'water-stone', price: 2100 }, { id: 'moon-stone', price: 2100 }, { id: 'linking-cord', price: 3000 },
  { id: 'scope-lens', price: 1200 }, { id: 'quick-claw', price: 1200 }, { id: 'leftovers', price: 2000 }, { id: 'charizardite-y', price: 9000 },
  { id: 'metal-coat', price: 2000 }, { id: 'kings-rock', price: 2000 }, { id: 'dragon-scale', price: 2000 },
  { id: 'sitrus-berry', price: 800 }, { id: 'focus-sash', price: 2500 }, { id: 'rocky-helmet', price: 3000 }, { id: 'assault-vest', price: 3500 }, { id: 'eviolite', price: 3500 },
  { id: 'life-orb', price: 4000 }, { id: 'choice-band', price: 4000 }, { id: 'choice-specs', price: 4000 }, { id: 'choice-scarf', price: 4000 },
  // EV training: vitamins, EV-reducing berries, Power items
  ...['hp-up', 'protein', 'iron', 'calcium', 'zinc', 'carbos'].map((id) => ({ id, price: 1500 })),
  ...['pomeg-berry', 'kelpsy-berry', 'qualot-berry', 'hondew-berry', 'grepa-berry', 'tamato-berry'].map((id) => ({ id, price: 400 })),
  ...['power-weight', 'power-bracer', 'power-belt', 'power-lens', 'power-band', 'power-anklet', 'macho-brace'].map((id) => ({ id, price: 3000 })),
  // Gen 1 Mega Stones without a world source yet are sold (expensive)
  ...['beedrillite', 'alakazite', 'slowbronite', 'gengarite', 'kangaskhanite', 'pinsirite', 'gyaradosite', 'aerodactylite', 'mewtwonite-x', 'mewtwonite-y'].map((id) => ({ id, price: 12000 })),
];
export const HEAL_POWER: Record<string, { party: number; trainer: number }> = {
  potion: { party: 0.4, trainer: 0.25 },
  superpotion: { party: 0.75, trainer: 0.5 },
  oranberry: { party: 0.2, trainer: 0.4 },
};

export const MAX_PARTY = 6;
export const STARTERS = ['charmander', 'squirtle', 'bulbasaur'];

export class AdventureState {
  readonly quests: QuestManager;
  trackedQuest: string | null = null;

  constructor(readonly save: SaveData) {
    if (!save.adventure) save.adventure = newAdventure();
    // authored quests + the generated legendary quest chains (core/legends.ts)
    // each campaign has its own quest book (Vietnam Odyssey: data/vietnam/quests.json, no classic legend chains)
    const vn = this.adv.campaign === 'vietnam';
    const authored = (vn ? vnQuestsJson : questsJson) as QuestDef[];
    this.quests = new QuestManager(vn ? authored : [...authored, ...legendQuests(authored)], this.adv.quests, () => new Set(this.adv.flags));
    this.syncQuests();
    this.trackedQuest = this.quests.active()[0]?.id ?? null;
    // Repair the V7 invariants on every construction (old saves, hand-edited saves, interrupted captures).
    this.ensureStorage();
  }

  get adv(): AdventureSave {
    return this.save.adventure!;
  }

  private syncQuests(): void {
    this.adv.quests = this.quests.serialize();
  }

  // ───────────────────────────── collection & party ─────────────────────────────

  owned(uid: string): OwnedPokemon | undefined {
    return this.save.collection.find((c) => c.uid === uid);
  }

  party(): OwnedPokemon[] {
    return this.adv.party.map((u) => this.owned(u)).filter((p): p is OwnedPokemon => !!p);
  }

  inParty(uid: string): boolean {
    return this.adv.party.includes(uid);
  }

  get activeUid(): string | null {
    return this.adv.activeUid;
  }

  activePokemon(): OwnedPokemon | null {
    const uid = this.adv.activeUid;
    return uid && this.inParty(uid) ? this.owned(uid) ?? null : null;
  }

  isActive(uid: string): boolean {
    return this.adv.activeUid === uid;
  }

  /**
   * Makes `uid` the one Pokémon outside its ball. Every other party member is marked as recalled
   * (in its ball) so the field can never contain two partners of the same trainer.
   */
  setActive(uid: string): boolean {
    const p = this.owned(uid);
    if (!p || !this.inParty(uid) || (p.hpFrac ?? 1) <= 0) return false;
    this.adv.activeUid = uid;
    this.adv.recalled = this.adv.party.filter((u) => u !== uid);
    return true;
  }

  /** Recall the active Pokémon; the party stays intact and an empty field is valid. */
  recallActive(): boolean {
    const uid = this.adv.activeUid;
    if (!uid) return false;
    this.adv.activeUid = null;
    if (!this.adv.recalled.includes(uid)) this.adv.recalled.push(uid);
    return true;
  }

  /** Repairs party/PC/active invariants (called on load and after storage updates). */
  ensureStorage(): void {
    const owned = new Set(this.save.collection.map((p) => p.uid));
    this.adv.party = [...new Set(this.adv.party.filter((u) => owned.has(u)))].slice(0, MAX_PARTY);
    let active = typeof this.adv.activeUid === 'string' && this.adv.party.includes(this.adv.activeUid) ? this.adv.activeUid : null;
    // A fainted Pokémon cannot stay outside its ball (it would be an invalid field state on load).
    const activeP = active ? this.owned(active) : undefined;
    if (active && activeP && (activeP.hpFrac ?? 1) <= 0) {
      this.adv.recalled.push(active);
      active = null;
    }
    this.adv.activeUid = active;
    this.adv.recalled = [...new Set(this.adv.recalled.filter((u) => u !== active && this.adv.party.includes(u)))];
    this.adv.pc = buildPcForCollection(this.save.collection, this.adv.party, this.adv.pc);
    // party always wins over a stale PC reference
    for (const uid of this.adv.party) removeFromPc(this.adv.pc, uid);
  }

  get pc(): PcStorage {
    return this.adv.pc;
  }

  pcLocation(uid: string): PcLocation {
    return pcLocationOf(this.adv.pc, uid);
  }

  pcAt(box: number, slot: number): OwnedPokemon | undefined {
    const uid = this.adv.pc.boxes[box]?.slots[slot];
    return uid ? this.owned(uid) : undefined;
  }

  pcPokemon(): OwnedPokemon[] {
    return pcUids(this.adv.pc).map((u) => this.owned(u)).filter((p): p is OwnedPokemon => !!p);
  }

  /** Owned but neither in the party nor the PC (only possible when storage was full during a capture). */
  unplacedPokemon(): OwnedPokemon[] {
    const party = new Set(this.adv.party), pc = new Set(pcUids(this.adv.pc));
    return this.save.collection.filter((p) => !party.has(p.uid) && !pc.has(p.uid));
  }

  canUsePc(): boolean {
    return pcHasRoom(this.adv.pc) || this.pcPokemon().length > 0;
  }

  /**
   * Moves a party member into a PC slot. At least one partner must stay in the party.
   * The Pokémon is never duplicated: it leaves the party/recall lists before entering the box.
   */
  depositToPc(uid: string, loc?: PcLocation): boolean {
    if (!this.owned(uid) || !this.inParty(uid) || this.adv.party.length <= 1) return false;
    const target = loc ?? firstFreePcSlot(this.adv.pc);
    if (!target || !this.adv.pc.boxes[target.box] || this.adv.pc.boxes[target.box].slots[target.slot]) return false;
    this.adv.party = this.adv.party.filter((u) => u !== uid);
    this.adv.recalled = this.adv.recalled.filter((u) => u !== uid);
    if (this.adv.activeUid === uid) this.adv.activeUid = null;
    removeFromPc(this.adv.pc, uid);
    if (!placeInPc(this.adv.pc, uid, target)) return false;
    this.ensureStorage();
    return true;
  }

  /** Withdraws a PC Pokémon into the party (in its ball; the player still summons it). */
  withdrawFromPc(uid: string): boolean {
    if (!this.owned(uid) || this.inParty(uid) || this.adv.party.length >= MAX_PARTY) return false;
    if (!this.pcLocation(uid)) return false;
    removeFromPc(this.adv.pc, uid);
    this.adv.party.push(uid);
    if (!this.adv.recalled.includes(uid)) this.adv.recalled.push(uid);
    this.ensureStorage();
    return true;
  }

  /** Moves/swaps inside the PC. Both uids stay owned and uniquely placed. */
  moveInPc(uid: string, box: number, slot: number): boolean {
    const from = this.pcLocation(uid);
    const targetBox = this.adv.pc.boxes[box];
    if (!from || !targetBox || slot < 0 || slot >= targetBox.slots.length) return false;
    if (from.box === box && from.slot === slot) return false;
    const other = targetBox.slots[slot];
    if (other === uid) return false;
    targetBox.slots[slot] = uid;
    this.adv.pc.boxes[from.box].slots[from.slot] = other ?? null;
    return true;
  }

  renameBox(box: number, name: string): boolean {
    const b = this.adv.pc.boxes[box];
    if (!b) return false;
    const clean = name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!clean) return false;
    b.name = clean;
    return true;
  }

  /** Compacts a box and sorts it by the chosen key (favourite first for every mode). */
  sortPc(box: number, mode: 'level' | 'name' | 'recent' | 'favorite' = 'level'): boolean {
    const b = this.adv.pc.boxes[box];
    if (!b) return false;
    const mons = b.slots.map((u) => (u ? this.owned(u) : undefined)).filter((p): p is OwnedPokemon => !!p);
    if (!mons.length) return false;
    const speciesName = (p: OwnedPokemon) => POKEMON.get(p.species)?.name ?? p.species;
    mons.sort((a, z) => {
      if (!!z.favorite !== !!a.favorite) return Number(!!z.favorite) - Number(!!a.favorite);
      if (mode === 'name') return speciesName(a).localeCompare(speciesName(z), 'vi');
      if (mode === 'recent') return z.caughtAt - a.caughtAt;
      if (mode === 'favorite') return z.level - a.level;
      return z.level - a.level || speciesName(a).localeCompare(speciesName(z), 'vi');
    });
    b.slots = [...mons.map((p) => p.uid), ...Array.from({ length: b.slots.length - mons.length }, () => null)];
    return true;
  }

  toggleFavorite(uid: string): boolean {
    const p = this.owned(uid);
    if (!p) return false;
    p.favorite = !p.favorite;
    return true;
  }

  /** Explicit setter used by the authoritative server (idempotent retries must not flip the flag). */
  setFavorite(uid: string, favorite: boolean): boolean {
    const p = this.owned(uid);
    if (!p) return false;
    p.favorite = !!favorite;
    return true;
  }

  renamePokemon(uid: string, raw: string): boolean {
    const p = this.owned(uid);
    if (!p) return false;
    const clean = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (clean) p.nickname = clean; else delete p.nickname;
    return true;
  }

  /**
   * Adds Pokémon to the party if there is room, otherwise to the PC, otherwise leaves it safely in the
   * Collection ("unplaced", visible in the PC). The collection entry is always created.
   */
  addPokemon(species: string, level: number, origin: OwnedPokemon['origin'], shiny = false): OwnedPokemon {
    if (!POKEMON.has(species)) throw new Error('Not a playable species: ' + species);
    const p = makeOwned(species, level, origin);
    if (shiny) p.shiny = true;
    this.save.collection.push(p);
    registerCaught(this.save, species, shiny);
    if (this.adv.party.length < MAX_PARTY) {
      this.adv.party.push(p.uid);
      if (!this.adv.activeUid) this.adv.activeUid = p.uid;
      else if (!this.adv.recalled.includes(p.uid)) this.adv.recalled.push(p.uid);
    } else {
      const loc = firstFreePcSlot(this.adv.pc);
      if (loc && placeInPc(this.adv.pc, p.uid, loc)) {
        // auto-stored: party is full
      }
      // else: keep in the Collection (never lost); the PC UI exposes it as "chưa xếp"
    }
    return p;
  }

  /** Switches a Pokémon between party and PC (never loses it). */
  togglePartyMember(uid: string): boolean {
    if (this.inParty(uid)) return this.depositToPc(uid);
    if (!this.owned(uid) || this.adv.party.length >= MAX_PARTY) return false;
    // free the PC reference before joining the party
    for (const box of this.adv.pc.boxes) {
      const i = box.slots.indexOf(uid);
      if (i >= 0) box.slots[i] = null;
    }
    this.adv.party.push(uid);
    if (!this.adv.recalled.includes(uid)) this.adv.recalled.push(uid);
    return true;
  }

  // ───────────────────────────── candy ─────────────────────────────

  /**
   * Uses candy from the bag. EXP/levels are calculated here (and by the server in online mode),
   * never by the UI. Returns the number actually consumed (capped at the level limit).
   */
  useCandy(uid: string, candyId: string, qty = 1): CandyOutcome & { candy: string; bagLeft: number; evolutions: string[] } {
    const p = this.owned(uid);
    const def = candyDef(candyId);
    const empty: CandyOutcome = { used: 0, expGained: 0, levels: 0, beforeLevel: p?.level ?? 1, afterLevel: p?.level ?? 1, beforeExp: p?.exp ?? 0, afterExp: p?.exp ?? 0 };
    if (!p || !def) return { ...empty, candy: candyId, bagLeft: this.item(candyId), evolutions: [] };
    const canUse = Math.min(Math.max(0, Math.floor(qty)), this.item(candyId), maxUsefulCandy(p, candyId));
    if (canUse <= 0) return { ...empty, candy: candyId, bagLeft: this.item(candyId), evolutions: [] };
    const result = applyCandy(p, candyId, canUse);
    if (result.used > 0) {
      this.save.inventory[candyId] = Math.max(0, this.item(candyId) - result.used);
      if (this.save.inventory[candyId] === 0) delete this.save.inventory[candyId];
    }
    return {
      ...result,
      candy: candyId,
      bagLeft: this.item(candyId),
      evolutions: result.levels > 0 ? this.pendingEvolutions(uid) : [],
    };
  }

  /** Grants EXP to the given party members. Returns level-ups for UI/world sync. */
  gainExp(uids: string[], amount: number): { uid: string; levels: number; level: number }[] {
    const out: { uid: string; levels: number; level: number }[] = [];
    for (const uid of uids) {
      const p = this.owned(uid);
      if (!p) continue;
      const levels = addExp(p, amount);
      for (let i = 0; i < levels; i++) addFriendship(p, 'levelup');
      if (levels > 0) out.push({ uid, levels, level: p.level });
    }
    return out;
  }

  /** EVs for the party members that took part in beating `species` (Power items / Macho Brace included). Returns who changed. */
  gainEvs(uids: string[], species: string): string[] {
    const changed: string[] = [];
    for (const uid of uids) {
      const p = this.owned(uid);
      if (!p) continue;
      const added = applyEvGain((p.evs ??= zeroEvs()), evGain(species, p.held));
      if (Object.keys(added).length) changed.push(uid);
    }
    return changed;
  }

  /** Vitamin (+10) or EV-reducing berry (−10, + friendship). Consumed only when it changes something. */
  useEvItem(uid: string, itemId: string): number {
    const p = this.owned(uid), ev = ITEM_DEFS.get(itemId)?.ev;
    if (!p || !ev || this.item(itemId) <= 0) return 0;
    const applied = addEv((p.evs ??= zeroEvs()), ev.stat as StatKey, ev.amount);
    if (!applied) return 0;
    this.consume(itemId);
    if (ev.amount < 0) addFriendship(p, 'item');
    return applied;
  }

  // ───────────────────────────── money & shop ─────────────────────────────

  get money(): number {
    return this.save.currency;
  }

  earn(v: number): void {
    this.save.currency += Math.max(0, Math.round(v));
  }

  buy(id: string, price: number): boolean {
    if (this.save.currency < price) return false;
    this.save.currency -= price;
    this.addItems({ [id]: 1 });
    return true;
  }

  // ───────────────────────────── equipment ─────────────────────────────

  /** Held items in the bag that can be equipped (held + Mega Stones). */
  equippable(): string[] {
    return Object.keys(this.save.inventory).filter((k) => this.item(k) > 0 && ['held', 'megaStone'].includes(ITEM_DEFS.get(k)?.kind ?? ''));
  }

  /** Equips `itemId` from the bag (previous item returns to the bag). */
  equip(uid: string, itemId: string): boolean {
    const p = this.owned(uid);
    const def = ITEM_DEFS.get(itemId);
    if (!p || !def || (def.kind !== 'held' && def.kind !== 'megaStone') || !this.consume(itemId)) return false;
    if (p.held) this.addItems({ [p.held]: 1 });
    p.held = itemId;
    return true;
  }

  unequip(uid: string): boolean {
    const p = this.owned(uid);
    if (!p?.held) return false;
    this.addItems({ [p.held]: 1 });
    p.held = undefined;
    return true;
  }

  // ───────────────────────────── evolution ─────────────────────────────

  /** Everything the EvolutionRuleEngine needs about this individual + the world around it. */
  evoContext(uid: string, env: EvoEnv = {}, usedItem: string | null = null): EvoContext | null {
    const p = this.owned(uid);
    if (!p) return null;
    const def = POKEMON.get(p.species);
    const st = def ? calcStats(def.baseStats, p.level, individualOf(p)) : undefined;
    return {
      level: p.level, friendship: p.friendship ?? 0, heldItem: p.held ?? null, knownSkills: unlockedSkills(p.species, p.level),
      timeOfDay: env.night ? 'night' : 'day', habitat: env.habitat ?? null, raining: !!env.raining, usedItem,
      stats: st ? { atk: st.atk, def: st.def } : undefined,
    };
  }

  /** Level-up evolutions available now (several = branch, the player chooses). Respects a previous "not now". */
  pendingEvolutions(uid: string, env: EvoEnv = {}): string[] {
    const p = this.owned(uid);
    if (!p || (p.evoDeclined != null && p.evoDeclined >= p.level)) return [];
    const c = this.evoContext(uid, env)!;
    return availableEvolutions(p.species, c).filter((o) => o.trigger === 'level-up').map((o) => o.to);
  }

  /** Back-compat: first pending level-up evolution. */
  pendingEvolution(uid: string, env: EvoEnv = {}): string | null {
    return this.pendingEvolutions(uid, env)[0] ?? null;
  }

  /** Evolution unlocked by using an item (stone / Linking Cord) on this Pokémon. */
  stoneEvolution(uid: string, stone: string, env: EvoEnv = {}): string | null {
    const c = this.evoContext(uid, env, stone);
    const p = this.owned(uid);
    return c && p ? availableEvolutions(p.species, c)[0]?.to ?? null : null;
  }

  /**
   * Applies an evolution permanently (collection + Pokédex), re-validated by the rule engine.
   * Keeps uid, level, EXP, IVs, nature, friendship, nickname, capture history; the used item is consumed,
   * and so is a held item that the rule requires (main-series trade behaviour).
   */
  evolve(uid: string, to: string, stone?: string, env: EvoEnv = {}): boolean {
    const p = this.owned(uid);
    if (!p || !POKEMON.has(to)) return false;
    const c = this.evoContext(uid, env, stone ?? null)!;
    const opt = evolutionsOf(p.species).find((e) => e.to === to && evaluate(e, c));
    if (!opt) return false;
    if (opt.trigger === 'use-item' && !this.consume(stone!)) return false;
    if (opt.rule.heldItem && p.held === opt.rule.heldItem) p.held = undefined;
    p.species = to;
    p.evoDeclined = undefined;
    registerCaught(this.save, to, !!p.shiny);
    return true;
  }

  declineEvolution(uid: string): void {
    const p = this.owned(uid);
    if (p) p.evoDeclined = p.level;
  }

  // ───────────────────────────── items ─────────────────────────────

  item(id: string): number {
    return this.save.inventory[id] ?? 0;
  }

  addItems(items: Record<string, number> | undefined): void {
    for (const [k, v] of Object.entries(items ?? {})) this.save.inventory[k] = (this.save.inventory[k] ?? 0) + v;
  }

  consume(id: string): boolean {
    if (this.item(id) <= 0) return false;
    this.save.inventory[id]--;
    return true;
  }

  // ───────────────────────────── flags & progression ─────────────────────────────

  hasFlag(f: string): boolean {
    return this.adv.flags.includes(f);
  }

  setFlag(f: string): void {
    if (!this.hasFlag(f)) this.adv.flags.push(f);
    this.quests.refresh();
    this.syncQuests();
  }

  get worldLevel(): number {
    return Math.min(8, Math.floor(Math.sqrt(this.adv.worldExp / 150)) + 1);
  }

  addWorldExp(v: number): boolean {
    const before = this.worldLevel;
    this.adv.worldExp += v;
    return this.worldLevel > before;
  }

  /** Overworld map the scene is showing (set by AdventureScene). */
  currentRegion = 'starter-valley';

  /** Explored chunk list of the region the player is in (the valley uses the original `discovered`). */
  discoveredList(): number[] {
    const r = this.currentRegion;
    if (!r || r === 'starter-valley') return this.adv.discovered;
    this.adv.discoveredBy ??= {};
    return (this.adv.discoveredBy[r] ??= []);
  }

  discoverChunk(idx: number): boolean {
    const list = this.discoveredList();
    if (list.includes(idx)) return false;
    list.push(idx);
    return true;
  }

  explorationPercent(totalChunks: number, totalChests: number, totalWaypoints: number): number {
    const c = this.discoveredList().length / Math.max(1, totalChunks);
    const ch = this.adv.chests.length / Math.max(1, totalChests);
    const wp = this.adv.waypoints.length / Math.max(1, totalWaypoints);
    return Math.round((c * 0.6 + ch * 0.2 + wp * 0.2) * 100);
  }

  markDungeon(id: string, d: Difficulty): void {
    const list = this.adv.dungeons[id] ?? (this.adv.dungeons[id] = []);
    if (!list.includes(d)) list.push(d);
  }

  dungeonCleared(id: string, d: Difficulty): boolean {
    return (this.adv.dungeons[id] ?? []).includes(d);
  }

  // ───────────────────────────── quests ─────────────────────────────

  /** Feeds an event to quests. Returns quests completed by it (rewards NOT yet applied). */
  notify(ev: QuestEvent): QuestDef[] {
    const done = this.quests.notify(ev).filter((u) => u.completed).map((u) => this.quests.def(u.questId)!);
    this.quests.refresh();
    if (this.trackedQuest && this.quests.states[this.trackedQuest]?.status === 'completed') this.trackedQuest = this.quests.active()[0]?.id ?? null;
    if (!this.trackedQuest) this.trackedQuest = this.quests.active()[0]?.id ?? null;
    this.syncQuests();
    return done;
  }

  startQuest(id: string): boolean {
    const ok = this.quests.start(id);
    if (ok && !this.trackedQuest) this.trackedQuest = id;
    this.syncQuests();
    return ok;
  }

  /** Applies quest/dungeon rewards; returns human-readable lines. */
  grant(r: QuestRewards): string[] {
    const lines: string[] = [];
    if (r.items) {
      this.addItems(r.items);
      lines.push(...Object.entries(r.items).map(([k, v]) => `+${v} ${ITEMS[k]?.name ?? k}`));
    }
    if (r.worldExp) { const up = this.addWorldExp(r.worldExp); lines.push(`+${r.worldExp} EXP thế giới${up ? ` → Cấp thế giới ${this.worldLevel}!` : ''}`); }
    if (r.reputation) { this.adv.reputation += r.reputation; lines.push(`+${r.reputation} Danh tiếng`); }
    if (r.pokemon) {
      const p = this.addPokemon(r.pokemon.species, r.pokemon.level, 'gift');
      lines.push(`${POKEMON.get(p.species)?.name} (Lv${p.level}) gia nhập bộ sưu tập!`);
    }
    for (const f of r.flags ?? []) this.setFlag(f);
    this.syncQuests();
    return lines;
  }
}
