import Phaser from 'phaser';
import { audio } from '../systems/audio';
import { fieldFlag } from '../core/field';
import { investigated } from '../core/legendClues';
import { missingConditions } from '../core/legends';
import { EX, SCALE, TILE_PX } from '../core/map/tiles';
import type { MapObject } from '../core/map/mapProvider';
import { regionDef } from '../core/map/regionDefs';
import { secretFlag, secretGate, secretRevealed, type SecretDef } from '../core/secrets';
import type { AdventureScene } from '../scenes/AdventureScene';

// Hidden ways into the legendary planes (core/secrets.ts). Until found an entrance is nothing at all — just the
// thicket / cracked rock guarding it, or plain ground until the legendary's clues are read. When it is revealed it
// opens with a flash (once; remembered in the save), then E on it leads into the plane.

interface View { s: SecretDef; x: number; y: number; objs: Phaser.GameObjects.GameObject[]; spin?: Phaser.GameObjects.Graphics }

const ID = 'secret:';

export class SecretController {
  private views = new Map<string, View>();
  private checkT = 0;
  private glimmerT = 0;
  private t = 0;

  constructor(private scene: AdventureScene) {}

  private get region() { return this.scene.regionDef.id; }
  private has = (f: string) => this.scene.state.hasFlag(f);

  private revealed(s: SecretDef): boolean {
    return secretRevealed(this.region, s, {
      has: this.has,
      fieldSolved: (id) => this.has(fieldFlag(this.region, id)),
      investigated: (l) => investigated(l, this.has),
    });
  }

  build(): void {
    for (const s of this.scene.regionDef.secrets ?? []) {
      if (!this.revealed(s)) continue;
      // found before (or revealed while away, e.g. the clues were read on another visit): no fanfare
      this.scene.state.setFlag(secretFlag(this.region, s.id));
      this.open(s);
    }
  }

