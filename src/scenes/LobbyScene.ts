import Phaser from 'phaser';
import { POKEMON } from '../core/data';
import { ITEM_DEFS } from '../core/evolution';
import { avatarTextureKey } from '../core/avatars';
import { fitScale } from '../render/spriteRegistry';
import { shinyKey } from '../render/lazyCreatures';
import { DuelHandshake, DuelStart, net } from '../net/session';
import { monFromOwned, RENTAL_TEAMS, RULE_LABEL, RULESETS, validateParty } from '../net/duel';
import type { DuelMon, DuelRules } from '../net/protocol';
import { defaultLinkKind, LinkKind } from '../net/transport';
import { saveStore } from '../systems/save';
import { audio } from '../systems/audio';
import { music } from '../systems/music';
import { gameModes } from '../systems/gameMode';
import { askText, button, COLORS, panel, text } from './ui';
import { openPlayerProfile } from './playerProfile';
import type { DuelSceneData } from './DuelScene';

// Online lobby: create / join a room by code, rules, team (Collection of the active save slot or a rental
// team), readiness of both players → the duel. Also the practice duel against the computer.

type View = 'home' | 'room' | 'practice';

export class LobbyScene extends Phaser.Scene {
  private view: View = 'home';
  private hs: DuelHandshake | null = null;
  /** chosen party: Collection uids, or a rental team */
  private picked: string[] = [];
  private rental: number | null = null;
  private page = 0;
  private errors: string[] = [];
  private busy = '';
  private offStatus: (() => void) | null = null;
  private refreshT = 0;
  private practiceRules: DuelRules = RULESETS.standard;

  constructor() {
    super('Lobby');
  }

  init(d: { resume?: boolean; view?: View }): void {
    this.view = d.view ?? (d.resume && (net.connected || net.status === 'hosting') ? 'room' : 'home');
    this.errors = [];
    this.busy = '';
  }

