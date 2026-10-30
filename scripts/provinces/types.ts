// Story spec of a Vietnam Odyssey province (scripts/gen-province.ts turns it into game data). The map itself is
// authored in src/data/vietnam/<id>.json; this file holds everything around it: the road from the previous province,
// passport page, encounter regions, boss, reputation, conservation, quests and the "what's new" entry.

/** [type, target, text, count?] — the marker is placed by the generator (NPC / trainer / area / waypoint / boss …) */
export type Obj = [type: 'talk' | 'trainer' | 'explore' | 'activate' | 'boss' | 'rescue' | 'capture', target: string, text: string, count?: number];

export interface QuestSpec {
  /** suffix: the quest id is vn-<prefix>-<id> */
  id: string;
  kind: 'main' | 'side';
  title: string;
  giver: string;
  /** quest suffixes of this province that come first */
  req?: string[];
  description: string;
  obj: Obj[];
  items: Record<string, number>;
  exp: number;
  rep: number;
  flags?: string[];
  offer: string[];
  progress?: string[];
  complete: string[];
}

export interface ProvinceSpec {
  id: string;
  name: string;
  /** two letters: quests vn-<prefix>-*, encounter regions vn-<prefix>-* */
  prefix: string;
  /** the previous province on the route: its gate here (added / updated on its map) */
  prev: { id: string; portal: { id: string; name: string; x: number; y: number } };
  /** where the gate from the previous province lands on this map */
  entry: { x: number; y: number };
  badge: string;
  landmarks: [flag: string, name: string][];
  /** encounter biome of every area that has wild Pokémon (village areas: none) */
  biomes: Record<string, 'meadow' | 'farm' | 'forest' | 'lake' | 'rocky' | 'ruins' | 'swamp' | 'coast' | 'snow' | 'volcano'>;
  /** tropical provinces keep Ice types out (default true) */
  noIce?: boolean;
  boss: {
    id: string; name: string; types: string[];
    baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
    skills: [string, string]; summon: string; banner: string;
    legend: { beam: string; volley: string; nova: string; field: string; ultimate: string; ultimateName: string;
      ultimateStyle: 'safe' | 'storm' | 'spokes' | 'mixed'; fieldStatus?: { kind: string; chance: number; duration: number; magnitude: number } };
    hpMult?: number;
  };
  rep: { rewards: Record<'1' | '2' | '3', Record<string, number>>; greet: [string, string, string, string] };
  eco: { area: string; action: 'plant' | 'net' | 'trash'; unlockQuest: string; label: string; done: string; thrivingReward: Record<string, number> };
  quests: QuestSpec[];
  news: { title: string; items: string[] };
}
