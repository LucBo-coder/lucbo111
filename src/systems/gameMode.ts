import Phaser from 'phaser';
import { coopSession } from '../net/coop';
import { net } from '../net/session';

// GameModeManager: the single place that starts/stops mode scenes so Survivor and Adventure
// never run at the same time or leak each other's systems.

export type GameMode = 'survivor' | 'adventure' | 'online';

const MODE_SCENES: Record<GameMode, string[]> = {
  survivor: ['Game', 'UI', 'Result'],
  adventure: ['Adventure', 'AdvUI'],
  online: ['Lobby', 'Duel', 'DuelUI', 'CoopGuest', 'OnlineHub', 'ServerWorld'],
};

class GameModeManager {
  current: GameMode | null = null;
  switches = 0;

  private stopAll(scene: Phaser.Scene): void {
    for (const keys of Object.values(MODE_SCENES)) {
      for (const k of keys) if (scene.scene.isActive(k) || scene.scene.isPaused(k) || scene.scene.isSleeping(k)) scene.scene.stop(k);
    }
  }

  /** online: `entry` picks the first scene ('Lobby' by default, 'Duel' for a challenge from the open world) */
  start(scene: Phaser.Scene, mode: GameMode, data: Record<string, unknown> & { entry?: string } = {}): void {
    this.stopAll(scene);
    this.current = mode;
    this.switches++;
    scene.scene.start(mode === 'survivor' ? 'Game' : mode === 'adventure' ? 'Adventure' : data.entry ?? 'Lobby', data);
  }

  toMenu(scene: Phaser.Scene): void {
    if (coopSession.active) { coopSession.active = false; net.leave(); }
    this.stopAll(scene);
    this.current = null;
    scene.scene.start('Menu');
  }
}

export const gameModes = new GameModeManager();
// debug / e2e hooks
(globalThis as unknown as { __modes: GameModeManager }).__modes = gameModes;
(globalThis as unknown as { __gm: (s: Phaser.Scene, d: object) => void }).__gm = (s, d) => gameModes.start(s, 'adventure', d as Record<string, unknown>);