  create(): void {
    net.setProfile(saveStore.playerName, saveStore.avatar);
    (window as unknown as { __lobby: LobbyScene }).__lobby = this;
    if (this.view === 'room') this.openHandshake();
    this.offStatus = net.onStatus(() => this.rebuild());
    this.scale.on('resize', this.rebuild, this);
    this.events.once('shutdown', () => {
      this.offStatus?.();
      this.hs?.dispose();
      this.hs = null;
      this.scale.off('resize', this.rebuild, this);
      document.getElementById('lobby-input')?.remove();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.back());
    this.build();
  }

  update(_t: number, delta: number): void {
    music.play('menu');
    // ping / opponent state refresh
    if (this.view === 'room' && (this.refreshT -= delta) <= 0) { this.refreshT = 1000; this.rebuild(); }
  }

  private rebuild(): void {
    if (!this.sys.isActive()) return;
    this.children.removeAll(true);
    this.build();
  }

  private go(v: View): void {
    this.view = v;
    this.errors = [];
    this.rebuild();
  }

  private back(): void {
    if (this.view === 'home') { net.leave(); gameModes.toMenu(this); return; }
    if (this.view === 'room') { this.hs?.dispose(); this.hs = null; net.leave(); }
    this.go('home');
  }

  // ───────────────────────────── actions ─────────────────────────────

  async createRoom(kind: LinkKind = defaultLinkKind()): Promise<string> {
    audio.unlock();
    this.busy = 'Đang tạo phòng…';
    this.go('room');
    try {
      const code = await net.host(kind);
      this.openHandshake();
      return code;
    } catch {
      return '';
    } finally {
      this.busy = '';
      this.rebuild();
    }
  }

  async joinRoom(code: string, kind: LinkKind = defaultLinkKind()): Promise<boolean> {
    audio.unlock();
    this.busy = 'Đang kết nối tới phòng ' + code.toUpperCase() + '…';
    this.go('room');
    try {
      await net.join(code, kind);
      this.openHandshake();
      return true;
    } catch {
      return false;
    } finally {
      this.busy = '';
      this.rebuild();
    }
  }

  private openHandshake(): void {
    this.hs?.dispose();
    this.hs = new DuelHandshake((s) => this.startDuel(s), () => this.rebuild());
    if (this.myParty().length) this.hs.setTeam(this.myParty(), false);
  }

  /** The party as it will be sent (Collection entries or a rental team). */
  myParty(): DuelMon[] {
    if (this.rental != null) return RENTAL_TEAMS[this.rental].party;
    const col = saveStore.data.collection;
    return this.picked.map((uid) => col.find((c) => c.uid === uid)).filter(Boolean).map((p) => monFromOwned(p!));
  }

  private rules(): DuelRules {
    return this.view === 'practice' ? this.practiceRules : this.hs?.rules ?? RULESETS.standard;
  }

  setReady(ready: boolean): void {
    if (!this.hs) return;
    this.errors = this.hs.setTeam(this.myParty(), ready);
    this.rebuild();
  }

  pickRental(i: number | null): void {
    this.rental = i;
    if (i != null) this.picked = [];
    this.afterTeamChange();
  }

  togglePick(uid: string): void {
    this.rental = null;
    if (this.picked.includes(uid)) this.picked = this.picked.filter((u) => u !== uid);
    else if (this.picked.length < this.rules().partyMax) this.picked.push(uid);
    this.afterTeamChange();
  }

  private afterTeamChange(): void {
    this.errors = [];
    if (this.view === 'room' && this.hs) this.hs.setTeam(this.myParty(), false);
    this.rebuild();
  }

  startPractice(): void {
    const mine = this.myParty();
    this.errors = validateParty(mine, this.practiceRules);
    if (this.errors.length) { this.rebuild(); return; }
    // the opponent: a rental team other than mine
    const opp = RENTAL_TEAMS[(this.rental ?? Math.floor(Math.random() * 3) + 1) % RENTAL_TEAMS.length].party;
    const seed = (Math.random() * 0x7fffffff) | 0;
    const start: DuelStart = { seed, rules: this.practiceRules, host: mine.map((m) => ({ ...m, level: this.practiceRules.level ?? m.level })), guest: opp, hostName: net.myName, guestName: 'Máy', roster: [] };
    this.scene.start('Duel', { role: 'practice', start, returnTo: 'lobby' } satisfies DuelSceneData);
  }

  private startDuel(s: DuelStart): void {
    this.scene.start('Duel', { role: net.role === 'host' ? 'host' : 'guest', start: s, returnTo: 'lobby' } satisfies DuelSceneData);
  }

  /** Shared profile editor (avatar + name); closing it refreshes the online-lobby card. */
  openProfile(): void {
    openPlayerProfile(this, () => this.rebuild());
  }

  // ───────────────────────────── layout ─────────────────────────────

  private build(): void {
    const { width: W, height: H } = this.scale;
    const s = Math.max(0.55, Math.min(W / 1100, H / 700, 1.5));
    this.cameras.main.setBackgroundColor(COLORS.bg);
    text(this, W / 2, 16 * s, this.view === 'practice' ? 'LUYỆN TẬP ĐẤU' : 'ĐẤU ONLINE', 40 * s, '#ffe080').setOrigin(0.5, 0);
    button(this, 70 * s, 34 * s, 120 * s, 40 * s, '◀ Quay lại', () => this.back(), 0x3a3a5a);
    if (this.view === 'home') this.buildHome(W, H, s);
    else this.buildRoom(W, H, s);
  }

  private buildHome(W: number, H: number, s: number): void {
    const pw = Math.min(W - 20, 760 * s), x0 = (W - pw) / 2, y0 = 80 * s;
    panel(this, x0, y0, pw, H - y0 - 14 * s);
    // player card: avatar + name + online record, with the profile action
    const ar = 20 * s, ax = x0 + 14 * s + ar, ay = y0 + 38 * s;
    const av = this.add.graphics();
    av.fillStyle(0x0c0f1a, 1).fillCircle(ax, ay, ar);
    av.lineStyle(2 * s, 0xffd040, 1).strokeCircle(ax, ay, ar);
    const avatar = avatarTextureKey(saveStore.avatar);
    if (this.textures.exists(avatar)) this.add.image(ax, ay - 1 * s, avatar).setScale(fitScale(this, avatar, 32 * s));
    const bx2 = ax + ar * 0.72, by2 = ay + ar * 0.72;
    const badge = this.add.graphics();
    badge.fillStyle(0x0c0f1a, 1).fillCircle(bx2, by2, 7 * s);
    badge.lineStyle(1.5 * s, 0xffd040, 1).strokeCircle(bx2, by2, 7 * s);
    text(this, bx2, by2 - 0.5 * s, '✎', 10 * s, '#ffe680').setOrigin(0.5);
    this.add.zone(ax, ay, ar * 2 + 6 * s, ar * 2 + 6 * s).setInteractive({ useHandCursor: true }).on('pointerup', () => this.openProfile());
    const nx = x0 + 14 * s + ar * 2 + 8 * s;
    text(this, nx, y0 + 10 * s, saveStore.playerName, 26 * s, '#ffe680');
    button(this, x0 + pw - 90 * s, ay, 150 * s, 36 * s, '✎ Hồ sơ', () => this.openProfile());
    const r2 = saveStore.data.pvp;
    text(this, nx, y0 + 42 * s,
      r2 ? `Thành tích online: ${r2.wins} thắng · ${r2.losses} thua · ${r2.draws} hòa · Ô ${saveStore.slot} · ${saveStore.data.collection.length} Pokémon`
        : `Chưa có trận online nào · Ô ${saveStore.slot} · ${saveStore.data.collection.length} Pokémon`,
      17 * s, '#c8d4f0').setWordWrapWidth(pw - (nx - x0) - 190 * s);
    const bx = W / 2, bw = Math.min(pw - 40 * s, 420 * s);
    button(this, bx, y0 + 120 * s, bw, 54 * s, '＋ Tạo phòng', () => void this.createRoom(), 0x2f6a3a);
    button(this, bx, y0 + 184 * s, bw, 54 * s, '→ Vào phòng bằng mã', () => void askText(this, 'Nhập mã phòng (6 ký tự)', '', 6).then((c) => { if (c) void this.joinRoom(c); }), 0x2f5a8a);
    button(this, bx, y0 + 248 * s, bw, 54 * s, '⚔ Luyện tập với máy', () => this.go('practice'), 0x6a4a2a);
    const hist = (r2?.history ?? []).slice(0, 5).map((h) => `${h.result === 'win' ? 'Thắng' : h.result === 'loss' ? 'Thua' : 'Hòa'} · ${h.opp}${h.online ? '' : ' (luyện tập)'} · ${new Date(h.at).toLocaleDateString('vi-VN')}`);
    text(this, x0 + 20 * s, y0 + 300 * s,
      'Kết nối trực tiếp giữa hai trình duyệt (WebRTC, qua máy chủ mai mối công cộng của PeerJS). Một số mạng (4G, mạng công ty) có thể chặn kết nối trực tiếp.\n' +
      'Chủ phòng chạy trận đấu; đội và cá thể (IV/EV/tính cách/trang bị) lấy từ Bộ sưu tập của ô lưu đang mở.\n' +
      'Chơi cùng nhau trong thế giới mở: Phiêu lưu → Cài đặt → "Chơi online cùng bạn".' + (hist.length ? '\n\nGần đây:\n' + hist.join('\n') : ''),
      15 * s, COLORS.dim).setWordWrapWidth(pw - 40 * s);
    if (net.error) text(this, W / 2, H - 40 * s, net.error, 18 * s, '#ff9080').setOrigin(0.5);
  }

  private buildRoom(W: number, H: number, s: number): void {
    const practice = this.view === 'practice';
    const top = 72 * s, colW = Math.min(W / 2 - 20 * s, 540 * s);
    const lx = W / 2 - colW - 6 * s, rx = W / 2 + 6 * s, ph = H - top - 12 * s;
    panel(this, lx, top, colW, ph);
    panel(this, rx, top, colW, ph);
    // left: room / rules / my team
    let y = top + 12 * s;
    if (!practice) {
      const st = net.status;
      const head = this.busy || (st === 'hosting' ? 'Đang chờ đối thủ vào phòng…' : st === 'connected' ? `Đã kết nối với ${net.peerName || '…'} · ping ${net.rtt} ms` : st === 'closed' ? `Lỗi: ${net.error}` : '');
      text(this, lx + 14 * s, y, head, 18 * s, st === 'closed' ? '#ff9080' : '#a0e0ff').setWordWrapWidth(colW - 28 * s);
      y += 30 * s;
      if (net.code) {
        text(this, lx + 14 * s, y, 'MÃ PHÒNG', 16 * s, COLORS.dim);
        text(this, lx + 120 * s, y - 8 * s, net.code, 40 * s, '#ffe060');
        button(this, lx + colW - 70 * s, y + 10 * s, 110 * s, 34 * s, 'Sao chép', () => { void navigator.clipboard?.writeText(net.code); }, 0x3a3a5a);
        y += 48 * s;
      }
    }
    const rules = this.rules();
    const canRule = practice || net.role === 'host';
    text(this, lx + 14 * s, y, 'Luật: ' + RULE_LABEL[rules.id], 17 * s, '#ffe0a0').setWordWrapWidth(colW - (canRule ? 150 : 28) * s);
    if (canRule) button(this, lx + colW - 70 * s, y + 10 * s, 120 * s, 32 * s, 'Đổi luật', () => {
      const ids = Object.keys(RULESETS) as DuelRules['id'][];
      const next = RULESETS[ids[(ids.indexOf(rules.id) + 1) % ids.length]];
      if (practice) { this.practiceRules = next; this.rebuild(); } else this.hs?.setRules(next);
    }, 0x3a3a5a);
    y += 44 * s;
    text(this, lx + 14 * s, y, `Đội của bạn (${this.myParty().length}/${rules.partyMax}) — chạm để chọn; 3 con ra sân, còn lại dự bị`, 16 * s, '#ffffff').setWordWrapWidth(colW - 28 * s);
    y += 26 * s;
    RENTAL_TEAMS.forEach((t, i) => button(this, lx + 14 * s + (colW - 28 * s) / 6 * (2 * i + 1), y + 14 * s, (colW - 40 * s) / 3, 30 * s, 'Thuê: ' + t.name, () => this.pickRental(this.rental === i ? null : i), this.rental === i ? 0x6a5a2a : 0x2c3654));
    y += 38 * s;
    this.teamGrid(lx + 10 * s, y, colW - 20 * s, top + ph - y - 70 * s, s);
    if (this.errors.length) text(this, lx + 14 * s, top + ph - 66 * s, this.errors.join(' · '), 14 * s, '#ff9080').setWordWrapWidth(colW - 28 * s);
    if (practice) button(this, lx + colW / 2, top + ph - 28 * s, colW - 40 * s, 44 * s, '⚔ Bắt đầu luyện tập', () => this.startPractice(), 0x2f6a3a);
    else if (this.hs && net.connected) {
      const ready = this.hs.myReady;
      button(this, lx + colW / 2, top + ph - 28 * s, colW - 40 * s, 44 * s, ready ? '✓ Đã sẵn sàng (chạm để hủy)' : 'Sẵn sàng', () => this.setReady(!ready), ready ? 0x2f6a3a : 0x8a6a24);
    }

    // right: the opponent
    y = top + 12 * s;
    const peerName = practice ? 'Đối thủ: Máy — một đội thuê khác của bạn' : `Đối thủ: ${net.peerName || '—'}`;
    text(this, rx + 14 * s, y, peerName, 20 * s, '#ffffff').setWordWrapWidth(colW - 90 * s);
    if (!practice) {
      const peerAvatar = avatarTextureKey(net.peerAvatar);
      if (this.textures.exists(peerAvatar)) this.add.image(rx + colW - 34 * s, y + 18 * s, peerAvatar).setScale(fitScale(this, peerAvatar, 34 * s));
    }
    y += 34 * s;
    if (!practice && this.hs) {
      const th = this.hs.theirs ?? [];
      text(this, rx + 14 * s, y, th.length ? `${th.length} Pokémon · ${this.hs.theirsReady ? '✓ sẵn sàng' : 'đang chọn đội…'}` : 'Chưa chọn đội', 17 * s, this.hs.theirsReady ? '#80ff90' : COLORS.dim);
      y += 30 * s;
      th.forEach((m, i) => {
        const yy = y + i * 46 * s;
        this.monIcon(rx + 34 * s, yy + 20 * s, m.species, !!m.shiny, 38 * s);
        text(this, rx + 62 * s, yy + 6 * s, monLabel(m, rules), 16 * s);
      });
      if (this.hs.rejected) text(this, rx + 14 * s, top + ph - 70 * s, 'Chủ phòng từ chối đội của bạn: ' + this.hs.rejected, 15 * s, '#ff9080').setWordWrapWidth(colW - 28 * s);
      if (net.role === 'host' && this.hs.myReady && this.hs.theirsReady) text(this, rx + colW / 2, top + ph - 30 * s, 'Bắt đầu…', 22 * s, '#ffe060').setOrigin(0.5);
    }
  }

  /** Collection of the active save slot (6 per row, paged) — tap to add / remove. A rental team is listed instead. */
  private teamGrid(x: number, y: number, w: number, h: number, s: number): void {
    if (this.rental != null) {
      RENTAL_TEAMS[this.rental].party.forEach((m, i) => {
        const yy = y + i * 44 * s;
        this.monIcon(x + 24 * s, yy + 18 * s, m.species, false, 36 * s);
        text(this, x + 52 * s, yy + 6 * s, monLabel(m, this.rules()), 16 * s);
      });
      text(this, x + 6 * s, y + 6 * 44 * s + 4 * s, 'Đội thuê dùng chung cho mọi người (IV/EV trung tính). Chạm lại nút đội thuê để chọn từ Bộ sưu tập.', 14 * s, COLORS.dim).setWordWrapWidth(w - 12 * s);
      return;
    }
    const col = saveStore.data.collection.slice().sort((a, b) => b.level - a.level);
    if (!col.length) { text(this, x + 6 * s, y + 6 * s, 'Ô lưu này chưa có Pokémon nào — dùng đội thuê, hoặc bắt Pokémon ở chế độ Phiêu lưu.', 15 * s, COLORS.dim).setWordWrapWidth(w - 12 * s); return; }
    const cw = w / 6, chh = 64 * s, perPage = 6 * Math.max(1, Math.floor((h - 30 * s) / chh));
    const pages = Math.ceil(col.length / perPage);
    this.page = Math.min(this.page, pages - 1);
    col.slice(this.page * perPage, (this.page + 1) * perPage).forEach((p, i) => {
      const cx = x + (i % 6) * cw, cy = y + Math.floor(i / 6) * chh;
      const on = this.picked.includes(p.uid);
      const g = this.add.graphics();
      g.fillStyle(on ? 0x2a4a2a : 0x1a1e2e, 1).fillRect(cx + 2, cy + 2, cw - 4, chh - 4);
      g.lineStyle(2, on ? 0x80ff90 : 0x3a4260, 1).strokeRect(cx + 2, cy + 2, cw - 4, chh - 4);
      this.monIcon(cx + cw / 2, cy + 24 * s, p.species, !!p.shiny, 36 * s);
      text(this, cx + cw / 2, cy + 44 * s, `${(POKEMON.get(p.species)?.name ?? p.species).slice(0, 10)} ${p.level}`, 13 * s, on ? '#c0ffc0' : '#d0d8f0').setOrigin(0.5, 0);
      if (on) text(this, cx + 8 * s, cy + 4 * s, String(this.picked.indexOf(p.uid) + 1), 16 * s, '#80ff90');
      this.add.zone(cx, cy, cw, chh).setOrigin(0).setInteractive({ useHandCursor: true }).on('pointerup', () => this.togglePick(p.uid));
    });
    if (pages > 1) {
      button(this, x + 60 * s, y + h - 14 * s, 100 * s, 28 * s, '◀', () => { this.page = (this.page + pages - 1) % pages; this.rebuild(); });
      text(this, x + w / 2, y + h - 14 * s, `${this.page + 1}/${pages}`, 15 * s, COLORS.dim).setOrigin(0.5);
      button(this, x + w - 60 * s, y + h - 14 * s, 100 * s, 28 * s, '▶', () => { this.page = (this.page + 1) % pages; this.rebuild(); });
    }
  }

  private monIcon(x: number, y: number, species: string, shiny: boolean, px: number): void {
    const key = shiny ? shinyKey(species) : species;
    if (!this.textures.exists(key)) return;
    this.add.image(x, y, key).setScale(fitScale(this, key, px));
  }
}

function monLabel(m: DuelMon, rules: DuelRules): string {
  const held = m.held ? ITEM_DEFS.get(m.held)?.name ?? m.held : '';
  return `${m.nickname || (POKEMON.get(m.species)?.name ?? m.species)} Lv${rules.level ?? m.level}${held ? ' · ' + held : ''}`;
}
