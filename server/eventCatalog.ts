export type ServerObjective = 'damage' | 'hits' | 'defeats';
export type EventDifficulty = 'Dễ' | 'Thường' | 'Khó' | 'Rất khó';
export interface RegionalEventDef {
  type: string; name: string; objective: ServerObjective; goal: number; species: string;
  legendary: boolean; minLevel: number;
  /** relative pick weight inside its region pool */
  weight: number;
  difficulty: EventDifficulty;
  recommendedLevel: number;
  /** candy tiers handed out by contribution (low → high) — preview only, the server computes the real reward */
  rewards: string;
}

// Each region has its own pool (V7 §9.3): the same random table is never shared by every region.
// Legendary entries only *announce* an omen / harder Alpha; they never hand out a legendary every cycle.
export const REGION_EVENT_POOLS: Readonly<Record<string, readonly RegionalEventDef[]>> = {
  'ca-mau': [
    { type: 'mangrove-bloom', name: 'Bảo vệ rừng tràm', objective: 'damage', goal: 2500, species: 'venusaur', legendary: false, minLevel: 0, weight: 4, difficulty: 'Dễ', recommendedLevel: 8, rewards: 'Exp. Candy S/M + xu' },
    { type: 'storm-surge', name: 'Bão lớn Đất Mũi', objective: 'hits', goal: 30, species: 'gyarados', legendary: false, minLevel: 0, weight: 3, difficulty: 'Thường', recommendedLevel: 12, rewards: 'Exp. Candy S/M/L + xu' },
    { type: 'alpha-migration', name: 'Đại di cư Alpha', objective: 'defeats', goal: 3, species: 'feraligatr', legendary: false, minLevel: 0, weight: 3, difficulty: 'Khó', recommendedLevel: 16, rewards: 'Exp. Candy M/L + xu' },
    { type: 'river-guard', name: 'Người giữ dòng sông', objective: 'damage', goal: 3000, species: 'lapras', legendary: false, minLevel: 0, weight: 3, difficulty: 'Thường', recommendedLevel: 12, rewards: 'Exp. Candy S/M/L + xu' },
    { type: 'thunder-relay', name: 'Tiếp sức sấm sét', objective: 'hits', goal: 45, species: 'ampharos', legendary: false, minLevel: 0, weight: 2, difficulty: 'Thường', recommendedLevel: 12, rewards: 'Exp. Candy S/M/L + xu' },
    { type: 'iron-front', name: 'Phòng tuyến thép', objective: 'defeats', goal: 2, species: 'steelix', legendary: false, minLevel: 0, weight: 2, difficulty: 'Khó', recommendedLevel: 16, rewards: 'Exp. Candy M/L + xu' },
    { type: 'night-patrol', name: 'Tuần tra đêm', objective: 'damage', goal: 4000, species: 'gengar', legendary: false, minLevel: 0, weight: 2, difficulty: 'Khó', recommendedLevel: 16, rewards: 'Exp. Candy M/L + xu' },
    { type: 'legendary-sign', name: 'Tiếng gọi huyền thoại', objective: 'damage', goal: 5000, species: 'suicune', legendary: true, minLevel: 20, weight: 1, difficulty: 'Rất khó', recommendedLevel: 20, rewards: 'Exp. Candy L + xu (không bắt được huyền thoại)' },
  ],
  'an-giang': [
    { type: 'flood-season', name: 'Mùa nước nổi', objective: 'hits', goal: 35, species: 'quagsire', legendary: false, minLevel: 0, weight: 4, difficulty: 'Dễ', recommendedLevel: 12, rewards: 'Exp. Candy S/M + xu' },
    { type: 'seven-mountains', name: 'Bóng tối Bảy Núi', objective: 'damage', goal: 3500, species: 'golem', legendary: false, minLevel: 0, weight: 3, difficulty: 'Thường', recommendedLevel: 16, rewards: 'Exp. Candy S/M/L + xu' },
    { type: 'stork-alpha', name: 'Alpha rừng tràm Trà Sư', objective: 'defeats', goal: 2, species: 'pelipper', legendary: false, minLevel: 0, weight: 2, difficulty: 'Khó', recommendedLevel: 18, rewards: 'Exp. Candy M/L + xu' },
    { type: 'temple-omen', name: 'Điềm báo đỉnh núi', objective: 'damage', goal: 5500, species: 'entei', legendary: true, minLevel: 24, weight: 1, difficulty: 'Rất khó', recommendedLevel: 24, rewards: 'Exp. Candy L + xu (không bắt được huyền thoại)' },
  ],
  'can-tho': [
    { type: 'river-festival', name: 'Lễ hội sông nước', objective: 'hits', goal: 40, species: 'lanturn', legendary: false, minLevel: 0, weight: 4, difficulty: 'Dễ', recommendedLevel: 16, rewards: 'Exp. Candy S/M + xu' },
    { type: 'floating-market', name: 'Thử thách chợ nổi', objective: 'damage', goal: 4000, species: 'kingler', legendary: false, minLevel: 0, weight: 3, difficulty: 'Thường', recommendedLevel: 20, rewards: 'Exp. Candy S/M/L + xu' },
    { type: 'water-migration', name: 'Di cư sông Hậu', objective: 'defeats', goal: 3, species: 'whiscash', legendary: false, minLevel: 0, weight: 2, difficulty: 'Khó', recommendedLevel: 22, rewards: 'Exp. Candy M/L + xu' },
  ],
};

