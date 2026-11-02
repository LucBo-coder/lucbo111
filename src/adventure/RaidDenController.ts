import Phaser from 'phaser';
import { abilityEffect, rollAbilitySlot } from '../core/abilities';
import { ECOLOGY, REGIONS, RegionDef } from '../core/encounters';
import { GMAX } from '../core/gimmicks';
import { randomTeraType } from '../core/pokemonTraits';
import { MAX_LEVEL } from '../core/progression';
import {
  DEN_LIFETIME, DEN_SPAWN_EVERY, MAX_DENS, RAID_CATCH_AT, RAID_CATCH_WINDOW, RAID_KIND_VI, RAID_LEASH, RAID_SHINY, RAID_TIERS,
  raidDenRewards, raidLevel, RaidKind, RaidStars, rollKind, rollStars, starsText,
} from '../core/raidDens';
import { TYPE_VI } from '../core/synergy';
import type { PokeType } from '../core/types';
import { makeWildState } from '../core/wildAI';
import type { Unit } from '../core/world';
import { audio } from '../systems/audio';
import type { AdventureScene } from '../scenes/AdventureScene';
import { ITEMS } from './AdventureState';
import type { PartyMsg } from '../net/party';

// Raid dens on the overworld (V32, rules in core/raidDens.ts). Dens appear by themselves around the player, each
// with a light column seen from far away and a star rating; E on a den shows the boss and starts the raid.
// Everything a den creates (beam, label, interactable, boss) goes away with it, and with the scene.
// Chơi chung: on a shared map only the map host's game makes dens (SharedWorld.mapHost); the others draw copies of
// them (`mirrors`, sent with the host's world events), start a raid at one through the host, see its timer and
// shields, and get the same rewards when it is won.

export interface RaidDen {
  id: number;
  x: number;
  y: number;
  stars: RaidStars;
  kind: RaidKind;
  species: string;
  level: number;
  teraType: PokeType | null;
  region: string;
  /** play time it appeared */
  born: number;
  state: 'idle' | 'fight' | 'catch';
  boss: Unit | null;
  /** seconds left to win (fight) or to throw a ball (catch) */
  left: number;
  shieldIdx: number;
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

/** a copy of the map host's den, with what the HUD shows of its raid */
type MirrorDen = RaidDen & { bossName?: string; bossHp?: number; bossShield?: boolean };

export interface RaidMarker { x: number; y: number; stars: number; kind: RaidKind; active: boolean; label: string }

const BEAM: Record<RaidKind, number[]> = { tera: [0x88eeff, 0xffffff], dynamax: [0xff2050, 0xff90a0], gmax: [0xff1040, 0xb040ff] };

export class RaidDenController {
  private dens: RaidDen[] = [];
  private nextId = 1;
  private spawnT: number;
  /** Chơi chung: the map host's dens (their id → copy) */
  private mirrors = new Map<number, MirrorDen>();

  constructor(private scene: AdventureScene) {
    this.spawnT = 20 + Math.random() * 30; // the first den shows up soon after arriving
    this.baseTexture();
  }

  private get world() { return this.scene.world; }
  private get now() { return this.scene.state.adv.playTime + this.scene.playClock; }

  /** The den being fought right now, if any (one raid at a time). */
  get active(): RaidDen | null { return this.dens.find((d) => d.state !== 'idle') ?? null; }
  /** someone else runs this map's dens */
  private get guest(): boolean { return !!this.scene.shared?.isGuest(); }

  list(): readonly RaidDen[] { return this.dens; }

  update(dt: number): void {
    if (this.scene.mapKind !== 'valley') return;
    if (this.guest) {
      // my own dens make way for the host's (a raid I am already fighting goes on)
      for (const d of [...this.dens]) {
        if (d.state === 'idle') { this.remove(d); continue; }
        this.draw(d);
        this.tickRaid(d, dt);
      }
      for (const d of this.mirrors.values()) this.draw(d);
      return;
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = DEN_SPAWN_EVERY[0] + Math.random() * (DEN_SPAWN_EVERY[1] - DEN_SPAWN_EVERY[0]);
      if (this.dens.length < MAX_DENS && !this.active) this.spawnDen();
    }
    const now = this.now;
    for (const d of [...this.dens]) {
      this.draw(d);
      if (d.state === 'idle') { if (now - d.born > DEN_LIFETIME) this.remove(d, 'Hang Raid đã tắt sáng.'); continue; }
      this.tickRaid(d, dt);
    }
  }

