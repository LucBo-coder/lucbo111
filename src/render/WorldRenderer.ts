import Phaser from 'phaser';
import { PmdAnim, pmdAnimKey, pmdDir, pmdHas, pmdReady, pumpPmd } from './pmdPack';
import { groundPose, pmdFootAnchor, visualProfile } from './overworldVisual';
import { createGroundSprite } from './groundSprite';
import { SKILLS } from '../core/data';
import { avatarTextureKey } from '../core/avatars';
import type { Unit, World, WorldEvent } from '../core/world';
import { audio } from '../systems/audio';
import { FONT } from '../scenes/ui';
import { AnimName, creatureFootAnchor, sheetKey } from './animation';
import { TYPE_PROJECTILE_TEX } from './pixelArt';
import { moveAssets } from './moveAssets';
import { shinyKey } from './lazyCreatures';
import { fieldScale, officialPack } from './spriteRegistry';
import { Quality, VfxLibrary } from './vfx';

// Shared world renderer used by Survivor and Adventure modes: unit sprites with derived-frame
// animations, projectiles, telegraphs/fields, HP bars, damage numbers and VFX.

export const SCALE = 3;
const DMG_POOL = 90;

export interface UnitView {
  body: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image | null;
  segs: Phaser.GameObjects.Image[];
  stamp: number;
  anim: string;
  faintT: number;
  deco: Phaser.GameObjects.Image | null;
  /** Status icons shown above the unit (max 2, pooled per view) */
  sicons: Phaser.GameObjects.Image[];
  /** PMD pack: facing direction row 0..7, time since the last turn, moving state with hysteresis */
  pdir?: number;
  pturn?: number;
  pmove?: boolean;
  pstill?: number;
  /** smoothed velocity for the PMD facing */
  svx?: number;
  svy?: number;
}

/** Floating feedback for status events (pixel font, short). */
const STATUS_TEXT: Record<string, [string, string]> = {
  burn: ['Bỏng!', '#ff9050'], poison: ['Trúng độc!', '#d080ff'], badPoison: ['Kịch độc!', '#b040e0'], paralysis: ['Tê liệt!', '#ffe040'],
  sleep: ['Ngủ...', '#c8d8ff'], freeze: ['Đóng băng!', '#a0e8ff'], confusion: ['Rối loạn!', '#e0a0ff'], flinch: ['Khựng!', '#ff8080'],
  slow: ['Chậm lại', '#90b0ff'], stun: ['Choáng!', '#ffe060'], leech: ['Hút máu', '#80e070'], taunt: ['Khiêu khích', '#ff7070'],
  miss: ['Trượt!', '#c0c0d0'], fullPara: ['Tê cứng!', '#ffe040'], selfHit: ['Tự đánh mình!', '#e0a0ff'], wake: ['Tỉnh giấc!', '#ffffff'],
  thaw: ['Tan băng!', '#ffb070'], immune: ['Miễn nhiễm', '#a0a0b0'],
};

export interface RendererHooks {
  banner(text: string, color: string): void;
  /** Extra per-unit decoration (wild state icons, selection ring). Called after the unit sync. */
  decorate?(u: Unit, v: UnitView): void;
  /** Whether a unit should be drawn (adventure hides units in unloaded chunks) */
  visible?(u: Unit): boolean;
}

interface DmgText {
  t: Phaser.GameObjects.Text;
  life: number;
  vy: number;
}

const MELEE_KINDS = new Set(['melee', 'dash']);

/** Animation a unit is showing right now (also relayed for the remote player's lead in the shared world). */
export function unitAnim(u: Unit, moving: boolean): AnimName {
  if (u.fainted) return 'faint';
  if (u.hitFlash > 0.04 && u.kind !== 'boss') return 'hit';
  const melee = MELEE_KINDS.has(SKILLS.get(u.lastSkill)?.kind ?? '');
  if (u.dash) return 'attack';
  if (u.castSlot >= 0 || u.animCast > 0) return melee ? 'attack' : 'cast';
  return moving ? 'walk' : 'idle';
}

export class WorldRenderer {
  readonly views = new Map<number, UnitView>();
  readonly vfx: VfxLibrary;
  private projImgs: (Phaser.GameObjects.Image | null)[] = [];
  private gemImgs: (Phaser.GameObjects.Image | null)[] = [];
  private zoneG: Phaser.GameObjects.Graphics;
  private barG: Phaser.GameObjects.Graphics;
  private dmgFree: Phaser.GameObjects.Text[] = [];
  private dmgActive: DmgText[] = [];
  private frameNo = 0;
  private ghosts = 0;
  private debugG: Phaser.GameObjects.Graphics;
  private debugLabels: Phaser.GameObjects.Text[] = [];
  private debugCount = 0;
  debugVisuals = false;
  private toggleVisuals = () => { this.debugVisuals = !this.debugVisuals; };

