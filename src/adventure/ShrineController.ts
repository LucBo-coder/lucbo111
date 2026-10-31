import Phaser from 'phaser';
import { audio } from '../systems/audio';
import { canUse } from '../core/field';
import { investigated } from '../core/legendClues';
import { LEGENDS, missingConditions } from '../core/legends';
import { DUNGEON, EX, SCALE, TILE_PX } from '../core/map/tiles';
import type { LegendSite } from '../core/map/valley';
import type { MapObject } from '../core/map/mapProvider';
import { clockwise, relicsDue, roamFlag, RITUALS, RitualRun, type RitualDef, type RitualEvent, type RitualStep } from '../core/rituals';
import { activeHazard, HAZARD_TELEGRAPH, hazardPoints } from '../core/shrineHazards';
import { SHRINES, shrineBounds, shrineCells, shrineFind, type ShrineDef } from '../core/shrines';
import { makeWildState } from '../core/wildAI';
import type { Unit } from '../core/world';
import { ITEM_DEFS } from '../core/evolution';
import type { AdventureScene } from '../scenes/AdventureScene';

// Legendary shrines in the scene (LEGENDARY_SHRINES.md §2.2): walking into a shrine never summons anything any more —
// the player presses E on the ritual spot `P`, does the shrine's ritual (core/rituals), watches a short cutscene and
// the legendary appears on `+` (else the anchor). During the fight the arena is sealed (the trainer stays inside
// radius R; E on `P` again offers to leave and resets the fight as before) and the shrine's hazards strike in turn.
// Non-fight shrines: roaming triggers (Mesprit's stone, the Lati wind terrace, Ho-Oh's three Beast statues), the
// Kyogre / Temple gates (portals to their own planes) and Manaphy's reef (the egg).

interface Cell { tx: number; ty: number; x: number; y: number }
interface View {
  site: LegendSite;
  sh: ShrineDef;
  rit: RitualDef;
  /** ritual spot / legendary spawn / arena centre (px) */
  P: { x: number; y: number };
  spawn: { x: number; y: number };
  /** arena radius (px, 0 = no arena) */
  R: number;
  parts: Map<string, Cell[]>;
  floor: { x: number; y: number }[];
  cores: Phaser.GameObjects.Image[];
}

const TOUCH = 'shrine-part:';
const WAKE = 'shrine-wake:';
const SPOT = 'shrine:';

export class ShrineController {
  private views = new Map<string, View>();
  private run: { v: View; r: RitualRun; lastX: number; lastY: number; wave: number; busy: boolean } | null = null;
  private fight: { v: View; unit: Unit; hazT: number; seal: Phaser.GameObjects.Graphics } | null = null;
  private glow: Phaser.GameObjects.Image[] = [];
  /** plates pressed in the current step */
  private marks: Phaser.GameObjects.Image[] = [];
  private cooldown = new Map<string, number>();
  private relicT = 0;
  private t = 0;

  constructor(private scene: AdventureScene) {}

  private get adv() { return this.scene.state.adv; }
  private has = (f: string) => this.scene.state.hasFlag(f);

  /** Shrine sites of the current map that the scene must not auto-summon (the ritual does). */
  manages(siteId: string): boolean {
    return this.views.has(siteId);
  }

