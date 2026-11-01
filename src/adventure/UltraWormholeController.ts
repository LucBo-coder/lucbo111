import Phaser from 'phaser';
import { POKEMON } from '../core/data';
import { TILE_PX } from '../core/map/tiles';
import type { Rng } from '../core/rng';
import { regionDef } from '../core/map/regionDefs';
import {
  pickWormholeLegend, RIFT_CHANCE, RIFT_CHECK, RIFT_COOLDOWN, riftCandidates, ULTRA_AWAKE, ULTRA_BEASTS, ULTRA_SPACE, ULTRA_STIR,
  ultraAwake, ultraStir, ultraWorldOf, ULTRA_WORLDS, type UltraWake, WORMHOLE_CHANCE, WORMHOLE_CHECK, WORMHOLE_COOLDOWN,
  WORMHOLE_FLAG, WORMHOLE_OPEN, WORMHOLE_STAY, wormholeKind, wormholeLevel,
} from '../core/ultraWormhole';
import type { Unit } from '../core/world';
import type { AdventureScene } from '../scenes/AdventureScene';

// Ultra Wormholes (rules: core/ultraWormhole.ts).
//   • open maps: a wormhole opens near the trainer now and then; E at it = step through into Không Gian Ultra (the
//     spot is kept in adv.ultraReturn: Ultra Space's own wormhole 'ultra-home' leads back there, see `goHome`)
//   • inside Ultra Space: small rifts; E at one = the legendary waiting on the other side steps out and fights; beaten
//     = the legendary capture window (AdventureScene.openLegendCapture). It goes back through if the fight drags on or
//     the trainer walks away.
//   • the Ultra Beasts' own sites there: a beast sleeps until the trainer has beaten enough wild Pokémon in its world
//     (`stir`); then a wormhole opens at its site for a while, and it comes out when the trainer gets close
//     (AdventureScene.updateWorldBoss asks `siteGate`).

const ID = 'ultra-wormhole';
type Swirl = { g: Phaser.GameObjects.Graphics; glow: Phaser.GameObjects.Particles.ParticleEmitter | null };

