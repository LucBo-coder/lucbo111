import Phaser from 'phaser';
import type { StatusKind } from '../core/types';
import type { Unit, World } from '../core/world';
import { LEGENDS } from '../core/legends';
import { POKEMON } from '../core/data';
import { DPR } from '../scenes/ui';

// Boss HUD built from the Rayquaza UI pack (public/assets/ui/boss, prepared by scripts/prepare-boss-ui.py).
// Everything shown is read from the live boss every frame: name, level, HP (dynamic bar + delayed damage trail),
// badge, phase (indicator + transition panel), statuses, cast warnings, enrage, invulnerability, weakened.
// The bar is a crop of a fill strip — the art is never stretched; every image keeps its aspect ratio.

const DIR = 'assets/ui/boss/';
export const BOSS_UI_FILES = [
  'hud_frame_blue', 'hud_frame_red', 'hud_fill_green', 'hud_fill_blue', 'hud_fill_purple', 'hud_fill_red',
  'boss_badge', 'legendary_badge', 'boss_warning_icon', 'phase_indicator', 'phase_change_panel', 'skill_warning_panel', 'warning_panel_small',
  'status_icon_atkUp', 'status_icon_defDown', 'status_icon_shield', 'status_icon_poison', 'status_icon_sleep', 'status_icon_burn',
  'status_icon_water', 'status_icon_leech', 'status_icon_confusion', 'element_icon_ice', 'element_icon_electric',
  'party_slot_small', 'party_slot_0', 'portrait_frame',
];
const key = (n: string) => 'bossui-' + n;

/** HP bar interior of each frame (x, y, w, h in source pixels) — from public/assets/ui/boss/manifest.json */
export const HUD_BAR: Record<'blue' | 'red', [number, number, number, number]> = { blue: [231, 83, 407, 25], red: [231, 84, 329, 25] };
export const HUD_SIZE: Record<'blue' | 'red', [number, number]> = { blue: [804, 147], red: [733, 145] };
/** Hexagon centre (portrait) and the baked "Lv." label end, in frame pixels */
const HEX = { x: 84, y: 74, r: 58 };
const LV_X = 640, LV_Y = 46;
/** Phase dots on phase_indicator.png (623×103) */
const PHASE_DOTS = [118, 305, 492];
const PHASE_DOT_Y = 62;

/** [texture key, url] of every boss HUD image (loaded in the background after boot). */
export function bossUiFiles(): [string, string][] {
  return BOSS_UI_FILES.map((n) => [key(n), DIR + n + '.png']);
}

export function bossUiReady(scene: Phaser.Scene): boolean {
  return BOSS_UI_FILES.every((n) => scene.textures.exists(key(n)));
}

const STATUS_ICON: Partial<Record<StatusKind, string>> = {
  atkUp: 'status_icon_atkUp', defDown: 'status_icon_defDown', poison: 'status_icon_poison', badPoison: 'status_icon_poison', sleep: 'status_icon_sleep',
  burn: 'status_icon_burn', confusion: 'status_icon_confusion', leech: 'status_icon_leech', slow: 'status_icon_water',
  freeze: 'element_icon_ice', paralysis: 'element_icon_electric', stun: 'element_icon_electric',
};

export interface BossHudExtra {
  /** e.g. capture throws left while weakened */
  note?: string;
}

/** HP colour per phase kind: green (normal) → purple (Mega) / blue (stance) → red (enraged). */
function fillOf(kind: string): string {
  return kind === 'enrage' ? 'hud_fill_red' : kind === 'mega' ? 'hud_fill_purple' : kind === 'stance' ? 'hud_fill_blue' : 'hud_fill_green';
}

export class BossHUDController {
  private root: Phaser.GameObjects.Container;
  private frame!: Phaser.GameObjects.Image;
  private trail!: Phaser.GameObjects.Image;
  private fill!: Phaser.GameObjects.Image;
  private portrait: Phaser.GameObjects.Image | null = null;
  private portraitKey = '';
  private name!: Phaser.GameObjects.Text;
  private level!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private legendBadge!: Phaser.GameObjects.Image;
  private phaseImg!: Phaser.GameObjects.Image;
  private phaseG!: Phaser.GameObjects.Graphics;
  private statusIcons: Phaser.GameObjects.Image[] = [];
  private note!: Phaser.GameObjects.Text;
  private castPanel!: Phaser.GameObjects.Container;
  private castText!: Phaser.GameObjects.Text;
  private castG!: Phaser.GameObjects.Graphics;
  private enragePanel!: Phaser.GameObjects.Container;
  private phasePanel!: Phaser.GameObjects.Container;
  private phaseTitle!: Phaser.GameObjects.Text;
  private phaseSub!: Phaser.GameObjects.Text;
  private bossId = -1;
  private shownHp = 1;
  private trailHp = 1;
  private trailHold = 0;
  private lastPhase = -1;
  private color: 'blue' | 'red' = 'blue';
  private k = 1;
  readonly ok: boolean;