  build(): void {
    for (const site of this.scene.regionDef.legendaries ?? []) {
      const sh = site.shrine ? SHRINES.get(site.shrine) : undefined;
      const rit = sh && RITUALS.get(sh.id);
      if (!sh || !rit) continue;
      const [x0, y0] = shrineBounds(sh, site.x, site.y);
      const px = (c: [number, number]) => ({ x: (x0 + c[0] + 0.5) * TILE_PX, y: (y0 + c[1] + 0.5) * TILE_PX });
      const P = px(shrineFind(sh, 'P')!);
      const plus = shrineFind(sh, '+');
      const spawn = plus ? px(plus) : { x: (site.x + 0.5) * TILE_PX, y: (site.y + 0.5) * TILE_PX };
      const parts = new Map<string, Cell[]>();
      const floor: { x: number; y: number }[] = [];
      const cores: Phaser.GameObjects.Image[] = [];
      for (const c of shrineCells(sh, site.x, site.y)) {
        const cell = { tx: c.tx, ty: c.ty, x: (c.tx + 0.5) * TILE_PX, y: (c.ty + 0.5) * TILE_PX };
        if ('OoS*&12'.includes(c.ch)) { const l = parts.get(c.ch) ?? []; l.push(cell); parts.set(c.ch, l); }
        if (c.ch === 'x') floor.push(cell);
        if (c.ch === 'A') cores.push(this.scene.add.image(cell.x, cell.y - 6, 'glow').setTint(rit.color || 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(cell.y + 30).setScale(1.6).setAlpha(0.3));
      }
      // the touch order of a part ('12': both pad kinds together) runs clockwise from north around the anchor
      for (const [k, l] of parts) parts.set(k, clockwise(l, (site.x + 0.5) * TILE_PX, (site.y + 0.5) * TILE_PX));
      const pads = [...(parts.get('1') ?? []), ...(parts.get('2') ?? [])];
      if (pads.length) parts.set('12', clockwise(pads, (site.x + 0.5) * TILE_PX, (site.y + 0.5) * TILE_PX));
      const v: View = { site, sh, rit, P, spawn, R: sh.arena ? sh.arena * TILE_PX : 0, parts, floor, cores };
      this.views.set(site.id, v);
      this.addSpot(v);
      if (rit.wake) (parts.get('S') ?? []).forEach((c, i) => rit.wake![i] && this.addWake(v, c, rit.wake![i]));
    }
    this.syncProgress(true);
  }

  private addSpot(v: View): void {
    const id = SPOT + v.site.id;
    const obj: MapObject = { kind: 'shrine', id, x: Math.floor(v.P.x / TILE_PX), y: Math.floor(v.P.y / TILE_PX), data: { site: v.site.id } };
    this.scene.interactables.set(id, { kind: 'shrine', id, x: v.P.x, y: v.P.y, label: v.rit.title || v.site.name, obj });
  }

  private addWake(v: View, c: Cell, legend: string): void {
    if (this.has(roamFlag(legend))) return;
    const id = WAKE + legend;
    const obj: MapObject = { kind: 'shrine', id, x: c.tx, y: c.ty, data: { site: v.site.id, wake: legend } };
    this.scene.interactables.set(id, { kind: 'shrine', id, x: c.x, y: c.y + 30, label: `Tượng ${this.scene.speciesName(legend)}`, obj });
  }

  /** Relics earned since the last check, roamers already met before the triggers existed (old saves). */
  private syncProgress(quiet = false): void {
    const owned = (i: string) => (this.scene.state.save.inventory[i] ?? 0) > 0;
    const due = relicsDue(this.has, (l) => investigated(l, this.has), owned);
    if (due.length) {
      this.scene.state.addItems(Object.fromEntries(due.map((i) => [i, 1])));
      if (!quiet) this.scene.ui?.eventAlert(`Nhận thánh vật: ${due.map((i) => ITEM_DEFS.get(i)?.name ?? i).join(', ')}`, '#ffe8a0');
    }
    for (const l of LEGENDS.values()) {
      const f = l.requires.find((r) => r.startsWith('roam:'));
      if (f && !this.has(f) && (this.adv.legends[l.id] && this.adv.legends[l.id] !== 'locked' || this.has('boss:' + l.id))) this.scene.state.setFlag(f);
    }
  }

  // ───────────────────────────── interaction ─────────────────────────────

  async interact(id: string, data: { site: string; part?: string; i?: number; wake?: string }): Promise<void> {
    const v = this.views.get(data.site);
    if (!v) return;
    if (data.part != null) {
      if (this.run?.v === v) { this.run.r.touch(data.part, data.i!); this.process(); }
      return;
    }
    if (data.wake) return this.wake(v, data.wake, id);
    return this.atSpot(v);
  }

  private async say(lines: string[], choices?: { label: string; value: string }[]): Promise<string | null> {
    return this.scene.say(this.run?.v.rit.title ?? 'Đền huyền thoại', lines, choices);
  }

  private async atSpot(v: View): Promise<void> {
    const s = this.scene, rit = v.rit, title = rit.title || v.site.name;
    if (this.fight?.v === v) {
      const r = await s.say(title, ['Rời trận? Huyền thoại sẽ trở về trạng thái ban đầu.'], [{ label: 'Rời trận', value: 'leave' }, { label: 'Chiến tiếp', value: 'stay' }]);
      if (r === 'leave') { s.abandonWorldBoss(); this.endFight(); s.ui.banner('Cổng niêm phong mở ra. Huyền thoại trở lại giấc ngủ.', '#c8d8ff'); }
      return;
    }
    if (this.run?.v === v) { const st = this.run.r.step; if (st) s.ui.banner(st.text, '#e0d0ff'); return; }
    if (this.run) return;
    const need = [...(rit.requires ?? []), ...(LEGENDS.get(rit.legends[0])?.requires ?? [])].filter((f) => !f.startsWith('roam:'));
    const mode = rit.mode ?? 'fight';
    if (!v.site.requires.every(this.has) || !need.every(this.has)) {
      await s.say(title, [v.site.hint || 'Lõi đền ngủ say. Có lẽ cần chứng tỏ bản thân ở nơi khác trước.']);
      return;
    }
    const cd = this.cooldown.get(v.site.id) ?? 0;
    if (cd > s.time.now) { s.ui.banner(`Ánh sáng chưa quay lại (còn ${Math.ceil((cd - s.time.now) / 1000)} giây)`, '#c8d8ff'); return; }
    const cond = v.site.condition;
    const miss = cond ? missingConditions({ ...cond, weather: cond.weather as never }, s.legendEnv()) : [];
    if (miss.length) { await s.say(title, [`${v.site.name}: chỉ thức dậy khi ${miss.join(', ')}.`]); return; }
    if (mode === 'roam') return this.roam(v);
    if (mode === 'egg') return this.egg(v);
    if (mode !== 'portal') {
      const legend = v.site.id;
      if (s.worldBoss?.alive || s.world.boss?.alive) { s.ui.banner('Một trận chiến khác đang diễn ra.', '#ffb0a0'); return; }
      if (mode === 'gift' && this.adv.legends[legend] === 'caught') { await s.say(title, ['Miếu đã được thanh tịnh. Không còn gì ở đây nữa.']); return; }
      const last = this.adv.bossDefeatedAt[legend];
      if (last != null && s.playNow() - last < v.site.respawn) {
        const m = Math.ceil((v.site.respawn - (s.playNow() - last)) / 60);
        await s.say(title, [`Lõi đền đã được thanh tịnh, đang ngủ yên (khoảng ${m} phút nữa sẽ thức lại).`]);
        return;
      }
      // a ritual done once is remembered: a rematch only needs E here
      if ((this.adv.rites ?? []).includes(v.sh.id)) { this.awaken(v); return; }
    }
    if (!rit.steps.length) { this.complete(v); return; }
    const counts = Object.fromEntries([...v.parts].map(([k, l]) => [k, l.length]));
    const t = s.world.trainer;
    this.run = { v, r: new RitualRun(rit, counts), lastX: t.x, lastY: t.y, wave: 0, busy: false };
    s.ui.banner(`${title}: nghi lễ bắt đầu`, '#ffe8a0');
    audio.play('levelup');
    this.process();
  }

  private async roam(v: View): Promise<void> {
    const fresh = v.rit.legends.filter((l) => !this.has(roamFlag(l)));
    if (!fresh.length) { await this.scene.say(v.rit.title, ['Nơi này giờ đã yên tĩnh. Những huyền thoại đã lên đường.']); return; }
    for (const l of fresh) this.scene.state.setFlag(roamFlag(l));
    this.appearFx(v, v.P);
    this.scene.ui.questComplete(v.rit.title, [v.rit.awaken]);
    this.scene.persist();
  }

  private async wake(v: View, legend: string, id: string): Promise<void> {
    const s = this.scene;
    if (this.run?.v === v) return;
    if (!this.has('boss:mega-venusaur')) { await s.say('Tượng đá', ['Một bức tượng Thú phủ rêu. Nó như đang chờ một nhà huấn luyện đủ mạnh.']); return; }
    if (this.has(roamFlag(legend))) return;
    s.state.setFlag(roamFlag(legend));
    s.interactables.delete(id);
    const name = s.speciesName(legend);
    s.renderer_.vfx.flash(s.world.trainer.x, s.world.trainer.y - 30, 120, v.rit.color, 600);
    s.cameras.main.shake(400, 0.006);
    s.ui.questComplete(`${name} đã thức giấc!`, [`Bức tượng nứt ra, một bóng hình vụt chạy khỏi Tháp Chuông. ${name} bắt đầu lang thang khắp vùng.`]);
    s.persist();
  }

  private async egg(v: View): Promise<void> {
    const s = this.scene, adv = this.adv;
    const owns = s.state.save.collection.some((p) => p.species === 'manaphy') || adv.eggs.some((e) => e.species === 'manaphy');
    if (owns || adv.legends.manaphy === 'caught') { await s.say(v.rit.title, ['Vỏ sò khổng lồ khép lại. Rạn san hô lấp lánh dưới nước.']); return; }
    adv.eggs.push({ species: 'manaphy', hatchAt: adv.playTime + (LEGENDS.get('manaphy')?.hatch ?? 600) });
    this.appearFx(v, v.P);
    s.ui.questComplete(v.rit.title, [v.rit.awaken, 'Nhận được: Trứng Manaphy']);
    s.persist();
  }

  // ───────────────────────────── ritual ─────────────────────────────

  private abort(msg: string): void {
    const r = this.run;
    if (!r) return;
    this.clearRitual();
    this.scene.ui.banner(msg, '#ffb0a0');
  }

  private clearRitual(): void {
    for (const k of [...this.scene.interactables.keys()]) if (k.startsWith(TOUCH)) this.scene.interactables.delete(k);
    for (const e of this.scene.world.enemies) if (e.tag === 'ritual' && e.alive) this.scene.world.removeEnemy(e);
    this.glow.forEach((g) => g.destroy());
    this.glow = [];
    this.marks.forEach((g) => g.destroy());
    this.marks = [];
    this.run = null;
  }

  private process(): void {
    const r = this.run;
    if (!r) return;
    for (let guard = 0; guard < 20 && this.run === r; guard++) {
      const evs = r.r.drain();
      if (!evs.length) break;
      for (const e of evs) { this.onEvent(r.v, e); if (this.run !== r) return; }
    }
  }

  private onEvent(v: View, e: RitualEvent): void {
    const s = this.scene, r = this.run!;
    switch (e.t) {
      case 'step': this.beginStep(v, e.step); break;
      case 'light': this.light(v, e.part, e.index); break;
      case 'progress': {
        s.ui.banner(`${v.rit.title}: ${e.done}/${e.of}`, '#ffe8a0');
        audio.play('gem');
        // a pressed plate stays lit (Shaymin: the watered clump blooms)
        const st = r.r.step;
        const c = st?.kind === 'plates' ? v.parts.get(st.part)?.[st.order[e.done - 1]] : undefined;
        if (c) this.marks.push(s.add.image(c.x, c.y, 'ow_tiles', v.sh.materials.plate === 'flower' ? EX.flowerBloom : DUNGEON.plateOn).setScale(SCALE).setDepth(-49));
        break;
      }
      case 'wave': if (e.n < e.of) this.spawnWave(v, e.n + 1); break;
      case 'fail':
        if (e.cooldown) { this.cooldown.set(v.site.id, s.time.now + e.cooldown * 1000); this.abort(`${e.reason} (thử lại sau ${e.cooldown} giây)`); return; }
        s.ui.banner(e.reason, '#ffb0a0');
        break;
      case 'complete': this.clearRitual(); this.complete(v); break;
    }
  }

  private beginStep(v: View, st: RitualStep): void {
    const s = this.scene, r = this.run!;
    for (const k of [...s.interactables.keys()]) if (k.startsWith(TOUCH)) s.interactables.delete(k);
    this.glow.forEach((g) => g.destroy());
    this.glow = [];
    this.marks.forEach((g) => g.destroy());
    this.marks = [];
    s.ui.banner(st.text, '#e0d0ff');
    switch (st.kind) {
      case 'relic': {
        const owned = (i: string) => (s.state.save.inventory[i] ?? 0) > 0;
        const missing = st.items.filter((i) => !owned(i));
        // a legend already beaten has proven the trainer; an alt weather (blizzard…) replaces the relic
        if (!missing.length || v.rit.legends.some((l) => this.has('boss:' + l)) || st.alt?.includes(s.effectiveWeather())) {
          if (!missing.length) s.ui.eventAlert(`Đặt thánh vật: ${st.items.map((i) => ITEM_DEFS.get(i)?.name ?? i).join(', ')}`, '#ffe8a0');
          r.r.pass();
        } else this.abort(`Thiếu thánh vật: ${missing.map((i) => ITEM_DEFS.get(i)?.name ?? i).join(', ')}`);
        break;
      }
      case 'field': {
        const chk = canUse(st.ability, s.partyMembers(), { has: this.has });
        if (chk.ok) {
          // the member able to do it comes out of its ball first (one Pokémon per trainer)
          void s.bringOut(chk.by, 'năng lực khám phá').then((ok) => {
            if (!ok) return this.abort('Chưa đổi được Pokémon phù hợp — thử lại sau');
            if (chk.by) s.ui.eventAlert(`${chk.by.name} dùng năng lực khám phá`, '#a0e0ff');
            r.r.pass();
          });
        } else this.abort(chk.reason);
        break;
      }
      case 'quiz': void this.quiz(st); break;
      case 'waves': r.wave = 0; this.spawnWave(v, 1); break;
      case 'sequence': {
        (v.parts.get(st.part) ?? []).forEach((c, i) => {
          const id = `${TOUCH}${v.site.id}:${i}`;
          const obj: MapObject = { kind: 'shrine', id, x: c.tx, y: c.ty, data: { site: v.site.id, part: st.part, i } };
          s.interactables.set(id, { kind: 'shrine', id, x: c.x, y: c.y + 26, label: 'Chạm vào', obj });
        });
        break;
      }
      case 'plates':
        if (st.hidden) for (const c of v.parts.get(st.part) ?? []) this.glow.push(this.glowAt(c.x, c.y, v.rit.color, 0.35));
        break;
      case 'still': break;
    }
  }

  private glowAt(x: number, y: number, tint: number, alpha = 0.9): Phaser.GameObjects.Image {
    const g = this.scene.add.image(x, y, 'glow').setTint(tint || 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 40).setScale(2).setAlpha(alpha);
    this.scene.tweens.add({ targets: g, scale: 1.4, alpha: alpha * 0.5, duration: 500, yoyo: true, repeat: -1 });
    return g;
  }

  private light(v: View, part: string, index: number): void {
    const c = v.parts.get(part)?.[index];
    if (!c) return;
    const st = this.run?.r.step;
    if (st?.kind !== 'plates' || !st.hidden) { this.glow.forEach((g) => g.destroy()); this.glow = []; }
    this.glow.push(this.glowAt(c.x, c.y - (part === '&' || part === '12' ? 0 : 20), v.rit.color));
    audio.play('click');
  }

  private async quiz(st: Extract<RitualStep, { kind: 'quiz' }>): Promise<void> {
    const r = this.run!;
    r.busy = true;
    for (const q of st.questions) {
      const a = await this.say([q.q], q.options.map((o, i) => ({ label: o, value: String(i) })));
      if (this.run !== r) return;
      if (a !== String(q.answer)) { r.busy = false; this.abort('Câu trả lời sai. Tấm bia tối lại — hãy đọc kỹ rồi thử lại.'); return; }
    }
    r.busy = false;
    r.r.pass();
    this.process();
  }

  private spawnWave(v: View, n: number): void {
    const s = this.scene, st = this.run?.r.step;
    if (st?.kind !== 'waves') return;
    this.run!.wave = n;
    const lv = Math.max(5, v.site.level - 12 + n * 2);
    const count = 2 + n;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + n;
      const x = v.P.x + Math.cos(a) * 260, y = v.P.y + Math.sin(a) * 260;
      const sp = st.species[(i + n) % st.species.length];
      s.world.spawnWild(sp, lv, x, y, { wild: makeWildState(x, y, 'aggressive', { homeR: 60, aggroR: 600, leash: 900 }), hostile: true, tag: 'ritual', noCapture: true });
    }
    s.ui.banner(`Đợt ${n}/${st.waves}`, '#ffd080');
  }

