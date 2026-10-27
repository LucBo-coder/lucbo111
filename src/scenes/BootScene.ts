import Phaser from 'phaser';
import { loadPmdIndex, pmdPack, setPmdAlias } from '../render/pmdPack';
import { music } from '../systems/music';
import { bossUiFiles } from '../ui/BossHUDController';
import { POKEMON, SKILLS, validateData } from '../core/data';
import { ITEM_DEFS } from '../core/evolution';
import { CANDY_DEFS } from '../core/candy';
import { buildIcons } from '../render/icons';
import { installLazyCreatures, registerOfficialLazy } from '../render/lazyCreatures';
import { buildAvatarSheets, buildCreatureAnimations } from '../render/animation';
import { REGISTRY, loadOfficialIndex, officialPack, officialItemFiles, preloadIcyEthics, registerIcyEthics, registerPlaceholders, registerProcedural } from '../render/spriteRegistry';
import { generateTextures } from '../render/pixelArt';
import { buildTileset, buildWorldProps, preloadIcyTiles } from '../render/tileset';
import { loadImagesInBackground, missingAssets, preloadManifest } from '../systems/assets';
import { audio } from '../systems/audio';
import { saveStore } from '../systems/save';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    console.info(`[boot] Boot.preload at ${Math.round(performance.now())} ms`);
    preloadManifest(this);
    preloadIcyEthics(this);
    preloadIcyTiles(this);
  }

  async create(): Promise<void> {
    // boot phase timings (console): where a slow start goes
    let t = performance.now();
    const lap = (label: string) => { const now = performance.now(); console.info(`[boot] ${label} ${Math.round(now - t)} ms`); t = now; };
    console.info(`[boot] preload done at ${Math.round(t)} ms`);
    const errors = validateData();
    if (errors.length) {
      // Bad data should never ship silently
      this.add.text(20, 20, 'DATA ERRORS:\n' + errors.join('\n'), { color: '#ff6060', fontSize: '16px' });
      console.error(errors);
      return;
    }
    lap('validate');
    const save = await saveStore.load();
    audio.enabled = save.settings.sfx;
    music.enabled = save.settings.music !== false;
    lap('save');
    registerProcedural();
    const icy = registerIcyEthics(this, missingAssets);
    console.info(`[assets] IcyEthics sprites converted: ${icy.join(', ') || 'none'}`);
    // Optional personal-use PMD animation pack (SpriteCollab, CC BY-NC 4.0; scripts/import-pmd-sprites.py): on unless switched off
    if (await loadPmdIndex()) pmdPack.active = save.settings.pmdSprites !== false;
    // Optional personal-use official sprite pack (never bundled; see scripts/fetch-official-sprites.mjs)
    lap('icy+pmd');
    const idx = await loadOfficialIndex();
    officialPack.available = !!idx;
    // the locally downloaded pack is used by default unless the player switched it off themselves
    if (idx && !save.settings.officialChosen) save.settings.officialSprites = true;
    if (idx && save.settings.officialSprites) {
      // on demand: only the index now, each species' art when it is first needed (see lazyCreatures.ts)
      officialPack.active = registerOfficialLazy(idx.icons, idx.front, (id) => POKEMON.get(id)?.types ?? ['normal'], idx.shiny ?? []) > 0;
      console.info(`[assets] official sprite pack (on demand): ${idx.icons.length} icons, ${idx.front.length} front sprites`);
    }
    // Mega forms without their own PMD sheets (scripts/fetch-pmd-megas.py): the Mega's official art when the pack has it
    // (its real look), otherwise the base species' animated sheets
    lap('official');
    const officialArt = new Set(officialPack.active && idx ? [...idx.icons, ...idx.front] : []);
    for (const p of POKEMON.values()) if (p.mega && !officialArt.has(p.id)) setPmdAlias(p.id, p.mega.base);
    const ph = registerPlaceholders([...POKEMON.values()]);
    if (ph) console.info(`[assets] placeholder sprites for ${ph} species without art`);
    // Hand-drawn / IcyEthics art is built now; placeholder & official-pack creatures on first use
    lap('placeholders');
    const eager = (k: string) => REGISTRY[k]?.source !== 'placeholder' && REGISTRY[k]?.source !== 'official';
    installLazyCreatures(this, Object.keys(REGISTRY).filter((k) => !eager(k)));
    generateTextures(this, eager);
    lap('textures');
    const candies = CANDY_DEFS.map((c) => ({ id: c.id, kind: 'candy', color: '#' + c.color.toString(16).padStart(6, '0') }));
    const icons = buildIcons(this, SKILLS.values(), [...ITEM_DEFS.values(), ...candies]);
    console.info(`[assets] icons: 18 types, ${icons.skills} skills (${icons.bespoke} hand-drawn), items, statuses`);
    lap('icons');
    buildCreatureAnimations(this, eager);
    buildAvatarSheets(this);
    lap('anims+avatars');
    buildTileset(this, missingAssets);
    buildWorldProps(this);
    lap('tiles+props');
    await this.registry.get('fontReady');
    lap('font');
    this.scene.start('Menu');
    // not needed by the menu: item art and the boss HUD arrive while the player picks a mode
    void loadImagesInBackground(this.textures, [...bossUiFiles(), ...(idx && officialPack.active ? officialItemFiles(idx) : [])]);
  }
}
