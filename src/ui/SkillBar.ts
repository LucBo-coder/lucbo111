import Phaser from 'phaser';
import { ACTIVE_SKILL_GCD, type Unit } from '../core/world';
import { moveAssets } from '../render/moveAssets';
import { bar } from '../render/WorldRenderer';
import { audio } from '../systems/audio';
import { text, TYPE_COLOR } from '../scenes/ui';

/** What a skill bar drives: Adventure, a duel (host or guest) or a co-op guest. */
export interface SkillBarHost {
  /** Pokémon the bar shows and commands */
  focusAlly(): Unit | null;
  manualSkill(slot: number): void;
  cycleFocus(): void;
  /** seconds left on the side's global cooldown */
  globalCd(): number;
  /** keeping a slot for the player (AI stops using it); omitted where the AI runs elsewhere */
  toggleReserved?(slot: number): void;
  isReserved?(u: Unit, slot: number): boolean;
}

/**
 * Active-skill bar, shared by every scene that commands Pokémon by hand.
 * Tap / click a slot = use it now · right-click or long-press = keep it for the player (where supported).
 */
export class SkillBar {
  private slots: { zone: Phaser.GameObjects.Zone; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }[] = [];
  private head: Phaser.GameObjects.Text | null = null;
  private x = 0;
  private y = 0;
  private sq = 0;
  private gap = 0;
  private s = 1;

  constructor(private scene: Phaser.Scene, private host: SkillBarHost, private touch: boolean) {}

  get width(): number { return 4 * this.sq + 3 * this.gap; }
  get bounds(): { x: number; y: number; sq: number; gap: number } { return { x: this.x, y: this.y, sq: this.sq, gap: this.gap }; }
  get zones(): Phaser.GameObjects.Zone[] { return this.slots.map((s) => s.zone); }

  /** Lays out four slots, top-left at (x0, y0). `centerX` instead centres the bar on it. */
  build(s: number, pos: { x?: number; centerX?: number; y: number }): void {
    const sc = this.scene;
    sc.input.mouse?.disableContextMenu();
    this.s = s;
    this.sq = Math.round(46 * s); this.gap = Math.round(6 * s);
    this.x = pos.centerX != null ? Math.round(pos.centerX - this.width / 2) : Math.round(pos.x ?? 0);
    this.y = Math.round(pos.y);
    this.slots = [];
    const keep = !!this.host.toggleReserved;
    for (let j = 0; j < 4; j++) {
      const x = this.x + j * (this.sq + this.gap);
      const zone = sc.add.zone(x, this.y, this.sq, this.sq).setOrigin(0).setInteractive({ useHandCursor: true });
      let downAt = 0, handled = false;
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        audio.unlock();
        downAt = sc.time.now; handled = false;
        if (keep && p.rightButtonDown()) { handled = true; this.host.toggleReserved!(j); }
      });
      zone.on('pointerup', () => {
        if (handled) return;
        handled = true;
        if (keep && sc.time.now - downAt > 450) this.host.toggleReserved!(j);
        else this.host.manualSkill(j);
      });
      const icon = sc.add.image(x + this.sq / 2, this.y + this.sq / 2 - 5 * s, 'item_held').setVisible(false).setDepth(3);
      const label = text(sc, x + this.sq / 2, this.y + this.sq - 1 * s, '', 11 * s, '#ffffff').setOrigin(0.5, 1).setDepth(3);
      this.slots.push({ zone, icon, label });
    }
    this.head = text(sc, this.x, this.y - 4 * s, '', 14 * s, '#a0d8ff').setOrigin(0, 1).setInteractive({ useHandCursor: true });
    this.head.on('pointerup', () => this.host.cycleFocus());
  }

  /** `hidden` (a menu or dialogue is open) blanks the bar and disables its slots. */
  draw(g: Phaser.GameObjects.Graphics, hidden = false): void {
    const s = this.s, u = hidden ? null : this.host.focusAlly();
    this.slots.forEach((slot, j) => {
      const sl = u?.skills[j];
      if (slot.zone.input) slot.zone.input.enabled = !!sl;
      if (!u || !sl) { slot.icon.setVisible(false); slot.label.setText(''); return; }
      const x = this.x + j * (this.sq + this.gap), y = this.y;
      const affordable = u.energy >= sl.def.energyCost;
      g.fillStyle(0x000000, 0.72).fillRect(x - 2, y - 2, this.sq + 4, this.sq + 4);
      g.fillStyle(TYPE_COLOR[sl.def.type] ?? 0x888888, affordable ? 0.85 : 0.3).fillRect(x, y, this.sq, this.sq);
      const ik = moveAssets(sl.def).icon;
      if (slot.icon.texture.key !== ik) slot.icon.setTexture(ik);
      slot.icon.setVisible(true).setScale(Math.max(1, Math.round(2.5 * s))).setAlpha(affordable ? 1 : 0.5);
      const frac = sl.cd > 0 && sl.cdMax ? Phaser.Math.Clamp(sl.cd / sl.cdMax, 0, 1) : 0;
      if (frac > 0) g.fillStyle(0x000000, 0.62).fillRect(x, y, this.sq, this.sq * frac);
      slot.label.setText(sl.cd > 0 ? `${Math.ceil(sl.cd)}s` : sl.def.name.length > 9 ? sl.def.name.slice(0, 8) + '…' : sl.def.name);
      const queued = u.queuedSlot === j, casting = u.castSlot === j, kept = !!this.host.isReserved?.(u, j);
      g.lineStyle(queued || casting ? 3 : 2, queued ? 0x80d0ff : casting ? 0xffffff : kept ? 0xffcc33 : 0x1a1e2c, 1).strokeRect(x, y, this.sq, this.sq);
      // kept for the player: a gold corner tag
      if (kept) g.fillStyle(0xffcc33, 1).fillTriangle(x + this.sq - 12 * s, y, x + this.sq, y, x + this.sq, y + 12 * s);
    });
    if (!u) { this.head?.setText(''); return; }
    bar(g, this.x, this.y + this.sq + 4 * s, this.width, 5 * s, u.energy / u.maxEnergy, 0x60c0ff);
    const gcd = this.host.globalCd();
    if (gcd > 0) g.fillStyle(0xffffff, 0.5).fillRect(this.x, this.y - 3 * s, this.width * Math.min(1, gcd / ACTIVE_SKILL_GCD), 2 * s);
    this.head?.setText(this.touch ? `${u.name}  ⇄` : `${u.name}  ·  [Q] chiêu tốt nhất  ·  [T] đổi Pokémon`);
  }
}
