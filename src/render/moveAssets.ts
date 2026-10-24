import type { SkillDef } from '../core/types';
import { ProjectileRegistry, SkillIconRegistry, StatusIconRegistry, TypeIconRegistry } from './icons';
import { PROJECTILE_TEX } from './pixelArt';

// MoveAssetRegistry: the single place that links a move to its visual/audio assets.
// Combat code only emits a move's ids; the renderer and UI resolve them here.

export interface MoveAssets {
  icon: string;
  /** true when the icon is hand-drawn for this move (else composed from kind + type) */
  bespokeIcon: boolean;
  typeIcon: string;
  /** Named VFX played on cast / travel (vfx.ts `named`) */
  vfx: string;
  /** Per-type impact effect played where the hit lands */
  impact: string;
  sfx: string;
  /** Projectile sprite (dedicated vfx sprite, else the type's projectile) */
  projectile: string | null;
  statusIcon: string | null;
}

const cache = new Map<string, MoveAssets>();

export function moveAssets(s: SkillDef): MoveAssets {
  const hit = cache.get(s.id);
  if (hit) return hit;
  const a: MoveAssets = {
    icon: SkillIconRegistry.key(s.id),
    bespokeIcon: SkillIconRegistry.hasBespoke(s.id),
    typeIcon: TypeIconRegistry.key(s.type),
    vfx: s.vfx,
    impact: s.type,
    sfx: s.sfx,
    projectile: s.kind === 'projectile' ? PROJECTILE_TEX[s.vfx] ?? ProjectileRegistry.key(s.type) : null,
    statusIcon: s.status ? StatusIconRegistry.key(s.status.kind) : null,
  };
  cache.set(s.id, a);
  return a;
}

/** Honest coverage report: which moves use composed (not hand-drawn) icons. */
export function missingBespokeIcons(skills: Iterable<SkillDef>): string[] {
  const out: string[] = [];
  for (const s of skills) if (!SkillIconRegistry.hasBespoke(s.id)) out.push(s.id);
  return out;
}