  constructor(private scene: Phaser.Scene) {
    this.ok = bossUiReady(scene);
    this.root = scene.add.container(0, 0).setDepth(900).setVisible(false).setScrollFactor(0);
    if (!this.ok) return;
    // every object belongs to the scene's display list → destroyed with the scene (no timers of its own)
    this.build();
  }

  private build(): void {
    const s = this.scene;
    this.frame = s.add.image(0, 0, key('hud_frame_blue')).setOrigin(0);
    this.trail = s.add.image(0, 0, key('hud_fill_green')).setOrigin(0).setTintFill(0xfff4c0).setAlpha(0.85);
    this.fill = s.add.image(0, 0, key('hud_fill_green')).setOrigin(0);
    const font = { fontFamily: 'VT323, monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 4 };
    this.name = s.add.text(0, 0, '', { ...font, fontSize: '34px' }).setOrigin(0, 0.5);
    this.level = s.add.text(0, 0, '', { ...font, fontSize: '34px' }).setOrigin(0, 0.5);
    this.hpText = s.add.text(0, 0, '', { ...font, fontSize: '22px', strokeThickness: 3 }).setOrigin(0.5, 0.5);
    this.legendBadge = s.add.image(0, 0, key('legendary_badge')).setOrigin(1, 0).setVisible(false);
    this.phaseImg = s.add.image(0, 0, key('phase_indicator')).setOrigin(0.5, 0);
    this.phaseG = s.add.graphics();
    this.note = s.add.text(0, 0, '', { ...font, fontSize: '26px', color: '#80ff90' }).setOrigin(0.5, 0);
    this.root.add([this.frame, this.trail, this.fill, this.name, this.level, this.hpText, this.legendBadge, this.phaseImg, this.phaseG, this.note]);

    // cast warning (skill name + wind-up countdown)
    const cp = s.add.image(0, 0, key('skill_warning_panel'));
    this.castText = s.add.text(0, -4, '', { ...font, fontSize: '40px', color: '#ffe0e0' }).setOrigin(0.5);
    this.castG = s.add.graphics();
    this.castPanel = s.add.container(0, 0, [cp, this.castG, this.castText]).setDepth(901).setScrollFactor(0).setVisible(false);
    // enrage tag
    const ep = s.add.image(0, 0, key('warning_panel_small'));
    const et = s.add.text(22, -2, 'CUỒNG NỘ', { ...font, fontSize: '30px', color: '#ffd0c0' }).setOrigin(0.5);
    this.enragePanel = s.add.container(0, 0, [ep, et]).setDepth(901).setScrollFactor(0).setVisible(false);
    // phase transition panel
    const pp = s.add.image(0, 0, key('phase_change_panel'));
    this.phaseTitle = s.add.text(30, -14, '', { ...font, fontSize: '34px', color: '#f0d0ff' }).setOrigin(0.5);
    this.phaseSub = s.add.text(30, 20, '', { ...font, fontSize: '20px', color: '#d0c0e0', strokeThickness: 3 }).setOrigin(0.5);
    this.phasePanel = s.add.container(0, 0, [pp, this.phaseTitle, this.phaseSub]).setDepth(902).setScrollFactor(0).setVisible(false);
  }

  /** Lays the HUD out for the current screen size (top centre). */
  private layout(W: number): void {
    const [fw, fh] = HUD_SIZE[this.color];
    this.k = DPR * Math.min(1, (Math.min(W / DPR - 24, 560)) / fw);
    const k = this.k;
    // centred, nudged right of the party list on wide screens (never past the right edge)
    this.root.setPosition(Math.min(W - 12 * DPR - fw * k, (W - fw * k) / 2 + (W / DPR > 1000 ? 40 * DPR : 0)), 8 * DPR).setScale(k);
    this.frame.setTexture(key('hud_frame_' + this.color));
    const [bx, by, bw, bh] = HUD_BAR[this.color];
    this.fill.setPosition(bx, by); this.trail.setPosition(bx, by);
    this.hpText.setPosition(bx + bw / 2, by + bh / 2);
    this.name.setPosition(178, LV_Y);
    this.level.setPosition(LV_X + 4, LV_Y);
    this.legendBadge.setPosition(fw - 40, fh + 4).setScale(0.6);
    this.phaseImg.setPosition(fw / 2 + 30, fh + 2).setScale(0.62);
    this.note.setPosition(fw / 2 + 30, fh + 72);
  }

  update(world: World, extra: BossHudExtra = {}): void {
    if (!this.ok) return;
    const b = world.boss && world.boss.alive && world.boss.boss ? world.boss : null;
    const W = this.scene.scale.width;
    if (!b) {
      this.root.setVisible(false); this.castPanel.setVisible(false); this.enragePanel.setVisible(false);
      this.bossId = -1;
      return;
    }
    const st = b.boss!, pm = st.pm, ph = pm.phase;
    if (b.id !== this.bossId) {
      // new boss: reset the animated values
      this.bossId = b.id;
      this.shownHp = this.trailHp = b.hp / b.maxHp;
      this.lastPhase = pm.index;
      this.phasePanel.setVisible(false);
    }
    const color: 'blue' | 'red' = ph.kind === 'enrage' ? 'red' : 'blue';
    if (color !== this.color || !this.root.visible) { this.color = color; this.layout(W); }
    this.root.setVisible(true);
    const dt = this.scene.game.loop.delta / 1000;

    // HP: fill eases to the real value fast, the light trail waits a moment then drains (damage readability)
    const frac = Math.max(0, Math.min(1, b.hp / b.maxHp));
    this.shownHp += (frac - this.shownHp) * Math.min(1, dt * 12);
    if (frac < this.trailHp - 1e-4) { this.trailHold -= dt; if (this.trailHold <= 0) this.trailHp = Math.max(frac, this.trailHp - dt * 0.35); }
    else { this.trailHp = frac; this.trailHold = 0.45; }
    if (frac > this.trailHp) this.trailHp = frac;
    const [, , bw, bh] = HUD_BAR[this.color];
    const fk = fillOf(ph.kind);
    if (this.fill.texture.key !== key(fk)) { this.fill.setTexture(key(fk)); this.trail.setTexture(key(fk)); }
    this.fill.setCrop(0, 0, Math.round(bw * this.shownHp), bh);
    this.trail.setCrop(0, 0, Math.round(bw * Math.max(this.shownHp, this.trailHp)), bh);
    const now = this.scene.time.now;
    // invulnerable (transition / airborne): the bar shimmers
    this.fill.setAlpha(pm.invulnerable ? 0.55 + Math.sin(now * 0.02) * 0.25 : 1);
    this.hpText.setText(`${Math.ceil(frac * 100)}%`);

    this.name.setText(st.form ? POKEMON.get(st.form)?.name ?? b.name : b.name);
    this.level.setText(String(b.level));
    this.legendBadge.setVisible(LEGENDS.has(b.defId));
    this.syncPortrait(b);

    // phase indicator (3-phase bosses): current dot pulses, phases not reached are dimmed
    const g = this.phaseG;
    g.clear();
    const three = pm.count === 3;
    this.phaseImg.setVisible(three);
    if (three) {
      const sc = this.phaseImg.scaleX, ox = this.phaseImg.x - (623 * sc) / 2, oy = this.phaseImg.y;
      PHASE_DOTS.forEach((dx, i) => {
        const x = ox + dx * sc, y = oy + PHASE_DOT_Y * sc;
        if (i > pm.index) g.fillStyle(0x0a0e1c, 0.72).fillCircle(x, y, 16 * sc + 2);
        if (i === pm.index) g.lineStyle(3, 0xffffff, 0.6 + Math.sin(now * 0.008) * 0.4).strokeCircle(x, y, 22 * sc + Math.sin(now * 0.008) * 2);
      });
    }

    // statuses (+ shield while invulnerable)
    const kinds: string[] = [];
    if (pm.invulnerable || (st.ray?.air ?? 0) > 0.5 || b.shield > 0) kinds.push('status_icon_shield');
    for (const s of b.statuses) { const ic = STATUS_ICON[s.kind]; if (ic && !kinds.includes(ic)) kinds.push(ic); }
    while (this.statusIcons.length < kinds.length) { const im = this.scene.add.image(0, 0, key('status_icon_shield')).setOrigin(0, 0); this.statusIcons.push(im); this.root.add(im); }
    this.statusIcons.forEach((im, i) => {
      if (i >= kinds.length) { im.setVisible(false); return; }
      // under the portrait hexagon, left of the phase indicator
      im.setTexture(key(kinds[i])).setVisible(true).setScale(40 / Math.max(im.width, 1)).setPosition(14 + (i % 4) * 44, HUD_SIZE[this.color][1] + 4 + Math.floor(i / 4) * 44);
    });

    this.note.setText(st.weakened ? `KIỆT SỨC — NÉM BÓNG ĐỂ THU PHỤC!${extra.note ? '  ' + extra.note : ''}` : '');

    // cast warning panel
    const cast = st.cast;
    const remain = cast ? cast.at + cast.windup - world.time : -1;
    if (cast && remain > 0 && pm.canAct) {
      const H = this.scene.scale.height;
      const pk = Math.min(1, (W - 40) / 731) * 0.7;
      this.castPanel.setVisible(true).setPosition(W / 2, Math.min(H * 0.32, 8 + (HUD_SIZE[this.color][1] + 110) * this.k + 60 * pk)).setScale(pk);
      this.castText.setText(cast.name.toUpperCase());
      this.castG.clear().fillStyle(0xff4040, 0.9).fillRect(-250, 34, 500 * Math.max(0, remain / cast.windup), 8);
    } else this.castPanel.setVisible(false);

    // enrage tag next to the frame
    if (ph.kind === 'enrage' && pm.canAct) {
      this.enragePanel.setVisible(true).setScale(this.k * 0.8).setPosition(this.root.x + (HUD_SIZE.red[0] + 70) * this.k, 8 + 70 * this.k).setAlpha(0.75 + Math.sin(now * 0.01) * 0.25);
      if (this.enragePanel.x > W - 40) this.enragePanel.setPosition(W - 100 * this.k, 8 + (HUD_SIZE.red[1] + 40) * this.k);
    } else this.enragePanel.setVisible(false);

    // phase transition panel (once per phase)
    if (pm.index !== this.lastPhase && pm.state !== 'ACTIVE') this.showPhasePanel(ph.name, ph.banner);
    this.lastPhase = pm.index;
  }

  /** Screen y below the HUD (0 when no boss): banners and popups go under it. */
  bottom(): number {
    if (!this.ok || !this.root.visible) return 0;
    return this.root.y + (HUD_SIZE[this.color][1] + 110) * this.k;
  }

  private showPhasePanel(title: string, sub: string): void {
    const W = this.scene.scale.width, H = this.scene.scale.height;
    const pk = Math.min(1.2, (W - 40) / 370);
    this.phaseTitle.setText(title);
    this.phaseSub.setText(sub);
    this.phasePanel.setVisible(true).setPosition(W / 2, H * 0.36).setScale(pk * 0.6).setAlpha(0);
    this.scene.tweens.killTweensOf(this.phasePanel);
    this.scene.tweens.add({ targets: this.phasePanel, alpha: 1, scale: pk, duration: 260, ease: 'Back.out' });
    this.scene.tweens.add({ targets: this.phasePanel, alpha: 0, delay: 2300, duration: 400, onComplete: () => this.phasePanel.setVisible(false) });
  }

  private syncPortrait(b: Unit): void {
    const sp = b.boss!.form ?? b.boss!.def.sprite;
    const front = 'front-' + sp;
    const tex = this.scene.textures.exists(front) ? front : this.scene.textures.exists(sp + '_sheet') ? sp + '_sheet' : sp;
    if (tex === this.portraitKey && this.portrait) return;
    this.portraitKey = tex;
    this.portrait?.destroy();
    if (!this.scene.textures.exists(tex)) { this.portrait = null; return; }
    const im = this.scene.add.image(HEX.x, HEX.y, tex, tex.endsWith('_sheet') ? 0 : undefined);
    im.setScale((HEX.r * 1.7) / Math.max(im.width, im.height));
    this.root.addAt(im, 1);
    this.portrait = im;
  }

  destroy(): void {
    this.root.destroy(true);
    this.castPanel?.destroy(true);
    this.enragePanel?.destroy(true);
    this.phasePanel?.destroy(true);
  }
}
