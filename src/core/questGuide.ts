import { FIELD_ABILITIES, fieldFlag } from './field';
import { clueFlag, LEGEND_CLUES } from './legendClues';
import { LEGENDS } from './legends';
import { REGION_DEFS } from './map/regionDefs';
import type { ObjectiveDef } from './quests';
import { secretFlag, type SecretDef } from './secrets';

// Quest guidance for the hidden shrines (pure; LEGENDARY_SHRINES.md mục 8). A legendary's fight objective points at
// its shrine, which now stands in a plane reached only through a concealed entrance. The tracker / map / journal show
// the step the player is on instead of a marker in a plane they cannot reach yet:
//   entrance not found  → the clues still to read (exact), or the obstacle's area (an approximate ring, no exact tile)
//   entrance found      → the entrance on its map (+ "only in the rain")
//   inside the plane    → the shrine itself

export interface Entrance { region: string; secret: SecretDef }

const BY_ID = new Map<string, Entrance>();
const BY_PLANE = new Map<string, Entrance[]>();
for (const [region, d] of Object.entries(REGION_DEFS)) for (const s of d.secrets ?? []) {
  BY_ID.set(s.id, { region, secret: s });
  BY_PLANE.set(s.to, [...(BY_PLANE.get(s.to) ?? []), { region, secret: s }]);
}

/** The hidden way to a legendary's shrine: its own entrance, or the only one into its plane (the Temple of Origin). */
export function entranceOf(legend: string): Entrance | undefined {
  const site = LEGENDS.get(legend)?.site;
  if (!site?.region || !REGION_DEFS[site.region]?.void) return undefined;
  const own = BY_ID.get('to-' + legend);
  if (own?.secret.to === site.region) return own;
  const all = BY_PLANE.get(site.region) ?? [];
  return all.length === 1 ? all[0] : undefined;
}

export interface GuideCtx {
  /** the map the trainer is on */
  region: string;
  hasFlag(f: string): boolean;
}

/** Ring radius (tiles) of an approximate marker: the obstacle is somewhere inside, not at the centre. */
export const APPROX_R = 7;

/** A small fixed offset per legend, so the ring's centre never gives the obstacle's exact tile away. */
function jitter(id: string): [number, number] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return [((h >>> 0) % 7) - 3, ((h >>> 3) % 7) - 3];
}

/** The objective as the player should see it now (text + marker); objectives that need no guidance come back as is. */
export function guideObjective(obj: ObjectiveDef, ctx: GuideCtx): ObjectiveDef {
  if (obj.type !== 'boss' || !obj.target) return obj;
  const e = entranceOf(obj.target), site = LEGENDS.get(obj.target)?.site;
  if (!e || !site?.region) return obj;
  const base = obj.text.replace(/\s*\([^)]*\)\s*$/, '');
  const plane = REGION_DEFS[site.region].name, map = REGION_DEFS[e.region].name, s = e.secret;
  if (ctx.region === site.region) return { ...obj, text: `${base} (${plane})`, marker: { x: site.x, y: site.y, region: site.region } };
  if (ctx.hasFlag(secretFlag(e.region, s.id))) {
    const rain = s.weather?.length ? ' — chỉ mở khi trời mưa' : '';
    return { ...obj, text: `${base} — vào ${plane} qua ${s.name} (${map})${rain}`, marker: { x: s.stand?.[0] ?? s.x, y: s.stand?.[1] ?? s.y, region: e.region } };
  }
  if (s.reveal.clues) {
    const clues = LEGEND_CLUES.get(s.reveal.clues) ?? [];
    const read = clues.filter((c) => ctx.hasFlag(clueFlag(c.id))).length, next = clues.find((c) => !ctx.hasFlag(clueFlag(c.id)));
    return { ...obj, text: `${base} — tìm lối vào bí mật ở ${map}: điều tra manh mối ${read}/${clues.length}`, marker: next ? { x: next.x, y: next.y, region: next.region } : undefined };
  }
  const f = s.reveal.field ? REGION_DEFS[e.region].field?.find((x) => x.id === s.reveal.field) : undefined;
  if (!f || ctx.hasFlag(fieldFlag(e.region, f.id))) return { ...obj, text: `${base} — tìm lối vào bí mật ở ${map}`, marker: undefined };
  const ab = FIELD_ABILITIES[f.ability], [dx, dy] = jitter(obj.target);
  const what = f.look === 'crack' ? 'Vách đá nứt' : ab.obstacle;
  return { ...obj, text: `${base} — tìm lối vào bí mật ở ${map}: ${what.toLowerCase()} lấp lánh trong vùng đánh dấu (${ab.name})`, marker: { x: f.x + dx, y: f.y + dy, region: e.region, approx: APPROX_R } };
}

/** Name of the authored area around a tile of a map ('' when none). */
function areaName(region: string, x: number, y: number): string {
  const a = REGION_DEFS[region].areas.find((r) => { const [x0, y0, x1, y1] = r.rect; return x >= x0 && x <= x1 && y >= y0 && y <= y1; });
  return a?.name ?? '';
}

const legendName = (id: string) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-');

/**
 * Villagers' rumours (idle chatter): a hidden entrance on this map that one of the player's active legend quests needs
 * and that is still unfound — the area it lies in, never its tile. `pick` rotates between several (any integer).
 */
export function entranceRumor(region: string, targets: string[], hasFlag: (f: string) => boolean, pick: number): string | null {
  const seen = new Set<string>(), out: string[] = [];
  for (const t of targets) {
    const e = entranceOf(t);
    if (!e || e.region !== region || seen.has(e.secret.id) || hasFlag(secretFlag(e.region, e.secret.id))) continue;
    seen.add(e.secret.id);
    const s = e.secret, rain = s.weather?.length ? ' Họ còn bảo lối ấy chỉ mở khi trời mưa bão.' : '';
    if (s.reveal.clues) {
      const next = (LEGEND_CLUES.get(s.reveal.clues) ?? []).find((c) => !hasFlag(clueFlag(c.id)));
      if (!next) continue;
      const where = areaName(next.region, next.x, next.y);
      out.push(`Dạo này người ta thấy dấu vết lạ${where ? ` quanh ${where}` : ''}. Có người bảo ai lần ra hết các dấu vết sẽ tìm được đường tới ${legendName(t)}.${rain}`);
    } else if (s.reveal.field) {
      const f = REGION_DEFS[region].field?.find((x) => x.id === s.reveal.field);
      if (!f || hasFlag(fieldFlag(region, f.id))) continue;
      const where = areaName(region, f.x, f.y), what = (f.look === 'crack' ? 'Vách đá nứt' : FIELD_ABILITIES[f.ability].obstacle).toLowerCase();
      out.push(`Nghe nói${where ? ` ở ${where}` : ' đâu đây'} có một ${what} cứ lấp lánh lạ lắm… Biết đâu phía sau lại giấu lối vào nơi ${legendName(t)} trú ngụ.${rain}`);
    }
  }
  return out.length ? out[((pick % out.length) + out.length) % out.length] : null;
}