  private complete(v: View): void {
    const s = this.scene, mode = v.rit.mode ?? 'fight';
    if (mode === 'portal') {
      this.appearFx(v, v.P);
      s.ui.banner(v.rit.awaken, '#c8e0ff');
      const to = v.rit.to!;
      s.time.delayedCall(900, () => s.travelTo(to.region, to.x, to.y));
      return;
    }
    const rites = (this.adv.rites ??= []);
    if (!rites.includes(v.sh.id)) rites.push(v.sh.id);
    s.persist();
    this.awaken(v);
  }

  /** Cutscene: camera to the spawn point, the legendary's own entrance, then the fight (or the meeting). */
  private awaken(v: View): void {
    const s = this.scene, cam = s.cameras.main;
    s.modal = true;
    cam.stopFollow();
    cam.pan(v.spawn.x, v.spawn.y, 700, 'Sine.easeInOut');
    audio.play('boss');
    s.ui.banner(v.rit.awaken, '#ffe8a0');
    s.time.delayedCall(700, () => this.appearFx(v, v.spawn));
    s.time.delayedCall(1700, () => {
      cam.pan(s.world.trainer.x, s.world.trainer.y, 500, 'Sine.easeInOut');
      if ((v.rit.mode ?? 'fight') === 'gift') { s.modal = false; void s.legendGift(v.site.id, v.site.level); return; }
      const u = s.spawnSiteBoss(v.site, v.spawn);
      if (u) this.startFight(v, u);
    });
    s.time.delayedCall(2250, () => { cam.startFollow(s.renderer_.trainerSprite(), true, 0.12, 0.12); s.modal = false; });
  }

