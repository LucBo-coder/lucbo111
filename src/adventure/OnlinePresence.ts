import Phaser from 'phaser';
import type { AdventureScene } from '../scenes/AdventureScene';
import { DuelHandshake, DuelStart, net } from '../net/session';
import { monFromOwned, RULESETS } from '../net/duel';
import type { LeadAnim, NetMsg } from '../net/protocol';
import type { DuelSceneData } from '../scenes/DuelScene';
import { gameModes } from '../systems/gameMode';
import { shinyKey } from '../render/lazyCreatures';
import { fitScale } from '../render/spriteRegistry';
import { avatarTextureKey } from '../core/avatars';
import { creatureFootAnchor, sheetKey } from '../render/animation';
import { unitAnim } from '../render/WorldRenderer';
import { POKEMON } from '../core/data';
import { audio } from '../systems/audio';

// Shared open world: while an online session is connected, each player sees the other walking around the
// same map (trainer + lead Pokémon, interpolated from 10 position updates per second) and can challenge
// them to a duel by walking up and pressing E. Wild Pokémon, quests and loot stay per player.

const SEND_EVERY = 100; // ms
const CHALLENGE_TIMEOUT = 20_000;

interface Remote { region: string; x: number; y: number; facing: number; lead: string | null; leadShiny: boolean; leadAnim: LeadAnim; moving: boolean; busy: boolean; at: number }

export class OnlinePresence {
  private remote: Remote | null = null;
  private prev: Remote | null = null;
  /** drawn position (interpolated) */
  x = 0;
  y = 0;
  private body: Phaser.GameObjects.Sprite | null = null;
  private pet: Phaser.GameObjects.Sprite | null = null;
  /** base art key the pet sprite was created for (sheet swaps when the lead or its shiny state changes) */
  private petKey = '';
  /** sprite sheet currently shown for the remote trainer's avatar */
  private bodySheet = '';
  private tag: Phaser.GameObjects.Text | null = null;
  private lastSent = 0;
  private off: () => void;
  private offStatus: () => void;
  private hs: DuelHandshake | null = null;
  private pendingChallenge: { at: number } | null = null;
  private asking = false;

  constructor(private scene: AdventureScene) {
    this.off = net.on((m) => this.receive(m));
    this.offStatus = net.onStatus(() => {
      if (!net.connected) { this.scene.ui?.banner(`Người chơi kia đã rời (${net.error || 'mất kết nối'})`, '#ff9080'); this.hide(); }
    });
  }

  destroy(): void {
    this.off(); this.offStatus();
    this.hs?.dispose();
    this.hs = null;
    this.hide();
  }

  private hide(): void {
    this.body?.destroy(); this.pet?.destroy(); this.tag?.destroy();
    this.body = this.pet = this.tag = null;
    this.bodySheet = ''; this.petKey = '';
    this.scene.interactables.delete('remote-player');
  }

  /** The other player is on my map, outside dungeons. */
  visible(): boolean {
    const r = this.remote;
    return !!r && net.connected && this.scene.mapKind === 'valley' && r.region === this.scene.regionDef.id;
  }

  update(now: number): void {
    if (!net.connected) return;
    const a = this.scene, t = a.world.trainer;
    if (now - this.lastSent >= SEND_EVERY) {
      this.lastSent = now;
      const lead = a.state.party()[0];
      // The lead Pokémon is the first party member that is still standing on the field.
      const unit = lead ? a.world.allies.find((u) => u.ownerUid === lead.uid && !u.fainted) ?? a.world.allies.find((u) => u.ownerUid === lead.uid) : undefined;
      const anim = unit ? unitAnim(unit, Math.hypot(unit.vx, unit.vy) > 12) : 'idle';
      const leadAnim: LeadAnim = anim === 'walk' || anim === 'attack' || anim === 'cast' ? anim : 'idle';
      net.send({ t: 'pos', region: a.mapKind === 'valley' ? a.regionDef.id : 'dungeon', x: Math.round(t.x), y: Math.round(t.y), facing: t.facing, lead: lead?.species ?? null, leadShiny: !!lead?.shiny, leadAnim, moving: Math.hypot(t.vx, t.vy) > 5, busy: a.modal });
    }
    if (this.pendingChallenge && now - this.pendingChallenge.at > CHALLENGE_TIMEOUT) {
      this.pendingChallenge = null;
      a.ui?.banner(`${net.peerName} không trả lời lời thách đấu`, '#ffb080');
    }
    if (!this.visible()) { this.hide(); return; }
    this.draw(now);
  }