  // ───────────────────────────── dens ─────────────────────────────

  /** A new den near the player (debug / tests can force every field). */
  spawnDen(o: Partial<Pick<RaidDen, 'stars' | 'kind' | 'species' | 'x' | 'y'>> = {}): RaidDen | null {
    const ev = this.scene.worldEvents;
    if (!ev) return null;
    const rng = this.world.rng, st = this.scene.state;
    const regions = ev.unlockedRegions();
    const here = ev.currentRegion();
    const region: RegionDef | undefined = here && regions.some((r) => r.id === here.id) ? here : regions.length ? rng.pick(regions) : undefined;
    if (!region) return null;
    let p: { x: number; y: number } | null = o.x != null && o.y != null ? { x: o.x, y: o.y } : null;
    const t = this.world.trainer;
    // close enough to be found (its light is seen from afar), not on top of the player
    for (let i = 0; !p && i < 6; i++) {
      const q = ev.regionPoint(region, t, 450);
      if (q && (Math.hypot(q.x - t.x, q.y - t.y) < 1800 || i === 5)) p = q;
    }
    if (!p) return null;
    const stars = o.stars ?? rollStars(rng, st.bossesBeaten());
    const level = raidLevel(stars, region.elite[1], MAX_LEVEL);
    const gmaxPool = Object.keys(GMAX).filter((s) => ECOLOGY.has(s) && ECOLOGY.get(s)!.minLevel <= level + 10);
    const kind = o.kind ?? rollKind(rng, stars, st.item('dynamax-band') > 0, gmaxPool.length > 0);
    const species = o.species ?? (kind === 'gmax' ? rng.pick(gmaxPool)
      : ev.pickSpecies(region, (e) => !e.aquatic && (stars < 4 || e.stage > 0 || e.rarity !== 'common')));
    if (!species) return null;
    const d: RaidDen = {
      id: this.nextId++, x: p.x, y: p.y, stars, kind, species, level, region: region.id,
      teraType: kind === 'tera' ? randomTeraType(() => rng.next()) : null,
      born: this.now, state: 'idle', boss: null, left: 0, shieldIdx: 0,
      gfx: this.scene.add.graphics(), label: this.scene.add.text(p.x, p.y - 70, '', { fontSize: '15px', color: '#ffe080', stroke: '#1a1020', strokeThickness: 4 }).setOrigin(0.5),
    };
    this.dens.push(d);
    const base = this.scene.add.image(p.x, p.y, 'raidDenBase').setDepth(p.y - 2);
    this.scene.addEventObject(this.objId(d), p.x, p.y, `Hang Raid ${stars}★`, { raidDen: d.id }, base);
    this.scene.ui.eventAlert(`Một Hang Raid ${starsText(stars).replace(/☆/g, '')} phát sáng ở ${region.name} — đi theo cột sáng (dấu ◆ trên bản đồ)!`, '#ffd080');
    return d;
  }

  private objId(d: RaidDen): string { return 'raidden-' + d.id; }

  private remove(d: RaidDen, msg?: string): void {
    this.scene.removeEventObject(this.objId(d));
    d.gfx.destroy(); d.label.destroy();
    if (d.boss?.alive && !d.boss.captured) this.world.removeEnemy(d.boss);
    this.dens = this.dens.filter((x) => x !== d);
    if (msg) this.scene.ui.banner(msg, '#c0c8e0');
  }

  /** E on a den: show what waits inside, start the raid if the player wants. */
  async use(id: number): Promise<void> {
    if (id < 0) return this.useMirror(-id); // a copy of the map host's den
    const d = this.dens.find((x) => x.id === id);
    if (!d || d.state !== 'idle') return;
    if (this.active) { this.scene.ui.banner('Đang có một trận Raid khác — hãy kết thúc nó trước.', '#ff9080'); return; }
    const tier = RAID_TIERS[d.stars];
    const name = this.scene.speciesName(d.species) + (d.kind === 'gmax' ? ' Gigantamax' : d.kind === 'dynamax' ? ' Dynamax' : '');
    const lead = this.world.allies.filter((a) => !a.fainted).reduce((m, a) => Math.max(m, a.level), 0);
    const rec = Math.max(5, d.level + tier.recommended);
    const r = await this.scene.say(`${RAID_KIND_VI[d.kind]} ${starsText(d.stars)}`, [
      `${name} Lv${d.level}${d.teraType ? ` · Hệ Tera ${TYPE_VI[d.teraType]}` : ''}\nThời gian ${tier.time}s · ${tier.shields.length ? `${tier.shields.length} lớp khiên` : 'không khiên'} · Khuyến nghị Lv${rec}+${lead && lead < rec ? ` (đội bạn cao nhất Lv${lead})` : ''}`,
    ], [{ label: 'Bắt đầu Raid', value: 'go' }, { label: 'Để sau', value: 'no' }]);
    if (r === 'go') this.start(d);
  }

