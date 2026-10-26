import { fbm, hash2 } from './noise';
import { nookRing, type Dock, type FieldDef } from '../field';
import { AreaDef, MapObject, MapProvider, SpawnEntry } from './mapProvider';
import { DUNGEON, EX, T, TOWN } from './tiles';

// Starter Valley: authored layout (JSON) + deterministic procedural detail (noise).
// Terrain is computed lazily per tile and memoised in a compact byte array; render objects
// are produced per chunk on demand so only nearby chunks ever exist as game objects.

export interface LegendSite {
  id: string;
  name: string;
  x: number;
  y: number;
  level: number;
  respawn: number;
  arena: number;
  /** Story flags required before the legendary shows up */
  requires: string[];
  /** Direction of the opening in the stone ring (radians) */
  gap: number;
  /** Shown when the player visits while it is still sealed */
  hint: string;
  /** Extra conditions (time of day, weather, lead friendship) */
  condition?: { time?: 'day' | 'night' | 'dawn'; weather?: string[]; friendship?: number };
  /** Non-combat encounter (the legendary joins after the meeting) */
  gift?: boolean;
  /** false = no stone ring (shares another site) */
  ring?: boolean;
}

export interface RegionDef {
  id: string;
  name: string;
  width: number;
  height: number;
  chunk: number;
  spawn: { x: number; y: number };
  areas: AreaDef[];
  paths: { w: number; pts: number[][] }[];
  plaza: [number, number, number, number];
  lake: { cx: number; cy: number; rx: number; ry: number };
  /** Land inside the lake / sea (islands, e.g. Phú Quốc) — the ring of an island is beach */
  islands?: { cx: number; cy: number; rx: number; ry: number }[];
  buildings: { id: string; name: string; x: number; y: number; w: number; h: number; roof: 'red' | 'grey'; wall: 'wood' | 'stone'; door: number }[];
  fences: number[][];
  props: { kind: string; x: number; y: number }[];
  signs: { x: number; y: number; text: string[] }[];
  /** wander: radius (tiles) the NPC walks around its spot by day · role 'nurse': talking heals the party */
  npcs: { id: string; name: string; sprite: string; x: number; y: number; lines: string[]; wander?: number; role?: 'nurse' }[];
  trainers: { id: string; name: string; sprite: string; x: number; y: number; team: [string, number][]; challenge: string[]; win: string[]; lose: string[]; rewards: { items?: Record<string, number>; exp?: number } }[];
  /** quest: the quest that must be active (default q-rescue) · reporter: who to tell afterwards */
  rescue: { id: string; x: number; y: number; species: string; level: number; guards: [string, number][]; quest?: string; reporter?: string };
  chests: { id: string; x: number; y: number; items: Record<string, number>; requiresFlag?: string }[];
  waypoints: { id: string; name: string; x: number; y: number }[];
  /** chest: the sealed chest the puzzle opens (default chest-ruins) */
  puzzles: { id: string; plates: number[][]; labels: string[]; order: number[]; chest?: string }[];
  dungeons: { id: string; name: string; x: number; y: number }[];
  pillars: number[][];
  spawns: Record<string, SpawnEntry[]>;
  /** Regional boss arena. `rewards` (data-driven bosses): first-clear loot, money, story flag (e.g. a badge) */
  worldBoss?: { id: string; name: string; x: number; y: number; level: number; respawn: number; arena: number; requires?: string[]; hint?: string;
    rewards?: { first: Record<string, number>; repeat: Record<string, number>; money: number; flag: string; message: string } };
  /** Legendary shrines: world bosses gated by story flags */
  legendaries?: LegendSite[];
  /** Visual / terrain theme (default 'valley'): frozen lake = water, volcanic lake = lava */
  theme?: 'valley' | 'frozen' | 'volcanic' | 'sanctuary' | 'swamp' | 'coast' | 'mekong';
  /** Gates to other regions (interact with E); `requires` = story flags */
  portals?: PortalDef[];
  /** Rivers (water, lava in volcanic maps); where a path crosses one it becomes a bridge */
  rivers?: { w: number; pts: number[][]; mouth?: boolean }[];
  /** Resource nodes (fishing spots on a shore, berry bushes): `table` = id in data/world/gathering.json */
  nodes?: { id: string; table: string; x: number; y: number }[];
  /** Field obstacles for exploration abilities (cut / smash / strength), see core/field.ts */
  field?: FieldDef[];
  /** Boat docks (Vietnam Odyssey rivers): land tile + the water tile the boat starts from */
  docks?: Dock[];
}

