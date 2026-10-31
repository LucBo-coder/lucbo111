import Phaser from 'phaser';
import type { StatusKind } from '../core/types';
import type { AdventureScene } from '../scenes/AdventureScene';
import { audio } from '../systems/audio';
import { itemIconKey } from '../render/spriteRegistry';
import { createGroundSprite } from '../render/groundSprite';
import { FIELD, switchCooldown, switchTimes } from '../core/fieldRules';

// Summon / Recall / Switch of party Pokémon (separate from the capture system — capture never goes through here).
//
//   Summon : Poké Ball thrown from the trainer → lands → opens → white flash → light → the Pokémon materialises.
//   Recall : red beam from the trainer → the Pokémon shrinks into it → stored with its current HP / status
//            (recalling never heals).
//   Switch : recall one, then summon another — one action at a time.
//
// No race conditions: every action takes the per-Pokémon lock AND the global lock for its whole animation; the
// unit is removed from the world at the START of a recall and added only at the END of a summon, so it can never be
// hit / act / be recalled twice mid-animation. A short cooldown follows each action. All tweens and sprites belong
// to the scene, so a scene shutdown mid-animation leaves nothing behind (and `busy` is reset on shutdown).

// Timings and cooldowns come from data/field-rules.json (core/fieldRules.ts): quick outside combat, a 0.6 s switch
// and a 6 s cooldown in combat. Switching never heals, never clears statuses and never resets skill cooldowns
// (World keeps them running while the Pokémon waits in its ball).
export const SWITCH_COOLDOWN = FIELD.calmCooldown;
export const SUMMON_TIME = FIELD.calmSummonTime;
export const RECALL_TIME = FIELD.calmRecallTime;

export type SummonResult = 'ok' | 'busy' | 'cooldown' | 'invalid' | 'fainted' | 'last';

/** Statuses worth keeping in the ball (buffs / short combat effects are dropped). */
const KEEP: StatusKind[] = ['burn', 'poison', 'badPoison', 'paralysis', 'sleep', 'freeze', 'confusion'];

export class PokemonSummonManager {
  private busy = false;
  private locked = new Set<string>();
  private cooldownUntil = 0;

  constructor(private scene: AdventureScene) {
    scene.events.once('shutdown', () => { this.busy = false; this.locked.clear(); });
  }

  private get adv() { return this.scene.state.adv; }
  private now(): number { return this.scene.time.now / 1000; }

  isRecalled(uid: string): boolean { return this.adv.recalled.includes(uid); }
  isBusy(): boolean { return this.busy; }
  cooldownLeft(): number { return Math.max(0, this.cooldownUntil - this.now()); }

  /** Timings of the action starting now (shorter in combat). */
  private times = switchTimes(false);

  private check(uid: string): SummonResult {
    if (!this.adv.party.includes(uid)) return 'invalid';
    if (this.busy || this.locked.has(uid)) return 'busy';
    // the Pokémon on the field fainted (or none is out): the next one may come out at once
    if (this.now() < this.cooldownUntil && !this.fieldDown()) return 'cooldown';
    return 'ok';
  }

  /** The active one fainted (still on the field or just put back in its ball): a recall by choice does not count. */
  private fieldDown(): boolean {
    return this.scene.awaitingReplacement || this.scene.world.allies.some((a) => a.ownerUid && a.fainted);
  }

  /**
   * Slot n (0-based) of the party. Tapping the active Pokémon recalls it; tapping another one switches
   * (recall + summon) so a trainer can never have two Pokémon outside their balls.
   */
  toggleSlot(n: number): SummonResult {
    const uid = this.adv.party[n];
    if (!uid) return 'invalid';
    const out = this.scene.world.allies.find((a) => a.ownerUid === uid);
    const r = out ? this.recall(uid, { allowEmpty: true }) : this.summon(uid);
    this.feedback(r);
    return r;
  }

  private feedback(r: SummonResult): void {
    const msg: Partial<Record<SummonResult, string>> = {
      busy: 'Đang đổi Pokémon...', cooldown: `Chờ ${this.cooldownLeft().toFixed(1)}s`, fainted: 'Pokémon này đã kiệt sức — hồi phục ở trạm / Y tá',
      last: 'Cần ít nhất 1 Pokémon trên sân',
    };
    if (msg[r]) this.scene.ui?.banner(msg[r]!, '#ffb0a0');
  }

