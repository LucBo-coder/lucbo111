// Secret shrine entrances (pure). No shrine stands on the overworld any more: a tier-1 legendary lives in a dimension
// of its own, the other shrines in their map's hidden sanctum (Bí Cảnh). On the map there is only a concealed way in —
// behind a field obstacle (a thicket to cut, a cracked rock to smash) or invisible until the legendary's three clues
// are read. Once found it stays open (flag `secret:<region>:<id>`). Data: region `secrets` (scripts/gen-legend-planes.ts).

export interface SecretDef {
  id: string;
  name: string;
  /** tile of the entrance (a whirlpool stands on water; the player uses it from `stand`) */
  x: number;
  y: number;
  stand?: [number, number];
  /** destination plane + arrival tile */
  to: string;
  toX: number;
  toY: number;
  look: 'cave' | 'rift' | 'whirlpool';
  /** what reveals it: a field obstacle of this map (by id) or the investigation of a legendary */
  reveal: { field?: string; clues?: string };
  /** story flags before it lets anyone through (found but sealed: `hint`) */
  requires?: string[];
  /** it only opens in this weather (Kyogre's whirlpool in the rain) */
  weather?: string[];
  hint?: string;
  color?: number;
}

export const secretFlag = (region: string, id: string) => `secret:${region}:${id}`;

export interface SecretWorld {
  has(flag: string): boolean;
  fieldSolved(id: string): boolean;
  investigated(legend: string): boolean;
}

/** Found already (flag), or its reveal condition is met now. */
export function secretRevealed(region: string, s: SecretDef, w: SecretWorld): boolean {
  if (w.has(secretFlag(region, s.id))) return true;
  if (s.reveal.field) return w.fieldSolved(s.reveal.field);
  if (s.reveal.clues) return w.investigated(s.reveal.clues);
  return true;
}

export type SecretGate = { ok: true } | { ok: false; reason: 'sealed' | 'weather' };

/** Can the trainer go through a found entrance now? */
export function secretGate(s: SecretDef, has: (f: string) => boolean, weather: string): SecretGate {
  if (!(s.requires ?? []).every(has)) return { ok: false, reason: 'sealed' };
  if (s.weather?.length && !s.weather.includes(weather)) return { ok: false, reason: 'weather' };
  return { ok: true };
}
