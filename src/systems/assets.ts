import Phaser from 'phaser';
import manifest from '../../ASSET_MANIFEST.json';

// Asset manager: loads every integrated file asset declared in ASSET_MANIFEST.json and records
// failures so procedural fallbacks can be used instead of crashing.

interface ManifestAsset {
  id: string;
  path: string;
  type: string;
  status: string;
  license?: string;
}

export const missingAssets = new Set<string>();

export function fileAssets(): ManifestAsset[] {
  return (manifest.assets as ManifestAsset[]).filter((a) => a.status === 'integrated' && a.type === 'spritesheet');
}

export function preloadManifest(scene: Phaser.Scene): void {
  for (const a of fileAssets()) {
    // Files live under /public; Vite serves them at the site root ('./' base for relative hosting)
    scene.load.image(a.id, a.path.replace(/^public\//, ''));
  }
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    missingAssets.add(file.key);
    console.warn(`[assets] failed to load ${file.key} — using procedural fallback`);
  });
}

export function attributionLines(): string[] {
  return (manifest.assets as (ManifestAsset & { attribution?: string })[]).filter((a) => a.attribution).map((a) => a.attribution!);
}
