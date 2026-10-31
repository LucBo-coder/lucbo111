import Phaser from 'phaser';
import { bar, hpColor } from '../render/WorldRenderer';
import { fitScale } from '../render/spriteRegistry';
import { audio } from '../systems/audio';
import { COLORS, fitText, text, TYPE_COLOR } from '../scenes/ui';

/** One party member in its ball, as the wheel shows it. */
export interface WheelMon {
  uid: string;
  name: string;
  level: number;
  /** HP fraction kept in the ball (0 = fainted) */
  hp: number;
  types: string[];
  /** major status carried into the ball (Vietnamese label), if any */
  status?: string;
  /** texture key of its icon */
  icon: string;
}

const STATUS_VI: Record<string, string> = {
  burn: 'Bỏng', poison: 'Độc', badPoison: 'Độc nặng', paralysis: 'Tê liệt', sleep: 'Ngủ', freeze: 'Đóng băng', confusion: 'Rối loạn',
};
export const statusLabel = (k?: string): string | undefined => (k ? STATUS_VI[k] ?? k : undefined);

/**
 * Quick switch: the Pokémon waiting in their balls on an arc above the skill bar, each with HP, types, status and
 * the switch cooldown. Opens on T / the "Đổi" button, and by itself when the active Pokémon faints. It never pauses
 * the game and sits low on the screen, clear of the field centre where boss warnings are drawn.
 * Pick: click / tap a card or press its number (1–5).
 */
export class SwitchWheel {
  private layer: Phaser.GameObjects.Container | null = null;
  private g: Phaser.GameObjects.Graphics | null = null;
  private cards: { mon: WheelMon; box: { x: number; y: number; w: number; h: number }; name: Phaser.GameObjects.Text; info: Phaser.GameObjects.Text; icon: Phaser.GameObjects.Image }[] = [];
  private head: Phaser.GameObjects.Text | null = null;
  reason: 'manual' | 'faint' | null = null;

  constructor(private scene: Phaser.Scene, private pick: (uid: string) => void, private cooldown: () => number) {}

  get isOpen(): boolean { return !!this.layer; }

  open(mons: WheelMon[], reason: 'manual' | 'faint', s: number, centerX: number, bottomY: number): void {
    this.close();
    this.reason = reason;
    const sc = this.scene;
    this.layer = sc.add.container(0, 0).setDepth(60);
    this.g = sc.add.graphics();
    this.layer.add(this.g);
    const n = Math.max(1, mons.length);
    const cw = Math.round(132 * s), ch = Math.round(58 * s);
    const radius = Math.max(cw * 1.15, Math.min(sc.scale.width * 0.42, 240 * s));
    // cards spread on the upper half of a circle centred under the bottom edge of the wheel
    const span = Math.min(Math.PI * 0.9, 0.42 * n);
    this.cards = mons.map((mon, i) => {
      const a = -Math.PI / 2 + (n === 1 ? 0 : -span / 2 + (span * i) / (n - 1));
      const cx = centerX + Math.cos(a) * radius, cy = bottomY + Math.sin(a) * radius * 0.55;
      const box = { x: Math.round(cx - cw / 2), y: Math.round(cy - ch / 2), w: cw, h: ch };
      const zone = sc.add.zone(box.x, box.y, cw, ch).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => { audio.unlock(); this.pick(mon.uid); });
      const icon = sc.add.image(box.x + 22 * s, box.y + ch / 2, mon.icon);
      icon.setScale(fitScale(sc, mon.icon, 38 * s));
      const name = text(sc, box.x + 44 * s, box.y + 3 * s, '', Math.max(13, 15 * s));
      const info = text(sc, box.x + 44 * s, box.y + ch - 18 * s, '', Math.max(12, 13 * s), COLORS.dim);
      fitText(name, `${i + 1}. ${mon.name} Lv${mon.level}`, cw - 48 * s);
      this.layer!.add([zone, icon, name, info]);
      return { mon, box, name, info, icon };
    });
    this.head = text(sc, centerX, bottomY - radius * 0.55 - ch / 2 - 26 * s, reason === 'faint' ? 'Pokémon đã gục — chọn Pokémon tiếp theo' : 'Đổi Pokémon (1–5 · T để đóng)', Math.max(14, 17 * s), reason === 'faint' ? '#ffb0a0' : '#a0d8ff').setOrigin(0.5).setStroke('#000', 4);
    this.layer.add(this.head);
    this.draw(s);
  }

  /** Redraws HP, status and the cooldown veil (call every frame while open). */
  draw(s: number): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const cd = this.cooldown();
    for (const c of this.cards) {
      const { box, mon } = c;
      const down = mon.hp <= 0;
      g.fillStyle(0x0b0d16, 0.86).fillRoundedRect(box.x, box.y, box.w, box.h, 6 * s);
      g.lineStyle(2, down ? 0x803030 : cd > 0 ? 0x4a4f66 : 0xffcc33, 1).strokeRoundedRect(box.x, box.y, box.w, box.h, 6 * s);
      const bx = box.x + 44 * s, bw = box.w - 52 * s;
      bar(g, bx, box.y + 22 * s, bw, 6 * s, mon.hp, down ? 0x603030 : hpColor(mon.hp));
      mon.types.forEach((t, k) => g.fillStyle(TYPE_COLOR[t] ?? 0x888888, 1).fillRect(bx + k * 16 * s, box.y + 31 * s, 13 * s, 5 * s));
      c.info.setText(down ? 'Kiệt sức' : mon.status ?? `${Math.round(mon.hp * 100)}% HP`).setColor(down ? '#c06060' : mon.status ? '#ffb070' : COLORS.dim);
      c.icon.setAlpha(down ? 0.35 : 1);
      if (cd > 0 && !down) {
        g.fillStyle(0x000000, 0.45).fillRoundedRect(box.x, box.y, box.w, box.h, 6 * s);
      }
    }
    if (cd > 0) this.head?.setText(`${this.reason === 'faint' ? 'Pokémon đã gục' : 'Đổi Pokémon'} — chờ ${cd.toFixed(1)} s`);
    else this.head?.setText(this.reason === 'faint' ? 'Pokémon đã gục — chọn Pokémon tiếp theo' : 'Đổi Pokémon (1–5 · T để đóng)');
  }

  /** Number key i (0-based) while the wheel is open. */
  pickIndex(i: number): boolean {
    const c = this.cards[i];
    if (!c) return false;
    this.pick(c.mon.uid);
    return true;
  }

  close(): void {
    this.layer?.destroy(true);
    this.layer = null; this.g = null; this.cards = []; this.head = null; this.reason = null;
  }
}
