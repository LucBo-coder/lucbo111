import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { UIScene } from './scenes/UIScene';
import { AdventureScene } from './scenes/AdventureScene';
import { AdventureUI } from './scenes/AdventureUI';
import { LobbyScene } from './scenes/LobbyScene';
import { DuelScene } from './scenes/DuelScene';
import { DuelUI } from './scenes/DuelUI';

async function boot(): Promise<void> {
  // Wait (briefly) for the pixel font so canvas text doesn't render in a fallback font
  try {
    await Promise.race([document.fonts.load('20px "VT323"'), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* offline: fall back to monospace */
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#14161f',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    input: { activePointers: 3 },
    fps: { target: 60, forceSetTimeOut: false },
    scene: [BootScene, MenuScene, GameScene, UIScene, ResultScene, AdventureScene, AdventureUI, LobbyScene, DuelScene, DuelUI],
  });
  (window as unknown as { __phaser: Phaser.Game }).__phaser = game;
}

void boot();
