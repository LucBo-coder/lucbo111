import { REGIONS, regionOfArea } from '../core/encounters';
import { LEGENDS, LegendDef, missingConditions, storyUnlocked } from '../core/legends';
import { TILE_PX } from '../core/map/tiles';
import type { Unit } from '../core/world';
import type { AdventureScene } from '../scenes/AdventureScene';

// Roaming legendaries + story eggs (shrines and non-combat meetings are site-based in AdventureScene.updateWorldBoss).
// Roamers: every ROAM_CHECK seconds an unlocked, uncaught roamer whose region the player is in may appear near
// them (weather / time conditions respected). It fights for ROAM_STAY seconds, then flees; its HP fraction is
// saved so wearing it down carries over (no reset on reload). Defeating it = it joins (one individual, persistent).

export const ROAM_CHECK = 90;
export const ROAM_CHANCE = 0.4;
export const ROAM_STAY = 35;
export const ROAM_COOLDOWN = 240;

export class LegendaryEncounterManager {
  private t = 20;
  private roamer: { unit: Unit; id: string; leaveAt: number } | null = null;
  private lastSeen = new Map<string, number>();
  private eggT = 0;

  constructor(private scene: AdventureScene) {}

  private get adv() { return this.scene.state.adv; }
  private get now() { return this.adv.playTime + this.scene.playClock; }

  isRoamer(unitId: number): boolean {
    return this.roamer?.unit.id === unitId;
  }

  roamers(): LegendDef[] {
    return [...LEGENDS.values()].filter((l) => l.kind === 'roaming');
  }

  update(dt: number): void {
    if (this.scene.mapKind !== 'valley') return;
    this.updateEggs(dt);
    const r = this.roamer;
    if (r) {
      if (!r.unit.alive) { this.roamer = null; return; }
      if (this.now >= r.leaveAt) this.flee();
      return;
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = ROAM_CHECK;
    if (this.scene.world.boss?.alive || this.scene.modal) return;
    const t = this.scene.world.trainer;
    const here = regionOfArea(this.scene.map.areaAt(Math.floor(t.x / TILE_PX), Math.floor(t.y / TILE_PX))?.id);
    if (!here) return;
    const env = this.scene.legendEnv();
    const ok = this.roamers().filter((l) =>
      this.adv.legends[l.id] !== 'caught' && storyUnlocked(l, (f) => this.scene.state.hasFlag(f)) && (l.regions ?? []).includes(here.id)
      && missingConditions(l, env).length === 0 && this.now - (this.lastSeen.get(l.id) ?? -1e9) > ROAM_COOLDOWN);
    if (!ok.length || !this.scene.world.rng.chance(ROAM_CHANCE)) return;
    this.appear(this.scene.world.rng.pick(ok));
  }

  /** Spawns the roamer near the player with its saved HP. Public for tests / debug. */
  appear(l: LegendDef): Unit | null {
    const w = this.scene.world, t = w.trainer;
    for (let i = 0; i < 12; i++) {
      const a = w.rng.range(0, Math.PI * 2);
      const x = t.x + Math.cos(a) * 320, y = t.y + Math.sin(a) * 320;
      if (w.blocked(x, y, 30)) continue;
      const u = w.spawnBoss(l.id, (l.level ?? 40) + (this.scene.state.worldLevel - 1) * 2, false, { x, y });
      u.tag = 'roamer';
      const frac = this.adv.legendHp[l.id];
      if (frac != null) u.hp = Math.max(1, Math.round(u.maxHp * frac));
      this.scene.restoreBossFight(u); // phase checkpoint (overrides the HP fraction when present)
      this.adv.legends[l.id] = 'active';
      this.roamer = { unit: u, id: l.id, leaveAt: this.now + ROAM_STAY };
      this.lastSeen.set(l.id, this.now);
      this.scene.ui.eventAlert(`Huyền thoại lang thang: ${u.name} xuất hiện! Nó sẽ bỏ chạy sau ${ROAM_STAY}s.`, '#ffe080');
      this.scene.cameras.main.shake(500, 0.01);
      return u;
    }
    return null;
  }

  /** Time's up: it flees, keeping its HP for next time. */
  flee(): void {
    const r = this.roamer;
    if (!r) return;
    this.adv.legendHp[r.id] = r.unit.hp / r.unit.maxHp;
    this.adv.legends[r.id] = 'available';
    this.scene.renderer_.vfx.named('poof', r.unit.x, r.unit.y);
    this.scene.world.removeEnemy(r.unit);
    this.scene.ui.banner(`${r.unit.name} đã chạy mất! (máu còn ${Math.round((this.adv.legendHp[r.id] ?? 1) * 100)}%)`, '#c0c8e0');
    this.roamer = null;
    this.scene.persist();
  }

  /** Beaten through every phase: rewards + story flag, then the capture window (it no longer flees on its timer). */
  onRoamerDefeated(id: string, level: number): void {
    if (this.roamer?.id === id) this.roamer.leaveAt = Infinity;
    delete this.adv.legendHp[id];
    if (this.adv.legends[id] !== 'caught') this.adv.legends[id] = 'defeated';
    this.scene.state.setFlag('boss:' + id);
    this.scene.state.earn(2500);
    this.scene.state.addItems({ ultraball: 3 });
    this.scene.ui.banner(`${this.scene.speciesName(id)} kiệt sức! (+2500 ${this.scene.state.unit}, +3 Ultra Ball) — ném bóng để thu phục`, '#80ff90');
    this.scene.openLegendCapture(id, level);
  }

  // ───────────────────────────── eggs (Manaphy, Phione) ─────────────────────────────

  private updateEggs(dt: number): void {
    this.eggT -= dt;
    if (this.eggT > 0) return;
    this.eggT = 2;
    const st = this.scene.state;
    // Phione: Manaphy + Ditto left together at the farm (the player visits the farm with both owned)
    const phione = LEGENDS.get('phione');
    if (phione && st.adv.legends.phione !== 'caught' && !st.adv.eggs.some((e) => e.species === 'phione')
      && (phione.needs ?? []).every((sp) => st.save.collection.some((c) => c.species === sp))) {
      const t = this.scene.world.trainer;
      if (regionOfArea(this.scene.map.areaAt(Math.floor(t.x / TILE_PX), Math.floor(t.y / TILE_PX))?.id)?.id === 'farm') {
        st.adv.eggs.push({ species: 'phione', hatchAt: this.now + (phione.hatch ?? 300) });
        this.scene.ui.eventAlert('Bác Tư: "Manaphy và Ditto ở nông trại để lại một quả trứng xanh nhạt này!"', '#a0e0ff');
      }
    }
    for (const egg of [...st.adv.eggs]) {
      if (this.now < egg.hatchAt) continue;
      st.adv.eggs = st.adv.eggs.filter((e) => e !== egg);
      this.scene.joinLegend(egg.species, 1, `Quả trứng nở ra... ${this.scene.speciesName(egg.species)}!`);
    }
  }

  cleanup(): void {
    if (this.roamer?.unit.alive) this.flee();
    this.roamer = null;
  }

  /** Pokédex hint: where an unlocked roamer may be found (never an exact position). */
  roamHint(id: string): string | null {
    const l = LEGENDS.get(id);
    if (!l || l.kind !== 'roaming') return null;
    return (l.regions ?? []).map((r) => REGIONS.get(r)?.name ?? r).join(', ');
  }
}