  private appearFx(v: View, p: { x: number; y: number }): void {
    const s = this.scene, fx = s.renderer_.vfx, c = v.rit.color || 0xffffff;
    switch (v.rit.appear) {
      case 'descend': fx.flash(p.x, p.y - 160, 140, c, 700); fx.named('wind_burst', p.x, p.y, 120); break;
      case 'rise': fx.named('quake', p.x, p.y, 140); s.cameras.main.shake(900, 0.01); break;
      case 'shatter': fx.named('evolve', p.x, p.y, 100); fx.emit('ice', p.x, p.y, 30); break;
      case 'burst': fx.named('explosion_fire', p.x, p.y, 140); break;
      case 'wall': fx.named('rock', p.x, p.y - 40, 120); s.cameras.main.shake(700, 0.012); break;
      case 'shadow': fx.flash(p.x, p.y, 160, 0x201028, 900, false); fx.emit('ghost', p.x, p.y, 30); break;
      case 'reflect': fx.flash(p.x, p.y, 150, 0xf0e8ff, 900); fx.emit('fairy', p.x, p.y, 30); break;
      case 'coil': for (let i = 0; i < 6; i++) s.time.delayedCall(i * 110, () => fx.ring(p.x, p.y, 60 + i * 30, c, 500)); fx.emit('dragon', p.x, p.y, 26); break;
      case 'fly': fx.named('wind_burst', p.x, p.y, 110); fx.emit('psychic', p.x, p.y, 20); break;
      default: fx.named('mega', p.x, p.y, 100);
    }
  }

