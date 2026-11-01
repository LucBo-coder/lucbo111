import Phaser from 'phaser';
import { text } from './ui';

// Battle-feature buttons (Mega, Terastal, Dynamax, weather call) in the bottom-right corner: a square frame per
// feature with its icon, the key, and a timer — the time left while it is in use (bar along the bottom + seconds),
// the recharge while it cools down (dark fill draining from the top + seconds). Click / tap = use it.
// The bar only draws; AdventureUI fills a view per slot each frame from the scene's gimmick state.

export type GimmickId = 'mega' | 'tera' | 'dyna' | 'weather';

export interface GimmickSlotView {
  /** shown at all (the key item is in the bag / a weather Pokémon is out) */
  visible: boolean;
  /** texture key of the icon */
  icon: string;
  /** short name under the icon when there is no timer */
  label: string;
  /** frame colour */
  color: number;
  /** ready = can be used now · active = in use · cooldown = recharging · blocked = can't now (no eligible Pokémon…) */
  state: 'ready' | 'active' | 'cooldown' | 'blocked';
  /** seconds left of the use (active) or of the recharge (cooldown), and the full length */
  left?: number;
  total?: number;
}

interface Slot {
  id: GimmickId;
  key: string;
  c: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Image;
  keyT: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  timer: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  view: GimmickSlotView | null;
}

const ORDER: { id: GimmickId; key: string }[] = [
  { id: 'mega', key: 'G' },
  { id: 'tera', key: 'Y' },
  { id: 'dyna', key: 'B' },
  { id: 'weather', key: 'C' },
];

export class GimmickBar {
  private slots: Slot[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private size = 56;
  /** anchor of the first slot and the step to the next one (a column going up, or a row going left) */
  private origin = { x: 0, y: 0 };
  private step = { x: 0, y: 0 };

  constructor(private scene: Phaser.Scene, private onUse: (id: GimmickId) => void, private touch: boolean) {}

  /** size = side of a square; slots fill from (x, y) — the centre of the first — along (dx, dy). */
  build(size: number, x: number, y: number, dx: number, dy: number): void {
    this.size = size;
    this.origin = { x, y };
    this.step = { x: dx, y: dy };
    this.g = this.scene.add.graphics().setDepth(20);
    for (const { id, key } of ORDER) {
      const c = this.scene.add.container(0, 0).setDepth(21).setVisible(false);
      const icon = this.scene.add.image(0, -size * 0.08, '__DEFAULT').setOrigin(0.5);
      const keyT = text(this.scene, -size / 2 + 4, -size / 2 + 2, this.touch ? '' : key, Math.round(size * 0.22), '#ffffff').setOrigin(0, 0);
      const label = text(this.scene, 0, size / 2 - 3, '', Math.round(size * 0.2), '#ffffff').setOrigin(0.5, 1);
      const timer = text(this.scene, 0, size / 2 - 3, '', Math.round(size * 0.26), '#ffffff').setOrigin(0.5, 1);
      const zone = this.scene.add.zone(0, 0, size, size).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => this.onUse(id));
      c.add([icon, keyT, label, timer, zone]);
      this.slots.push({ id, key, c, icon, keyT, label, timer, zone, view: null });
    }
  }

  /** Screen rectangle of a shown slot (tests, layout checks). */
  bounds(id: GimmickId): { x: number; y: number; w: number; h: number } | null {
    const s = this.slots.find((x) => x.id === id);
    if (!s || !s.c.visible) return null;
    return { x: s.c.x - this.size / 2, y: s.c.y - this.size / 2, w: this.size, h: this.size };
  }

  /** The view a slot shows now (tests). */
  viewOf(id: GimmickId): GimmickSlotView | null {
    const s = this.slots.find((x) => x.id === id);
    return s?.c.visible ? s.view : null;
  }

  draw(views: Record<GimmickId, GimmickSlotView>, hidden: boolean, now: number): void {
    const g = this.g;
    g.clear();
    const z = this.size, h = z / 2;
    let i = 0;
    for (const s of this.slots) {
      const v = views[s.id];
      s.view = v;
      const show = v.visible && !hidden;
      s.c.setVisible(show);
      if (!show) continue;
      const x = this.origin.x + this.step.x * i, y = this.origin.y + this.step.y * i;
      i++;
      s.c.setPosition(x, y);
      // icon: pixel art scaled to ~60% of the square
      if (s.icon.texture.key !== v.icon && this.scene.textures.exists(v.icon)) s.icon.setTexture(v.icon);
      const src = s.icon.frame;
      s.icon.setScale((z * 0.56) / Math.max(src.width, src.height, 1));
      const dim = v.state === 'blocked' || v.state === 'cooldown';
      s.icon.setAlpha(dim ? 0.45 : 1);
      // frame: shadow, dark face, coloured edge (pulsing when ready, bright while in use)
      g.fillStyle(0x000000, 0.45).fillRect(x - h + 3, y - h + 4, z, z);
      g.fillStyle(0x0c1424, 0.88).fillRect(x - h, y - h, z, z);
      const pulse = v.state === 'ready' ? 0.6 + 0.4 * Math.sin(now / 220) : 1;
      const edge = v.state === 'blocked' ? 0x5a6478 : v.color;
      g.lineStyle(Math.max(2, z * 0.05), edge, v.state === 'cooldown' ? 0.5 : pulse).strokeRect(x - h, y - h, z, z);
      g.lineStyle(1, 0xffffff, 0.18).strokeRect(x - h + 3, y - h + 3, z - 6, z - 6);
      const frac = v.total ? Phaser.Math.Clamp((v.left ?? 0) / v.total, 0, 1) : 0;
      if (v.state === 'cooldown' && frac > 0) {
        // recharge: dark fill over the part still to come, from the top
        g.fillStyle(0x000000, 0.55).fillRect(x - h + 2, y - h + 2, z - 4, (z - 4) * frac);
      }
      if (v.state === 'active') {
        // in use: glow + time bar along the bottom
        g.lineStyle(z * 0.12, v.color, 0.18 + 0.1 * Math.sin(now / 160)).strokeRect(x - h - 2, y - h - 2, z + 4, z + 4);
        g.fillStyle(0x000000, 0.7).fillRect(x - h + 3, y + h - 8, z - 6, 5);
        g.fillStyle(v.color, 1).fillRect(x - h + 3, y + h - 8, (z - 6) * frac, 5);
      }
      const timed = (v.state === 'active' || v.state === 'cooldown') && v.left != null && v.left > 0;
      // the timer takes the label's place under the icon (above the time bar while in use)
      s.timer.setText(timed ? `${Math.ceil(v.left!)}s` : '').setColor(v.state === 'active' ? '#ffffff' : '#c8d0e0').setY(v.state === 'active' ? h - 8 : h - 2);
      s.label.setText(timed ? '' : v.label).setAlpha(dim ? 0.6 : 1);
    }
  }
}
