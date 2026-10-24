import type { PokeType, StatusApply } from '../types';
import { hash2 } from './noise';
import { AreaDef, MapObject, MapProvider, SpawnEntry } from './mapProvider';
import { DUNGEON, EX, T } from './tiles';

export interface DungeonDef {
  id: string;
  name: string;
  width: number;
  height: number;
  rows: string[];
  rooms: Record<'wave' | 'hazard' | 'puzzle' | 'boss', [number, number, number, number]>;
  plateOrder: number[];
  boss: { id: string; levelOffset: number };
  waves: [string, number][][];
  difficulties: Record<string, {
    label: string; level: number; hpMult: number; elites: number; hazardEvery: number; bossHp: number; requires: string | null;
    rewards: { items: Record<string, number>; exp: number; worldExp: number; reputation: number };
    firstClear?: Record<string, number>;
    /** Challenge dungeons: seconds from the first wave to the boss's defeat */
    timeLimit?: number;
  }>;
  /** Map the entrance is on */
  region?: string;
  kind?: 'cave' | 'elemental' | 'challenge';
  /** Dark overlay colour (theme) */
  tint?: number;
  /** Falling hazards of the corridor / wrong plates */
  hazardType?: PokeType;
  hazardStatus?: StatusApply;
  intro?: string[];
  /** Floor art: IcyEthics stone / ice floors (default: Kenney cave floor) */
  floor?: 'icyGray' | 'icyBlue';
}

/** ASCII-authored dungeon. Door tiles are solid until opened at runtime (`setDoor`). */
export class DungeonMap implements MapProvider {
  readonly kind = 'dungeon' as const;
  readonly id: string;
  readonly name: string;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly chunk = 16;
  readonly plates: { x: number; y: number }[] = [];
  start = { x: 0, y: 0 };
  exit = { x: 0, y: 0 };
  bossExit = { x: 0, y: 0 };
  bossSpawn = { x: 0, y: 0 };
  chest = { x: 0, y: 0 };
  private openDoors = new Set<string>();

  constructor(readonly def: DungeonDef) {
    this.id = def.id;
    this.name = def.name;
    this.widthTiles = def.width;
    this.heightTiles = def.height;
    def.rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === 'P') this.plates.push({ x, y });
      if (c === 'S') this.start = { x, y };
      if (c === 'E') this.exit = { x, y };
      if (c === 'X') this.bossExit = { x, y };
      if (c === 'b') this.bossSpawn = { x, y };
      if (c === 'c') this.chest = { x, y };
    }));
  }

  private ch(tx: number, ty: number): string {
    return this.def.rows[ty]?.[tx] ?? '#';
  }

  /** Doors are grouped by letter: 'D' (wave room) and 'Q' (puzzle/boss). */
  setDoor(letter: 'D' | 'Q', open: boolean): void {
    if (open) this.openDoors.add(letter);
    else this.openDoors.delete(letter);
  }

  doorOpen(letter: 'D' | 'Q'): boolean {
    return this.openDoors.has(letter);
  }

  terrainAt(tx: number, ty: number): number {
    const c = this.ch(tx, ty);
    if (c === '#' || c === 't') return T.CaveWall;
    if (c === 'D' || c === 'Q') return this.openDoors.has(c) ? T.CaveFloor : T.Door;
    return T.CaveFloor;
  }

  solidAt(tx: number, ty: number): boolean {
    const t = this.terrainAt(tx, ty);
    return t === T.CaveWall || t === T.Door || this.ch(tx, ty) === 'p';
  }

  shotSolidAt(tx: number, ty: number): boolean {
    return this.solidAt(tx, ty);
  }

  animatedAt(): boolean {
    return false;
  }

  tileIndexAt(tx: number, ty: number): number {
    const c = this.ch(tx, ty);
    if (c === '#' || c === 't') {
      // Walls that face a floor tile below show the brick face; deeper walls show the dark top
      const below = this.ch(tx, ty + 1);
      return below !== '#' && below !== 't' ? DUNGEON.wall : DUNGEON.wallTop2;
    }
    if (c === 'D' || c === 'Q') return this.openDoors.has(c) ? DUNGEON.floor : DUNGEON.doorClosed;
    const h = hash2(tx, ty, 2);
    const fl = this.def.floor ? EX[this.def.floor] + Math.floor(hash2(tx, ty, 7) * 4) : DUNGEON.floor;
    if (c === 'H') return h < 0.25 ? DUNGEON.rubble2 : h < 0.5 ? DUNGEON.rubble1 : fl;
    return h < 0.03 && !this.def.floor ? DUNGEON.rubble1 : fl;
  }

  objectsInChunk(cx: number, cy: number): MapObject[] {
    const out: MapObject[] = [];
    for (let ty = cy * 16; ty < Math.min(cy * 16 + 16, this.heightTiles); ty++) {
      for (let tx = cx * 16; tx < Math.min(cx * 16 + 16, this.widthTiles); tx++) {
        const c = this.ch(tx, ty);
        if (c === 'p') out.push({ kind: 'pillar', id: `p-${tx}-${ty}`, x: tx, y: ty, tile: DUNGEON.pillar });
        else if (c === 't') out.push({ kind: 'torch', id: `torch-${tx}-${ty}`, x: tx, y: ty, tile: DUNGEON.torch });
        else if (c === 'P') out.push({ kind: 'plate', id: `plate-${this.plates.findIndex((p) => p.x === tx && p.y === ty)}`, x: tx, y: ty, data: { index: this.plates.findIndex((p) => p.x === tx && p.y === ty) } });
        else if (c === 'E') out.push({ kind: 'exit', id: 'exit', x: tx, y: ty });
      }
    }
    return out;
  }

  roomAt(tx: number, ty: number): keyof DungeonDef['rooms'] | null {
    for (const [k, [x0, y0, x1, y1]] of Object.entries(this.def.rooms)) {
      if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return k as keyof DungeonDef['rooms'];
    }
    return null;
  }

  areaAt(): AreaDef | null {
    return null;
  }

  habitatAt(): string | null {
    return null;
  }

  spawnTable(): SpawnEntry[] {
    return [];
  }

  colorAt(tx: number, ty: number): number {
    const t = this.terrainAt(tx, ty);
    return t === T.CaveWall ? 0x2a2230 : t === T.Door ? 0xa06030 : this.ch(tx, ty) === 'H' ? 0x6a5040 : 0x5a4a3a;
  }
}
