import Phaser from 'phaser';
import type { AdventureScene } from '../scenes/AdventureScene';
import type { DialogueChoice } from '../scenes/AdventureUI';
import type { ObjectiveDef, QuestDef } from '../core/quests';
import { cutscenePages, holdTick, waveDue, type Cutscene, type EncounterDef, type HoldState, type StoryDef } from '../core/story';
import { storyOf } from '../core/storyData';
import { makeWildState } from '../core/wildAI';
import { npcLook } from '../core/npcLooks';
import { buildNpcLook, sheetKey } from '../render/animation';
import type { Unit, WorldEvent } from '../core/world';
import { TILE_PX } from '../core/map/tiles';
import { audio } from '../systems/audio';

const SCALE = 3;

/** A running encounter objective (hold / destroy / escort) of the active story quest on this map. */
interface Running {
  quest: string;
  step: number;
  obj: ObjectiveDef;
  def: EncounterDef;
  /** world px */
  x: number;
  y: number;
  t: number;
  hold: HoldState;
  wave: number;
  spawned: Unit[];
  device: Unit | null;
  g: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  escort: { img: Phaser.GameObjects.Sprite; following: boolean } | null;
}

/**
 * Story of the campaign being played: cutscenes (played once when their quest starts / ends, skippable, every one
 * readable again in the journal) and the encounter objectives of the story quests. An encounter lives only on its
 * map: leaving the map, a blackout or stepping away too long resets it (the objective itself is never lost).
 */
export class StoryController {
  readonly story: StoryDef;
  private queue: string[] = [];
  private playing = false;
  private run: Running | null = null;
  private checkT = 0;

  constructor(private scene: AdventureScene) {
    this.story = storyOf(scene.state.adv.campaign);
    scene.events.once('shutdown', () => this.stopEncounter());
  }

  private get seen(): string[] { return (this.scene.state.adv.storySeen ??= []); }

  cutscene(id: string): Cutscene | undefined { return this.story.cutscenes.find((c) => c.id === id); }

  /** Cutscenes already seen, in story order (journal). */
  seenCutscenes(): Cutscene[] { return this.story.cutscenes.filter((c) => this.seen.includes(c.id)); }

  characterName(who: string): string { return this.story.characters.find((c) => c.id === who)?.name ?? who; }

  /** Queues the cutscene of a quest that just started / ended (played when no dialogue or fight is going on). */
  onQuest(q: QuestDef, when: 'start' | 'complete'): void {
    const id = q.cutscene?.[when];
    if (id && !this.seen.includes(id) && !this.queue.includes(id)) this.queue.push(id);
  }