  constructor(private scene: Phaser.Scene, public world: World, private hooks: RendererHooks, quality: Quality = 'high') {
    this.vfx = new VfxLibrary(scene, quality);
    this.zoneG = scene.add.graphics().setDepth(1);
    this.barG = scene.add.graphics().setDepth(9000);
    this.debugG = scene.add.graphics().setDepth(9900);
    this.debugVisuals = new URLSearchParams(location.search).has('visualDebug');
    scene.input.keyboard?.on('keydown-F8', this.toggleVisuals);
    for (let i = 0; i < DMG_POOL; i++) {
      this.dmgFree.push(scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '22px', color: '#fff', stroke: '#000', strokeThickness: 4 })
        .setOrigin(0.5).setDepth(9500).setVisible(false));
    }
  }

  setQuality(q: Quality): void {
    this.vfx.setQuality(q);
  }

  private drawVisualDebug(u: Unit, v: UnitView, flight: number): void {
    const g = this.debugG;
    // Actual combat circle, not an inferred sprite rectangle.
    g.lineStyle(1, 0xff6060).strokeCircle(u.x, u.y, u.radius);
    g.lineStyle(2, 0xffff00).strokeCircle(v.shadow.x, v.shadow.y, 6);
    g.lineStyle(2, 0x00ffff).lineBetween(u.x - 5, u.y, u.x + 5, u.y).lineBetween(u.x, u.y - 5, u.x, u.y + 5);
    g.lineStyle(1, 0xff80ff).lineBetween(u.x, u.y, v.body.x, v.body.y).strokeCircle(v.body.x, v.body.y, 3);
    let label = this.debugLabels[this.debugCount];
    if (!label) this.debugLabels[this.debugCount] = label = this.scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', backgroundColor: '#151922cc',
    }).setDepth(9901);
    this.debugCount++;
    label.setVisible(true).setPosition(u.x + 10, u.y + 10).setText(
      `${u.defId} H:${flight.toFixed(1)} offset:${(v.body.x-u.x).toFixed(1)},${(v.body.y-u.y).toFixed(1)}\n` +
      `origin:${v.body.displayOriginX.toFixed(1)},${v.body.displayOriginY.toFixed(1)} depth:${v.body.depth.toFixed(0)}`);
  }

  trainerSprite(): Phaser.GameObjects.Sprite {
    this.syncUnit(this.world.trainer);
    return this.views.get(this.world.trainer.id)!.body;
  }

  // ───────────────────────────── per frame ─────────────────────────────

  render(delta: number): void {
    this.frameNo++;
    pumpPmd(this.scene); // PMD animation sheets of newly seen species, a few at a time
    const w = this.world;
    const view = this.scene.cameras.main.worldView;
    const margin = 120;
    const onScreen = (x: number, y: number) => x > view.x - margin && x < view.right + margin && y > view.y - margin && y < view.bottom + margin;

    this.barG.clear();
    this.debugG.clear();
    this.debugCount = 0;
    this.debugLabels.forEach(t => t.setVisible(false));
    this.syncUnit(w.trainer);
    for (const a of w.allies) this.syncUnit(a);
    // PvP duel: the other player's trainer and Pokémon on the field (the bench is not drawn)
    if (w.rival) { this.syncUnit(w.rival.trainer); for (const a of w.rival.allies) this.syncUnit(a); }
    if (w.companion) { this.syncUnit(w.companion.trainer); for (const a of w.companion.allies) this.syncUnit(a); }
    for (const e of w.enemies) {
      const show = !e.captured && (e.kind === 'boss' || onScreen(e.x, e.y)) && (this.hooks.visible?.(e) ?? true);
      if (show) this.syncUnit(e);
      else {
        const v = this.views.get(e.id);
        if (v) { v.body.setVisible(false); v.shadow.setVisible(false); v.deco?.setVisible(false); v.ring?.setVisible(false); v.sicons.forEach((i) => i.setVisible(false)); v.stamp = this.frameNo; }
      }
    }
    for (const [id, v] of this.views) {
      if (v.stamp !== this.frameNo) {
        v.body.destroy(); v.shadow.destroy(); v.ring?.destroy(); v.deco?.destroy(); v.segs.forEach((s) => s.destroy()); v.sicons.forEach((i) => i.destroy());
        this.views.delete(id);
      }
    }

    const projs = w.projectiles;
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      let img = this.projImgs[i];
      if (!p.active) { if (img?.visible) img.setVisible(false); continue; }
      const sk = p.skill!;
      const tex = moveAssets(sk).projectile ?? TYPE_PROJECTILE_TEX[sk.type] ?? 'p_spark';
      if (!img) { img = this.scene.add.image(0, 0, tex).setScale(2.6).setDepth(7000); this.projImgs[i] = img; }
      if (img.texture.key !== tex) img.setTexture(tex);
      img.setVisible(true).setPosition(p.x, p.y);
      img.rotation = tex === 'p_leaf' || tex === 'p_star' ? img.rotation + delta * 0.03 : Math.atan2(p.vy, p.vx);
      if (this.frameNo % 3 === i % 3) this.vfx.trail(sk.type, p.x, p.y);
    }

    if (w.mode === 'survivor') {
      const gems = w.gems;
      const bob = Math.sin(this.scene.time.now * 0.006);
      for (let i = 0; i < gems.length; i++) {
        const g = gems[i];
        let img = this.gemImgs[i];
        if (!g.active || !onScreen(g.x, g.y)) { if (img?.visible) img.setVisible(false); continue; }
        const tex = g.kind === 'berry' ? 'icon_berry' : g.value >= 25 ? 'gem_huge' : g.value >= 6 ? 'gem_big' : 'gem';
        if (!img) { img = this.scene.add.image(0, 0, tex).setScale(2.4); this.gemImgs[i] = img; }
        if (img.texture.key !== tex) img.setTexture(tex);
        img.setVisible(true).setPosition(g.x, g.y + bob * 2).setDepth(g.y - 20);
      }
    }
    this.drawZones();
    this.updateTexts(delta);
  }

  syncUnit(u: Unit): UnitView {
    let v = this.views.get(u.id);
    const isBoss = u.kind === 'boss';
    const bdef = u.boss?.def;
    // the hand-drawn segmented Onix is only used without the official sprite pack
    const segmented = isBoss && bdef!.sprite === 'onix' && !officialPack.active;
    // Player trainers wear the avatar chosen in the device profile; NPC trainers keep the generic sprite.
    const avatarKey = !isBoss && u.kind === 'trainer' && u.avatar ? avatarTextureKey(u.avatar) : '';
    const avatarSheet = avatarKey ? sheetKey(avatarKey) : '';
    // a boss in an alternate form (Mega Rayquaza) is drawn as that species
    const key = isBoss ? (segmented ? 'onix_head' : u.boss!.form ?? bdef!.sprite)
      : avatarSheet && this.scene.textures.exists(avatarSheet) ? avatarKey
      : u.shiny ? shinyKey(u.defId) : u.defId;
    // PMD animation pack (personal): real 8-direction animations once the species' sheets are loaded
    const species = isBoss ? u.boss!.form ?? bdef!.sprite : u.defId;
    const pmdOn = !segmented && pmdReady(species, !!u.shiny);
    const profile = visualProfile(species, pmdOn, fieldScale(key));
    const size = isBoss ? Math.min(1.5, (bdef!.scale ?? 5.5) / 3) : u.alpha ? 1.7 : u.elite ? 1.35 : 1;
    const base = profile.visualScale * size;
    if (!v) {
      const shadow = this.scene.add.image(u.x, u.y, 'shadow').setScale(base * 0.9, base * 0.9);
      if (u.elite) shadow.setTint(0xffd040).setAlpha(1);
      const sheet = sheetKey(key);
      const body = this.scene.add.sprite(u.x, u.y, this.scene.textures.exists(sheet) ? sheet : key, 0).setScale(base);
      const segs: Phaser.GameObjects.Image[] = [];
      if (segmented) for (let i = 0; i < u.boss!.def.segments; i++) segs.push(this.scene.add.image(u.x, u.y, 'onix_seg').setScale(4.4 - i * 0.35));
      v = { body, shadow, ring: null, segs, stamp: 0, anim: '', faintT: 0, deco: null, sicons: [] };
      this.views.set(u.id, v);
    }
    // Species changed in place (evolution / Mega): swap the sprite sheet
    if (!pmdOn && (!isBoss || u.boss!.form) && v.body.texture.key !== sheetKey(key) && this.scene.textures.exists(sheetKey(key))) {
      v.body.setTexture(sheetKey(key), 0);
      v.anim = '';
    }
    v.stamp = this.frameNo;
    const now = this.scene.time.now;
    const moving = Math.abs(u.vx) + Math.abs(u.vy) > 12;

    // Animation state machine (only (re)plays when the state changes)
    const anim = unitAnim(u, moving);
    if (pmdOn) {
      // Stable state: the AI's velocity jitters every frame, which used to restart the animation ~10×/s.
      // Moving ↔ standing and the facing row both have hysteresis, and a turn keeps the frame in progress.
      const dt = this.scene.game.loop.delta;
      // smoothed velocity (~0.3 s): back-and-forth jitter of the AI cancels out instead of flipping the sprite
      const k = Math.min(1, dt / 300);
      v.svx = (v.svx ?? u.vx) + (u.vx - (v.svx ?? u.vx)) * k;
      v.svy = (v.svy ?? u.vy) + (u.vy - (v.svy ?? u.vy)) * k;
      const speed = Math.abs(v.svx) + Math.abs(v.svy);
      if (speed > 24) { v.pmove = true; v.pstill = 0; }
      else if (speed < 8) { v.pstill = (v.pstill ?? 0) + dt; if (v.pstill > 180) v.pmove = false; }
      const tg = u.target && u.target.alive ? u.target : null;
      // standing: face the target only when it is not right on top of us (jitter next to it flips the angle)
      const far = tg && Math.hypot(tg.x - u.x, tg.y - u.y) > u.radius * 2 + 30;
      const walking = !!v.pmove && speed > 8;
      const aim = walking ? [v.svx, v.svy] : far ? [tg!.x - u.x, tg!.y - u.y] : null;
      v.pturn = (v.pturn ?? 0) + dt;
      if (v.pdir == null) v.pdir = aim ? pmdDir(aim[0], aim[1]) : u.facing < 0 ? 6 : 2;
      else if (aim && v.pturn > (walking ? 200 : 600)) {
        // turn only when the heading is well inside another sector (> 30° from the current row's centre)
        const a = Math.atan2(aim[1], aim[0]) * 180 / Math.PI, cur = 90 - v.pdir * 45;
        const diff = Math.abs(((a - cur + 540) % 360) - 180);
        if (diff > 30) { v.pdir = pmdDir(aim[0], aim[1]); v.pturn = 0; }
      }
      const st = anim === 'walk' || anim === 'idle' ? (v.pmove ? 'walk' : 'idle') : anim;
      const want: PmdAnim = st === 'faint' ? 'Faint' : st === 'hit' ? 'Hurt' : st === 'attack' ? 'Attack' : st === 'cast' ? 'Shoot' : st === 'walk' ? 'Walk' : 'Idle';
      const use: PmdAnim = pmdHas(species, want) ? want : want === 'Shoot' && pmdHas(species, 'Attack') ? 'Attack' : want === 'Walk' ? 'Walk' : 'Idle';
      const requested = pmdAnimKey(species, !!u.shiny, use, v.pdir);
      const ak = this.scene.anims.exists(requested) ? requested : pmdAnimKey(species, !!u.shiny, 'Idle', v.pdir);
      const busy = v.anim.startsWith(`pmd:${species}:`) && v.body.anims.isPlaying && /:(Attack|Shoot|Hurt):/.test(v.anim);
      // one-shot actions (attack, shoot, hurt) play to the end unless the Pokémon faints
      if (v.anim !== ak && this.scene.anims.exists(ak) && (!busy || use === 'Faint')) {
        // same animation, new direction → keep the frame in progress instead of restarting the cycle
        const sameAnim = v.anim.slice(0, v.anim.lastIndexOf(':')) === ak.slice(0, ak.lastIndexOf(':'));
        const at = sameAnim ? v.body.anims.currentFrame?.index ?? 0 : 0;
        v.body.play({ key: ak, startFrame: Math.max(0, at - 1) }, true);
        v.anim = ak;
        if (use === 'Faint') v.faintT = 0;
      }
    } else {
      const animKey = `${key}:${anim}`;
      if (v.anim !== animKey && this.scene.anims.exists(animKey)) {
        v.body.play(animKey, true);
        v.anim = animKey;
        if (anim === 'faint') v.faintT = 0;
      }
    }
    // Apply the same ground transform to every state, including faint and texture/form swaps.
    const anchor = pmdOn
      ? pmdFootAnchor(species, Number(v.anim.split(':').pop()) || 0, v.body.frame.realWidth, v.body.frame.realHeight, profile)
      : null;
    const fallbackAnchor = creatureFootAnchor(key);
    if (anchor) v.body.setOrigin(anchor.x / v.body.frame.realWidth, anchor.y / v.body.frame.realHeight);
    else v.body.setOrigin(fallbackAnchor.x, fallbackAnchor.y);
    const air = u.boss?.ray?.air ?? 0;
    const pose = groundPose(u.x, u.y, profile, air * 160);
    v.body.setPosition(pose.x, pose.y).setDepth(pose.depth)
      .setScale(base * (pmdOn ? 1 : u.facing), base);
    v.shadow.setPosition(pose.shadowX, pose.shadowY).setDepth(u.y - 0.1)
      .setScale(profile.shadowScale * size * (1 - air * 0.5)).setAlpha(0.65).clearTint();
    if (u.elite) v.shadow.setTint(0xffd040);
    if (u.fainted) {
      // Faint plays once, holds briefly, then the Pokémon returns to its ball (hidden)
      v.faintT += this.scene.game.loop.delta;
      v.body.setAlpha(Math.max(0, 1 - Math.max(0, v.faintT - 500) / 400));
      v.shadow.setVisible(false); v.ring?.setVisible(false); v.deco?.setVisible(false); v.sicons.forEach((i) => i.setVisible(false));
      v.body.setVisible(v.faintT < 900);
      if (pmdOn && !pmdHas(species, 'Faint')) v.body.anims.stop();
      if (this.debugVisuals) this.drawVisualDebug(u, v, profile.flightHeight + air * 160);
      return v;
    }
    v.faintT = 0;
    v.body.setVisible(true).setAlpha(1);
    v.shadow.setVisible(true);

    // Rayquaza high in the sky (Dragon Ascent / Sky Cataclysm): lifted, faded, only the shadow stays on the ground
    v.body.setAlpha(1 - air * 0.75);
    // PMD sheets already face the right way (8 directions): never mirror them
    if (u.aquatic) {
      // swimming: no ground shadow — a pale ripple around the waterline, the body bobs on the surface
      const k = 1 + Math.sin(now * 0.006 + u.id) * 0.12;
      v.shadow.setTintFill(0xd8f0ff).setAlpha(0.55).setScale(profile.shadowScale * size * k, profile.shadowScale * size * 0.5 * k);
      v.body.setY(pose.y + Math.sin(now * 0.004 + u.id) * 2);
    }
    if (this.debugVisuals) this.drawVisualDebug(u, v, profile.flightHeight + air * 160);

    if (u.hitFlash > 0.08 && !isBoss) v.body.setTintFill(0xffffff);
    else if (u.hitFlash > 0 && isBoss) v.body.setTint(0xffc0c0);
    else if (u.kind === 'trainer' && u.iframes > 0 && Math.floor(now / 60) % 2) v.body.setTint(0xff8080);
    else if (u.statuses.length) {
      const k = u.statuses[0].kind;
      v.body.setTint(k === 'burn' ? 0xffa070 : k === 'slow' ? 0x90c0ff : k === 'leech' || k === 'poison' || k === 'badPoison' ? 0xd090ff : k === 'stun' || k === 'paralysis' ? 0xfff080
        : k === 'freeze' ? 0xa8e8ff : k === 'sleep' ? 0xb0b0d0 : k === 'confusion' ? 0xf0c0ff : k === 'taunt' ? 0xffe0a0 : 0xffffff);
    } else v.body.clearTint();

    if (u.alpha && !isBoss) {
      // Alpha: pulsing red aura ring + red eyes-glow tint flicker
      if (!v.deco) v.deco = this.scene.add.image(u.x, u.y, 'ringTex');
      v.deco.setVisible(true).setPosition(u.x, u.y - 4).setScale((u.radius * 3.6) / 64 * (1 + Math.sin(now * 0.01) * 0.08)).setTint(0xff3020).setAlpha(0.6).setDepth(u.y - 2);
    }
    if (u.shiny && !u.fainted && this.frameNo % 20 === u.id % 20) this.vfx.emit('fairy', u.x + (Math.random() - 0.5) * u.radius * 2, u.y - u.radius, 1);
    if (u.megaFrom && !isBoss) {
      // Mega aura: rainbow-tinted ring pulse
      if (!v.deco) v.deco = this.scene.add.image(u.x, u.y, 'ringTex');
      const hue = (now * 0.0004 + u.id * 0.1) % 1;
      v.deco.setVisible(true).setPosition(u.x, u.y - 4).setScale((u.radius * 3.2) / 64 * (1 + Math.sin(now * 0.008) * 0.06))
        .setTint(Phaser.Display.Color.HSVToRGB(hue, 0.6, 1).color).setAlpha(0.55).setDepth(u.y - 2);
    }
    if (u.boss?.weakened) {
      // weakened legendary: green capture ring — throw a ball now
      if (!v.deco) v.deco = this.scene.add.image(u.x, u.y, 'ringTex');
      v.deco.setVisible(true).setPosition(u.x, u.y - 4).setScale((u.radius * 3.4) / 64 * (1 + Math.sin(now * 0.012) * 0.1)).setTint(0x60ff80).setAlpha(0.7).setDepth(u.y - 2);
      v.body.setAlpha(0.8 + Math.sin(now * 0.01) * 0.2);
    }
    if (u.shield > 0) {
      if (!v.ring) v.ring = this.scene.add.image(u.x, u.y, 'ringTex').setTint(0x80e0ff);
      v.ring.setVisible(true).setPosition(u.x, u.y - 6).setScale((u.radius * 2.6) / 64).setAlpha(0.5 + Math.sin(now * 0.01) * 0.2).setDepth(u.y + 1);
    } else v.ring?.setVisible(false);

    if (isBoss) {
      const trail = u.boss!.trail;
      v.segs.forEach((s, i) => {
        const p = trail[Math.min(trail.length - 1, (i + 1) * 4)];
        s.setPosition(p.x, p.y - 8).setDepth(p.y - 1);
        if (u.hitFlash > 0) s.setTint(0xffc0c0);
        else if (u.boss!.phase === 2) s.setTint(0xffb090);
        else s.clearTint();
      });
      v.body.setDepth(u.y);
    }

    // Status icons (pixel art) above the unit — at most two, most important first
    let shown = 0;
    if (u.statuses.length && !u.fainted) {
      for (const s of u.statuses) {
        if (shown >= 2 || s.kind === 'atkUp' && u.statuses.length > 2) continue;
        let ic = v.sicons[shown];
        const key = 'status-' + s.kind;
        if (!ic) { ic = this.scene.add.image(0, 0, key).setScale(2); v.sicons[shown] = ic; }
        if (ic.texture.key !== key) ic.setTexture(key);
        const top = isBoss ? u.y - u.radius * 2.2 : u.y - u.radius - 30;
        ic.setVisible(true).setPosition(u.x - 10 + shown * 20, top).setDepth(u.y + 50);
        shown++;
      }
    }
    for (let i = shown; i < v.sicons.length; i++) v.sicons[i].setVisible(false);

    const g = this.barG;
    // The visual foot/origin already includes flight height and render offsets.
    // Combat radius is unrelated to the gap between the artwork and its HUD.
    const barX = v.body.x, barY = v.body.y + 5;
    if (u.kind === 'pokemon') {
      const bw = 36, x = barX - bw / 2, y = barY;
      bar(g, x, y, bw, 4, u.hp / u.maxHp, hpColor(u.hp / u.maxHp));
      bar(g, x, y + 5, bw, 2, u.energy / u.maxEnergy, 0x60a0ff);
    } else if (u.kind === 'trainer') {
      bar(g, barX - 20, barY, 40, 4, u.hp / u.maxHp, hpColor(u.hp / u.maxHp));
    } else if (!isBoss && (u.hp < u.maxHp || u.elite || u.hostile)) {
      const bw = u.elite ? 40 : 30;
      bar(g, barX - bw / 2, barY, bw, 3, u.hp / u.maxHp, u.elite ? 0xffb020 : u.hostile ? 0xff4040 : 0xa0a0a0);
    }
    this.hooks.decorate?.(u, v);
    return v;
  }

  private drawZones(): void {
    const g = this.zoneG;
    g.clear();
    const now = this.scene.time.now;
    for (const z of this.world.zones) {
      if (!z.active) continue;
      const hostile = z.team === 'enemy';
      if (!z.fired) {
        if (!hostile && z.delay < 0.1) continue;
        const p = Math.min(1, z.t / Math.max(0.01, z.delay));
        const col = hostile ? 0xff3030 : 0xffb030;
        if (z.safe) {
          // arena-wide blast: tint everything, then cut out the shade circles
          g.fillStyle(0xffe060, 0.08 + 0.14 * p).fillCircle(z.x, z.y, z.r);
          g.lineStyle(3, 0xffe060, 0.8).strokeCircle(z.x, z.y, z.r * p);
          for (const sp of z.safe) {
            g.fillStyle(0x0a3a14, 0.65).fillCircle(sp.x, sp.y, sp.r);
            g.lineStyle(3, 0x60ff80, 0.9 + 0.1 * Math.sin(now * 0.02)).strokeCircle(sp.x, sp.y, sp.r);
          }
          continue;
        }
        if (z.shape === 'circle') {
          g.fillStyle(col, 0.1 + 0.1 * p).fillCircle(z.x, z.y, z.r);
          g.fillStyle(col, 0.28).fillCircle(z.x, z.y, z.r * p);
          g.lineStyle(2, col, 0.6 + 0.4 * Math.sin(now * 0.02)).strokeCircle(z.x, z.y, z.r);
        } else if (z.shape === 'cone') {
          // fan: exact area of the cone hit (range = length, half spread = r), filling up as it charges
          const fan = (len: number) => {
            const pts = [new Phaser.Math.Vector2(z.x, z.y)];
            for (let i = 0; i <= 12; i++) { const a = z.angle - z.r + (i / 12) * z.r * 2; pts.push(new Phaser.Math.Vector2(z.x + Math.cos(a) * len, z.y + Math.sin(a) * len)); }
            return pts;
          };
          g.fillStyle(col, 0.12 + 0.1 * p).fillPoints(fan(z.length), true);
          g.fillStyle(col, 0.26).fillPoints(fan(z.length * p), true);
          g.lineStyle(2, col, 0.8).strokePoints(fan(z.length), true, true);
        } else {
          const c = Math.cos(z.angle), s = Math.sin(z.angle);
          const nx = -s * z.r, ny = c * z.r;
          const ex = z.x + c * z.length, ey = z.y + s * z.length;
          const pts = [
            new Phaser.Math.Vector2(z.x + nx, z.y + ny), new Phaser.Math.Vector2(ex + nx, ey + ny),
            new Phaser.Math.Vector2(ex - nx, ey - ny), new Phaser.Math.Vector2(z.x - nx, z.y - ny),
          ];
          g.fillStyle(col, 0.12 + 0.15 * p).fillPoints(pts, true);
          g.lineStyle(2, col, 0.8).strokePoints(pts, true, true);
          g.fillStyle(col, 0.35).fillCircle(z.x + c * z.length * p, z.y + s * z.length * p, z.r * 0.6);
        }
      } else {
        const type = z.slot.def.type;
        const col = type === 'fire' ? 0xff6020 : type === 'rock' ? 0x9a8060 : type === 'water' ? 0x4090ff : type === 'poison' ? 0xb050d0 : 0x80c060;
        const pulse = 0.22 + Math.sin(now * 0.012 + z.x) * 0.06;
        g.fillStyle(col, pulse).fillCircle(z.x, z.y, z.r);
        g.lineStyle(2, col, 0.7).strokeCircle(z.x, z.y, z.r);
        if (this.frameNo % 4 === 0) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * z.r;
          this.vfx.emit(type, z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, 2);
        }
      }
    }
  }

  // ───────────────────────────── events ─────────────────────────────

  handle(events: WorldEvent[]): void {
    let dmgBudget = 30;
    for (const e of events) {
      switch (e.t) {
        case 'dmg': {
          if (dmgBudget-- <= 0) break;
          const ally = e.victimTeam === 'ally';
          let color = ally ? '#ff6060' : '#ffffff';
          let size = 20;
          let str = `${e.amount}`;
          if (!ally) {
            if (e.eff > 1) { color = '#ffe040'; size = 26; }
            else if (e.eff < 1) { color = '#a0a0b0'; size = 17; }
            if (e.crit) { color = '#ff9020'; size += 6; str += '!'; }
          }
          this.spawnText(e.x + (Math.random() - 0.5) * 16, e.y, str, color, size);
          break;
        }
        case 'heal': this.spawnText(e.x, e.y, `+${e.amount}`, '#70ff80', 20); break;
        case 'status': {
          const st = STATUS_TEXT[e.kind];
          if (st && dmgBudget-- > 0) this.spawnText(e.x, e.y - 14, st[0], st[1], 16);
          if (e.kind === 'thaw') this.vfx.hit('fire', e.x, e.y, 8);
          else if (e.kind === 'freeze') this.vfx.impact('ice', e.x, e.y + 10, 30);
          break;
        }
        case 'vfx': this.vfx.named(e.name, e.x, e.y, e.r, e.angle, e.type, e.len); break;
        case 'combo':
          if (dmgBudget-- > 0) this.spawnText(e.x, e.y - 24, `${e.name}!`, '#ffe040', 22);
          this.vfx.ring(e.x, e.y + 10, 70, 0xffe060, 380);
          break;
        case 'sfx': audio.play(e.name); break;
        case 'death': this.deathFx(e.x, e.y, e.defId, e.elite, e.boss); break;
        case 'faint': this.hooks.banner(`${e.name} kiệt sức!`, '#ff8080'); break;
        case 'revive': this.hooks.banner(`${e.name} đã trở lại!`, '#80ff90'); break;
        case 'levelup': {
          const t = this.world.trainer;
          this.vfx.emit('gold', t.x, t.y, 30);
          this.vfx.ring(t.x, t.y, 120, 0xffe060, 500);
          break;
        }
        case 'banner': this.hooks.banner(e.text, e.color); break;
        case 'shake': this.scene.cameras.main.shake(e.duration, e.intensity); break;
      }
    }
  }

  private deathFx(x: number, y: number, defId: string, elite: boolean, boss: boolean): void {
    if (boss) {
      for (let i = 0; i < 5; i++) this.scene.time.delayedCall(i * 120, () => { this.vfx.flash(x + (Math.random() - 0.5) * 100, y + (Math.random() - 0.5) * 100, 90, 0xffe0a0, 400); this.vfx.emit('rock', x, y, 20); });
      this.vfx.emit('gold', x, y, 60);
      return;
    }
    this.vfx.emit('dust', x, y, elite ? 14 : 6);
    if (elite) this.vfx.emit('gold', x, y, 20);
    if (this.ghosts > 25) return;
    this.ghosts++;
    const g = createGroundSprite(this.scene, defId, x, y);
    g.setScale(g.scaleX * (elite ? 1.35 : 1));
    // PMD corpse stays in its own art family; derived faint is only for derived sheets.
    if (!g.texture.key.startsWith('pmd:') && this.scene.anims.exists(`${defId}:faint`)) g.play(`${defId}:faint`);
    this.scene.tweens.add({ targets: g, alpha: 0, delay: 250, duration: 260, onComplete: () => { g.destroy(); this.ghosts--; } });
  }

  spawnText(x: number, y: number, str: string, color: string, size: number): void {
    const t = this.dmgFree.pop();
    if (!t) return;
    t.setText(str).setColor(color).setFontSize(size).setPosition(x, y).setAlpha(1).setVisible(true).setScale(1.3);
    this.dmgActive.push({ t, life: 0.7, vy: -60 });
  }

  private updateTexts(delta: number): void {
    const dt = delta / 1000;
    for (let i = this.dmgActive.length - 1; i >= 0; i--) {
      const d = this.dmgActive[i];
      d.life -= dt;
      d.t.y += d.vy * dt;
      d.vy *= 0.92;
      d.t.setScale(Math.max(1, d.t.scale - dt * 3));
      if (d.life < 0.25) d.t.setAlpha(d.life / 0.25);
      if (d.life <= 0) {
        d.t.setVisible(false);
        this.dmgFree.push(d.t);
        this.dmgActive.splice(i, 1);
      }
    }
  }

  /** Drops every view (used when swapping World instances, e.g. entering a dungeon). */
  reset(world: World): void {
    for (const v of this.views.values()) { v.body.destroy(); v.shadow.destroy(); v.ring?.destroy(); v.deco?.destroy(); v.segs.forEach((s) => s.destroy()); v.sicons.forEach((i) => i.destroy()); }
    this.views.clear();
    this.projImgs.forEach((p) => p?.destroy());
    this.gemImgs.forEach((p) => p?.destroy());
    this.projImgs = [];
    this.gemImgs = [];
    this.world = world;
  }

  destroy(): void {
    this.reset(this.world);
    this.vfx.destroy();
    this.zoneG.destroy();
    this.barG.destroy();
    this.scene.input.keyboard?.off('keydown-F8', this.toggleVisuals);
    this.debugG.destroy();
    this.debugLabels.forEach(t => t.destroy());
    this.dmgFree.forEach((t) => t.destroy());
    this.dmgActive.forEach((d) => d.t.destroy());
  }
}

export function hpColor(f: number): number {
  return f > 0.5 ? 0x50e060 : f > 0.25 ? 0xf0d030 : 0xf04040;
}

export function bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, frac: number, color: number): void {
  g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(color, 1).fillRect(x, y, Math.max(0, w * Phaser.Math.Clamp(frac, 0, 1)), h);
}