  /** Draws a found entrance and makes it usable. */
  private open(s: SecretDef): View {
    const sc = this.scene, x = (s.x + 0.5) * TILE_PX, y = (s.y + 0.5) * TILE_PX, c = s.color ?? 0xb090ff;
    const objs: Phaser.GameObjects.GameObject[] = [];
    let spin: Phaser.GameObjects.Graphics | undefined;
    if (s.look === 'cave') {
      // a dark mouth in the ground ringed with rubble
      const g = sc.add.graphics().setDepth(-30);
      g.fillStyle(0x3a3036, 1).fillEllipse(x, y + 4, 54, 38).fillStyle(0x08060a, 1).fillEllipse(x, y + 6, 40, 26);
      g.fillStyle(0x6a5e58, 1);
      for (let i = 0; i < 7; i++) { const a = Math.PI * (0.9 + i * 0.2); g.fillCircle(x + Math.cos(a) * 26, y + 4 + Math.sin(a) * 18, 4 + (i % 3)); }
      objs.push(g);
    } else if (s.look === 'whirlpool') {
      spin = sc.add.graphics().setDepth(-30);
      objs.push(spin);
    } else {
      const img = sc.add.image(x, y + TILE_PX / 2, 'ow_tiles', EX.portal).setOrigin(0.5, 1).setScale(SCALE * 1.6).setTint(c).setDepth(y + TILE_PX / 2);
      sc.tweens.add({ targets: img, alpha: { from: 1, to: 0.7 }, duration: 800, yoyo: true, repeat: -1 });
      objs.push(img);
      sc.world.addObstacle({ x, y: y + TILE_PX / 2 - 10, r: 18, kind: 'prop', tag: ID + s.id });
    }
    const glow = sc.add.image(x, y - 6, 'glow').setTint(c).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 40).setScale(1.8).setAlpha(0.45);
    sc.tweens.add({ targets: glow, alpha: 0.2, scale: 1.4, duration: 1100, yoyo: true, repeat: -1 });
    objs.push(glow);
    const [ix, iy] = s.stand ? [(s.stand[0] + 0.5) * TILE_PX, (s.stand[1] + 0.5) * TILE_PX] : [x, y + (s.look === 'rift' ? TILE_PX / 2 + 16 : 0)];
    const obj: MapObject = { kind: 'secret', id: ID + s.id, x: s.x, y: s.y, data: { id: s.id } };
    sc.interactables.set(ID + s.id, { kind: 'secret', id: ID + s.id, x: ix, y: iy, label: s.name, obj });
    const v: View = { s, x, y, objs, spin };
    this.views.set(s.id, v);
    return v;
  }

  /** First discovery: the entrance opens with a flash and is remembered. */
  private discover(s: SecretDef): void {
    const sc = this.scene;
    sc.state.setFlag(secretFlag(this.region, s.id));
    const v = this.open(s);
    sc.renderer_.vfx.flash(v.x, v.y, 140, s.color ?? 0xb090ff, 700);
    sc.renderer_.vfx.named('mega', v.x, v.y, 90);
    sc.cameras.main.shake(300, 0.004);
    audio.play('levelup');
    sc.ui.questComplete('Lối vào bí mật!', [`Bạn đã tìm thấy: ${s.name}.`, `Nó dẫn tới ${regionDef(s.to).name}.`]);
    sc.persist();
  }

  async interact(id: string): Promise<void> {
    const v = this.views.get(id.replace(ID, ''));
    if (!v) return;
    const sc = this.scene, s = v.s;
    const g = secretGate(s, this.has, sc.effectiveWeather());
    if (!g.ok && g.reason === 'sealed') {
      await sc.say(s.name, [s.hint ?? 'Một sức mạnh cổ xưa chặn lối vào. Có lẽ cần chứng tỏ bản thân ở nơi khác trước.']);
      return;
    }
    if (!g.ok) {
      const miss = missingConditions({ weather: s.weather as never }, sc.legendEnv());
      await sc.say(s.name, [`Lối vào đang khép kín. Nó chỉ mở khi ${miss.join(', ') || 'thời tiết thay đổi'}.`]);
      return;
    }
    const dest = regionDef(s.to).name;
    const r = await sc.say(s.name, [`Lối vào dẫn tới ${dest}.`], [{ label: `Đi vào ${dest}`, value: 'go' }, { label: 'Ở lại', value: 'no' }]);
    if (r === 'go') sc.travelTo(s.to, s.toX, s.toY);
  }

  update(dt: number): void {
    this.t += dt;
    for (const v of this.views.values()) if (v.spin) {
      const g = v.spin.clear();
      for (let i = 0; i < 4; i++) {
        const r = 10 + i * 9, a0 = this.t * (3 - i * 0.4) + i;
        g.lineStyle(3, i % 2 ? 0xe8f4ff : 0x6ab0e8, 0.85 - i * 0.15).beginPath().arc(v.x, v.y, r, a0, a0 + Math.PI * 1.3).strokePath();
      }
    }
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      for (const s of this.scene.regionDef.secrets ?? []) if (!this.views.has(s.id) && this.revealed(s)) this.discover(s);
    }
    // a guarded entrance glimmers faintly when the trainer is close: "something is behind this"
    this.glimmerT -= dt;
    if (this.glimmerT <= 0) {
      this.glimmerT = 2.2;
      const t = this.scene.world.trainer;
      for (const s of this.scene.regionDef.secrets ?? []) {
        if (this.views.has(s.id) || !s.reveal.field) continue;
        const x = (s.x + 0.5) * TILE_PX, y = (s.y + 0.5) * TILE_PX;
        if (Math.hypot(t.x - x, t.y - y) < 6 * TILE_PX) this.scene.renderer_.vfx.emit('fairy', x, y - 10, 6);
      }
    }
  }

  /** Entrances found on this map (debug / tests). */
  debug(): { found: string[]; all: string[] } {
    return { found: [...this.views.keys()], all: (this.scene.regionDef.secrets ?? []).map((s) => s.id) };
  }

  /** Where an entrance is used from (debug / tests). */
  spot(id: string): { x: number; y: number } | null {
    const it = this.scene.interactables.get(ID + id);
    if (it) return { x: it.x, y: it.y };
    const s = (this.scene.regionDef.secrets ?? []).find((q) => q.id === id);
    return s ? { x: ((s.stand?.[0] ?? s.x) + 0.5) * TILE_PX, y: ((s.stand?.[1] ?? s.y) + 0.5) * TILE_PX } : null;
  }

  cleanup(): void {
    for (const v of this.views.values()) v.objs.forEach((o) => o.destroy());
    this.views.clear();
  }
}