/** Shared Alpha outside events: species pool + level per region (harder further from Cà Mau). */
export const REGION_ALPHA: Readonly<Record<string, { species: readonly string[]; level: number; eventLevel: number }>> = {
  'ca-mau': { species: ['gyarados', 'krookodile', 'feraligatr', 'lapras'], level: 12, eventLevel: 16 },
  'an-giang': { species: ['golem', 'quagsire', 'swampert', 'tauros'], level: 18, eventLevel: 22 },
  'can-tho': { species: ['whiscash', 'kingler', 'lanturn', 'tropius'], level: 22, eventLevel: 26 },
};

/**
 * Online players cannot earn story badges, so a badge portal opens for them at a party level instead
 * (the offline campaign rule `hasFlag(badge)` still counts if the flag exists).
 */
export const ONLINE_BADGE_LEVEL: Readonly<Record<string, number>> = { 'badge:ca-mau': 12, 'badge:an-giang': 16 };

const FALLBACK_POOL = REGION_EVENT_POOLS['ca-mau'];
const ALL = Object.values(REGION_EVENT_POOLS).flat();

/** Back-compat: the Cà Mau pool (the first region that went online). */
export const EVENT_POOL: readonly RegionalEventDef[] = FALLBACK_POOL;

export function regionPool(region: string): readonly RegionalEventDef[] {
  return REGION_EVENT_POOLS[region] ?? FALLBACK_POOL;
}

export function eventDef(type: string): RegionalEventDef { return ALL.find((d) => d.type === type) ?? FALLBACK_POOL[0]; }

export function eventObjectiveLabel(type: string): string {
  return { damage: 'Gây sát thương lên Alpha', hits: 'Đánh trúng Alpha', defeats: 'Hạ Alpha' }[eventDef(type).objective];
}

/**
 * Weighted pick from the region pool. Skips the previous type (no back-to-back repeat) and legendary
 * omens nobody nearby is strong enough for. `rand` is injectable so tests are deterministic.
 */
export function pickEvent(region: string, opts: { lastType?: string; maxPlayerLevel: number; rand?: () => number }): RegionalEventDef {
  const pool = regionPool(region);
  let candidates = pool.filter((d) => d.type !== opts.lastType && (!d.legendary || opts.maxPlayerLevel >= d.minLevel));
  if (!candidates.length) candidates = pool.filter((d) => !d.legendary);
  const total = candidates.reduce((n, d) => n + d.weight, 0);
  let roll = (opts.rand ?? Math.random)() * total;
  for (const d of candidates) {
    roll -= d.weight;
    if (roll < 0) return d;
  }
  return candidates[candidates.length - 1];
}