  // ───────────────────────────── fight ─────────────────────────────

  private startFight(v: View, unit: Unit): void {
    const s = this.scene, t = s.world.trainer;
    // the seal closes: a trainer standing outside (ritual spot in a back hall) is moved to the arena edge
    if (v.R) {
      const dx = t.x - v.spawn.x, dy = t.y - v.spawn.y, d = Math.hypot(dx, dy) || 1;
      if (d > v.R - TILE_PX) s.world.teleport(v.spawn.x + (dx / d) * (v.R - TILE_PX * 1.5), v.spawn.y + (dy / d) * (v.R - TILE_PX * 1.5));
    }
    const seal = s.add.graphics().setDepth(-4);
    this.fight = { v, unit, hazT: 4, seal };
    if (v.R) s.ui.banner('Cổng niêm phong đã đóng! (bấm E ở chỗ làm lễ để rời trận)', '#ffd080');
  }

  private endFight(): void {
    this.fight?.seal.destroy();
    this.fight = null;
  }

  /** The point of the arena closest to the ritual spot (where E offers to leave). */
  private leavePoint(v: View): { x: number; y: number } {
    const dx = v.P.x - v.spawn.x, dy = v.P.y - v.spawn.y, d = Math.hypot(dx, dy);
    if (!v.R || d <= v.R - TILE_PX) return v.P;
    return { x: v.spawn.x + (dx / d) * (v.R - TILE_PX * 1.5), y: v.spawn.y + (dy / d) * (v.R - TILE_PX * 1.5) };
  }

