import type Phaser from 'phaser';
import { coopSession, type CoopHost } from '../net/coop';
import { coopEventLabel } from '../core/coopEvents';
import { applyCoopLoot, type CoopLoot } from '../net/coopRewards';
import { net } from '../net/session';
import { saveStore } from '../systems/save';
import { text } from './ui';

export function rewardCoopHost(loot: CoopLoot): void {
  applyCoopLoot(saveStore.data, loot); void saveStore.save();
}

export function addCoopHud(scene: Phaser.Scene, host: CoopHost): () => void {
  const label = text(scene, 12, 145, '', 17, '#ffe6a0').setScrollFactor(0).setDepth(20000)
    .setStroke('#111827', 4).setWordWrapWidth(Math.min(480, scene.scale.width - 24));
  const update = () => label.setVisible(coopSession.active && net.role === 'host').setText(`CO-OP · Mã phòng ${net.code} · ${net.connected ? net.peerName : 'Đang chờ bạn'}\n${coopEventLabel(host.challenges.view)}`);
  scene.events.on('update', update);
  const cleanup = () => { scene.events.off('update', update); label.destroy(); scene.events.off('shutdown', cleanup); };
  scene.events.once('shutdown', cleanup); update();
  return cleanup;
}
