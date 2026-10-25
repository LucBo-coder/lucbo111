import Phaser from 'phaser';
import { AVATARS, avatarTextureKey } from '../core/avatars';
import { fitScale } from '../render/spriteRegistry';
import { net } from '../net/session';
import { saveStore } from '../systems/save';
import { askText, button, COLORS, panel, text } from './ui';

// Player profile (avatar + name) shared by the main lobby and the online lobby.
// The modal is plain Phaser UI; only the name box is HTML (askText) so phone keyboards work.

function layoutScale(W: number, H: number): number {
  return W < H ? Math.min(W / 470, H / 995, 1.4) : Math.min(W / 960, H / 640, 1.6);
}

/**
 * Opens the device-wide profile editor. `onChanged` runs after the modal closes (and after an avatar
 * was picked or the name edited), so the caller can rebuild its own card.
 */
export function openPlayerProfile(scene: Phaser.Scene, onChanged?: () => void): void {
  const layer = scene.add.container(0, 0).setDepth(30000);
  const keyboard = scene.input.keyboard;
  const keyboardWasEnabled = keyboard?.enabled ?? false;
  if (keyboard) keyboard.enabled = false;
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    layer.destroy();
    onChanged?.();
  };

  // A parent scene rebuild destroys this layer without calling close(); only restore the keyboard.
  layer.once('destroy', () => { if (keyboard) keyboard.enabled = keyboardWasEnabled; });

  const build = (): void => {
    layer.removeAll(true);
    const { width: W, height: H } = scene.scale;
    const s = layoutScale(W, H);
    const pw = Math.min(620, W - 24);
    const pad = 18 * s;
    const gap = 10 * s;
    const headerH = 136 * s;
    const footerH = 68 * s;
    const cols = pw < 440 ? 2 : 4;
    const rows = Math.ceil(AVATARS.length / cols);
    const tileW = (pw - pad * 2 - gap * (cols - 1)) / cols;
    const maxTileH = Math.min(122 * s, tileW * 0.86);
    const naturalH = pad * 2 + headerH + rows * maxTileH + (rows - 1) * gap + footerH;
    const available = H - 24;
    const tileH = naturalH <= available
      ? maxTileH
      : Math.max(54 * s, (available - (pad * 2 + headerH + (rows - 1) * gap + footerH)) / rows);
    const ph = Math.min(available, pad * 2 + headerH + rows * tileH + (rows - 1) * gap + footerH);
    const px = (W - pw) / 2, py = (H - ph) / 2;

    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { layer.add(o); return o; };

    const backdrop = add(scene.add.rectangle(0, 0, W, H, 0x05060c, 0.74).setOrigin(0).setInteractive());
    backdrop.on('pointerup', close);
    // clicks inside the panel must not reach the backdrop
    add(scene.add.zone(px, py, pw, ph).setOrigin(0).setInteractive());

    add(panel(scene, px, py, pw, ph, 0xffcc33, 0x1d2232, 0.98));
    add(text(scene, W / 2, py + 10 * s, 'HỒ SƠ NGƯỜI CHƠI', 27 * s, '#ffe680').setOrigin(0.5, 0));

    // current avatar + name + rename
    const avatar = avatarTextureKey(saveStore.avatar);
    const r = 25 * s, ax = px + pad + r, ay = py + 80 * s;
    const ring = add(scene.add.graphics());
    ring.fillStyle(0x0c0f1a, 1).fillCircle(ax, ay, r);
    ring.lineStyle(3 * s, 0xffd040, 1).strokeCircle(ax, ay, r);
    ring.lineStyle(1 * s, 0xffffff, 0.2).strokeCircle(ax, ay, r - 4 * s);
    if (scene.textures.exists(avatar)) {
      add(scene.add.image(ax, ay - 1 * s, avatar).setScale(fitScale(scene, avatar, 40 * s)));
    }
    const renameW = Math.min(150 * s, pw * 0.36), renameX = px + pw - pad - renameW / 2;
    const nx = ax + r + 12 * s;
    add(text(scene, nx, ay - 16 * s, saveStore.playerName, 25 * s, '#ffffff')
      .setWordWrapWidth(Math.max(60, renameX - renameW / 2 - nx - 8 * s)));
    add(button(scene, renameX, ay, renameW, Math.min(40 * s, 34 * s), '✎ Đổi tên', () => {
      void (async () => {
        const v = await askText(scene, 'Tên người chơi (bạn bè sẽ thấy khi online)', saveStore.playerName, 16);
        if (v == null) return;
        net.setName(await saveStore.setPlayerName(v));
        build();
      })();
    }, 0x3a4260).container);

    add(text(scene, px + pad, py + 112 * s, 'Chạm một avatar để chọn · lưu theo thiết bị', 15 * s, COLORS.dim));

    const gridY = py + headerH + pad;
    AVATARS.forEach((a, i) => {
      const tx = px + pad + (i % cols) * (tileW + gap);
      const ty = gridY + Math.floor(i / cols) * (tileH + gap);
      const selected = a.id === saveStore.avatar;
      add(panel(scene, tx, ty, tileW, tileH, selected ? 0xffd040 : 0x3a4260, selected ? 0x2a3048 : 0x161b28, selected ? 1 : 0.9));
      const key = avatarTextureKey(a.id);
      if (scene.textures.exists(key)) {
        add(scene.add.image(tx + tileW / 2, ty + tileH * 0.4, key).setScale(fitScale(scene, key, Math.min(46 * s, tileH * 0.46))));
      }
      add(text(scene, tx + tileW / 2, ty + tileH - 21 * s, a.name, 16 * s, selected ? '#ffe680' : '#d8e0f8')
        .setOrigin(0.5, 0).setWordWrapWidth(tileW - 6 * s).setAlign('center'));
      if (selected) add(text(scene, tx + tileW - 8 * s, ty + 4 * s, '✓', 18 * s, '#ffe680').setOrigin(1, 0));
      const zone = add(scene.add.zone(tx, ty, tileW, tileH).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerup', () => {
        if (a.id === saveStore.avatar) return;
        void saveStore.setAvatar(a.id).then(build);
      });
    });

    add(button(scene, W / 2, py + ph - 32 * s, Math.min(200 * s, pw - 40 * s), 42 * s, 'Đóng', close, 0x2f6a3a).container);
  };

  build();
}