  /** The boss comes out of the den. */
  start(d: RaidDen): void {
    const rng = this.world.rng, tier = RAID_TIERS[d.stars];
    const u = this.world.spawnWild(d.species, d.level, d.x, d.y - 10, {
      wild: makeWildState(d.x, d.y, 'aggressive', { homeR: 140, aggroR: 520, leash: 600 }),
      hostile: true, tag: 'raid:' + d.id, elite: true, hpMult: tier.hpMult, noCapture: true,
    });
    u.flinchImmuneT = 1e9;
    u.shiny = rng.next() < RAID_SHINY;
    u.abilitySlot = rollAbilitySlot(d.species, () => rng.next(), d.stars >= 3);
    u.passive = abilityEffect(d.species, u.abilitySlot);
    u.raidCatch = tier.catchMult;
    if (d.teraType) { u.teraPick = d.teraType; this.world.terastallize(u, d.teraType); }
    else this.world.dynamax(u, d.kind === 'gmax');
    d.boss = u; d.state = 'fight'; d.left = tier.time; d.shieldIdx = 0;
    this.scene.removeEventObject(this.objId(d));
    this.scene.cameras.main.shake(400, 0.008);
    audio.play('boss');
    const msg = `${RAID_KIND_VI[d.kind]} ${starsText(d.stars)}: ${u.name} xuất hiện! Hạ nó trong ${tier.time}s.`;
    this.scene.ui.eventAlert(msg, '#ff9080');
    this.scene.shared?.note(msg, '#ff9080');
  }

  /** Host: a player of my map asked to open this den. */
  startFor(id: number, _from: string): void {
    const d = this.dens.find((x) => x.id === id);
    if (d && d.state === 'idle' && !this.active) this.start(d);
  }

  private tickRaid(d: RaidDen, dt: number): void {
    const u = d.boss!, tier = RAID_TIERS[d.stars], t = this.world.trainer;
    d.left -= dt;
    if (u.captured || !u.alive) return; // resolved through onResolved
    if (d.state === 'fight') {
      if (this.world.state !== 'playing') return this.fail(d, 'Đội của bạn đã gục — Pokémon Raid quay về hang.');
      if (d.left <= 0) return this.fail(d, `Hết giờ! ${u.name} biến mất vào hang.`);
      // (Chơi chung: the raid goes on while any player of the map stays at the den)
      const here = [t, ...(this.scene.shared?.mateAnchors() ?? [])];
      if (!here.some((p) => Math.hypot(p.x - d.x, p.y - d.y) <= RAID_LEASH)) return this.fail(d, 'Bạn đã rời Hang Raid — trận Raid bị hủy.');
      // barrier shields at the tier's HP thresholds
      const th = tier.shields[d.shieldIdx];
      if (th != null && u.hp / u.maxHp < th) {
        d.shieldIdx++;
        u.shield = Math.round(u.maxHp * tier.shieldFrac); u.shieldT = 1e9;
        this.scene.renderer_.vfx.named('shield', u.x, u.y);
        this.scene.ui.banner(`${u.name} dựng khiên chắn! (${d.shieldIdx}/${tier.shields.length}) — phá khiên để tiếp tục gây sát thương`, '#80e0ff');
      }
      // worn down: the giant shrinks / the Tera layer shatters, and it can be caught
      if (u.hp / u.maxHp < RAID_CATCH_AT) {
        if (u.dyna) this.world.endDynamax(u);
        if (u.tera) this.world.endTera(u);
        u.shield = 0;
        u.noCapture = false;
        d.state = 'catch'; d.left = RAID_CATCH_WINDOW;
        this.scene.ui.eventAlert(`${u.name} đã kiệt sức — ném bóng ngay! (${RAID_CATCH_WINDOW}s)`, '#a0ffb0');
      }
    } else if (d.state === 'catch' && d.left <= 0) {
      this.world.removeEnemy(u);
      this.win(d, false, `${u.name} đã chạy thoát, nhưng bạn vẫn thắng trận Raid.`);
    }
  }

