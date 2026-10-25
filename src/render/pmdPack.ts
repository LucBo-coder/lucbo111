import Phaser from 'phaser';

// Optional personal-use pack of Pokémon Mystery Dungeon style animation sheets (PMDCollab SpriteCollab,
// CC BY-NC 4.0 — artists in public/assets/pmd/CREDITS.md), imported by scripts/import-pmd-sprites.py.
// Each species has real hand-drawn animations in 8 directions: Walk, Idle, Attack, Shoot, Charge, Hurt, Faint
// (+ shiny sheets). Sheets are loaded on demand, a few species at a time, the first time a species is on screen.

export type PmdAnim = 'Walk' | 'Idle' | 'Attack' | 'Shoot' | 'Charge' | 'Hurt' | 'Faint';
interface AnimMeta { w: number; h: number; n: number; rows: number; d: number[]; hit?: number }
interface SpeciesMeta { dex: number; anims: Partial<Record<PmdAnim, AnimMeta>>; shiny: boolean }

export const pmdPack = { available: false, active: false };
let index: Record<string, SpeciesMeta> = {};
const state = new Map<string, 'loading' | 'ready' | 'failed'>();
const queue: string[] = [];
const LOOP: Partial<Record<PmdAnim, boolean>> = { Walk: true, Idle: true, Charge: true };
/** PMD durations are game frames at 60 fps; played a bit slower (×1.5) — at full speed they look hurried at this zoom */
export const PMD_SLOWDOWN = 1.5;
const FRAME_MS = (1000 / 60) * PMD_SLOWDOWN;

export async function loadPmdIndex(): Promise<boolean> {
  try {
    const r = await fetch('assets/pmd/index.json', { cache: 'no-store' });
    if (!r.ok) return false;
    index = ((await r.json()) as { species: Record<string, SpeciesMeta> }).species;
    pmdPack.available = Object.keys(index).length > 0;
    return pmdPack.available;
  } catch {
    return false;
  }
}

/** Forms drawn with another species' sheets (Mega forms without their own art use the base species). */
const alias = new Map<string, string>();
export function setPmdAlias(form: string, base: string): void {
  alias.set(form, base);
}
const res = (species: string) => (index[species] ? species : alias.get(species) ?? species);

export function hasPmd(species: string): boolean {
  return pmdPack.active && !!index[res(species)];
}

const id = (species: string, shiny: boolean) => { const s = res(species); return s + (shiny && index[s]?.shiny ? ':s' : ''); };
export const pmdSheetKey = (species: string, shiny: boolean, anim: PmdAnim) => `pmd:${id(species, shiny)}:${anim}`;
export const pmdAnimKey = (species: string, shiny: boolean, anim: PmdAnim, dir: number) => `${pmdSheetKey(species, shiny, anim)}:${dir}`;

/** Ready to draw (sheets loaded, animations created)? Queues the load the first time it is asked. */
export function pmdReady(species: string, shiny: boolean): boolean {
  if (!hasPmd(species)) return false;
  const k = id(species, shiny);
  const s = state.get(k);
  if (s === 'ready') return true;
  if (!s) { state.set(k, 'loading'); queue.push(k); }
  return false;
}

/** The animations this species really has (missing ones fall back, e.g. Shoot → Attack). */
export function pmdHas(species: string, anim: PmdAnim): boolean {
  return !!index[res(species)]?.anims[anim];
}

export function pmdMeta(species: string, anim: PmdAnim): AnimMeta | undefined {
  return index[res(species)]?.anims[anim];
}

/** Starts loading queued species (call once per frame from a scene that renders units). */
export function pumpPmd(scene: Phaser.Scene): void {
  if (!queue.length || scene.load.isLoading()) return;
  const batch = queue.splice(0, 6);
  for (const k of batch) {
    const [species, s] = k.split(':');
    const meta = index[species];
    for (const [anim, m] of Object.entries(meta.anims) as [PmdAnim, AnimMeta][]) {
      const key = `pmd:${k}:${anim}`;
      if (scene.textures.exists(key)) continue;
      scene.load.spritesheet(key, `assets/pmd/${species}/${s ? 'shiny/' : ''}${anim}.png`, { frameWidth: m.w, frameHeight: m.h });
    }
  }
  scene.load.once('complete', () => {
    for (const k of batch) {
      const [species] = k.split(':');
      const meta = index[species];
      let ok = true;
      for (const [anim, m] of Object.entries(meta.anims) as [PmdAnim, AnimMeta][]) {
        const key = `pmd:${k}:${anim}`;
        if (!scene.textures.exists(key)) { ok = anim !== 'Walk' && anim !== 'Idle' && ok; continue; }
        const source = scene.textures.get(key).getSourceImage();
        // Some local shiny sheets do not match the normal AnimData geometry.
        // Reject them instead of animating sliced fragments of adjacent frames.
        if (source.width !== m.w * m.n || source.height !== m.h * m.rows) {
          ok = anim !== 'Walk' && anim !== 'Idle' && ok;
          console.warn(`[overworld] Invalid PMD geometry: ${key}; using fallback`);
          continue;
        }
        for (let dir = 0; dir < 8; dir++) {
          const row = m.rows >= 8 ? dir : 0;
          const ak = `${key}:${dir}`;
          if (scene.anims.exists(ak)) continue;
          // Phaser 3.88 ignores per-frame `duration` (nextTick = msPerFrame || frame.duration, and msPerFrame is
          // never 0): the animation ticks at 1 PMD frame and each drawing is repeated for its own duration instead
          scene.anims.create({
            key: ak,
            frames: m.d.flatMap((d, i) => Array.from({ length: Math.max(1, d) }, () => ({ key, frame: row * m.n + Math.min(i, m.n - 1) }))),
            frameRate: 1000 / FRAME_MS,
            repeat: LOOP[anim] ? -1 : 0,
          });
        }
      }
      state.set(k, ok ? 'ready' : 'failed');
    }
  });
  scene.load.start();
}

/** PMD direction rows: 0 down, 1 down-right, 2 right, 3 up-right, 4 up, 5 up-left, 6 left, 7 down-left. */
export function pmdDir(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  return ((Math.round((90 - a) / 45) % 8) + 8) % 8;
}

(globalThis as unknown as { __pmdMeta?: typeof pmdMeta }).__pmdMeta = pmdMeta; // e2e / debug
