// Common interface for chunked, map-based modes (overworld regions and dungeons).
// Everything here is pure data/logic so it can be tested without Phaser.

export type ObjKind =
  | 'tree' | 'boulder' | 'building' | 'prop' | 'fence' | 'sign' | 'npc' | 'trainer' | 'chest' | 'waypoint'
  | 'plate' | 'cave' | 'rescue' | 'pillar' | 'torch' | 'door' | 'exit' | 'flower' | 'portal' | 'node' | 'field' | 'dock';

export interface MapObject {
  kind: ObjKind;
  id: string;
  /** Tile coordinates (top-left for multi-tile objects) */
  x: number;
  y: number;
  w?: number;
  h?: number;
  tile?: number;
  tiles?: number[][];
  /** Circle collider radius in world px (trees, boulders, props) */
  collideR?: number;
  data?: Record<string, unknown>;
}

export interface AreaDef {
  id: string;
  name: string;
  rect: [number, number, number, number];
  habitat: string;
  level: [number, number];
}

export interface SpawnEntry {
  species: string;
  weight: number;
  temperament: 'timid' | 'neutral' | 'aggressive';
  time: 'day' | 'night' | 'any';
  nocturnal?: boolean;
  weather?: Partial<Record<'rain' | 'fog' | 'clear', number>>;
}

export interface MapProvider {
  readonly id: string;
  readonly name: string;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly chunk: number;
  readonly kind: 'overworld' | 'dungeon';
  terrainAt(tx: number, ty: number): number;
  solidAt(tx: number, ty: number): boolean;
  shotSolidAt(tx: number, ty: number): boolean;
  tileIndexAt(tx: number, ty: number, frame: number): number;
  /** True if the tile at (tx,ty) changes between animation frames (water, tall grass) */
  animatedAt(tx: number, ty: number): boolean;
  objectsInChunk(cx: number, cy: number): MapObject[];
  areaAt(tx: number, ty: number): AreaDef | null;
  habitatAt(tx: number, ty: number): string | null;
  spawnTable(habitat: string): SpawnEntry[];
  /** Minimap colour (0xRRGGBB) for a tile */
  colorAt(tx: number, ty: number): number;
}

export function chunkIndex(map: MapProvider, cx: number, cy: number): number {
  return cy * Math.ceil(map.widthTiles / map.chunk) + cx;
}

export function chunkCols(map: MapProvider): number {
  return Math.ceil(map.widthTiles / map.chunk);
}

export function chunkRows(map: MapProvider): number {
  return Math.ceil(map.heightTiles / map.chunk);
}
