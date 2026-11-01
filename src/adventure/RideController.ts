import { POKEMON } from '../core/data';
import { bestMount, RIDE_MIN_LEVEL, RIDE_NAME, rideModeFor, rideModesAt, rideSpeed, type RideMode } from '../core/riding';
import type { PartyMember } from '../core/field';
import type { AdventureScene } from '../scenes/AdventureScene';

// Riding party Pokémon on the map (rules: core/riding.ts).
//   Z        — climb on the best mount for this spot (the one picked with Shift+Z first), Z again = climb off
//   Shift+Z  — next mount in the party (remembered)
// At the water's edge the trainer changes mounts by itself: a runner pushing into the water → the party's best
// swimmer; a swimmer pushing onto land → the best runner (or just steps ashore). Flyers go everywhere.
// The ridden Pokémon goes back to its ball if it was the one out, and comes back out when the trainer climbs off.
// Not in dungeons, on the river boat, while downed, or in a fight (a fight on land makes the trainer climb off).

const FOLLOW_SNAP = 360;

export class RideController {
  /** uid of the Pokémon that was out and went into its ball to be ridden */
  private recalledUid: string | null = null;
  private swapT = 0;

  constructor(private scene: AdventureScene) {}

  private get world() { return this.scene.world; }
  private get adv() { return this.scene.state.adv; }

  get riding(): boolean { return !!this.world.ride; }

  /** Party members that can carry the trainer somewhere at their level. */
  private mounts(): PartyMember[] {
    return this.scene.partyMembers().filter((m) => rideModesAt(m.species, m.level).length > 0);
  }

  private onWater(x: number, y: number): boolean {
    return !!this.world.terrain?.isWater?.(x, y);
  }

  /** Why the trainer can't ride now (null = can). */
  blockedReason(): string | null {
    const s = this.scene;
    if (s.mapKind === 'dungeon') return 'Không cưỡi Pokémon được trong hang động';
    if (s.boating) return 'Đang đi ghe';
    if (s.modal) return 'Đang mở bảng';
    if (this.world.trainer.hp <= 0) return 'Đang kiệt sức';
    if (s.inCombat()) return 'Không thể leo lên khi đang giao chiến';
    return null;
  }

  /** The mount Z would use here. */
  pick(): PartyMember | null {
    const list = this.mounts();
    const t = this.world.trainer, water = this.onWater(t.x, t.y);
    const fav = list.find((m) => m.uid === this.adv.rideUid);
    if (fav && rideModeFor(rideModesAt(fav.species, fav.level), water)) return fav;
    return bestMount(list, water);
  }

  toggle(): void {
    if (this.riding) { this.dismount(); return; }
    const why = this.blockedReason();
    if (why) { this.scene.ui.banner(why, '#ffb0a0'); return; }
    const m = this.pick();
    if (!m) {
      this.scene.ui.banner(`Chưa có Pokémon nào cưỡi được — cần Pokémon cao từ 1 m: chạy (nặng từ 40 kg) Lv ${RIDE_MIN_LEVEL.run}+, bơi (hệ Nước) Lv ${RIDE_MIN_LEVEL.swim}+, bay (hệ Bay) Lv ${RIDE_MIN_LEVEL.fly}+`, '#ffb0a0');
      return;
    }
    this.mount(m, true);
  }

  /** Shift+Z: the next mount of the party becomes the favourite (and is ridden at once if already riding). */
  cycle(): void {
    const list = this.mounts();
    if (!list.length) { this.toggle(); return; }
    const i = list.findIndex((m) => m.uid === (this.world.ride?.uid ?? this.adv.rideUid));
    const next = list[(i + 1) % list.length];
    this.adv.rideUid = next.uid;
    const modes = rideModesAt(next.species, next.level);
    const info = modes.map((md) => `${RIDE_NAME[md]} ×${rideSpeed(next.species, md).toFixed(2)}`).join(' · ');
    if (this.riding) {
      const t = this.world.trainer;
      if (this.world.rideAllows(modes, t.x, t.y)) { this.dismount(true); this.mount(next, true); return; }
    }
    this.scene.ui.banner(`Thú cưỡi: ${next.name} — ${info} (Z để cưỡi)`, '#a0e0ff');
  }