export interface PortalDef {
  id: string;
  name: string;
  x: number;
  y: number;
  to: string;
  toX: number;
  toY: number;
  requires?: string[];
  hint?: string;
}

const PROP_TILE: Record<string, number> = {
  well: TOWN.well, beehive: TOWN.beehive, haystack: TOWN.haystack, log: TOWN.log, target: TOWN.target, bucket: TOWN.bucket,
};

const UNKNOWN = 255;

export class ValleyMap implements MapProvider {
  readonly kind = 'overworld' as const;
  readonly id: string;
  readonly name: string;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly chunk: number;
  private terrain: Uint8Array;
  private solid = new Set<number>();
  private authored = new Map<number, MapObject[]>();
  private clear: { x: number; y: number; r: number }[] = [];
  private segs: { ax: number; ay: number; bx: number; by: number; w: number }[] = [];
  private riverSegs: { ax: number; ay: number; bx: number; by: number; w: number }[] = [];
  /** segments of rivers that run into the lake / sea (`mouth`): their bed cuts through the beach */
  private mouthSegs: { ax: number; ay: number; bx: number; by: number; w: number }[] = [];

  constructor(readonly def: RegionDef) {
    this.id = def.id;
    this.name = def.name;
    this.widthTiles = def.width;
    this.heightTiles = def.height;
    this.chunk = def.chunk;
    this.terrain = new Uint8Array(def.width * def.height).fill(UNKNOWN);
    for (const p of def.paths) for (let i = 0; i < p.pts.length - 1; i++) {
      this.segs.push({ ax: p.pts[i][0], ay: p.pts[i][1], bx: p.pts[i + 1][0], by: p.pts[i + 1][1], w: p.w });
    }
    for (const r of def.rivers ?? []) for (let i = 0; i < r.pts.length - 1; i++) {
      this.riverSegs.push({ ax: r.pts[i][0], ay: r.pts[i][1], bx: r.pts[i + 1][0], by: r.pts[i + 1][1], w: r.w });
      if (r.mouth) this.mouthSegs.push({ ax: r.pts[i][0], ay: r.pts[i][1], bx: r.pts[i + 1][0], by: r.pts[i + 1][1], w: r.w });
    }
    this.buildAuthored();
  }

  private key(tx: number, ty: number): number {
    return ty * this.widthTiles + tx;
  }

  private chunkOf(tx: number, ty: number): number {
    return Math.floor(ty / this.chunk) * Math.ceil(this.widthTiles / this.chunk) + Math.floor(tx / this.chunk);
  }

  private add(o: MapObject): void {
    const k = this.chunkOf(Math.floor(o.x), Math.floor(o.y));
    let arr = this.authored.get(k);
    if (!arr) this.authored.set(k, (arr = []));
    arr.push(o);
  }

