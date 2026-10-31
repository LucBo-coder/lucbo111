// Old East Asian town architecture for the Vietnam Odyssey province cities (V28): curved tiled roofs with upturned
// eave tips, red lacquered columns, lattice windows, hanging lanterns, a three-gate entrance (cổng tam quan) and
// street furniture (lantern posts, stone lanterns, bonsai pots, incense burners).
// Everything is drawn by code (render/orientalArt.ts) — no third-party art. This module only decides WHAT to draw
// for a map object, so it runs without Phaser (tests, server).

/** Building shapes: a tiled-roof house, Pokémon Center / mart (house + plaque), two-tier temple / communal hall, gate */
export type OrientalKind = 'house' | 'center' | 'mart' | 'temple' | 'gate';
/** Roof glaze: red-brown clay, blue-grey clay, imperial yellow, celadon green */
export type RoofPal = 'red' | 'grey' | 'gold' | 'green';
/** Street furniture drawn as images (one tile footprint, taller than it) */
export const ORIENTAL_PROPS = ['lantern', 'stone-lantern', 'bonsai', 'incense'] as const;
export type OrientalProp = (typeof ORIENTAL_PROPS)[number];

/** Native pixels the roof rises above the building's footprint (the image is footprint + rise tall). */
export const ORIENTAL_RISE: Record<OrientalKind, number> = { house: 16, center: 18, mart: 18, temple: 26, gate: 38 };
/** Native size of a prop image (bottom centre stands on the prop's tile). */
export const PROP_SIZE: Record<OrientalProp, [number, number]> = { lantern: [16, 30], 'stone-lantern': [16, 24], bonsai: [16, 20], incense: [16, 16] };

/** The kind of an oriental building from its id / name (Pokémon Center, mart, temple / pagoda / hall / museum, gate). */
export function orientalKindOf(id: string, name = ''): OrientalKind {
  const s = (id + ' ' + name).toLowerCase();
  if (/gate|cổng/.test(s)) return 'gate';
  if (/center/.test(id)) return 'center';
  if (/mart/.test(id)) return 'mart';
  if (/museum|temple|pagoda|chua|den-|dinh|mieu|bảo tàng|chùa|đền|đình|miếu|văn miếu|thánh thất|nhà thờ|lăng|cung|điện/.test(s)) return 'temple';
  return 'house';
}

/** Roof glaze from the map's roof colour (Tiny Town names kept so the tile fallback still matches). */
export function roofPalOf(roof: string): RoofPal {
  return roof === 'gold' ? 'gold' : roof === 'teal' ? 'green' : roof === 'grey' ? 'grey' : 'red';
}

export interface OrientalArt {
  /** Texture key (one texture per distinct shape) */
  key: string;
  kind: OrientalKind | OrientalProp;
  /** Native image size (pixels at 1×) */
  w: number;
  h: number;
  pal: RoofPal;
  /** Door column (buildings) */
  door: number;
  /** Footprint in tiles (buildings) */
  tw: number;
  th: number;
}

/** What to draw for a map object, or null (not oriental: Tiny Town tiles / Adventure Awaits art instead). */
export function orientalArtOf(o: { kind: string; w?: number; h?: number; data?: Record<string, unknown> }): OrientalArt | null {
  const d = o.data ?? {};
  if (o.kind === 'building' && d.oriental) {
    const kind = d.oriental as OrientalKind, pal = (d.roofPal as RoofPal) ?? 'red';
    const tw = o.w ?? 3, th = o.h ?? 3, door = (d.door as number) ?? Math.floor(tw / 2);
    return { key: `or-${kind}-${tw}x${th}-${pal}-d${door}`, kind, w: tw * 16, h: th * 16 + ORIENTAL_RISE[kind], pal, door, tw, th };
  }
  if (o.kind === 'prop' && (ORIENTAL_PROPS as readonly string[]).includes(d.prop as string)) {
    const kind = d.prop as OrientalProp, [w, h] = PROP_SIZE[kind];
    return { key: `or-prop-${kind}`, kind, w, h, pal: 'red', door: 0, tw: 1, th: 1 };
  }
  return null;
}

/** Tiles of a gate's footprint that block walking: only its two pillars (the middle is the way through). */
export function gateSolid(x: number, y: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  for (let yy = y; yy < y + h; yy++) out.push([x, yy], [x + w - 1, yy]);
  return out;
}