  private mount(m: PartyMember, announce: boolean): boolean {
    const owned = m.uid ? this.scene.state.owned(m.uid) : undefined;
    if (!this.world.startRide(m.species, { uid: m.uid, level: m.level, shiny: !!owned?.shiny })) return false;
    // the one on the field goes into its ball to carry the trainer (it is not on the field twice)
    if (m.uid && this.world.allies.some((a) => a.ownerUid === m.uid) && this.scene.summons) {
      if (this.scene.summons.recall(m.uid, { allowEmpty: true }) === 'ok') this.recalledUid = m.uid;
    }
    this.adv.ride = m.uid ?? undefined;
    if (announce) {
      const mode = this.world.ride!.mode;
      this.scene.ui.banner(`${RIDE_NAME[mode]} trên lưng ${m.name} — ×${rideSpeed(m.species, mode).toFixed(2)} tốc độ (Z để xuống)`, '#a0e0ff');
    }
    this.scene.persist();
    return true;
  }

  /** Off the mount (false = over water / lava, stays on). */
  dismount(quiet = false): boolean {
    const r = this.world.ride;
    if (!r) return true;
    if (!this.world.stopRide()) {
      if (!quiet) this.scene.ui.banner(r.mode === 'fly' ? 'Bay tới chỗ đất liền rồi mới xuống được' : 'Không thể xuống giữa nước', '#ffb0a0');
      return false;
    }
    delete this.adv.ride;
    const t = this.world.trainer;
    for (const a of this.world.allies) if (a.aquatic && !this.onWater(a.x, a.y)) a.aquatic = false;
    const back = this.recalledUid;
    this.recalledUid = null;
    if (back && !this.world.allies.length && this.scene.summons) this.scene.summons.summon(back, { x: t.x + 30, y: t.y + 10 });
    if (!quiet) this.scene.ui.banner(`Đã xuống khỏi ${POKEMON.get(r.species)?.name ?? r.species}`, '#c0d8ff');
    this.scene.persist();
    return true;
  }

  /** After a reload: back on the mount the save was made on (false = could not, e.g. it left the party). */
  restore(): boolean {
    const uid = this.adv.ride;
    if (!uid || this.scene.mapKind === 'dungeon') return false;
    const m = this.mounts().find((x) => x.uid === uid);
    if (m && this.mount(m, false)) return true;
    delete this.adv.ride;
    return false;
  }

  update(dt: number): void {
    const r = this.world.ride;
    if (!r) return;
    const s = this.scene, t = this.world.trainer;
    // a fight on land: off the mount (over water / in the air it carries on)
    if ((s.inCombat() || t.hp <= 0 || s.boating) && this.dismount(true)) { s.ui.banner('Xuống khỏi thú cưỡi để chiến đấu', '#ffd0a0'); return; }
    this.swapT -= dt;
    const inp = this.world.input;
    if (this.swapT <= 0 && Math.hypot(inp.x, inp.y) > 0.3 && !s.modal) {
      const len = Math.hypot(inp.x, inp.y);
      const ax = t.x + (inp.x / len) * 26, ay = t.y + (inp.y / len) * 26;
      if (!this.world.rideAllows(r.modes, ax, ay)) this.shoreSwap(ax, ay);
    }
    // the Pokémon out of its ball keeps up: land-bound ones jump to the trainer once left behind at a shore
    for (const a of this.world.allies) {
      if (a.fainted || Math.hypot(a.x - t.x, a.y - t.y) < FOLLOW_SNAP) continue;
      a.x = a.lastX = t.x + 24; a.y = a.lastY = t.y + 18;
      a.aquatic = this.onWater(a.x, a.y);
      this.world.emit({ t: 'vfx', name: 'poof', x: a.x, y: a.y });
    }
  }

  /** Pushing out of the current mount's element: change to the party's best mount for the spot ahead. */
  private shoreSwap(ax: number, ay: number): void {
    const r = this.world.ride!;
    const water = this.onWater(ax, ay);
    const next = bestMount(this.mounts().filter((m) => m.uid !== r.uid), water);
    const nextModes: RideMode[] = next ? rideModesAt(next.species, next.level) : [];
    if (next && this.world.rideAllows(nextModes, ax, ay)) {
      this.swapT = 1;
      this.dismount(true) || this.world.stopRide(true);
      this.world.teleport(ax, ay);
      if (this.mount(next, false)) {
        const mode = this.world.ride!.mode;
        this.scene.ui.banner(`Đổi sang ${RIDE_NAME[mode].toLowerCase()} trên lưng ${next.name} (×${rideSpeed(next.species, mode).toFixed(2)})`, '#a0e0ff');
      }
      return;
    }
    // a swimmer reaching the bank with no runner in the party: the trainer steps ashore
    if (r.mode === 'swim' && !water && !this.world.terrain?.blocksMove(ax, ay)) {
      this.swapT = 1;
      this.world.teleport(ax, ay);
      this.dismount();
      return;
    }
  }
}