  /**
   * Recall. `then` (switch): the global lock is kept through to the follow-up action, so nothing can slip in
   * between the recall and the summon of a switch.
   */
  recall(uid: string, opts: { allowEmpty?: boolean; then?: () => void } = {}): SummonResult {
    const c = this.check(uid);
    if (c !== 'ok') return c;
    const u = this.scene.world.allies.find((a) => a.ownerUid === uid);
    if (!u) return 'invalid';
    // Adventure Mode permits an empty field: recalling the last Pokémon is valid.
    void opts.allowEmpty;
    const p = this.scene.state.owned(uid)!;
    this.times = switchTimes(this.scene.inCombat());
    // store exactly what it has now — no healing in the ball
    p.hpFrac = u.fainted ? 0 : Math.max(0.01, u.hp / u.maxHp);
    const st = u.statuses.find((x) => KEEP.includes(x.kind));
    p.status = st ? { kind: st.kind, t: Math.max(0.5, st.t) } : undefined;
    this.busy = true; this.locked.add(uid);
    const x = u.x, y = u.y, key = u.shiny ? u.defId + '~shiny' : u.defId;
    const visual = this.scene.renderer_.views.get(u.id)?.body;
    this.scene.world.removePokemon(u);
    if (!this.adv.recalled.includes(uid)) this.adv.recalled.push(uid);
    if (this.adv.activeUid === uid) this.adv.activeUid = null;
    this.animateRecall(x, y, key, () => {
      if (opts.then) { this.locked.delete(uid); opts.then(); return; }
      this.done(uid);
    }, visual);
    return 'ok';
  }

  summon(uid: string, at?: { x: number; y: number }, force = false): SummonResult {
    const c = force ? 'ok' : this.check(uid);
    if (c !== 'ok') return c;
    // Single active rule: summoning someone else while a partner is out is a switch.
    const other = this.scene.world.allies.find((a) => !!a.ownerUid && a.ownerUid !== uid);
    if (!force && !at && other?.ownerUid) return this.switchTo(other.ownerUid, uid);
    if (!this.isRecalled(uid)) return 'invalid';
    const p = this.scene.state.owned(uid);
    if (!p) return 'invalid';
    if ((p.hpFrac ?? 1) <= 0) return 'fainted';
    if (!force) this.times = switchTimes(this.scene.inCombat());
    this.busy = true; this.locked.add(uid);
    const t = this.scene.world.trainer;
    const tx = at?.x ?? t.x + t.facing * 70, ty = at?.y ?? t.y + 18;
    this.animateSummon(t.x, t.y - 20, tx, ty, p.ball ?? 'pokeball', p.shiny ? p.species + '~shiny' : p.species, () => {
      // The active Pokémon becomes authoritative only when the materialise animation finishes;
      // every other party member is explicitly in its ball.
      this.adv.activeUid = uid;
      this.adv.recalled = this.adv.party.filter((u) => u !== uid);
      this.scene.applyParty();
      const u = this.scene.world.allies.find((a) => a.ownerUid === uid);
      if (u) {
        u.x = tx; u.y = ty;
        if (p.status) this.scene.world.applyStatus(u, { kind: p.status.kind as StatusKind, chance: 1, duration: p.status.t, magnitude: 0.5 }, null);
      }
      p.status = undefined;
      this.done(uid);
    });
    return 'ok';
  }

  /** Switch: recall `outUid`, then summon `inUid` where it stood — one locked action. */
  switchTo(outUid: string, inUid: string): SummonResult {
    if (!this.isRecalled(inUid) || this.locked.has(inUid)) return this.busy ? 'busy' : 'invalid';
    const p = this.scene.state.owned(inUid);
    if (!p || (p.hpFrac ?? 1) <= 0) return 'fainted';
    const out = this.scene.world.allies.find((a) => a.ownerUid === outUid);
    if (!out) return 'invalid';
    const at = { x: out.x, y: out.y };
    return this.recall(outUid, { allowEmpty: true, then: () => { if (this.summon(inUid, at, true) !== 'ok') this.done(inUid); } });
  }

  /** Heals the Pokémon kept in their balls (waypoints, nurse). */
  healRecalled(): void {
    for (const uid of this.adv.recalled) { const p = this.scene.state.owned(uid); if (p) { p.hpFrac = 1; p.status = undefined; } }
  }