  private updateFight(dt: number): void {
    const f = this.fight!, s = this.scene, v = f.v, t = s.world.trainer;
    if (!f.unit.alive || s.worldBoss !== f.unit) { this.endFight(); return; }
    // keep the trainer inside the sealed arena
    if (v.R) {
      const dx = t.x - v.spawn.x, dy = t.y - v.spawn.y, d = Math.hypot(dx, dy), max = v.R - TILE_PX * 0.5;
      if (d > max) { t.x = v.spawn.x + (dx / d) * max; t.y = v.spawn.y + (dy / d) * max; }
      const pulse = 0.5 + 0.3 * Math.sin(this.t * 4);
      f.seal.clear().lineStyle(5, v.rit.color || 0xffffff, pulse).strokeCircle(v.spawn.x, v.spawn.y, v.R).lineStyle(2, 0xffffff, pulse * 0.6).strokeCircle(v.spawn.x, v.spawn.y, v.R - 8);
      const lp = this.leavePoint(v), it = s.interactables.get(SPOT + v.site.id);
      if (it) { it.x = lp.x; it.y = lp.y; it.label = 'Rời trận'; }
    }
    // hazards: one kind at a time (by phase), never during a transition or the capture window
    const b = f.unit.boss;
    const h = activeHazard(v.rit.hazards, b?.pm.index ?? 0);
    if (!h || !b || !b.pm.canAct || b.weakened) return;
    f.hazT -= dt;
    if (f.hazT > 0) return;
    f.hazT = h.every;
    const pts = hazardPoints(h, { cx: v.spawn.x, cy: v.spawn.y, R: v.R || 8 * TILE_PX, trainer: t, boss: f.unit, floor: v.floor }, () => s.world.rng.next());
    for (const p of pts) s.world.addHazard(p.x, p.y, p.r, HAZARD_TELEGRAPH, h.power, h.type, f.unit.level);
  }