  private buildAuthored(): void {
    const d = this.def;
    for (const b of d.buildings) {
      const roof = b.roof === 'red' ? TOWN.roofRed : TOWN.roofGrey;
      const wall = b.wall === 'wood' ? TOWN.wallWood : TOWN.wallStone;
      const tiles: number[][] = [];
      tiles.push(Array.from({ length: b.w }, (_, i) => (i === 0 ? roof.tl : i === b.w - 1 ? roof.tr : roof.t)));
      tiles.push(Array.from({ length: b.w }, (_, i) => (i === 0 ? roof.bl : i === b.w - 1 ? roof.br : roof.b)));
      for (let r = 2; r < b.h; r++) {
        const bottom = r === b.h - 1;
        tiles.push(Array.from({ length: b.w }, (_, i) => {
          if (i === 0) return wall.l;
          if (i === b.w - 1) return wall.r;
          if (bottom && i === b.door) return wall.door;
          return (i % 2 === 1) ? wall.window : wall.c;
        }));
      }
      this.add({ kind: 'building', id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, tiles, data: { name: b.name, doorX: b.x + b.door, doorY: b.y + b.h - 1 } });
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.solid.add(this.key(x, y));
      this.clear.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) / 2 + 2 });
    }
    for (const [x1, y1, x2, y2] of d.fences) {
      const horiz = y1 === y2;
      const n = horiz ? x2 - x1 : y2 - y1;
      for (let i = 0; i <= n; i++) {
        const x = horiz ? x1 + i : x1, y = horiz ? y1 : y1 + i;
        this.add({ kind: 'fence', id: `fence-${x}-${y}`, x, y, tile: horiz ? TOWN.fenceH : TOWN.fenceV });
        this.solid.add(this.key(x, y));
      }
    }
    for (const p of d.props) this.add({ kind: 'prop', id: `prop-${p.kind}-${p.x}-${p.y}`, x: p.x, y: p.y, tile: PROP_TILE[p.kind] ?? TOWN.log, collideR: 18, data: { prop: p.kind } });
    for (const s of d.signs) this.add({ kind: 'sign', id: `sign-${s.x}-${s.y}`, x: s.x, y: s.y, tile: TOWN.sign, collideR: 12, data: { text: s.text } });
    for (const n of d.npcs) { this.add({ kind: 'npc', id: n.id, x: n.x, y: n.y, data: { ...n } }); this.clear.push({ x: n.x, y: n.y, r: 2 }); }
    for (const t of d.trainers) { this.add({ kind: 'trainer', id: t.id, x: t.x, y: t.y, data: { ...t } }); this.clear.push({ x: t.x, y: t.y, r: 4 }); }
    for (const c of d.chests) { this.add({ kind: 'chest', id: c.id, x: c.x, y: c.y, data: { ...c } }); this.clear.push({ x: c.x, y: c.y, r: 1.5 }); }
    for (const w of d.waypoints) { this.add({ kind: 'waypoint', id: w.id, x: w.x, y: w.y, collideR: 14, data: { ...w } }); this.clear.push({ x: w.x, y: w.y, r: 3 }); }
    for (const p of d.puzzles) p.plates.forEach(([x, y], i) => this.add({ kind: 'plate', id: `${p.id}:${i}`, x, y, data: { puzzle: p.id, index: i, label: p.labels[i] } }));
    for (const g of d.dungeons) { this.add({ kind: 'cave', id: g.id, x: g.x, y: g.y, data: { ...g } }); this.clear.push({ x: g.x, y: g.y, r: 4 }); }
    for (const n of d.nodes ?? []) { this.add({ kind: 'node', id: n.id, x: n.x, y: n.y, data: { ...n } }); this.clear.push({ x: n.x, y: n.y, r: 1 }); }
    for (const f of d.field ?? []) this.addField(f);
    for (const k of d.docks ?? []) { this.clear.push({ x: k.x + 0.5, y: k.y + 0.5, r: 1.5 }); }
    for (const [x, y] of d.pillars) this.add({ kind: 'pillar', id: `pillar-${x}-${y}`, x, y, tile: DUNGEON.pillar, collideR: 16 });
    const r = d.rescue;
    if (r.x >= 0) this.addRescue(r);
    this.clear.push({ x: d.spawn.x, y: d.spawn.y, r: 3 });
    for (const p of d.portals ?? []) {
      this.add({ kind: 'portal', id: p.id, x: p.x, y: p.y, tile: EX.portal, data: { ...p } });
      this.clear.push({ x: p.x, y: p.y, r: 3 });
    }
    // World boss grove: open clearing ringed by standing stones (one gap facing the forest path)
    const wb = d.worldBoss;
    if (wb) {
      this.clear.push({ x: wb.x, y: wb.y, r: 9 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        if (Math.abs(a - Math.PI * 0.25) < 0.4) continue;
        const px = Math.round(wb.x + Math.cos(a) * 8), py = Math.round(wb.y + Math.sin(a) * 8);
        // an arena on a small island (Cồn Sơn) keeps only the stones that stand on land
        if (this.terrainAt(px, py) === T.Water) continue;
        this.add({ kind: 'pillar', id: `grove-${i}`, x: px, y: py, tile: DUNGEON.pillar, collideR: 16 });
      }
    }
    // Legendary shrines: smaller stone rings, gap towards `gap` (radians)
    for (const l of d.legendaries ?? []) {
      if (l.ring === false) continue;
      this.clear.push({ x: l.x, y: l.y, r: 8 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const da = Math.abs(((a - l.gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da < 0.45) continue;
        this.add({ kind: 'pillar', id: `shrine-${l.id}-${i}`, x: Math.round(l.x + Math.cos(a) * 7), y: Math.round(l.y + Math.sin(a) * 7), tile: DUNGEON.pillar, collideR: 16 });
      }
    }
  }

  /**
   * A field obstacle: open ground around it (and its hole), and — for a hidden nook — a ring of trees / boulders with the
   * obstacle in its only gap. The obstacle itself is drawn and collided by the scene (it can be cleared or moved).
   */
  private addField(f: FieldDef): void {
    const ox = f.x + 0.5, oy = f.y + 0.5;
    this.clear.push({ x: ox, y: oy, r: 1.6 });
    if (f.to) this.clear.push({ x: f.to[0] + 0.5, y: f.to[1] + 0.5, r: 1 });
    const n = f.nook;
    if (!n) return;
    this.clear.push({ x: n.cx, y: n.cy, r: n.r + 1.4 });
    // a clear approach from outside the gap
    const ux = (ox - n.cx) / n.r, uy = (oy - n.cy) / n.r;
    for (let k = 1; k <= 3; k++) this.clear.push({ x: ox + ux * k, y: oy + uy * k, r: 1.2 });
    nookRing(f).forEach((p, i) => {
      const id = `nook-${f.id}-${i}`;
      if (n.wall === 'boulder') this.add({ kind: 'boulder', id, x: p.x, y: p.y, collideR: 20 });
      else this.add({ ...this.tree(Math.floor(p.x), Math.floor(p.y), 'forest'), id, x: p.x, y: p.y, collideR: 18 });
    });
  }

  /** The valley's trapped-Pokémon rescue site (other regions have none). */
  private addRescue(r: RegionDef['rescue']): void {
    this.add({ kind: 'rescue', id: r.id, x: r.x, y: r.y, data: { ...r } });
    this.clear.push({ x: r.x, y: r.y, r: 7 });
    // Rescue site is fenced in by boulders, with one gap facing the forest path
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      if (Math.abs(a - Math.PI * 0.75) < 0.5) continue;
      this.add({ kind: 'boulder', id: `rb-${i}`, x: r.x + Math.cos(a) * 3.2, y: r.y + Math.sin(a) * 3.2, collideR: 20 });
    }
  }

  /** PC terminals (tile coords): the door of every Pokémon Center / lab. Shared by Adventure and the online server. */
  pcTerminalTiles(): { x: number; y: number }[] {
    return this.def.buildings.filter((b) => /center|lab/i.test(b.id)).map((b) => ({ x: b.x + b.door + 0.5, y: b.y + b.h - 0.5 }));
  }

  portals(): PortalDef[] {
    return this.def.portals ?? [];
  }

  // ───────────────────────────── terrain ─────────────────────────────

  areaAt(tx: number, ty: number): AreaDef | null {
    for (const a of this.def.areas) {
      const [x0, y0, x1, y1] = a.rect;
      if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return a;
    }
    return null;
  }

  private onPath(tx: number, ty: number): boolean {
    return this.onSegs(this.segs, tx, ty);
  }

  private onSegs(segs: { ax: number; ay: number; bx: number; by: number; w: number }[], tx: number, ty: number): boolean {
    const px = tx + 0.5, py = ty + 0.5;
    for (const s of segs) {
      const dx = s.bx - s.ax, dy = s.by - s.ay;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / l2));
      const qx = s.ax + dx * t, qy = s.ay + dy * t;
      if (Math.hypot(px - qx, py - qy) <= s.w / 2) return true;
    }
    return false;
  }

  private lakeValue(tx: number, ty: number): number {
    const L = this.def.lake;
    const v = ((tx - L.cx) / L.rx) ** 2 + ((ty - L.cy) / L.ry) ** 2 + (fbm(tx, ty, 6, 3) - 0.5) * 0.5;
    if (v >= 1.32 || !this.def.islands) return v;
    // an island turns the sea back into land: its core is land (> 1.32), its rim beach (1..1.32)
    let best = v;
    for (const I of this.def.islands) {
      const d = ((tx - I.cx) / I.rx) ** 2 + ((ty - I.cy) / I.ry) ** 2 + (fbm(tx, ty, 5, 9) - 0.5) * 0.3;
      if (d < 1) best = Math.max(best, d < 0.75 ? 2 : 1.1);
    }
    return best;
  }

  terrainAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.widthTiles || ty >= this.heightTiles) return T.Deep;
    const k = this.key(tx, ty);
    const cached = this.terrain[k];
    if (cached !== UNKNOWN) return cached;
    const v = this.computeTerrain(tx, ty);
    this.terrain[k] = v;
    return v;
  }

  private computeTerrain(tx: number, ty: number): number {
    const W = this.widthTiles, H = this.heightTiles;
    if (tx < 2 || ty < 2 || tx >= W - 2 || ty >= H - 2) return T.Deep;
    const theme = this.def.theme ?? 'valley';
    const lake = this.lakeValue(tx, ty);
    if (lake < 1) return theme === 'volcanic' ? T.Lava : T.Water;
    if (lake < 1.32 && this.mouthSegs.length && this.onSegs(this.mouthSegs, tx, ty)) return theme === 'volcanic' ? T.Lava : T.Water;
    if (lake < 1.32) return theme === 'volcanic' ? T.AshRock : theme === 'frozen' ? T.Ice : theme === 'swamp' ? T.Mud : T.Sand;
    const area = this.areaAt(tx, ty);
    const [px0, py0, px1, py1] = this.def.plaza;
    // rivers (with a little noise on the banks); a path across one becomes a bridge
    if (this.riverSegs.length && this.onSegs(this.riverSegs, tx, ty)) {
      if (this.onPath(tx, ty)) return T.Bridge;
      return theme === 'volcanic' ? T.Lava : T.Water;
    }
    if (this.onPath(tx, ty)) return tx >= px0 && tx <= px1 && ty >= py0 && ty <= py1 ? T.Plaza : T.Path;
    if (tx >= px0 && tx <= px1 && ty >= py0 && ty <= py1 && hash2(tx, ty, 9) < 0.08) return T.Flowers;
    const n = fbm(tx, ty, 7, 11);
    switch (area?.habitat) {
      case 'snow':
        if (n > 0.6) return T.SnowDeep;
        return fbm(tx, ty, 5, 31) > 0.64 ? T.Ice : T.Snow;
      case 'volcano':
        if (n > 0.66) return T.AshRock;
        // small lava pools in the crater area
        if (area.id === 'crater' && fbm(tx, ty, 4, 37) > 0.7) return T.Lava;
        return T.Ash;
      case 'sanctuary':
        return n > 0.58 ? T.Flowers : T.Sanctum;
      case 'swamp':
        // toxic puddles in the wettest spots, reeds, mud flats
        if (n > 0.7) return T.Bog;
        if (n > 0.58) return T.TallGrass;
        return fbm(tx, ty, 5, 41) > 0.56 ? T.Mud : T.Grass;
      case 'mangrove':
        // tidal channels, mud flats and reeds between the mangroves (Mekong theme)
        if (n > 0.68) return T.Water;
        if (n > 0.56) return T.TallGrass;
        return fbm(tx, ty, 5, 47) > 0.5 ? T.Mud : T.Grass;
      case 'coast':
        if (n > 0.68) return T.Rocky;
        if (fbm(tx, ty, 5, 43) > 0.58) return T.Sand;
        return n > 0.56 ? T.TallGrass : T.Grass;
      case 'ruins':
        return n > 0.32 ? T.Ruin : T.Tuft;
      case 'farm':
        return tx > 43 && tx < 57 && ty > 99 && ty < 111 && ty % 3 !== 0 ? T.Farm : T.Grass;
      case 'rocky':
        if (n > 0.62) return T.Grass;
        return T.Rocky;
      case 'forest':
        if (n > 0.6) return T.TallGrass;
        // shaded patches under the canopy (noise, not per-tile, to avoid a checkerboard)
        return fbm(tx, ty, 5, 23) > 0.52 ? T.Deep : T.Tuft;
      case 'meadow':
        if (n > 0.55) return T.TallGrass;
        break;
      case 'lake':
        if (n > 0.7) return T.TallGrass;
        break;
    }
    const h = hash2(tx, ty, 5);
    return h < 0.02 ? T.Flowers : h < 0.14 ? T.Tuft : T.Grass;
  }

  solidAt(tx: number, ty: number): boolean {
    const t = this.terrainAt(tx, ty);
    if (t === T.Water || t === T.Lava) return true;
    if (tx < 2 || ty < 2 || tx >= this.widthTiles - 2 || ty >= this.heightTiles - 2) return true;
    return this.solid.has(this.key(tx, ty));
  }

  shotSolidAt(tx: number, ty: number): boolean {
    // Projectiles fly over water but are stopped by buildings, fences and the border
    if (tx < 2 || ty < 2 || tx >= this.widthTiles - 2 || ty >= this.heightTiles - 2) return true;
    return this.solid.has(this.key(tx, ty));
  }

  habitatAt(tx: number, ty: number): string | null {
    const a = this.areaAt(tx, ty);
    if (!a || a.habitat === 'village') return null;
    const t = this.terrainAt(tx, ty);
    if (t === T.Water || t === T.Lava || t === T.Bridge || t === T.Path || t === T.Plaza) return null;
    if (t === T.TallGrass && (a.habitat === 'meadow' || a.habitat === 'forest')) return a.habitat + '-grass';
    if (t === T.SnowDeep) return 'snow-grass';
    return a.habitat;
  }

  /**
   * Authored fallback table. Ordinary overworld spawns go through the encounter system
   * (src/core/encounters.ts: region levels, biome pools, rarity tiers, shiny) — see SpawnManager.
   */
  spawnTable(h: string): SpawnEntry[] {
    return this.def.spawns[h] ?? [];
  }

  animatedAt(tx: number, ty: number): boolean {
    const t = this.terrainAt(tx, ty);
    return t === T.Water || t === T.TallGrass || t === T.Lava || t === T.SnowDeep || t === T.Bog;
  }

  tileIndexAt(tx: number, ty: number, frame: number): number {
    const t = this.terrainAt(tx, ty);
    // themed regions: the valley's green ground (border, flowers, tufts) takes the region's ground instead
    const theme = this.def.theme ?? 'valley';
    if (theme === 'swamp' && (t === T.Deep || t === T.Grass || t === T.Tuft || t === T.Flowers)) return hash2(tx, ty, 4) < 0.12 ? EX.mud : EX.swampGrass;
    // swamp: paths are wooden boardwalks, the lake is murky water (no grass shore rim)
    if (theme === 'swamp' && (t === T.Path || t === T.Plaza)) return EX.bridge;
    if (theme === 'swamp' && t === T.Water) return EX.bogWater + frame;
    if (theme === 'swamp' && t === T.TallGrass) return EX.reeds + frame;
    // Mekong: reeds in the mangroves, sea along the coast without a grass rim on the sand
    if (theme === 'mekong' && t === T.TallGrass && this.areaAt(tx, ty)?.habitat === 'mangrove') return EX.reeds + frame;
    // coast: open sea next to sand — plain water, the Kenney dirt path keeps working on the green
    if (theme === 'coast' && t === T.Water) return EX.water + frame;
    // green-ground themes (valley, coast, Mekong) keep the Kenney grass; the others swap it for their own ground
    const green = theme === 'valley' || theme === 'coast' || theme === 'mekong';
    if (!green && theme !== 'swamp' && (t === T.Deep || t === T.Grass || t === T.Tuft || (t === T.Flowers && theme !== 'sanctuary'))) {
      if (theme === 'frozen') return hash2(tx, ty, 4) < 0.3 ? EX.snow2 : EX.snow;
      if (theme === 'volcanic') return hash2(tx, ty, 4) < 0.3 ? EX.ash2 : EX.ash;
      return hash2(tx, ty, 6) < 0.25 ? EX.sanctum2 : EX.sanctum;
    }
    // themed regions: paths / camp plaza are flagstones (the Kenney dirt & plaza tiles have green rims)
    if (!green && (t === T.Path || t === T.Plaza)) return hash2(tx, ty, 8) < 0.3 ? EX.ruin2 : EX.ruin;
    switch (t) {
      case T.Water: {
        const land = (dx: number, dy: number) => this.terrainAt(tx + dx, ty + dy) !== T.Water;
        const mask = (land(0, -1) ? 1 : 0) | (land(1, 0) ? 2 : 0) | (land(0, 1) ? 4 : 0) | (land(-1, 0) ? 8 : 0);
        return mask ? EX.shore + mask * 2 + frame : EX.water + frame;
      }
      case T.TallGrass: return EX.tallGrass + frame;
      case T.Snow: return hash2(tx, ty, 4) < 0.3 ? EX.snow2 : EX.snow;
      case T.SnowDeep: return EX.snowDeep + frame;
      case T.Ice: return EX.ice;
      case T.Ash: return hash2(tx, ty, 4) < 0.3 ? EX.ash2 : EX.ash;
      case T.AshRock: return EX.ashRock;
      case T.Lava: return EX.lava + frame;
      case T.Bridge: return EX.bridge;
      case T.Bog: return EX.bog + frame;
      case T.Mud: return hash2(tx, ty, 4) < 0.35 ? EX.mud2 : EX.mud;
      case T.Sanctum: return hash2(tx, ty, 6) < 0.25 ? EX.sanctum2 : EX.sanctum;
      case T.Sand: return hash2(tx, ty, 4) < 0.3 ? EX.sand2 : EX.sand;
      case T.Rocky: return hash2(tx, ty, 4) < 0.35 ? EX.rocky2 : EX.rocky;
      case T.Farm: return EX.farmland;
      case T.Deep: return EX.deepGrass;
      case T.Ruin: return hash2(tx, ty, 8) < 0.35 ? EX.ruin2 : EX.ruin;
      case T.Plaza: return TOWN.plaza;
      case T.Flowers: return TOWN.grass[2];
      case T.Tuft: return TOWN.grass[1];
      case T.Path: {
        const p = (dx: number, dy: number) => { const q = this.terrainAt(tx + dx, ty + dy); return q === T.Path || q === T.Plaza; };
        const n = p(0, -1), s = p(0, 1), w = p(-1, 0), e = p(1, 0);
        const D = TOWN.dirt;
        if (!n && !w) return D.tl;
        if (!n && !e) return D.tr;
        if (!s && !w) return D.bl;
        if (!s && !e) return D.br;
        if (!n) return D.t;
        if (!s) return D.b;
        if (!w) return D.l;
        if (!e) return D.r;
        // inner corners: all four sides are path but a diagonal is grass
        const I = EX.dirtInner;
        if (!p(1, -1)) return I.ne;
        if (!p(-1, -1)) return I.nw;
        if (!p(1, 1)) return I.se;
        if (!p(-1, 1)) return I.sw;
        return D.c;
      }
      default: return TOWN.grass[0];
    }
  }

  colorAt(tx: number, ty: number): number {
    if (this.solid.has(this.key(tx, ty))) return 0x8a5a40;
    switch (this.terrainAt(tx, ty)) {
      case T.Water: return 0x3a78d8;
      case T.Sand: return 0xe0c890;
      case T.Path: case T.Plaza: return 0xd0a070;
      case T.TallGrass: return 0x2f7a34;
      case T.Rocky: return 0x8a8478;
      case T.Ruin: return 0xc8a878;
      case T.Farm: return 0x7a5030;
      case T.Deep: return 0x1f4a24;
      case T.Snow: case T.SnowDeep: return 0xe8f0f8;
      case T.Ice: return 0xa8d8f0;
      case T.Ash: case T.AshRock: return 0x4e4644;
      case T.Lava: return 0xe04818;
      case T.Bridge: return 0xa87848;
      case T.Sanctum: return 0xe0d8f0;
      case T.Bog: return 0x5a4a6a;
      case T.Mud: return 0x5a4a32;
      default: return this.def.theme === 'swamp' ? 0x3e6a3a : 0x4c9a48;
    }
  }

  // ───────────────────────────── objects ─────────────────────────────

  private isClear(tx: number, ty: number): boolean {
    for (const c of this.clear) if (Math.hypot(tx + 0.5 - c.x, ty + 0.5 - c.y) < c.r) return false;
    return true;
  }

  private nearPath(tx: number, ty: number): boolean {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = this.terrainAt(tx + dx, ty + dy);
      if (t === T.Path || t === T.Plaza || t === T.Water || t === T.Bridge || t === T.Lava) return true;
    }
    return false;
  }

  objectsInChunk(cx: number, cy: number): MapObject[] {
    const out = [...(this.authored.get(cy * Math.ceil(this.widthTiles / this.chunk) + cx) ?? [])];
    const x0 = cx * this.chunk, y0 = cy * this.chunk;
    for (let ty = y0; ty < Math.min(y0 + this.chunk, this.heightTiles); ty++) {
      for (let tx = x0; tx < Math.min(x0 + this.chunk, this.widthTiles); tx++) {
        const t = this.terrainAt(tx, ty);
        const border = tx < 4 || ty < 4 || tx >= this.widthTiles - 4 || ty >= this.heightTiles - 4;
        const h = hash2(tx, ty, 21);
        if (border) {
          if (h < 0.85) out.push(this.tree(tx, ty, 'forest'));
          continue;
        }
        if (t === T.Water || t === T.Lava || t === T.Ice || t === T.Bridge || t === T.Path || t === T.Plaza || t === T.Farm || this.solid.has(this.key(tx, ty))) continue;
        if (!this.isClear(tx, ty) || this.nearPath(tx, ty)) continue;
        const area = this.areaAt(tx, ty);
        const hab = area?.habitat ?? 'meadow';
        if ((hab === 'rocky' && t === T.Rocky || hab === 'volcano' && t === T.AshRock) && h < 0.07) {
          out.push({ kind: 'boulder', id: `b-${tx}-${ty}`, x: tx + 0.5, y: ty + 0.5, collideR: 20 });
          continue;
        }
        if (t === T.Bog) continue;
        if (hab === 'coast' && t === T.Rocky && h < 0.08) { out.push({ kind: 'boulder', id: `b-${tx}-${ty}`, x: tx + 0.5, y: ty + 0.5, collideR: 20 }); continue; }
        const density = hab === 'mangrove' ? 0.08 : hab === 'swamp' ? 0.05 : hab === 'coast' ? (t === T.Sand ? 0.02 : 0.03) : hab === 'forest' ? (t === T.TallGrass ? 0.06 : 0.3) : hab === 'village' || hab === 'farm' ? 0 : hab === 'rocky' ? 0.03
          : hab === 'snow' ? (t === T.SnowDeep ? 0.02 : 0.06) : hab === 'volcano' ? 0.02 : hab === 'sanctuary' ? 0.015 : 0.025;
        if (h < density) out.push(this.tree(tx, ty, hab));
      }
    }
    return out;
  }

  private tree(tx: number, ty: number, hab: string): MapObject {
    const theme = this.def.theme ?? 'valley';
    if (theme === 'frozen') return { kind: 'tree', id: `t-${tx}-${ty}`, x: tx + 0.5, y: ty + 0.5, tile: EX.snowPine, collideR: 15 };
    if (theme === 'volcanic') return { kind: 'tree', id: `t-${tx}-${ty}`, x: tx + 0.5, y: ty + 0.5, tile: EX.deadTree, collideR: 12 };
    if (theme === 'swamp') return { kind: 'tree', id: `t-${tx}-${ty}`, x: tx + 0.5, y: ty + 0.5, tile: hash2(tx, ty, 36) < 0.35 ? EX.deadTree : TOWN.tall, collideR: 13 };
    if (theme === 'mekong') {
      const tile = hab === 'mangrove' ? EX.mangrove : hab === 'forest' ? (hash2(tx, ty, 38) < 0.8 ? EX.melaleuca : TOWN.tall) : hab === 'coast' ? EX.palm
        : hab === 'rocky' ? (hash2(tx, ty, 39) < 0.5 ? TOWN.round : TOWN.pine) : (hash2(tx, ty, 39) < 0.3 ? EX.palm : TOWN.round);
      return { kind: 'tree', id: `t-${tx}-${ty}`, x: tx + 0.5, y: ty + 0.5, tile, collideR: tile === EX.melaleuca ? 10 : 14 };
    }
    if (theme === 'coast') return { kind: 'tree', id: `t-${tx}-${ty}`, x: tx + 0.5, y: ty + 0.5, tile: hash2(tx, ty, 37) < 0.7 ? EX.palm : TOWN.round, collideR: 12 };
    if (theme === 'sanctuary') return { kind: 'tree', id: `t-${tx}-${ty}`, x: tx + 0.5, y: ty + 0.5, tile: hash2(tx, ty, 35) < 0.5 ? EX.crystal : TOWN.round, collideR: 14 };
    void hab;
    const v = hash2(tx, ty, 33);
    const autumn = hab === 'forest' && hash2(tx, ty, 34) < 0.14;
    const tile = v < 0.25 ? (autumn ? TOWN.pineAutumn : TOWN.pine) : v < 0.7 ? (autumn ? TOWN.roundAutumn : TOWN.round) : (autumn ? TOWN.tallAutumn : TOWN.tall);
    return { kind: 'tree', id: `t-${tx}-${ty}`, x: tx + 0.5, y: ty + 0.5, tile, collideR: 15 };
  }
}
