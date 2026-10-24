import Phaser from 'phaser';
import { chunkCols, chunkRows, MapObject, MapProvider } from '../core/map/mapProvider';
import { SCALE, TILE, TILE_PX } from '../core/map/tiles';
import { TILESET_KEY } from './tileset';

// Chunk streaming: a 16x16-tile Phaser Tilemap per chunk + its objects, created when the chunk
// enters the camera's load radius and destroyed (memory freed) when it leaves the unload radius.

export interface ChunkRecord {
  idx: number;
  cx: number;
  cy: number;
  map: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
  objects: Phaser.GameObjects.GameObject[];
  animated: [number, number][];
  mapObjects: MapObject[];
}

export interface ChunkHooks {
  onLoad(rec: ChunkRecord): void;
  onUnload(rec: ChunkRecord): void;
}

export class ChunkView {
  readonly loaded = new Map<number, ChunkRecord>();
  loadsTotal = 0;
  unloadsTotal = 0;
  private cols: number;
  private rows: number;

  constructor(private scene: Phaser.Scene, readonly map: MapProvider, private hooks: ChunkHooks, private loadMargin = 1) {
    this.cols = chunkCols(map);
    this.rows = chunkRows(map);
  }

  get chunkPx(): number {
    return this.map.chunk * TILE_PX;
  }

  isLoadedTile(tx: number, ty: number): boolean {
    return this.loaded.has(Math.floor(ty / this.map.chunk) * this.cols + Math.floor(tx / this.map.chunk));
  }

  update(view: Phaser.Geom.Rectangle): void {
    const cp = this.chunkPx;
    const x0 = Math.max(0, Math.floor(view.x / cp) - this.loadMargin), x1 = Math.min(this.cols - 1, Math.floor(view.right / cp) + this.loadMargin);
    const y0 = Math.max(0, Math.floor(view.y / cp) - this.loadMargin), y1 = Math.min(this.rows - 1, Math.floor(view.bottom / cp) + this.loadMargin);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const idx = cy * this.cols + cx;
      if (!this.loaded.has(idx)) this.load(cx, cy, idx);
    }
    // Unload with one chunk of hysteresis so walking along a border doesn't thrash
    for (const [idx, rec] of this.loaded) {
      if (rec.cx < x0 - 1 || rec.cx > x1 + 1 || rec.cy < y0 - 1 || rec.cy > y1 + 1) this.unload(idx, rec);
    }
  }

  private load(cx: number, cy: number, idx: number): void {
    const n = this.map.chunk;
    const data: number[][] = [];
    const animated: [number, number][] = [];
    for (let y = 0; y < n; y++) {
      const row: number[] = [];
      for (let x = 0; x < n; x++) {
        const tx = cx * n + x, ty = cy * n + y;
        if (tx >= this.map.widthTiles || ty >= this.map.heightTiles) { row.push(-1); continue; }
        row.push(this.map.tileIndexAt(tx, ty, 0));
        if (this.map.animatedAt(tx, ty)) animated.push([x, y]);
      }
      data.push(row);
    }
    const tm = this.scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = tm.addTilesetImage(TILESET_KEY, TILESET_KEY, TILE, TILE, 0, 0)!;
    const layer = tm.createLayer(0, ts, cx * n * TILE_PX, cy * n * TILE_PX)!.setScale(SCALE).setDepth(-100);
    const rec: ChunkRecord = { idx, cx, cy, map: tm, layer, objects: [], animated, mapObjects: this.map.objectsInChunk(cx, cy) };
    this.loaded.set(idx, rec);
    this.loadsTotal++;
    this.hooks.onLoad(rec);
  }

  private unload(idx: number, rec: ChunkRecord): void {
    this.hooks.onUnload(rec);
    for (const o of rec.objects) o.destroy();
    rec.objects.length = 0;
    rec.layer.destroy();
    rec.map.destroy();
    this.loaded.delete(idx);
    this.unloadsTotal++;
  }

  /** Swaps animated tiles (water ripples, swaying tall grass) for every loaded chunk. */
  animate(frame: number): void {
    const n = this.map.chunk;
    for (const rec of this.loaded.values()) {
      for (const [x, y] of rec.animated) rec.layer.putTileAt(this.map.tileIndexAt(rec.cx * n + x, rec.cy * n + y, frame), x, y);
    }
  }

  /** Re-reads tiles after runtime changes (doors opening). */
  refreshTiles(): void {
    const n = this.map.chunk;
    for (const rec of this.loaded.values()) {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const tx = rec.cx * n + x, ty = rec.cy * n + y;
        if (tx < this.map.widthTiles && ty < this.map.heightTiles) rec.layer.putTileAt(this.map.tileIndexAt(tx, ty, 0), x, y);
      }
    }
  }

  destroyAll(): void {
    for (const [idx, rec] of [...this.loaded]) this.unload(idx, rec);
  }
}