  /**
   * Plays a cutscene. It is marked seen as soon as it starts (skipping counts as seen; the journal keeps it).
   * `replay`: from the journal, never changes anything.
   */
  async play(id: string, replay = false): Promise<void> {
    const c = this.cutscene(id);
    if (!c || this.playing) return;
    this.playing = true;
    if (!replay && !this.seen.includes(id)) { this.seen.push(id); this.scene.persist(); }
    try {
      const pages = cutscenePages(c, (w) => this.characterName(w));
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const last = i === pages.length - 1;
        const choices: DialogueChoice[] | undefined = last ? undefined : [{ label: 'Tiếp ▶', value: 'next' }, { label: 'Bỏ qua cảnh', value: 'skip' }];
        const r = await this.scene.say(p.speaker || c.title, p.lines, choices, this.portrait(p.speaker));
        if (r === 'skip') break;
      }
    } finally {
      this.playing = false;
    }
  }

  /** Portrait of a speaker: the character's NPC on this map (story people: any `<npc>-<map>` copy of them). */
  private portrait(speaker: string): string | undefined {
    const npc = this.story.characters.find((ch) => ch.name === speaker)?.npc;
    if (!npc) return undefined;
    const d = this.scene.regionDef;
    const here = [...d.npcs, ...d.trainers].find((n) => n.id === npc || n.id.startsWith(npc + '-'));
    return here ? this.scene.portraitOf(here.id) : undefined;
  }

  update(dt: number): void {
    const s = this.scene;
    // cutscenes wait for a calm moment: no dialogue, no fight, no trainer battle
    if ((this.checkT -= dt) <= 0) {
      this.checkT = 0.5;
      for (const q of s.state.quests.active()) this.onQuest(q, 'start');
      if (this.queue.length && !this.playing && !s.modal && !s.inCombat() && !s.battle) void this.play(this.queue.shift()!);
      this.syncEncounter();
    }
    if (this.run) this.stepEncounter(dt);
  }

  // ───────────────────────────── encounters ─────────────────────────────

  /** The encounter objective that should run on this map now (current objective of an active story quest). */
  private wanted(): { q: QuestDef; obj: ObjectiveDef; step: number } | null {
    const s = this.scene, qs = s.state.quests;
    if (s.mapKind === 'dungeon') return null;
    for (const q of qs.active()) {
      const obj = qs.currentObjective(q.id);
      if (obj?.encounter && obj.encounter.region === s.regionDef.id) return { q, obj, step: qs.states[q.id].step };
    }
    return null;
  }

  private syncEncounter(): void {
    const w = this.wanted();
    if (this.run && (!w || w.q.id !== this.run.quest || w.step !== this.run.step)) this.stopEncounter();
    if (!this.run && w) this.startEncounter(w.q.id, w.step, w.obj);
  }

  private startEncounter(quest: string, step: number, obj: ObjectiveDef): void {
    const s = this.scene, def = obj.encounter!;
    const x = (def.x + 0.5) * TILE_PX, y = (def.y + 0.5) * TILE_PX;
    const g = s.add.graphics().setDepth(-15);
    const label = s.add.text(x, y - 70, '', { fontFamily: '"VT323", monospace', fontSize: '26px', color: '#ffe080', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(9100);
    let escort: Running['escort'] = null;
    if (def.kind === 'escort' && def.npc) {
      const ex = (def.npc.fromX + 0.5) * TILE_PX, ey = (def.npc.fromY + 0.5) * TILE_PX;
      const look = npcLook(def.npc.look ?? 'escort:' + quest, def.npc.sprite ?? 'villager', def.npc.name, {});
      const key = look ? buildNpcLook(s, look) : null;
      const img = key ? s.add.sprite(ex, ey, sheetKey(key), 0).setScale(SCALE).play(key + ':idle') : s.add.sprite(ex, ey, 'ow_tiles', 0).setScale(SCALE);
      img.setDepth(ey);
      escort = { img, following: false };
    }
    this.run = { quest, step, obj, def, x, y, t: 0, hold: { t: 0, out: 0 }, wave: -1, spawned: [], device: null, g, label, escort };
  }

  private stopEncounter(): void {
    const r = this.run;
    if (!r) return;
    for (const u of r.spawned) if (u.alive) this.scene.world.removeEnemy(u);
    if (r.device?.alive) this.scene.world.removeEnemy(r.device);
    r.g.destroy(); r.label.destroy(); r.escort?.img.destroy();
    this.run = null;
  }

  /** The device of a 'destroy' objective went down (AdventureScene.handleDown). */
  onDown(e: Extract<WorldEvent, { t: 'death' }>): void {
    const r = this.run;
    if (!r || r.def.kind !== 'destroy' || !r.device || e.id !== r.device.id) return;
    r.device = null;
    this.finish('Thiết bị đã bị phá hủy!');
  }

  private finish(msg: string): void {
    const r = this.run!;
    const target = r.obj.target ?? '';
    this.stopEncounter();
    this.scene.ui.banner(msg, '#80ff90');
    audio.play('levelup');
    this.scene.questEvent({ type: r.def.kind, target });
  }

  private spawnWave(r: Running, i: number): void {
    const s = this.scene, wave = r.def.waves?.[i] ?? [];
    wave.forEach(([sp, lv], k) => {
      const a = (k / Math.max(1, wave.length)) * Math.PI * 2 + i;
      const rad = ((r.def.radius ?? 4) + 4) * TILE_PX;
      const sx = r.x + Math.cos(a) * rad, sy = r.y + Math.sin(a) * rad;
      const u = s.world.spawnWild(sp, lv, sx, sy, { wild: makeWildState(sx, sy, 'aggressive', { homeR: 40, aggroR: 700, leash: 900 }), hostile: true, tag: 'story', noCapture: true });
      r.spawned.push(u);
    });
    if (wave.length) s.ui.banner(`Đợt ${i + 1}/${r.def.waves!.length} kéo tới!`, '#ffb060');
  }

  private stepEncounter(dt: number): void {
    const r = this.run!, s = this.scene, t = s.world.trainer, def = r.def;
    const rad = (def.radius ?? 4) * TILE_PX;
    const d = Math.hypot(t.x - r.x, t.y - r.y);
    r.g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(s.time.now / 300);
    switch (def.kind) {
      case 'hold': {
        if (d > 30 * TILE_PX && r.hold.t === 0) { r.label.setText(''); return; }
        const inside = d < rad && s.world.allies.some((a) => !a.fainted);
        const res = holdTick(r.hold, dt, inside, def);
        if (res.reset) {
          for (const u of r.spawned) if (u.alive) s.world.removeEnemy(u);
          r.spawned = []; r.t = 0; r.wave = -1;
          s.ui.banner('Mất điểm giữ — phải bắt đầu lại.', '#ff9080');
        }
        r.hold = res.st;
        if (r.hold.t > 0 || inside) {
          r.t += dt;
          const due = waveDue(r.t, def);
          while (r.wave < due) this.spawnWave(r, ++r.wave);
        }
        const need = def.seconds ?? 45;
        r.g.lineStyle(4, inside ? 0x80ff90 : 0xffd060, 0.5 + 0.4 * pulse).strokeCircle(r.x, r.y, rad);
        r.g.fillStyle(inside ? 0x80ff90 : 0xffd060, 0.08).fillCircle(r.x, r.y, rad);
        r.g.lineStyle(8, 0x80ff90, 0.9).beginPath().arc(r.x, r.y, rad + 10, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * r.hold.t) / need).strokePath();
        r.label.setPosition(r.x, r.y - rad - 30).setText(`${r.obj.text} — ${Math.ceil(need - r.hold.t)} s${inside ? '' : r.hold.t > 0 ? ' (quay lại vòng!)' : ''}`);
        if (res.done) this.finish('Đã giữ vững vị trí!');
        return;
      }
      case 'destroy': {
        if (!r.device && d < 16 * TILE_PX && def.device) {
          const u = s.world.spawnWild(def.device.species, def.device.level, r.x, r.y, { hostile: true, tag: 'story-device', noCapture: true, hpMult: def.device.hpMult ?? 4, wild: makeWildState(r.x, r.y, 'aggressive', { homeR: 1, aggroR: 420, leash: 4000 }) });
          u.name = def.device.name;
          u.moveSpeed = 0; // bolted to the ground
          r.device = u;
          s.ui.banner(`${def.device.name}: hãy cho Pokémon tấn công nó!`, '#ffd060');
        }
        if (r.device && !r.device.alive) { r.device = null; return; }
        if (r.device) {
          // bolted to its spot and never calms down (knock-back / the wild AI's leash would make it peaceful)
          const dv = r.device;
          dv.x = r.x; dv.y = r.y; dv.vx = 0; dv.vy = 0; dv.hostile = true;
          r.t += dt;
          const due = waveDue(r.t, def);
          while (r.wave < due) this.spawnWave(r, ++r.wave);
          r.g.lineStyle(3, 0xff6040, 0.4 + 0.5 * pulse).strokeCircle(r.x, r.y, 60);
          r.label.setPosition(r.x, r.y - 80).setText(`${def.device?.name} — ${Math.ceil((r.device.hp / r.device.maxHp) * 100)}%`);
        } else r.label.setText('');
        return;
      }
      case 'escort': {
        const e = r.escort;
        if (!e) return;
        const ed = Math.hypot(t.x - e.img.x, t.y - e.img.y);
        if (!e.following && ed < 2.5 * TILE_PX) { e.following = true; s.ui.banner(`${def.npc?.name ?? 'Người cần hộ tống'} đi theo bạn`, '#a0d8ff'); }
        if (e.following) {
          // follows a little behind; stops when hostile Pokémon are near (it hides until the way is clear)
          const danger = s.inCombat();
          if (!danger && ed > 1.4 * TILE_PX) {
            const k = Math.min(1, (dt * 3.2 * (ed - 1.2 * TILE_PX)) / ed);
            e.img.x += (t.x - e.img.x) * k; e.img.y += (t.y - e.img.y) * k;
            e.img.setDepth(e.img.y);
          }
          if (ed > 14 * TILE_PX) { e.following = false; s.ui.banner(`${def.npc?.name ?? 'Người cần hộ tống'} bị bỏ lại — quay lại đón!`, '#ff9080'); }
        }
        r.g.lineStyle(4, 0x80d0ff, 0.4 + 0.5 * pulse).strokeCircle(r.x, r.y, rad);
        r.label.setPosition(e.img.x, e.img.y - 60).setText(e.following ? `${def.npc?.name}` : `${def.npc?.name} (lại gần để dẫn đi)`);
        if (Math.hypot(e.img.x - r.x, e.img.y - r.y) < rad) this.finish(`${def.npc?.name ?? 'Người cần hộ tống'} đã tới nơi an toàn!`);
        return;
      }
    }
  }
}