  // ───────────────────────────── per frame ─────────────────────────────

  update(dt: number): void {
    this.t += dt;
    this.relicT -= dt;
    if (this.relicT <= 0) { this.relicT = 2; this.syncProgress(); }
    if (this.fight) this.updateFight(dt);
    else for (const v of this.views.values()) {
      const it = this.scene.interactables.get(SPOT + v.site.id);
      if (it && it.label === 'Rời trận') { it.x = v.P.x; it.y = v.P.y; it.label = v.rit.title || v.site.name; }
    }
    this.updateCores();
    const r = this.run;
    if (!r || r.busy || this.scene.modal) return;
    const t = this.scene.world.trainer, st = r.r.step;
    if (Math.hypot(t.x - r.v.P.x, t.y - r.v.P.y) > 15 * TILE_PX) { this.abort('Bạn đã rời khỏi đền — nghi lễ bị gián đoạn.'); return; }
    const moved = Math.hypot(t.x - r.lastX, t.y - r.lastY) > 0.5;
    r.lastX = t.x; r.lastY = t.y;
    if (st?.kind === 'plates') {
      const tx = Math.floor(t.x / TILE_PX), ty = Math.floor(t.y / TILE_PX);
      const i = (r.v.parts.get(st.part) ?? []).findIndex((c) => c.tx === tx && c.ty === ty);
      if (i >= 0) r.r.stepOn(st.part, i);
    } else if (st?.kind === 'waves') {
      if (Math.hypot(t.x - r.v.P.x, t.y - r.v.P.y) > st.ring * TILE_PX) { this.abort('Bạn đã bước ra khỏi vòng thử thách!'); return; }
      if (!this.scene.world.enemies.some((e) => e.tag === 'ritual' && e.alive && !e.captured && !e.fainted)) r.r.waveCleared();
    } else if (st?.kind === 'still') {
      // standing still on the ritual spot
      const off = Math.hypot(t.x - r.v.P.x, t.y - r.v.P.y) > TILE_PX * 1.2;
      r.r.tick(dt, moved || off, this.scene.effectiveWeather());
    } else r.r.tick(dt, moved, this.scene.effectiveWeather());
    this.process();
  }