/** A slow white-blue-pink spiral with particles pouring out of its centre. */
function swirl(s: Phaser.Scene, x: number, y: number, big: number): Swirl {
  const g = s.add.graphics().setDepth(y + 5);
  s.tweens.addCounter({ from: 0, to: Math.PI * 2, duration: 2600, repeat: -1, onUpdate: (tw) => {
    if (!g.active) { tw.stop(); return; }
    const r0 = tw.getValue() ?? 0;
    g.clear();
    for (let k = 0; k < 6; k++) {
      const c = [0xffffff, 0xa0d8ff, 0xffa0f0][k % 3];
      g.lineStyle(5 - k * 0.6, c, 0.85 - k * 0.1);
      g.beginPath();
      for (let j = 0; j <= 40; j++) {
        const ang = r0 + k * 1.05 + j * 0.16, rad = (10 + j * 1.6) * big;
        const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad * 0.62;
        if (j === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.strokePath();
    }
    g.fillStyle(0x0a0420, 0.9).fillEllipse(x, y, 34 * big, 22 * big);
  } });
  const glow = s.textures.exists('px') ? s.add.particles(x, y, 'px', {
    lifespan: 900, speed: { min: 30, max: 90 }, scale: { start: 3, end: 0 }, alpha: { start: 0.9, end: 0 }, quantity: 2, frequency: 60, tint: [0xffffff, 0xa0d8ff, 0xffa0f0],
  }).setDepth(y + 6) : null;
  return { g, glow };
}

export class UltraWormholeController {
  private t = 45;
  private lastOpen = -1e9;
  /** legend: who steps out of a rift (Ultra Space); null = a wormhole into Ultra Space (open maps) */
  private hole: ({ x: number; y: number; until: number; legend: string | null } & Swirl) | null = null;
  /** wormholes standing open at the sites of woken Ultra Beasts */
  private siteSwirls = new Map<string, Swirl>();
  private fight: { unit: Unit; leaveAt: number; x: number; y: number } | null = null;

  private motes: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(private scene: AdventureScene) {
    if (scene.regionDef.filter === 'ultra') this.alienSky();
  }

  /** Không Gian Ultra's sky: pale motes drifting across the screen (the ground's colours: AdventureScene.onChunkLoad). */
  private alienSky(): void {
    const s = this.scene, cam = s.cameras.main;
    if (!s.textures.exists('px')) return;
    this.motes = s.add.particles(0, 0, 'px', {
      x: { min: 0, max: cam.width }, y: { min: 0, max: cam.height }, lifespan: 4000, speedY: { min: -12, max: -4 }, speedX: { min: -6, max: 6 },
      scale: { start: 2, end: 0 }, alpha: { start: 0, end: 0.7, ease: 'Sine.easeInOut' }, quantity: 1, frequency: 120, tint: [0xffffff, 0xa0d8ff, 0xffa0f0],
    }).setScrollFactor(0).setDepth(9000);
  }

  private get now() { return this.scene.state.adv.playTime + this.scene.playClock; }

  /** the legendary on the other side of the open rift (tests) */
  get waiting(): string | null { return this.hole?.legend ?? null; }
  get open(): boolean { return !!this.hole; }
  /** inside Ultra Space (rifts with legendaries) rather than on an open map (wormholes into it) */
  get inUltraSpace(): boolean { return this.scene.regionDef.id === ULTRA_SPACE; }

  private candidates(): string[] {
    const adv = this.scene.state.adv;
    const caught = Object.values(adv.legends).filter((v) => v === 'caught').length;
    return riftCandidates((id) => adv.legends[id] === 'caught', caught);
  }

  private get wake(): UltraWake {
    return (this.scene.state.adv.ultra ??= { stir: {}, awake: {} });
  }

  /** A wild Pokémon beaten at (x, y): in Ultra Space it stirs that world; enough of them wake its Ultra Beast. */
  stir(x: number, y: number, rng: Rng = this.scene.world.rng): string | null {
    const s = this.scene;
    if (!this.inUltraSpace) return null;
    const area = s.map.areaAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
    if (!area || !ULTRA_WORLDS.has(area.id)) return null;
    const caught = (id: string) => s.state.adv.legends[id] === 'caught';
    const woke = ultraStir(this.wake, area.id, caught, this.now, rng);
    if (woke) {
      const site = s.regionDef.legendaries?.find((l) => l.id === woke);
      s.ui.eventAlert(`Không gian ở ${area.name} rung chuyển dữ dội! Một Ultra Wormhole mở ra ở ${site?.name ?? area.name} — có thứ gì đó đang bước qua… (${Math.round(ULTRA_AWAKE / 60)} phút)`, '#ffa0f0');
      s.cameras.main.shake(700, 0.01);
      return woke;
    }
    const n = this.wake.stir[area.id] ?? 0;
    if (n > 0 && n % 4 === 0) s.ui.banner(`Dao động Ultra ở ${area.name}: ${n}/${ULTRA_STIR}`, '#e0b0ff');
    return null;
  }

  /** Why a site's legendary does not come out now (null = it may): an Ultra Beast that is still asleep. */
  siteGate(id: string): { key: string; msg: string } | null {
    const s = this.scene;
    if (!this.inUltraSpace || !ULTRA_BEASTS.has(id) || s.state.adv.legends[id] === 'caught') return null;
    if (ultraAwake(this.wake, id, this.now)) return null;
    const world = ultraWorldOf(id);
    const left = ULTRA_STIR - (this.wake.stir[world?.id ?? ''] ?? 0);
    return { key: `${id}:ultra:${left}`, msg: `Không gian ở đây yên tĩnh lạ thường… Hạ thêm ${left} Pokémon hoang dã ở ${world?.name ?? 'vùng này'} để khuấy động nó.` };
  }

  /** A woken beast beaten at its site: its wormhole closes; the world has to be stirred again for the next time. */
  onSiteBeaten(id: string): void {
    if (this.wake.awake[id] != null) delete this.wake.awake[id];
  }

  /** The wormholes at the sites of the woken beasts: open while they are awake. */
  private updateSiteSwirls(): void {
    const s = this.scene, sites = this.inUltraSpace ? s.regionDef.legendaries ?? [] : [];
    for (const [id, sw] of this.siteSwirls) {
      if (!((this.wake.awake[id] ?? -1) > this.now) || s.state.adv.legends[id] === 'caught') {
        sw.g.destroy(); sw.glow?.destroy(); this.siteSwirls.delete(id);
      }
    }
    for (const l of sites) {
      if (!ULTRA_BEASTS.has(l.id) || this.siteSwirls.has(l.id) || !((this.wake.awake[l.id] ?? -1) > this.now)) continue;
      if (s.state.adv.legends[l.id] === 'caught') continue;
      this.siteSwirls.set(l.id, swirl(s, (l.x + 0.5) * TILE_PX, (l.y + 0.5) * TILE_PX - 30, 1.8));
    }
  }

  update(dt: number): void {
    const s = this.scene;
    if (s.mapKind !== 'valley') return;
    this.updateSiteSwirls();
    if (this.hole && this.now >= this.hole.until && !this.fight) this.close('Ultra Wormhole khép lại.');
    if (this.fight) { this.updateFight(); return; }
    if (this.hole) return;
    this.t -= dt;
    if (this.t > 0) return;
    const inside = this.inUltraSpace;
    this.t = inside ? RIFT_CHECK : WORMHOLE_CHECK;
    if (!s.state.hasFlag(WORMHOLE_FLAG) || s.modal || s.inCombat() || s.world.boss?.alive) return;
    if (this.now - this.lastOpen < (inside ? RIFT_COOLDOWN : WORMHOLE_COOLDOWN)) return;
    if (!s.world.rng.chance(inside ? RIFT_CHANCE : WORMHOLE_CHANCE)) return;
    this.openNear();
  }

  /**
   * Opens a rift 260–420 px from the trainer on open ground: in Ultra Space with a legendary behind it (`legend` or a
   * weighted pick), elsewhere a wormhole into Ultra Space. Public for tests / debug.
   */
  openNear(legend?: string): boolean {
    const s = this.scene, w = s.world, t = w.trainer;
    if (this.hole) return false;
    const inside = this.inUltraSpace;
    const id = inside ? legend ?? pickWormholeLegend(w.rng, this.candidates()) : null;
    if (inside && !id) return false;
    for (let i = 0; i < 16; i++) {
      const a = w.rng.range(0, Math.PI * 2), d = w.rng.range(260, 420);
      const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
      if (w.blocked(x, y, 40) || s.map.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX))) continue;
      this.show(x, y, id);
      return true;
    }
    return false;
  }

  private show(x: number, y: number, legend: string | null): void {
    const s = this.scene;
    this.hole = { x, y, until: this.now + WORMHOLE_OPEN, legend, ...swirl(s, x, y, legend ? 1 : 1.6) };
    this.lastOpen = this.now;
    s.interactables.set(ID, { kind: 'wormhole', id: ID, x, y, label: legend ? 'Vết nứt Ultra' : 'Ultra Wormhole', obj: { kind: 'secret', id: ID, x: Math.floor(x / TILE_PX), y: Math.floor(y / TILE_PX) } });
    if (legend) s.ui.eventAlert(`Một vết nứt mở ra gần đây! Phía bên kia có một luồng sức mạnh huyền thoại… (E để tiến lại, ${WORMHOLE_OPEN}s)`, '#ffa0f0');
    else s.ui.eventAlert(`Ultra Wormhole mở ra gần đây! Nó dẫn tới Không Gian Ultra… (E để bước vào, ${WORMHOLE_OPEN}s)`, '#ffa0f0');
    s.cameras.main.shake(400, 0.006);
  }

  /** E at the rift: the legendary steps out (Ultra Space), or into Ultra Space (open maps). */
  async interact(): Promise<void> {
    const s = this.scene, h = this.hole;
    if (!h || this.fight) return;
    if (!h.legend) { await this.enter(); return; }
    if (s.world.boss?.alive) { s.ui.banner('Một trận chiến khác đang diễn ra.', '#ffb0a0'); return; }
    if (s.rides?.riding) s.rides.dismount(true);
    const legend = h.legend;
    const level = wormholeLevel(legend, s.state.worldLevel);
    const u = s.world.spawnBoss(legend, level, false, { x: h.x, y: h.y });
    u.tag = 'wormhole';
    s.restoreBossFight(u);
    s.state.adv.legends[legend] = s.state.adv.legends[legend] === 'caught' ? 'caught' : 'active';
    this.fight = { unit: u, leaveAt: this.now + WORMHOLE_STAY, x: h.x, y: h.y };
    s.interactables.delete(ID);
    s.renderer_.vfx.flash(h.x, h.y, 140, 0xffa0f0, 700);
    const beast = wormholeKind(legend) === 'ultra-beast';
    s.ui.eventAlert(`${u.name} bước ra từ vết nứt!${beast ? ' (Ultra Beast)' : ''}`, '#ffa0f0');
    s.cameras.main.shake(600, 0.012);
  }

  /** Through the wormhole into Ultra Space; the spot it opened at is where its way home leads. */
  private async enter(): Promise<void> {
    const s = this.scene, h = this.hole!;
    const r = await s.say('Ultra Wormhole', ['Không gian bên kia vặn xoắn đầy ánh sáng. Pokémon hoang dã ở đó rất mạnh (Lv45–62).'],
      [{ label: 'Bước vào Không Gian Ultra', value: 'go' }, { label: 'Ở lại', value: 'no' }]);
    if (r !== 'go' || this.hole !== h) return;
    if (s.rides?.riding) s.rides.dismount(true);
    s.state.adv.ultraReturn = { region: s.regionDef.id, x: Math.floor(s.world.trainer.x / TILE_PX), y: Math.floor(s.world.trainer.y / TILE_PX) };
    const sp = regionDef(ULTRA_SPACE).spawn;
    this.close();
    s.travelTo(ULTRA_SPACE, sp.x, sp.y);
  }

  /** Ultra Space's own wormhole ('ultra-home'): back to where the trainer came through. */
  async goHome(fallback: { to: string; toX: number; toY: number }): Promise<void> {
    const s = this.scene, back = s.state.adv.ultraReturn;
    const to = back ?? { region: fallback.to, x: fallback.toX, y: fallback.toY };
    const r = await s.say('Ultra Wormhole', [`Ánh sáng phía bên kia là ${regionDef(to.region).name}.`],
      [{ label: 'Về nhà', value: 'go' }, { label: 'Ở lại', value: 'no' }]);
    if (r !== 'go') return;
    if (s.rides?.riding) s.rides.dismount(true);
    delete s.state.adv.ultraReturn;
    s.travelTo(to.region, to.x, to.y);
  }

  private updateFight(): void {
    const f = this.fight!, s = this.scene, t = s.world.trainer;
    if (!f.unit.alive) { this.fight = null; this.close(); return; }
    if (f.unit.boss?.weakened) return; // capture window: AdventureScene runs it
    const far = Math.hypot(f.unit.x - t.x, f.unit.y - t.y) > 1400;
    if (this.now >= f.leaveAt || far) this.retreat();
  }

  /** It goes back through the rift (HP kept in the saved boss fight for next time). */
  private retreat(): void {
    const f = this.fight!, s = this.scene;
    s.persist(); // HP + phase saved for the next time it comes through
    s.renderer_.vfx.named('poof', f.unit.x, f.unit.y);
    s.world.removeEnemy(f.unit);
    s.ui.banner(`${f.unit.name} quay về Ultra Wormhole…`, '#c0c8e0');
    if (s.state.adv.legends[f.unit.defId] === 'active') s.state.adv.legends[f.unit.defId] = 'available';
    this.fight = null;
    this.close();
  }

  /** Beaten through every phase: rewards, then the capture window. */
  onDefeated(id: string, level: number): void {
    const s = this.scene;
    if (this.fight?.unit.defId === id) this.fight.leaveAt = Infinity;
    if (s.state.adv.legends[id] !== 'caught') s.state.adv.legends[id] = 'defeated';
    s.state.earn(3000);
    s.state.addItems({ ultraball: 3 });
    s.ui.banner(`${POKEMON.get(id)?.name ?? id} kiệt sức! (+3000 ${s.state.unit}, +3 Ultra Ball) — ném bóng để thu phục`, '#80ff90');
    s.openLegendCapture(id, level);
  }

  private close(msg?: string): void {
    const h = this.hole;
    if (!h) return;
    h.g.destroy();
    h.glow?.destroy();
    this.scene.interactables.delete(ID);
    this.hole = null;
    if (msg) this.scene.ui.banner(msg, '#c0c8e0');
  }

  cleanup(): void {
    this.motes?.destroy();
    this.motes = null;
    for (const sw of this.siteSwirls.values()) { sw.g.destroy(); sw.glow?.destroy(); }
    this.siteSwirls.clear();
    if (this.fight?.unit.alive && !this.fight.unit.boss?.weakened) this.retreat();
    this.fight = null;
    this.close();
  }
}
