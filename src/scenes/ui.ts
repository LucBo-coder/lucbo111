import Phaser from 'phaser';
import { audio } from '../systems/audio';
import { Rarity } from '../core/types';

export const FONT = '"VT323", monospace';

/**
 * Canvas pixels per CSS pixel: the screen's devicePixelRatio (up to 2, on a 0.25 grid) so text is drawn at the
 * real resolution instead of being upscaled by the browser — phones at 2×, Windows laptops at 125 % / 150 %
 * scaling at 1.25 / 1.5. Capped so the canvas stays under ~4.2 M pixels on big high-DPI monitors.
 * Layout formulas work in CSS pixels through `uiScale`; world cameras pick their zoom with `worldZoom`.
 */
export const DPR = (() => {
  if (typeof window === 'undefined') return 1;
  const budget = Math.sqrt(4_200_000 / Math.max(1, screen.width * screen.height));
  return Math.max(1, Math.floor(Math.min(2, window.devicePixelRatio || 1, budget) * 4) / 4);
})();

/** A layout scale computed from the CSS size of the screen, returned in canvas pixels. */
export function uiScale(W: number, H: number, f: (cssW: number, cssH: number) => number): number {
  return f(W / DPR, H / DPR) * DPR;
}

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

/**
 * Sets a single-line text and keeps it inside `maxW` px (phones: labels must not run past their box or into the next
 * one): the font shrinks down to `minFrac` of its own size, then the end is cut with "…". Cheap to call every frame —
 * nothing is redrawn while the string and the width stay the same.
 */
export function fitText(t: Phaser.GameObjects.Text, str: string, maxW: number, minFrac = 0.72): Phaser.GameObjects.Text {
  const d = t as Phaser.GameObjects.Text & { _fit?: { base: number; src: string; w: number } };
  if (d._fit && d._fit.src === str && d._fit.w === maxW) return t;
  const base = d._fit?.base ?? parseFloat(String(t.style.fontSize));
  if (parseFloat(String(t.style.fontSize)) !== base) t.setFontSize(base);
  t.setText(str);
  if (t.width > maxW && maxW > 0) {
    t.setFontSize(Math.round(Math.max(base * minFrac, Math.floor(base * (maxW / t.width)))));
    if (t.width > maxW) {
      let lo = 0, hi = str.length;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; t.setText(str.slice(0, m).trimEnd() + '…'); if (t.width <= maxW) lo = m; else hi = m - 1; }
      t.setText(str.slice(0, lo).trimEnd() + '…');
    }
  }
  d._fit = { base, src: str, w: maxW };
  return t;
}

/** fitText with the text's current string. */
export const fitWidth = (t: Phaser.GameObjects.Text, maxW: number, minFrac?: number) => fitText(t, t.text, maxW, minFrac);

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
  const t = fitWidth(text(scene, 0, 0, label, Math.min(28 * DPR, h * 0.55)).setOrigin(0.5), w - 10);
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
  return { container: c, setLabel: (s) => { fitText(t, s, w - 10); } };
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

/** A small HTML text box over the canvas (room codes, names) — works with phone keyboards. */
export function askText(scene: Phaser.Scene, label: string, initial: string, max: number): Promise<string | null> {
  document.getElementById('lobby-input')?.remove();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'lobby-input';
    box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,6,12,.7);z-index:50;font-family:VT323,monospace';
    box.innerHTML = `<form style="background:#161a28;border:2px solid #ffd040;padding:18px 20px;display:flex;flex-direction:column;gap:12px;min-width:280px;color:#e8f0ff;font-size:22px">
      <label>${label}</label>
      <input maxlength="${max}" autocomplete="off" autocapitalize="characters" style="font:inherit;font-size:28px;padding:6px 10px;background:#0b0d16;color:#ffe060;border:1px solid #3a4260;text-transform:${max <= 6 ? 'uppercase' : 'none'}">
      <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" data-x>Hủy</button><button type="submit">OK</button></div></form>`;
    document.body.appendChild(box);
    const input = box.querySelector('input')!;
    input.value = initial;
    input.focus();
    const done = (v: string | null) => { box.remove(); scene.input.keyboard?.enableGlobalCapture(); resolve(v); };
    scene.input.keyboard?.disableGlobalCapture();
    box.querySelector('form')!.addEventListener('submit', (e) => { e.preventDefault(); done(input.value); });
    box.querySelector('[data-x]')!.addEventListener('click', () => done(null));
  });
}