  /** Called by the scene for every defeated or captured unit. */
  onResolved(id: number, captured: boolean): void {
    const d = this.dens.find((x) => x.boss?.id === id);
    if (!d) return;
    if (captured) {
      const p = [...this.scene.state.save.collection].reverse().find((c) => c.species === d.species);
      if (p && d.kind === 'gmax') { p.gmax = true; this.scene.ui.banner(`${this.scene.speciesName(d.species)} mang Nhân Tố Gigantamax!`, '#ff6080'); }
      this.win(d, true);
    } else if (d.state === 'catch') this.win(d, false);
    else this.win(d, false); // knocked out in one burst before the catch phase
  }

  private win(d: RaidDen, caught: boolean, note?: string): void {
    const st = this.scene.state;
    const loot = raidDenRewards(d.stars, d.kind, this.world.rng.next());
    st.addItems(loot.items); st.earn(loot.money);
    st.addWorldExp(60 + d.stars * 40);
    this.scene.coopHost?.grant({ currency: loot.money, items: loot.items, note: 'Hang Raid' });
    const lines = [
      ...(note ? [note] : caught ? [`Đã bắt được ${this.scene.speciesName(d.species)}!`] : []),
      ...Object.entries(loot.items).map(([id, n]) => `+${n} ${ITEMS[id]?.name ?? id}`), `+${loot.money} ${st.unit}`,
    ];
    d.boss = null;
    this.remove(d);
    if (!this.guest) this.scene.shared?.sendEvents({ t: 'swRaid', id: d.id, ok: true });
    this.scene.ui.questComplete(`${RAID_KIND_VI[d.kind]} ${starsText(d.stars)}: chiến thắng!`, lines);
    audio.play('victory');
    this.scene.persist();
  }

  private fail(d: RaidDen, msg: string): void {
    this.remove(d);
    this.scene.ui.eventAlert(msg, '#ff9080');
    if (!this.guest) this.scene.shared?.sendEvents({ t: 'swRaid', id: d.id, ok: false, msg });
  }

  // ───────────────────────────── Chơi chung: the map host's dens ─────────────────────────────

  /** Host: my dens for the others on this map. */
  snapshot(): Record<string, unknown>[] {
    return this.dens.map((d) => ({
      id: d.id, x: Math.round(d.x), y: Math.round(d.y), stars: d.stars, kind: d.kind, species: d.species, level: d.level, teraType: d.teraType,
      region: d.region, state: d.state, left: Math.round(d.left), shieldIdx: d.shieldIdx,
      ...(d.boss ? { bn: d.boss.name, bh: Math.round((d.boss.hp / d.boss.maxHp) * 100) / 100, bs: d.boss.shield > 0 ? 1 : 0 } : {}),
    }));
  }

  /** Guest: the host's dens as they are now ([] = none, or the host is gone). */
  applyMirror(list: Record<string, unknown>[]): void {
    if (!list.length && !this.mirrors.size) return;
    const seen = new Set<number>();
    for (const r of list.slice(0, 6)) {
      const id = Number(r.id), stars = r.stars as RaidStars, kind = r.kind as RaidKind;
      if (!Number.isFinite(id) || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !BEAM[kind] || !RAID_TIERS[stars] || typeof r.species !== 'string' || !ECOLOGY.has(r.species)) continue;
      seen.add(id);
      let d = this.mirrors.get(id);
      const state = r.state === 'fight' || r.state === 'catch' ? r.state : 'idle';
      if (!d) {
        const x = r.x as number, y = r.y as number;
        d = {
          id, x, y, stars, kind, species: r.species, level: Number(r.level) || 1, teraType: (r.teraType as PokeType | null) ?? null,
          region: String(r.region ?? ''), born: this.now, state: 'idle', boss: null, left: 0, shieldIdx: 0,
          gfx: this.scene.add.graphics(), label: this.scene.add.text(x, y - 70, '', { fontSize: '15px', color: '#ffe080', stroke: '#1a1020', strokeThickness: 4 }).setOrigin(0.5),
        };
        this.mirrors.set(id, d);
        if (state === 'idle') {
          const base = this.scene.add.image(x, y, 'raidDenBase').setDepth(y - 2);
          this.scene.addEventObject(this.mirrorObj(d), x, y, `Hang Raid ${stars}★`, { raidDen: -id }, base);
          this.scene.ui.eventAlert(`Một Hang Raid ${starsText(stars).replace(/☆/g, '')} phát sáng ở ${this.regionName(d)} — đi theo cột sáng (dấu ◆ trên bản đồ)!`, '#ffd080');
        }
      }
      if (d.state === 'idle' && state !== 'idle') this.scene.removeEventObject(this.mirrorObj(d));
      d.state = state;
      d.left = Number(r.left) || 0;
      d.shieldIdx = Number(r.shieldIdx) || 0;
      d.bossName = typeof r.bn === 'string' ? r.bn : undefined;
      d.bossHp = Number(r.bh) || 0;
      d.bossShield = !!r.bs;
    }
    for (const d of [...this.mirrors.values()]) if (!seen.has(d.id)) this.dropMirror(d);
  }

