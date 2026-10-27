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
import { CoopGuestScene } from './scenes/CoopGuestScene';
import { CoopGuestUI } from './scenes/CoopGuestUI';
import { ServerScene } from './scenes/ServerScene';
import { OnlineHubScene } from './scenes/OnlineHubScene';
import { DPR } from './scenes/ui';
import { installCrashGuard } from './systems/crashGuard';

function boot(): void {
  console.info(`[boot] scripts ready at ${Math.round(performance.now())} ms`);
  // The pixel font loads while the game downloads its assets; Boot waits for it (briefly) before the first text,
  // so canvas text doesn't render in a fallback font — without holding the whole start-up for it.
  const fontReady = Promise.race([document.fonts.load('20px "VT323"'), new Promise((r) => setTimeout(r, 2500))])
    .catch(() => undefined); // offline: fall back to monospace
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#14161f',
    pixelArt: true,
    roundPixels: true,
    // high-DPI screens render at DPR× (sharp text); the canvas is shown at the CSS size of the window
    scale: DPR > 1
      ? { mode: Phaser.Scale.NONE, width: Math.round(innerWidth * DPR), height: Math.round(innerHeight * DPR), zoom: 1 / DPR }
      : { mode: Phaser.Scale.RESIZE, width: innerWidth, height: innerHeight },
    input: { activePointers: 3 },
    fps: { target: 60, forceSetTimeOut: false },
    scene: [BootScene, MenuScene, GameScene, UIScene, ResultScene, AdventureScene, AdventureUI, LobbyScene, DuelScene, DuelUI, CoopGuestScene, CoopGuestUI, ServerScene, OnlineHubScene],
  });
  game.registry.set('fontReady', fontReady);
  installCrashGuard(game as unknown as Parameters<typeof installCrashGuard>[0]);
  (window as unknown as { __phaser: Phaser.Game }).__phaser = game;
  if (DPR > 1) {
    const fit = () => game.scale.resize(Math.round(innerWidth * DPR), Math.round(innerHeight * DPR));
    addEventListener('resize', fit);
    addEventListener('orientationchange', () => setTimeout(fit, 150));
  }
  if (new URLSearchParams(location.search).has('netstats')) void import('./net/netOverlay').then(m => m.startNetOverlay());
}

boot();
