import questsJson from '../data/world/quests.json';
import vnQuestsJson from '../data/vietnam/quests.json';
import { POKEMON } from '../core/data';
import { addExp, addFriendship, individualOf, makeOwned, OwnedPokemon } from '../core/progression';
import { availableEvolutions, EvoContext, evolutionsOf, evaluate, ITEM_DEFS } from '../core/evolution';
import { unlockedSkills } from '../core/learnset';
import { legendQuests } from '../core/legends';
import { calcStats } from '../core/stats';
import { QuestDef, QuestEvent, QuestManager, QuestRewards } from '../core/quests';
import { AdventureSave, Difficulty, newAdventure, registerCaught, SaveData } from '../systems/saveSchema';

// Adventure progression wrapper around the shared save. No Phaser here (unit-tested).

/** World state relevant to evolution rules (time of day, current habitat, weather). */
export interface EvoEnv {
  night?: boolean;
  habitat?: string | null;
  raining?: boolean;
}

export const ITEMS: Record<string, { name: string; desc: string; kind: 'ball' | 'heal' | 'held' | 'stone' | 'key' }> = {
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
for (const it of ITEM_DEFS.values()) ITEMS[it.id] = { name: it.name, desc: it.desc, kind: it.kind === 'held' || it.kind === 'megaStone' ? 'held' : it.kind === 'evoStone' ? 'stone' : 'key' } as never;
export const SHOP: { id: string; price: number }[] = [
  { id: 'pokeball', price: 200 }, { id: 'greatball', price: 600 }, { id: 'ultraball', price: 1200 },
  { id: 'netball', price: 1000 }, { id: 'duskball', price: 1000 }, { id: 'quickball', price: 1000 }, { id: 'timerball', price: 1000 }, { id: 'luxuryball', price: 1000 },
  { id: 'potion', price: 300 }, { id: 'superpotion', price: 700 }, { id: 'oranberry', price: 150 },
  { id: 'thunder-stone', price: 2100 }, { id: 'leaf-stone', price: 2100 },
  { id: 'charcoal', price: 600 }, { id: 'mystic-water', price: 600 }, { id: 'miracle-seed', price: 600 }, { id: 'magnet', price: 600 },
  { id: 'fire-stone', price: 2100 }, { id: 'water-stone', price: 2100 }, { id: 'moon-stone', price: 2100 }, { id: 'linking-cord', price: 3000 },
  { id: 'scope-lens', price: 1200 }, { id: 'quick-claw', price: 1200 }, { id: 'leftovers', price: 2000 }, { id: 'charizardite-y', price: 9000 },
  { id: 'metal-coat', price: 2000 }, { id: 'kings-rock', price: 2000 }, { id: 'dragon-scale', price: 2000 },
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

  togglePartyMember(uid: string): boolean {
    if (this.inParty(uid)) {
      if (this.adv.party.length <= 1) return false; // always keep at least one partner
      this.adv.party = this.adv.party.filter((u) => u !== uid);
      return true;
    }
    if (this.adv.party.length >= MAX_PARTY || !this.owned(uid)) return false;
    this.adv.party.push(uid);
    return true;
  }

  /** Adds a Pokémon to the permanent collection (+Pokédex) and to the party if there is room. */
  addPokemon(species: string, level: number, origin: OwnedPokemon['origin'], shiny = false): OwnedPokemon {
    if (!POKEMON.has(species)) throw new Error('Not a playable species: ' + species);
    const p = makeOwned(species, level, origin);
    if (shiny) p.shiny = true;
    this.save.collection.push(p);
    registerCaught(this.save, species, shiny);
    if (this.adv.party.length < MAX_PARTY) this.adv.party.push(p.uid);
    return p;
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