  private mirrorObj(d: RaidDen): string { return 'raidden-m' + d.id; }

  private dropMirror(d: MirrorDen): void {
    this.scene.removeEventObject(this.mirrorObj(d));
    d.gfx.destroy(); d.label.destroy();
    this.mirrors.delete(d.id);
  }

  /** Guest: the host's raid at a den ended — won: my own rewards too; lost: why. */
  mirrorOutcome(m: PartyMsg): void {
    const d = this.mirrors.get(Number(m.id));
    if (!d) return;
    this.dropMirror(d);
    if (!m.ok) { this.scene.ui.eventAlert(typeof m.msg === 'string' ? m.msg.slice(0, 200) : 'Trận Raid đã kết thúc.', '#ff9080'); return; }
    const st = this.scene.state;
    const loot = raidDenRewards(d.stars, d.kind, this.world.rng.next());
    st.addItems(loot.items); st.earn(loot.money);
    st.addWorldExp(60 + d.stars * 40);
    this.scene.ui.questComplete(`${RAID_KIND_VI[d.kind]} ${starsText(d.stars)}: chiến thắng!`, [
      ...Object.entries(loot.items).map(([id, n]) => `+${n} ${ITEMS[id]?.name ?? id}`), `+${loot.money} ${st.unit}`,
    ]);
    audio.play('victory');
    this.scene.persist();
  }

  /** E on a copy of the host's den: same preview, then the host's game starts the raid. */
  private async useMirror(id: number): Promise<void> {
    const d = this.mirrors.get(id), shared = this.scene.shared;
    if (!d || d.state !== 'idle' || !shared) return;
    if ([...this.mirrors.values()].some((x) => x.state !== 'idle')) { this.scene.ui.banner('Đang có một trận Raid khác — hãy kết thúc nó trước.', '#ff9080'); return; }
    const tier = RAID_TIERS[d.stars];
    const name = this.scene.speciesName(d.species) + (d.kind === 'gmax' ? ' Gigantamax' : d.kind === 'dynamax' ? ' Dynamax' : '');
    const r = await this.scene.say(`${RAID_KIND_VI[d.kind]} ${starsText(d.stars)}`, [
      `${name} Lv${d.level}${d.teraType ? ` · Hệ Tera ${TYPE_VI[d.teraType]}` : ''}\nThời gian ${tier.time}s · ${tier.shields.length ? `${tier.shields.length} lớp khiên` : 'không khiên'} · Khuyến nghị Lv${Math.max(5, d.level + tier.recommended)}+\nCả nhóm cùng đánh; thắng thì ai trên bản đồ cũng nhận thưởng.`,
    ], [{ label: 'Bắt đầu Raid', value: 'go' }, { label: 'Để sau', value: 'no' }]);
    if (r !== 'go' || !this.mirrors.has(id)) return;
    shared.sendEvents({ t: 'swEvUse', uid: id, a: 'den' }, shared.mapHost());
    this.scene.ui.banner('Đang mở Hang Raid…', '#ffd080');
  }

  // ───────────────────────────── views ─────────────────────────────

  markers(): RaidMarker[] {
    return [...this.dens, ...this.mirrors.values()].map((d) => ({ x: d.x, y: d.y, stars: d.stars, kind: d.kind, active: d.state !== 'idle', label: `${d.stars}★${d.kind === 'gmax' ? ' G-Max' : d.kind === 'tera' ? ' Tera' : ' Max'}` }));
  }

