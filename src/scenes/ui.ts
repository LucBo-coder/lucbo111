import Phaser from 'phaser';
import { audio } from '../systems/audio';
import { Rarity } from '../core/types';

export const FONT = '"VT323", monospace';

export const COLORS = {
  bg: 0x14161f,
  panel: 0x1e2230,
  panelEdge: 0x3a4260,
  text: '#f2f4ff',
  dim: '#9aa3c0',
  accent: 0xffcc33,
};

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xb8c0d0,
  rare: 0x4aa8ff,
  epic: 0xc060ff,
  legendary: 0xffb020,
};
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'THƯỜNG',
  rare: 'HIẾM',
  epic: 'SỬ THI',
  legendary: 'HUYỀN THOẠI',
};

export const TYPE_COLOR: Record<string, number> = {
  normal: 0xa8a878, fire: 0xf08030, water: 0x6890f0, electric: 0xf8d030, grass: 0x78c850, ice: 0x98d8d8,
  fighting: 0xc03028, poison: 0xa040a0, ground: 0xe0c068, flying: 0xa890f0, psychic: 0xf85888, bug: 0xa8b820,
  rock: 0xb8a038, ghost: 0x705898, dragon: 0x7038f8, dark: 0x705848, steel: 0xb8b8d0, fairy: 0xee99ac,
};

export const ROLE_LABEL: Record<string, string> = {
  tank: 'Đỡ đòn', fighter: 'Đấu sĩ', assassin: 'Sát thủ', marksman: 'Xạ thủ', mage: 'Pháp sư', support: 'Hỗ trợ',
};

export function text(scene: Phaser.Scene, x: number, y: number, str: string, size = 20, color = COLORS.text): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${Math.round(size)}px`, color, stroke: '#0b0c12', strokeThickness: Math.max(2, Math.round(size / 6)) });
}

const shade = (c: number, pct: number) => {
  const col = Phaser.Display.Color.ValueToColor(c);
  return (pct >= 0 ? col.lighten(pct) : col.darken(-pct)).color;
};

/**
 * Pixel-style panel (0.9.0 look): drop shadow, vertical gradient fill, dark outline + coloured edge,
 * bevel (light top / dark bottom inner lines) and small corner rivets.
 */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, edge = COLORS.panelEdge, fill = COLORS.panel, alpha = 0.92): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.4).fillRect(x + 5, y + 6, w, h);
  const top = shade(fill, 14), bot = shade(fill, -22);
  g.fillGradientStyle(top, top, bot, bot, alpha).fillRect(x, y, w, h);
  g.lineStyle(1, 0x05060a, 1).strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  g.lineStyle(3, edge, 1).strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.lineStyle(1, 0xffffff, 0.16).lineBetween(x + 4, y + 4.5, x + w - 4, y + 4.5);
  g.lineStyle(1, 0x000000, 0.35).lineBetween(x + 4, y + h - 4.5, x + w - 4, y + h - 4.5);
  const r = shade(edge, 30);
  for (const [cx, cy] of [[x + 4, y + 4], [x + w - 7, y + 4], [x + 4, y + h - 7], [x + w - 7, y + h - 7]]) g.fillStyle(r, 1).fillRect(cx, cy, 3, 3);
  return g;
}

export interface Button {
  container: Phaser.GameObjects.Container;
  setLabel(s: string): void;
}

/** Beveled pixel button: gradient face, highlight / shade lines, hover lift + gold edge, press sinks it. */
export function button(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void, color = 0x2c3654): Button {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (state: 'idle' | 'hover' | 'down') => {
    const face = state === 'hover' ? shade(color, 18) : state === 'down' ? shade(color, -12) : color;
    const dy = state === 'down' ? 2 : 0;
    g.clear();
    g.fillStyle(0x000000, 0.45).fillRect(-w / 2 + 3, -h / 2 + 5, w, h);
    g.fillGradientStyle(shade(face, 16), shade(face, 16), shade(face, -16), shade(face, -16), 1).fillRect(-w / 2, -h / 2 + dy, w, h);
    g.lineStyle(1, 0x05060a, 1).strokeRect(-w / 2 - 0.5, -h / 2 - 0.5 + dy, w + 1, h + 1);
    g.lineStyle(2, state === 'hover' ? 0xffe680 : shade(color, 40), 1).strokeRect(-w / 2 + 1, -h / 2 + 1 + dy, w - 2, h - 2);
    g.lineStyle(1, 0xffffff, state === 'down' ? 0.08 : 0.28).lineBetween(-w / 2 + 3, -h / 2 + 3.5 + dy, w / 2 - 3, -h / 2 + 3.5 + dy);
    g.lineStyle(1, 0x000000, 0.4).lineBetween(-w / 2 + 3, h / 2 - 3.5 + dy, w / 2 - 3, h / 2 - 3.5 + dy);
    t.setY(dy);
  };
  const t = text(scene, 0, 0, label, Math.min(28, h * 0.55)).setOrigin(0.5);
  draw('idle');
  const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
  zone.on('pointerover', () => { draw('hover'); scene.tweens.add({ targets: c, scale: 1.04, duration: 90 }); });
  zone.on('pointerout', () => { draw('idle'); scene.tweens.add({ targets: c, scale: 1, duration: 90 }); });
  zone.on('pointerdown', () => draw('down'));
  zone.on('pointerup', () => {
    draw('hover');
    audio.unlock();
    audio.play('click');
    onClick();
  });
  c.add([g, t, zone]);
  return { container: c, setLabel: (s) => t.setText(s) };
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

export function typeBadge(scene: Phaser.Scene, x: number, y: number, type: string, size = 14): Phaser.GameObjects.Container {
  const label = type.toUpperCase();
  const h = size + 4;
  const hasIcon = scene.textures.exists('type-' + type);
  const iw = hasIcon ? h : 0;
  const w = label.length * size * 0.5 + 10 + iw;
  const g = scene.add.graphics();
  g.fillStyle(TYPE_COLOR[type] ?? 0x888888, 1).fillRect(0, 0, w, h);
  g.lineStyle(1, 0x000000, 0.6).strokeRect(0.5, 0.5, w - 1, h - 1);
  const parts: Phaser.GameObjects.GameObject[] = [g];
  // integer scale keeps the 11×11 pixel icon crisp
  if (hasIcon) parts.push(scene.add.image(h / 2, h / 2, 'type-' + type).setScale(Math.max(1, Math.floor((h - 2) / 11))));
  parts.push(text(scene, iw + (w - iw) / 2, h / 2, label, size).setOrigin(0.5));
  return scene.add.container(x, y, parts).setSize(w, h);
}

/** Pixel type icon alone (crisp integer scale). */
export function typeIcon(scene: Phaser.Scene, x: number, y: number, type: string, px = 22): Phaser.GameObjects.Image {
  return scene.add.image(x, y, 'type-' + type).setScale(Math.max(1, Math.round(px / 11)));
}