  /** Rebuilds the single-active invariant (after loading, party edits or box transfers). */
  sanitize(): void {
    const active = this.adv.activeUid && this.adv.party.includes(this.adv.activeUid) ? this.adv.activeUid : null;
    this.adv.activeUid = active;
    // Every party member except the one outside its ball is recalled; the active one never is.
    this.adv.recalled = this.adv.party.filter((u) => u !== active);
  }

  private done(uid: string): void {
    this.locked.delete(uid);
    this.busy = false;
    this.cooldownUntil = this.now() + switchCooldown(this.scene.inCombat());
    this.scene.persist();
  }

  /** Cooldown length that will follow the next action (HUD). */
  nextCooldown(): number { return switchCooldown(this.scene.inCombat()); }

  // ───────────────────────────── animations (scene-owned objects only) ─────────────────────────────

  private animateSummon(sx: number, sy: number, tx: number, ty: number, ball: string, species: string, onDone: () => void): void {
    const s = this.scene;
    const art = itemIconKey(s, ball);
    const b = s.add.image(sx, sy, art).setDepth(9200).setScale(art.startsWith('oitem-') ? 1.6 : 2.4);
    audio.play('whip');
    const dist = Math.hypot(tx - sx, ty - sy);
    s.tweens.addCounter({
      from: 0, to: 1, duration: Math.min(320, this.times.summon * 1000 * 0.55),
      onUpdate: (tw) => { const k = tw.getValue() ?? 0; b.setPosition(sx + (tx - sx) * k, sy + (ty - sy) * k - Math.sin(k * Math.PI) * (50 + dist * 0.2)).setAngle(k * 540); },
      onComplete: () => {
        // open: pop + white flash + light column
        s.tweens.add({ targets: b, scale: b.scale * 1.5, alpha: 0, duration: 140, onComplete: () => b.destroy() });
        s.renderer_.vfx.flash(tx, ty, 46, 0xffffff, 220);
        s.renderer_.vfx.ring(tx, ty, 60, 0xffffff, 300);
        audio.play('shield');
        const g = s.add.rectangle(tx, ty - 40, 26, 110, 0xffffff, 0.75).setDepth(ty + 60).setBlendMode(Phaser.BlendModes.ADD);
        s.tweens.add({ targets: g, scaleX: 0.1, alpha: 0, duration: 380, onComplete: () => g.destroy() });
        // materialise: white silhouette growing into the Pokémon
        const sil = createGroundSprite(s, species, tx, ty).setTintFill(0xffffff);
        const full = sil.scaleX;
        sil.setScale(0.1);
        if (sil) s.tweens.add({ targets: sil, scale: full, duration: 260, ease: 'Back.out', onComplete: () => s.tweens.add({ targets: sil, alpha: 0, duration: 120, onComplete: () => sil.destroy() }) });
        s.time.delayedCall(Math.max(0, this.times.summon * 1000 - Math.min(320, this.times.summon * 1000 * 0.55)), onDone);
      },
    });
  }

  private animateRecall(x: number, y: number, species: string, onDone: () => void, source?: Phaser.GameObjects.Sprite): void {
    const s = this.scene;
    const t = s.world.trainer;
    const beam = s.add.graphics().setDepth(9100);
    const sil = source
      ? s.add.sprite(source.x, source.y, source.texture.key, source.frame.name).setOrigin(source.originX, source.originY).setScale(source.scaleX, source.scaleY).setDepth(y)
      : createGroundSprite(s, species, x, y);
    sil.setTintFill(0xff4040);
    const fullX = sil.scaleX, fullY = sil.scaleY, startX = sil.x, startY = sil.y;
    audio.play('zap');
    s.tweens.addCounter({
      from: 0, to: 1, duration: this.times.recall * 1000,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        beam.clear().lineStyle(6 * (1 - k * 0.6), 0xff3030, 0.85).lineBetween(t.x, t.y - 20, x, y).lineStyle(2, 0xffffff, 0.9).lineBetween(t.x, t.y - 20, x, y);
        // Deliberate beam motion is visual only; the unit's ground position is untouched.
        sil.setScale(fullX * (1 - k), fullY * (1 - k)).setPosition(startX + (t.x - startX) * k * 0.3, startY + (t.y - 20 - startY) * k * 0.3);
      },
      onComplete: () => { beam.destroy(); sil?.destroy(); onDone(); },
    });
  }
}