  private draw(now: number): void {
    const r = this.remote!, p = this.prev ?? r;
    const k = Math.min(1, Math.max(0, (now - r.at) / SEND_EVERY));
    this.x = p.x + (r.x - p.x) * k; this.y = p.y + (r.y - p.y) * k;
    const sc = this.scene;
    // The peer wears the avatar chosen in their profile; the hello sync keeps this live.
    const avatar = avatarTextureKey(net.peerAvatar);
    const avatarSheet = sheetKey(avatar);
    const bodySheet = sc.textures.exists(avatarSheet) ? avatarSheet : 'trainer_sheet';
    const bodyKey = bodySheet === avatarSheet ? avatar : 'trainer';
    if (!this.body) {
      this.body = sc.add.sprite(0, 0, bodySheet, 0).setScale(3);
      this.body.setOrigin(0.5, creatureFootAnchor(bodyKey).y);
      this.bodySheet = bodySheet;
      this.tag = sc.add.text(0, 0, '', { fontFamily: '"VT323", monospace', fontSize: '20px', color: '#ffe080', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 1);
    } else if (this.bodySheet !== bodySheet) {
      this.body.setTexture(bodySheet, 0);
      this.body.setOrigin(0.5, creatureFootAnchor(bodyKey).y);
      this.bodySheet = bodySheet;
    }
    this.body.setPosition(this.x, this.y).setFlipX(r.facing < 0).setDepth(this.y);
    const bodyAnim = `${bodyKey}:${r.moving ? 'walk' : 'idle'}`;
    if (sc.anims.exists(bodyAnim)) {
      if (this.body.anims.currentAnim?.key !== bodyAnim) this.body.play(bodyAnim);
    } else this.body.stop();
    this.tag!.setText(net.peerName + (r.busy ? ' …' : '')).setPosition(this.x, this.y - 46).setDepth(9100);
    // lead Pokémon walking beside the trainer, playing the animation their owner reports
    const key = r.lead ? (r.leadShiny ? shinyKey(r.lead) : r.lead) : null;
    if (key && sc.textures.exists(key)) {
      const sheet = sc.textures.exists(sheetKey(key)) ? sheetKey(key) : '';
      if (!this.pet || this.petKey !== key) {
        this.pet?.destroy();
        this.pet = sc.add.sprite(0, 0, sheet || key);
        this.pet.setOrigin(0.5, creatureFootAnchor(key).y);
        this.petKey = key;
      }
      const petAnim = `${key}:${r.leadAnim}`;
      if (sheet && sc.anims.exists(petAnim)) {
        if (this.pet.anims.currentAnim?.key !== petAnim) this.pet.play(petAnim);
      } else this.pet.stop();
      const scale = fitScale(sc, key, 48);
      const bob = Math.sin(now * 0.01) * (r.moving ? 2 : 0.5);
      this.pet.setScale(scale).setPosition(this.x - r.facing * 40, this.y + 2 + bob).setDepth(this.y + 8);
    } else { this.pet?.destroy(); this.pet = null; this.petKey = ''; }
    // walking up to the other player offers a challenge (E)
    sc.interactables.set('remote-player', { kind: 'remote', id: 'remote-player', x: this.x, y: this.y, label: `Thách đấu ${net.peerName}`, obj: { kind: 'npc', id: 'remote-player', x: 0, y: 0 }, sprite: null as never });
  }

  // ───────────────────────────── challenge ─────────────────────────────

  /** E next to the other player. */
  async challenge(): Promise<void> {
    if (!this.visible() || this.pendingChallenge) return;
    if (this.remote?.busy) { this.scene.ui?.banner(`${net.peerName} đang bận`, '#ffb080'); return; }
    const party = this.scene.state.party();
    if (!party.length) { this.scene.ui?.banner('Bạn cần ít nhất 1 Pokémon trong đội', '#ff9080'); return; }
    const r = await this.scene.say('Thách đấu', [`Thách đấu ${net.peerName}? Luật Tự do: dùng đội hiện tại với cấp thật, 3 con ra sân, còn lại dự bị. Trận đấu không mất gì, chỉ ghi vào thành tích.`],
      [{ label: 'Gửi lời thách đấu', value: 'yes' }, { label: 'Thôi', value: 'no' }]);
    if (r !== 'yes') return;
    this.pendingChallenge = { at: performance.now() };
    net.send({ t: 'challenge', rules: RULESETS.open });
    this.scene.ui?.banner(`Đã gửi lời thách đấu tới ${net.peerName}…`, '#a0d8ff');
  }

  private receive(m: NetMsg): void {
    if (m.t === 'pos') {
      const leadAnim: LeadAnim = m.leadAnim === 'walk' || m.leadAnim === 'attack' || m.leadAnim === 'cast' ? m.leadAnim : 'idle';
      const r: Remote = { region: String(m.region), x: Number(m.x) || 0, y: Number(m.y) || 0, facing: m.facing < 0 ? -1 : 1, lead: typeof m.lead === 'string' && POKEMON.has(m.lead) ? m.lead : null, leadShiny: !!m.leadShiny, leadAnim, moving: !!m.moving, busy: !!m.busy, at: performance.now() };
      this.prev = this.remote && this.remote.region === r.region ? { ...this.remote, x: this.x || this.remote.x, y: this.y || this.remote.y } : r;
      this.remote = r;
    } else if (m.t === 'challenge') void this.onChallenged();
    else if (m.t === 'challengeReply') {
      if (!this.pendingChallenge) return;
      this.pendingChallenge = null;
      if (m.accept) this.beginDuel();
      else this.scene.ui?.banner(`${net.peerName} đã từ chối`, '#ffb080');
    }
  }

  private async onChallenged(): Promise<void> {
    if (this.asking) return;
    this.asking = true;
    audio.play('levelup');
    // wait for a free moment (no dialogue / menu open), at most the challenge timeout
    const t0 = performance.now();
    while (this.scene.modal && performance.now() - t0 < CHALLENGE_TIMEOUT - 3000) await new Promise((r) => setTimeout(r, 250));
    const ok = !this.scene.modal && this.scene.state.party().length > 0 && await this.scene.say('Lời thách đấu', [`${net.peerName} thách đấu bạn! Luật Tự do: đội hiện tại, cấp thật, 3 con ra sân. Nhận lời?`],
      [{ label: 'Nhận lời', value: 'yes' }, { label: 'Từ chối', value: 'no' }]) === 'yes';
    this.asking = false;
    net.send({ t: 'challengeReply', accept: ok });
    if (ok) this.beginDuel();
  }

  /** Both players: send the current party; the room host validates and starts the duel. */
  private beginDuel(): void {
    const a = this.scene;
    a.persist();
    this.hs?.dispose();
    this.hs = new DuelHandshake((s) => this.start(s));
    if (net.role === 'host') this.hs.setRules(RULESETS.open);
    else this.hs.rules = RULESETS.open;
    const errs = this.hs.setTeam(a.state.party().slice(0, 6).map(monFromOwned), true);
    if (errs.length) a.ui?.banner('Đội không hợp lệ: ' + errs.join(' · '), '#ff9080');
    else a.ui?.banner('Đang chuẩn bị trận đấu…', '#a0d8ff');
  }

  private start(s: DuelStart): void {
    const data: DuelSceneData & { entry: string } = { entry: 'Duel', role: net.role === 'host' ? 'host' : 'guest', start: s, returnTo: 'adventure' };
    gameModes.start(this.scene, 'online', data as unknown as Record<string, unknown>);
  }
}
