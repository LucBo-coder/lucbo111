import type Phaser from 'phaser';

// Gigantamax form art (V32): 96×96 front sprites of the 32 G-Max forms from the personal official pack
// (scripts/fetch-gmax-sprites.mjs → public/assets/official/gmax/). PMDCollab has no Gigantamax sheets, so a
// Gigantamax giant is drawn with this picture instead of its base species' animated sheet, and the party / Pokédex
// show it next to the Gigantamax Factor. Without the pack everything falls back to the scaled base sprite.

let forms = new Set<string>();
let shinies = new Set<string>();
const loading = new Map<string, Promise<void>>();
let sceneRef: Phaser.Scene | null = null;

export async function loadGmaxIndex(scene: Phaser.Scene): Promise<number> {
  sceneRef = scene;
  try {
    const r = await fetch('assets/official/gmax/index.json', { cache: 'no-store' });
    if (!r.ok) return 0;
    const idx = (await r.json()) as { gmax?: string[]; shiny?: string[] };
    forms = new Set(idx.gmax ?? []);
    shinies = new Set(idx.shiny ?? []);
  } catch { /* no pack */ }
  return forms.size;
}

export function gmaxArtKey(species: string, shiny = false): string {
  return `gmax-${shiny && shinies.has(species) ? 'shiny-' : ''}${species}`;
}

export function hasGmaxArt(species: string): boolean {
  return forms.has(species);
}

/** Texture key of the G-Max art once it is loaded; starts loading it (and returns null) the first time. */
export function gmaxTexture(species: string, shiny = false): string | null {
  const scene = sceneRef;
  if (!scene || !forms.has(species)) return null;
  const key = gmaxArtKey(species, shiny);
  if (scene.textures.exists(key)) return key;
  void loadGmaxArt(species, shiny);
  return null;
}

export function loadGmaxArt(species: string, shiny = false): Promise<void> {
  const scene = sceneRef;
  if (!scene || !forms.has(species)) return Promise.resolve();
  const key = gmaxArtKey(species, shiny);
  if (scene.textures.exists(key)) return Promise.resolve();
  let p = loading.get(key);
  if (!p) {
    p = new Promise<void>((res) => {
      const img = new Image();
      img.onload = () => { if (!scene.textures.exists(key)) scene.textures.addImage(key, img); res(); };
      img.onerror = () => res();
      img.src = `assets/official/gmax/${key.includes('shiny-') ? 'shiny/' : ''}${species}.png`;
    });
    loading.set(key, p);
  }
  return p;
}