  /** HUD line of the raid in progress. */
  hudLine(): string | null {
    const d = this.active;
    if (!d?.boss) return this.mirrorLine();
    const tier = RAID_TIERS[d.stars];
    const mm = Math.max(0, Math.ceil(d.left));
    const time = `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}`;
    if (d.state === 'catch') return `⚔ RAID ${starsText(d.stars)} · ${d.boss.name} kiệt sức — ném bóng! ${time}`;
    return `⚔ RAID ${starsText(d.stars)} · ${d.boss.name} ${Math.ceil((d.boss.hp / d.boss.maxHp) * 100)}% · ${time}${tier.shields.length ? ` · khiên ${d.shieldIdx}/${tier.shields.length}` : ''}${d.boss.shield > 0 ? ' (đang có khiên)' : ''}`;
  }

  /** the host's raid in progress, as sent */
  private mirrorLine(): string | null {
    const d = [...this.mirrors.values()].find((x) => x.state !== 'idle');
    if (!d?.bossName) return null;
    const tier = RAID_TIERS[d.stars];
    const mm = Math.max(0, Math.ceil(d.left));
    const time = `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}`;
    if (d.state === 'catch') return `⚔ RAID ${starsText(d.stars)} · ${d.bossName} kiệt sức — ném bóng! ${time}`;
    return `⚔ RAID ${starsText(d.stars)} · ${d.bossName} ${Math.ceil((d.bossHp ?? 0) * 100)}% · ${time}${tier.shields.length ? ` · khiên ${d.shieldIdx}/${tier.shields.length}` : ''}${d.bossShield ? ' (đang có khiên)' : ''}`;
  }

  private draw(d: RaidDen): void {
    const now = this.scene.time.now, g = d.gfx;
    const [c1, c2] = BEAM[d.kind];
    const pulse = 0.75 + Math.sin(now * 0.004 + d.id) * 0.25;
    const h = d.state === 'idle' ? 380 : 220;
    g.clear().setDepth(d.y - 3);
    // light column: a wide soft glow, a brighter core and a white heart, fading upward
    for (const [w, a] of [[46, 0.12], [26, 0.22], [10, 0.5]] as const) {
      for (let i = 0; i < 6; i++) {
        g.fillStyle(i % 2 && d.kind === 'gmax' ? c2 : w === 10 ? 0xffffff : c1, a * pulse * (1 - i / 7));
        g.fillRect(d.x - w / 2, d.y - 10 - (h / 6) * (i + 1), w, h / 6);
      }
    }
    g.fillStyle(c1, 0.35 * pulse).fillEllipse(d.x, d.y, 90, 34);
    if (Math.random() < 0.15) this.scene.renderer_.vfx.emit(d.kind === 'tera' ? 'tera' : 'dyna', d.x + (Math.random() - 0.5) * 30, d.y - Math.random() * h * 0.7, 1);
    const near = Math.hypot(this.world.trainer.x - d.x, this.world.trainer.y - d.y) < 420;
    d.label.setText(d.state === 'idle' ? `${starsText(d.stars).replace(/☆/g, '')}${near ? `\n${RAID_KIND_VI[d.kind]}` : ''}` : 'ĐANG RAID')
      .setPosition(d.x, d.y - h - 18).setDepth(d.y + 400).setColor(d.kind === 'tera' ? '#b8f5ff' : '#ffb0c0');
  }

  /** Ring of standing stones around a dark hollow (made once). */
  private baseTexture(): void {
    const key = 'raidDenBase';
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x2a2030, 1).fillEllipse(40, 26, 64, 26);
    g.fillStyle(0x120c18, 1).fillEllipse(40, 26, 44, 16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, x = 40 + Math.cos(a) * 34, y = 24 + Math.sin(a) * 14;
      g.fillStyle(0x8a8478, 1).fillRect(x - 4, y - 9, 8, 12);
      g.fillStyle(0xb8b0a0, 1).fillRect(x - 4, y - 9, 8, 3);
    }
    g.generateTexture(key, 80, 44);
    g.destroy();
  }

  cleanup(): void {
    for (const d of [...this.dens]) this.remove(d);
    for (const d of [...this.mirrors.values()]) this.dropMirror(d);
  }

  /** Region of a den, for the map (unused regions never get dens). */
  regionName(d: RaidDen): string { return REGIONS.get(d.region)?.name ?? ''; }
}