  /** Core glow: asleep (dim, slow), awake (ritual / fight: bright, fast), purified (after a win: soft, steady). */
  private updateCores(): void {
    for (const v of this.views.values()) {
      if (!v.cores.length) continue;
      const awake = this.run?.v === v || this.fight?.v === v;
      const last = this.adv.bossDefeatedAt[v.site.id];
      const purified = !awake && (last != null && this.scene.playNow() - last < v.site.respawn || this.adv.legends[v.site.id] === 'caught' && v.rit.mode === 'gift');
      const a = awake ? 0.75 + 0.25 * Math.sin(this.t * 7) : purified ? 0.45 : 0.22 + 0.1 * Math.sin(this.t * 1.6);
      const sc = awake ? 2.4 + 0.3 * Math.sin(this.t * 7) : purified ? 1.8 : 1.5;
      for (const g of v.cores) g.setAlpha(a).setScale(sc).setTint(purified ? 0xf0f8ff : v.rit.color || 0xffffff);
    }
  }

  /** E on a site's ritual spot (debug / tests: same as walking there and pressing E). */
  open(siteId: string): Promise<void> {
    const v = this.views.get(siteId);
    return v ? this.atSpot(v) : Promise.resolve();
  }

  shrineOf(siteId: string): string | null {
    return this.views.get(siteId)?.sh.id ?? null;
  }

  /** Ritual state (debug / tests). */
  debug(): { run: { site: string; step: number; kind?: string; lit: number; done: number } | null; fight: string | null; views: string[] } {
    const r = this.run;
    return { run: r ? { site: r.v.site.id, step: r.r.index, kind: r.r.step?.kind, lit: r.r.lit, done: r.r.done } : null, fight: this.fight?.v.site.id ?? null, views: [...this.views.keys()] };
  }

  /** Tile of a ritual part (debug / tests): where to stand / what to touch. */
  partTile(site: string, part: string, i: number): { x: number; y: number } | null {
    const c = this.views.get(site)?.parts.get(part)?.[i];
    return c ? { x: c.x, y: c.y } : null;
  }

  spot(site: string): { P: { x: number; y: number }; spawn: { x: number; y: number }; R: number } | null {
    const v = this.views.get(site);
    return v ? { P: v.P, spawn: v.spawn, R: v.R } : null;
  }

  cleanup(): void {
    this.clearRitual();
    this.endFight();
    for (const v of this.views.values()) v.cores.forEach((g) => g.destroy());
    this.views.clear();
  }
}
