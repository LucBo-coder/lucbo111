// Tileset index constants for the composite 'ow_tiles' texture (12 columns, 16px tiles):
//   0..131    Kenney Tiny Town (CC0)
//   132..263  Kenney Tiny Dungeon (CC0)
//   264..     procedural extras (src/render/tileset.ts) — things the CC0 packs don't contain

export const TILE = 16;
export const SCALE = 3;
export const TILE_PX = TILE * SCALE; // world pixels per tile
export const COLS = 12;

export const TOWN = {
  grass: [0, 1, 2],
  dirt: { tl: 12, t: 13, tr: 14, l: 24, c: 25, r: 26, bl: 36, b: 37, br: 38 },
  plaza: 43,
  pine: 4, round: 16, tall: 28, pineAutumn: 3, roundAutumn: 15, tallAutumn: 27, bush: 5, mushrooms: 29, sprout: 17,
  fenceH: 45, fenceL: 44, fenceR: 46, fenceV: 47,
  sign: 83, well: 104, beehive: 94, target: 95, log: 106, bucket: 130, haystack: 92,
  roofRed: { tl: 52, t: 53, tr: 54, bl: 64, b: 65, br: 66 },
  roofGrey: { tl: 48, t: 49, tr: 50, bl: 60, b: 61, br: 62 },
  wallWood: { l: 72, c: 73, door: 74, r: 75, window: 84 },
  wallStone: { l: 76, c: 77, door: 78, r: 79, window: 88 },
} as const;

const D = 132;
export const DUNGEON = {
  floor: D + 0, rubble1: D + 12, rubble2: D + 24, sand: D + 48, sand2: D + 49, sand3: D + 52,
  wall: D + 40, wallTop: D + 57, wallTop2: D + 58, wallTop3: D + 59, torch: D + 29, grate: D + 28,
  pillar: D + 6, doorClosed: D + 46, chestClosed: D + 89, chestOpen: D + 90, plate: D + 60, plateOn: D + 61,
  stair: D + 41,
  npc: { wizard: D + 84, villager: D + 85, bald: D + 86, viking: D + 87, farmer: D + 88, knight: D + 96, girl: D + 99, elder: D + 100, ranger: D + 112, youngster: D + 97 },
  potion: D + 115, superPotion: D + 116,
} as const;

export const EX = {
  water: 264, // +frame
  tallGrass: 266, // +frame
  sand: 268, sand2: 269,
  rocky: 270, rocky2: 271,
  farmland: 272,
  deepGrass: 273,
  ruin: 274, ruin2: 275,
  shore: 276, // + mask*2 + frame (mask: N=1,E=2,S=4,W=8 land neighbours)
  // regions beyond the valley (0.7.0)
  snow: 308, snow2: 309, snowDeep: 310, // snowDeep +frame (311)
  ice: 312, ash: 313, ash2: 314, ashRock: 315, lava: 316, // lava +frame (317)
  sanctum: 318, sanctum2: 319, snowPine: 320, deadTree: 321, crystal: 322, portal: 323, bridge: 324,
  // IcyEthics cave floors (public/assets/icyethics/tiles, 4 variants each) — new dungeons (0.8.0)
  icyGray: 325, icyBlue: 329,
  /** dirt-path inner corners (grass notch at NE / NW / SE / SW) */
  dirtInner: { ne: 336, nw: 337, se: 338, sw: 339 },
  // Đầm Lầy Sương Mù / Bờ Biển San Hô (0.9.0)
  mud: 340, mud2: 341, bog: 342, // bog +frame (343)
  bogWater: 344, // +frame (345)
  swampGrass: 346, palm: 347,
  reeds: 348, // +frame (349)
  // Vietnam Odyssey (0.10.0): mangrove (cây đước) and melaleuca (cây tràm)
  mangrove: 350, melaleuca: 351,
  // legendary shrines (V22, LEGENDARY_SHRINES.md §4): statue, summoning core, themed pillars, small ritual props
  statue: 352, altar: 353, icePillar: 354, rodPillar: 355, whitePillar: 356, brokenPillar: 357,
  runeStone: 358, starStone: 359, flowerWilt: 360, flowerBloom: 361, moonPlate: 362, pad: 363, crack: 364, regiSlot: 365,
  // themed paths (V26): packed-snow trail (frozen), basalt flagstones (volcanic) — 2 variants each
  snowPath: 366, basaltPath: 368,
  /** sand / rocky ground with a jagged grass fringe on the sides that touch grass: + mask (N=1, E=2, S=4, W=8; 1..15) */
  sandEdge: 372, rockyEdge: 388,
} as const;
export const TILESET_ROWS = 34;

/**
 * Adventure Awaits by Ishtar Pixels (CC0): cottages and old trees, separate images (outside 'ow_tiles') drawn at the
 * same ×3 as the tiles. ax / ay = anchor in image pixels — cottages: the footprint's left edge (the wall starts at
 * x 3) and bottom (the doorstep ends at y 76); trees: the trunk's base. Roof, canopy and soft shadow overhang.
 */
export const AA_DIR = 'assets/ishtar/adventure-awaits/';
export const AA_ART = {
  'aa-house-red': { file: 'house-red.png', ax: 3, ay: 77 },
  'aa-house-brown': { file: 'house-brown.png', ax: 3, ay: 77 },
  'aa-house-blue': { file: 'house-blue.png', ax: 3, ay: 77 },
  'aa-tree-round': { file: 'tree-round.png', ax: 23, ay: 49 },
  'aa-tree-wide': { file: 'tree-wide.png', ax: 27, ay: 54 },
} as const;
export type AaKey = keyof typeof AA_ART;

/** The Adventure Awaits image of a map object (cottage / old tree), if it has one. */
export function worldArtKey(o: { data?: Record<string, unknown> }): AaKey | null {
  const key = o.data?.cottage ? `aa-house-${o.data.cottage}` : o.data?.big ? `aa-tree-${o.data.big}` : null;
  return key && key in AA_ART ? key as AaKey : null;
}

/** Terrain codes produced by map providers. */
export const T = {
  Grass: 0, Tuft: 1, Flowers: 2, TallGrass: 3, Path: 4, Water: 5, Sand: 6, Rocky: 7, Ruin: 8, Plaza: 9, Farm: 10, Deep: 11,
  CaveFloor: 20, CaveWall: 21, Door: 22,
  Snow: 30, SnowDeep: 31, Ice: 32, Ash: 33, AshRock: 34, Lava: 35, Sanctum: 36, Bridge: 37,
  /** toxic swamp puddle (walkable, poisons) */ Bog: 38, Mud: 39,
  /** shrine wall / cliff (legendary shrines, solid) */ Wall: 40,
} as const;
export type Terrain = (typeof T)[keyof typeof T];
