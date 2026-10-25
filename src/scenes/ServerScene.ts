import Phaser from 'phaser';
import { avatarTextureKey } from '../core/avatars';
import { CANDY_DEFS, candyDef, maxUsefulCandy, previewCandy } from '../core/candy';
import { POKEMON } from '../core/data';
import { regionDef } from '../core/map/regionDefs';
import { ValleyMap } from '../core/map/valley';
import { TILE_PX, SCALE } from '../core/map/tiles';
import { ChunkView } from '../render/ChunkView';
import { sheetKey } from '../render/animation';
import { shinyKey } from '../render/lazyCreatures';
import { ServerClient, actionId, defaultEndpoint, needsServerHint } from '../net/serverClient';
import type {
  ActionType, EmoteKind, ServerAccount, ServerAlphaView, ServerEventIncoming, ServerEventView, ServerFriend, ServerMsg,
  ServerPartyView, ServerPlayerView,
} from '../net/serverProtocol';
import type { SaveData } from '../systems/saveSchema';
import type { OwnedPokemon } from '../core/progression';
import { audio } from '../systems/audio';
import { text, TYPE_COLOR } from './ui';
import { ServerPc } from './serverPc';
import './serverScene.css';

const EMOTE_LABEL: Record<EmoteKind, string> = { wave: '👋 Chào!', cheer: '🎉 Hoan hô!', sit: '💤 Ngồi nghỉ', point: '👉 Bên này!' };
const REGION_NAME: Record<string, string> = { 'ca-mau': 'Cà Mau', 'an-giang': 'An Giang', 'can-tho': 'Cần Thơ' };
const ALPHA_RANGE = 320;
const PC_RANGE = 120; // a bit inside the server's 130 px so the button never lies
const PORTAL_RANGE = 140;
/** the server accepts one Alpha attack per 900 ms; the button waits a little longer so no request is wasted */
const ATTACK_COOLDOWN = 1000;
type Tab = 'party' | 'events' | 'social' | 'chat' | 'more';

interface Remote {
  view: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Image;
  trainer: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.Text;
  pet: Phaser.GameObjects.Sprite;
  bubble: Phaser.GameObjects.Text;
  data: ServerPlayerView;
  /** interpolation target (server presence arrives at 10 Hz) */
  tx: number;
  ty: number;
  /** last horizontal direction (+1 right, −1 left) */
  face: number;
  /** while a summon/recall effect plays, presence must not toggle the pet sprite */
  fxUntil: number;
}

interface AlphaArt {
  box: Phaser.GameObjects.Container;
  aura: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Sprite;
  hp: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  species: string;
}

const name = (p: OwnedPokemon) => p.nickname || POKEMON.get(p.species)?.name || p.species;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** Server-owned world: the browser renders and requests actions, never awards loot locally. */
export class ServerScene extends Phaser.Scene {
  private root!: HTMLDivElement;
  private client!: ServerClient;
  private save?: SaveData;
  private account?: ServerAccount;
  private map?: ValleyMap;
  private chunks?: ChunkView;
  private player?: Phaser.GameObjects.Sprite;
  private playerShadow?: Phaser.GameObjects.Image;
  private myName?: Phaser.GameObjects.Text;
  private companion?: Phaser.GameObjects.Sprite;
  private companionShadow?: Phaser.GameObjects.Image;
  private myBubble?: Phaser.GameObjects.Text;
  private remotes = new Map<string, Remote>();
  private alpha?: ServerAlphaView | null;
  private alphaArt?: AlphaArt;
  private rangeRing?: Phaser.GameObjects.Graphics;
  private trackArrow?: Phaser.GameObjects.Triangle;
  private tracking = false;
  private autoAttack = false;
  private nextAttackAt = 0;
  private face = 1;
  private event: ServerEventView | null = null;
  private incoming: ServerEventIncoming | null = null;
  private party: ServerPartyView | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private sentAt = 0;
  private uiAt = 0;
  private target?: { x: number; y: number };
  private chatLines: string[] = [];
  private chatIds = new Set<number>();
  private candyFor: string | null = null;
  private companionFxUntil = 0;
  private lastActive: string | null = null;
  private pc?: ServerPc;
  private nearby: { kind: 'pc' } | { kind: 'portal'; id: string; name: string; to: string } | null = null;
  private nearbyKey = '';
  private nearAt = 0;
  private iconCache = new Map<string, string>();
  private tab: Tab = 'party';
  private drawerOpen = true;
  private miniBase?: HTMLCanvasElement;
  private miniAt = 0;
  private statusTimer?: ReturnType<typeof setTimeout>;

  constructor() { super('ServerWorld'); }

  create(): void {
    this.save = undefined; this.account = undefined; this.target = undefined; this.event = null; this.incoming = null; this.party = null;
    this.alpha = null; this.remotes.clear(); this.chatLines = []; this.chatIds.clear(); this.sentAt = 0; this.uiAt = 0;
    this.tracking = false; this.autoAttack = false; this.nextAttackAt = 0; this.face = 1;
    this.candyFor = null; this.companionFxUntil = 0; this.lastActive = null;
    this.nearby = null; this.nearbyKey = ''; this.nearAt = 0; this.tab = 'party'; this.miniBase = undefined; this.miniAt = 0;
    // phones start with the map visible; wide screens keep the menu open beside it
    this.drawerOpen = innerWidth >= 900 && innerHeight >= 560;
    this.cameras.main.setBackgroundColor('#16382e');
    this.root = document.createElement('div');
    this.root.className = 'server-world ol-root';
    this.root.innerHTML = `
      <section class="server-panel ol-panel" aria-label="Thế giới online" data-login>
        <header><button class="ol-btn ol-btn-back" data-exit>◀ Quay lại</button><h1 class="ol-title">THẾ GIỚI ONLINE</h1></header>
        <p data-status role="status">Cà Mau · Cùng khám phá, cùng săn Alpha</p>
        <form data-auth>
          <label>Máy chủ<input name="endpoint" aria-label="Máy chủ" required></label>
          <p class="server-card server-incoming" data-server-hint hidden>Bản web này không kèm máy chủ online. Chạy máy chủ trên máy tính (<b>npm run server</b> trong thư mục game) rồi giữ địa chỉ ws://localhost:8787/ws, hoặc nhập địa chỉ wss:// của máy chủ bạn bè đã dựng.</p>
          <label>Tên đăng nhập<input name="username" aria-label="Tên đăng nhập" autocomplete="username" pattern="[A-Za-z0-9_]{3,20}" minlength="3" maxlength="20" required></label>
          <label>Mật khẩu<input name="password" aria-label="Mật khẩu" type="password" autocomplete="current-password" minlength="6" maxlength="128" required></label>
          <label>Pokémon khởi đầu<select name="starter"><option value="charmander">Charmander</option><option value="squirtle">Squirtle</option><option value="bulbasaur">Bulbasaur</option><option value="pikachu">Pikachu</option><option value="eevee">Eevee</option></select></label>
          <div class="server-auth-actions"><button class="ol-btn ol-btn-green" type="submit" value="login">Đăng nhập</button><button class="ol-btn ol-btn-blue" type="submit" value="register">Tạo tài khoản</button></div>
          <p>Nhân vật online được lưu trên máy chủ. Dùng cùng địa chỉ máy chủ với bạn bè.</p>
          <details data-recover-box><summary>Quên mật khẩu?</summary>
            <label>Mã khôi phục<input name="code" aria-label="Mã khôi phục" autocomplete="off" maxlength="40"></label>
            <label>Mật khẩu mới<input name="newPassword" aria-label="Mật khẩu mới" type="password" autocomplete="new-password" minlength="6" maxlength="128"></label>
            <button type="button" data-recover>Khôi phục tài khoản</button>
          </details>
        </form>
      </section>
      <div class="sw-play" data-play hidden>
        <header class="sw-top ol-panel">
          <button class="ol-btn ol-btn-back" data-exit>◀<span class="sw-label"> Quay lại</span></button>
          <p class="sw-summary" data-summary></p>
          <button class="ol-btn ol-btn-blue sw-menu" data-drawer aria-controls="sw-drawer">☰<span class="sw-label"> Menu</span></button>
        </header>
        <div class="sw-hud">
          <div class="sw-card" data-alpha-card><p data-alpha>Đang tìm Alpha…</p><div class="server-bar sw-hp"><i data-alpha-hp></i></div></div>
          <div class="sw-card" data-event-card><p data-event>Chưa có sự kiện.</p><div class="server-bar" data-event-bar hidden><i></i></div></div>
          <canvas class="sw-mini" data-minimap aria-label="Bản đồ nhỏ" role="img"></canvas>
        </div>
        <div class="sw-cards">
          <div data-recovery class="server-card server-incoming" hidden></div>
          <div data-invite class="server-card" hidden></div>
          <div data-interact class="server-card" hidden></div>
        </div>
        <div class="sw-chatmini" data-chat-mini hidden></div>
        <div class="sw-actions">
          <div data-nearby class="server-card" hidden></div>
          <div class="sw-act-row">
            <button class="sw-act" data-track aria-pressed="false">Chỉ đường</button>
            <button class="sw-act" data-auto aria-pressed="false">Tự đánh</button>
          </div>
          <button class="sw-act sw-attack" data-attack title="Phím Space / F">Tấn công Alpha</button>
        </div>
        <aside class="sw-drawer ol-panel" id="sw-drawer" aria-label="Menu thế giới online">
          <nav class="sw-tabs" role="tablist">
            <button role="tab" data-tab="party">Đội</button><button role="tab" data-tab="events">Sự kiện</button><button role="tab" data-tab="social">Bạn bè</button><button role="tab" data-tab="chat">Chat</button><button role="tab" data-tab="more">Khác</button>
          </nav>
          <section role="tabpanel" data-panel="party">
            <div data-candy class="server-card" hidden></div>
            <div data-roster></div>
            <div class="server-row"><button data-open-pc disabled>Mở PC</button></div>
            <p class="server-help" data-pc-help>Gửi / rút Pokémon tại máy PC ở Trung tâm Pokémon.</p>
          </section>
          <section role="tabpanel" data-panel="events">
            <div data-incoming class="server-card server-incoming" hidden></div>
            <h2>Sự kiện thế giới</h2><p data-event-detail>Chưa có sự kiện.</p>
            <h2>Alpha</h2><p data-alpha-detail>Đang tìm Alpha…</p>
            <p class="server-help">WASD / phím mũi tên hoặc chạm bản đồ để đi · Space / F tấn công Alpha · E dùng máy PC / cổng · M mở menu · Enter chat. Chạm người chơi khác để kết bạn / mời nhóm.</p>
          </section>
          <section role="tabpanel" data-panel="social">
            <label>Tên đăng nhập của bạn<input data-friend maxlength="20"></label>
            <div class="server-row"><button data-social="request">Kết bạn</button><button data-social="accept">Chấp nhận bạn</button><button data-party="create">Tạo nhóm</button><button data-party="invite">Mời vào nhóm</button><button data-party="accept">Nhận lời mời nhóm</button><button data-party="leave">Rời nhóm</button></div>
            <div data-friends><p>Chưa có bạn bè.</p></div><div data-party-info><p>Chưa tham gia nhóm.</p></div>
          </section>
          <section role="tabpanel" data-panel="chat">
            <div data-chat role="log" aria-live="polite"></div>
            <form data-chat-form class="server-row"><select name="channel" aria-label="Kênh chat"><option value="local">Khu vực</option><option value="party">Nhóm</option></select>
              <input name="body" aria-label="Tin nhắn" placeholder="Nói gì đó… (/w tên nội dung = nhắn riêng)" maxlength="240" required><button>Gửi</button></form>
          </section>
          <section role="tabpanel" data-panel="more">
            <h2>Biểu cảm</h2><div class="server-row">
              <button data-emote="wave">👋 Vẫy</button><button data-emote="cheer">🎉 Cổ vũ</button><button data-emote="sit">💤 Ngồi</button><button data-emote="point">👉 Chỉ</button>
            </div>
            <h2>Tài khoản</h2>
            <label>Mật khẩu hiện tại<input data-acc-old type="password" autocomplete="current-password" maxlength="128"></label>
            <label>Mật khẩu mới (tài khoản)<input data-acc-new type="password" autocomplete="new-password" maxlength="128"></label>
            <div class="server-row"><button data-acc="changePassword">Đổi mật khẩu</button><button data-acc="recoveryCode">Tạo mã khôi phục mới</button><button data-acc="logoutAll">Đăng xuất mọi thiết bị</button></div>
            <button data-logout>Đăng xuất</button>
          </section>
        </aside>
      </div>`;
    document.body.append(this.root);
    const form = this.el<HTMLFormElement>('[data-auth]');
    const endpoint = form.elements.namedItem('endpoint') as HTMLInputElement;
    let saved: string | null = null;
    try { saved = localStorage.getItem('survivor.server.endpoint'); } catch { /* storage disabled */ }
    endpoint.value = defaultEndpoint(saved);
    if (needsServerHint()) this.el('[data-server-hint]').hidden = false;
    try { (form.elements.namedItem('username') as HTMLInputElement).value = localStorage.getItem('survivor.server.username') ?? ''; } catch { /* optional */ }
    this.client = new ServerClient((msg) => this.receive(msg), (message) => {
      this.status(message);
      if (!this.client.ready && !this.client.reconnecting) { this.setMode(false); this.target = undefined; }
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const t = (event.submitter as HTMLButtonElement)?.value === 'register' ? 'register' : 'login';
      try {
        this.client.connect(endpoint.value.trim(), { t, username: String(data.get('username')), password: String(data.get('password')), ...(t === 'register' ? { starter: String(data.get('starter')) } : {}) });
        try { localStorage.setItem('survivor.server.endpoint', endpoint.value.trim()); localStorage.setItem('survivor.server.username', String(data.get('username')).trim()); } catch { /* optional */ }
      } catch (e) { this.el('[data-status]').textContent = (e as Error).message; }
    };
    this.el('[data-recover]').onclick = () => {
      const data = new FormData(form);
      try {
        this.client.connect(endpoint.value.trim(), { t: 'recover', username: String(data.get('username')).trim(), code: String(data.get('code')), newPassword: String(data.get('newPassword')) });
      } catch (e) { this.status((e as Error).message); }
    };
    this.root.querySelectorAll<HTMLButtonElement>('[data-acc]').forEach((b) => b.onclick = () => {
      const op = b.dataset.acc as 'changePassword' | 'recoveryCode' | 'logoutAll';
      const old = this.el<HTMLInputElement>('[data-acc-old]'), neu = this.el<HTMLInputElement>('[data-acc-new]');
      this.client.send({ t: 'account', actionId: actionId(), op, password: old.value, newPassword: neu.value });
      old.value = ''; neu.value = '';
    });
    this.pc = new ServerPc(this.root, {
      save: () => this.save,
      act: (type, data) => this.act(type, data),
      icon: (species, shiny) => this.icon(species, shiny),
      onClose: () => this.game.canvas.focus?.(),
    });
    this.el('[data-open-pc]').onclick = () => this.useNearby();
    this.root.querySelectorAll<HTMLButtonElement>('[data-exit]').forEach((b) => b.onclick = () => this.scene.start('Menu'));
    this.el('[data-logout]').onclick = () => {
      this.client.send({ t: 'logout' }); this.client.shutdown(); this.scene.restart();
    };
    this.el('[data-attack]').onclick = () => this.attackAlpha();
    this.el('[data-track]').onclick = () => {
      this.tracking = !this.tracking;
      this.el('[data-track]').setAttribute('aria-pressed', String(this.tracking));
      this.el('[data-track]').textContent = this.tracking ? 'Tắt chỉ đường' : 'Chỉ đường';
    };
    this.el('[data-auto]').onclick = () => {
      this.autoAttack = !this.autoAttack;
      this.el('[data-auto]').setAttribute('aria-pressed', String(this.autoAttack));
      this.status(this.autoAttack ? 'Tự đánh: BẬT — Pokémon tự tấn công khi Alpha trong tầm.' : 'Tự đánh: TẮT');
    };
    this.el('[data-drawer]').onclick = () => this.setDrawer(!this.drawerOpen);
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.onclick = () => this.openTab(b.dataset.tab as Tab));
    this.el('[data-chat-mini]').onclick = () => this.openTab('chat');
    this.setDrawer(this.drawerOpen); this.openTab('party', false);
    this.el<HTMLFormElement>('[data-chat-form]').onsubmit = (event) => {
      event.preventDefault();
      const field = this.el<HTMLInputElement>('[name=body]');
      if (this.sendChat(field.value.trim())) field.value = '';
    };
    this.root.querySelectorAll<HTMLButtonElement>('[data-social]').forEach((b) => b.onclick = () => this.friendOp(b.dataset.social as 'request' | 'accept', this.friendField()));
    this.root.querySelectorAll<HTMLButtonElement>('[data-party]').forEach((b) => b.onclick = () => this.partyOp(b.dataset.party as 'create' | 'invite' | 'accept' | 'leave', this.friendField()));
    this.root.querySelectorAll<HTMLButtonElement>('[data-emote]').forEach((b) => b.onclick = () => this.client.send({ t: 'emote', kind: b.dataset.emote as EmoteKind }));
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as typeof this.keys;
    const free = () => this.client.ready && !this.typing() && !this.pc?.open;
    this.input.keyboard!.on('keydown-E', () => { if (free()) this.useNearby(); });
    this.input.keyboard!.on('keydown-SPACE', () => { if (free()) this.attackAlpha(); });
    this.input.keyboard!.on('keydown-F', () => { if (free()) this.attackAlpha(); });
    this.input.keyboard!.on('keydown-M', () => { if (free()) this.setDrawer(!this.drawerOpen); });
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (!free()) return;
      this.openTab('chat'); this.el<HTMLInputElement>('[name=body]').focus();
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.client.ready) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const hit = [...this.remotes.values()].find((r) => Math.hypot(r.view.x - w.x, r.view.y - w.y) < 34);
      if (hit) { this.interact(hit.data); return; }
      this.target = w;
    });
    this.events.once('shutdown', () => {
      clearTimeout(this.statusTimer);
      this.client.shutdown(); this.pc?.destroy(); this.pc = undefined; this.root.remove(); this.chunks?.destroyAll(); this.chunks = undefined;
      this.map = undefined; this.player = undefined; this.companion = undefined; this.alphaArt = undefined; this.myBubble = undefined;
      this.trackArrow = undefined; this.rangeRing = undefined; this.playerShadow = undefined; this.companionShadow = undefined; this.myName = undefined;
      this.remotes.clear();
    });
  }

  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private typing(): boolean {
    return this.root.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
  }

  /** Login card ↔ in-world layout. The one status line moves with it (login card / toast over the map). */
  private setMode(playing: boolean): void {
    this.el('[data-login]').hidden = playing;
    this.el('[data-auth]').hidden = playing;
    this.el('[data-play]').hidden = !playing;
    const status = this.el('[data-status]');
    if (playing) this.el('[data-play]').append(status);
    else this.el('[data-login] header').after(status);
  }

  private setDrawer(open: boolean): void {
    this.drawerOpen = open;
    this.el('[data-play]').classList.toggle('drawer-open', open);
    this.el('[data-drawer]').setAttribute('aria-expanded', String(open));
    this.updateChatMini();
  }

  private openTab(tab: Tab, show = true): void {
    this.tab = tab;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.root.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => p.hidden = p.dataset.panel !== tab);
    if (show && !this.drawerOpen) this.setDrawer(true);
    if (tab === 'chat') { const log = this.el('[data-chat]'); log.scrollTop = log.scrollHeight; }
    this.updateChatMini();
  }

  private icon(species: string, shiny: boolean): string | null {
    const key = shiny ? `${species}~shiny` : species;
    const hit = this.iconCache.get(key);
    if (hit) return hit;
    if (!this.textures.exists(key)) return null;
    try {
      const url = this.textures.getBase64(key);
      if (url) this.iconCache.set(key, url);
      return url || null;
    } catch { return null; }
  }

  /** PC terminal or portal under the trainer (computed from the same map data the server validates with). */
  private updateNearby(): void {
    if (!this.player || !this.map) return;
    const px = this.player.x, py = this.player.y;
    let near: typeof this.nearby = null;
    if (this.map.pcTerminalTiles().some((t) => Math.hypot(t.x * TILE_PX - px, t.y * TILE_PX - py) <= PC_RANGE)) near = { kind: 'pc' };
    else {
      const portal = this.map.portals().find((p) => Math.hypot((p.x + 0.5) * TILE_PX - px, (p.y + 0.5) * TILE_PX - py) <= PORTAL_RANGE);
      if (portal) near = { kind: 'portal', id: portal.id, name: portal.name, to: portal.to };
    }
    const key = near ? (near.kind === 'pc' ? 'pc' : near.id) : '';
    if (key === this.nearbyKey) return;
    this.nearbyKey = key; this.nearby = near;
    const card = this.el('[data-nearby]');
    card.hidden = !near; card.replaceChildren();
    (this.el('[data-open-pc]') as HTMLButtonElement).disabled = near?.kind !== 'pc';
    if (!near) { if (this.pc?.open) this.pc.hide(); return; }
    const p = document.createElement('p');
    p.textContent = near.kind === 'pc' ? 'Máy PC Pokémon' : `Cổng: ${near.name}${near.to !== this.save?.adventure?.region ? ` → ${REGION_NAME[near.to] ?? near.to}` : ''}`;
    const b = document.createElement('button');
    b.textContent = near.kind === 'pc' ? '[E] Mở PC' : '[E] Đi qua cổng';
    b.onclick = () => this.useNearby();
    card.append(p, b);
  }

  private useNearby(): void {
    const n = this.nearby;
    if (!n || !this.client.ready) return;
    if (n.kind === 'pc') { this.renderCandy(null); this.pc?.show(); return; }
    this.client.send({ t: 'travel', portal: n.id });
  }

  private showRecovery(code: string): void {
    const box = this.el('[data-recovery]');
    box.hidden = false; box.replaceChildren();
    const p = document.createElement('p');
    p.textContent = `MÃ KHÔI PHỤC TÀI KHOẢN\n${code}\nGhi lại và cất giữ mã này. Đây là cách duy nhất lấy lại tài khoản nếu quên mật khẩu; máy chủ không lưu mã ở dạng đọc được và sẽ không hiện lại.`;
    p.setAttribute('data-recovery-code', code);
    const ok = document.createElement('button'); ok.textContent = 'Tôi đã lưu mã';
    ok.onclick = () => { box.hidden = true; box.replaceChildren(); };
    box.append(p, ok);
  }

  private friendField(): string { return this.el<HTMLInputElement>('[data-friend]').value.trim(); }
  private status(message: string): void {
    const el = this.el('[data-status]');
    el.textContent = message;
    // over the map the line is a toast: it fades after a few seconds (the text stays for screen readers)
    el.classList.remove('faded');
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => el.classList.add('faded'), 4000);
  }

  private act(type: ActionType, data?: Record<string, unknown>): void {
    this.client.send({ t: 'action', actionId: actionId(), type, data });
  }
  private friendOp(op: 'request' | 'accept' | 'remove' | 'block' | 'unblock' | 'report', target: string, reason?: string): void {
    this.client.send({ t: 'friend', actionId: actionId(), op, target, ...(reason ? { reason } : {}) });
  }
  private partyOp(op: 'create' | 'invite' | 'accept' | 'decline' | 'leave' | 'kick' | 'promote' | 'disband', target = ''): void {
    this.client.send({ t: 'party', actionId: actionId(), op, target });
  }

  private sendChat(raw: string): boolean {
    if (!raw) return false;
    const whisper = /^\/w\s+(\S+)\s+(.+)$/i.exec(raw);
    if (whisper) return this.client.send({ t: 'whisper', actionId: actionId(), target: whisper[1], body: whisper[2] });
    const channelSel = this.el<HTMLSelectElement>('[name=channel]').value;
    if (channelSel === 'party') {
      if (!this.party?.id) { this.status('Bạn chưa ở trong nhóm.'); return false; }
      return this.client.send({ t: 'chat', actionId: actionId(), channel: `party:${this.party.id}`, body: raw });
    }
    return this.client.send({ t: 'chat', actionId: actionId(), channel: `region:${this.save?.adventure?.region}`, body: raw });
  }

  private receive(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome': {
        const reconnect = !!this.save && this.account?.id === msg.account.id && this.save.adventure?.region === msg.save.adventure?.region;
        this.account = msg.account; this.save = msg.save;
        this.setMode(true);
        this.el<HTMLInputElement>('[name=password]').value = '';
        if (reconnect && this.player) {
          // resumed session: keep the rendered world, snap to the server's position
          const pos = msg.save.adventure!.pos; this.player.setPosition(pos.x, pos.y);
          this.status('Đã kết nối lại. Dữ liệu được giữ nguyên trên máy chủ.');
        } else this.openWorld();
        this.lastActive = msg.save.adventure?.activeUid ?? null;
        if (msg.recoveryCode) this.showRecovery(msg.recoveryCode);
        this.roster(); break;
      }
      case 'recoveryCode': this.showRecovery(msg.code); break;
      case 'region':
        this.save = msg.save; this.pc?.hide();
        this.openWorld(); this.roster(); this.nearbyKey = '-';
        this.status(`Đã đến ${REGION_NAME[msg.region] ?? msg.region}.`);
        break;
      case 'position': this.player?.setPosition(msg.x, msg.y); this.target = undefined; break;
      case 'saveSync': this.save = msg.save; this.roster(); this.pc?.render(); break;
      case 'presence': this.presence(msg.players, !!msg.full, msg.gone ?? []); break;
      case 'actionResult': this.actionDone(msg.save, msg.result); break;
      case 'actionError': case 'error': case 'notice': this.status(msg.message); break;
      case 'chat': this.chat(msg.message.id, `${msg.message.channel.startsWith('party:') ? '[Nhóm] ' : ''}${msg.message.fromName}: ${msg.message.body}`); break;
      case 'chatHistory': for (const m of msg.messages) this.chat(m.id, `${m.channel.startsWith('party:') ? '[Nhóm] ' : ''}${m.fromName}: ${m.body}`); break;
      case 'whisper': this.chat(-msg.at - Math.random(), msg.from === this.account?.id ? `[Riêng → ${msg.toName}] ${msg.body}` : `[Riêng] ${msg.fromName}: ${msg.body}`); break;
      case 'alpha': case 'alphaHit': case 'alphaDefeated':
        this.alpha = msg.alpha; this.drawAlpha();
        if (msg.t === 'alphaHit') this.hitFx(msg.damage);
        if (msg.t === 'alphaDefeated') this.defeatFx();
        if (msg.t === 'alphaDefeated' && msg.save) {
          const mine = msg.rewards.find((r) => r.accountId === this.account?.id);
          const before = this.save?.collection.find((p) => p.uid === this.save?.adventure?.activeUid);
          this.save = msg.save; this.roster(); this.pc?.render();
          const after = before && msg.save.collection.find((p) => p.uid === before.uid);
          const lv = before && after && after.level > before.level ? ` · ${name(after)} Lv${before.level} → Lv${after.level}` : '';
          this.status(`Hạ Alpha! +${mine?.exp ?? 0} EXP${mine?.partyBonus ? ` (thưởng nhóm +${Math.round(mine.partyBonus * 100)}%)` : ''}, ${Object.keys(mine?.items ?? {}).join(', ')}, +${mine?.money ?? 0} xu${lv}`);
          if (lv) this.levelFx();
        }
        break;
      case 'event': this.event = msg.event; this.renderEvent(); if (msg.message) this.status(msg.message); break;
      case 'eventIncoming': this.incoming = msg.incoming; this.renderEvent(); break;
      case 'friends': this.renderFriends(msg.friends, msg.requests); break;
      case 'party': this.party = msg.party; this.renderParty(msg.invite ?? null); break;
      case 'petFx': this.petFx(msg.accountId, msg.kind, msg.species); break;
      case 'emote': this.showEmote(msg.accountId, msg.kind); break;
    }
  }

  private actionDone(save: SaveData, result?: Record<string, unknown>): void {
    const prev = this.save;
    this.save = save;
    const active = save.adventure?.activeUid ?? null;
    if (active !== this.lastActive) this.lastActive = active;
    if (result && typeof result.used === 'number' && prev) {
      // one merged line for any number of levels (no popup spam), then the evolution question
      const uid = this.candyFor;
      const p = uid ? save.collection.find((c) => c.uid === uid) : undefined;
      const levels = Number(result.levels ?? 0);
      this.status(`Đã dùng ${result.used} ${candyDef(String(result.candy))?.name ?? 'kẹo'}: +${result.expGained} EXP${levels ? ` · Lv${result.beforeLevel} → Lv${result.afterLevel}` : ''}`);
      if (levels && p && p.uid === active) this.levelFx();
      const evo = Array.isArray(result.evolutions) ? result.evolutions as string[] : [];
      if (p && evo.length) this.evolutionPrompt(p, evo);
      else if (uid) this.renderCandy(uid);
    } else if (result && typeof result.species === 'string') {
      this.status(`Tiến hóa thành ${POKEMON.get(result.species)?.name ?? result.species}!`);
      this.candyFor = null; this.renderCandy(null);
    } else this.status('Đã lưu trên máy chủ.');
    this.roster();
    this.pc?.render();
  }

  /** Animated sheet of a profile avatar / species; falls back to the still image. */
  private sheetOf(key: string): string { return this.textures.exists(sheetKey(key)) ? sheetKey(key) : key; }
  private petKey(species: string, shiny = false): string {
    return shiny && this.textures.exists(sheetKey(shinyKey(species))) ? shinyKey(species) : species;
  }
  /** idle / walk loop + facing for a sprite drawn from one of the derived sheets */
  private animate(s: Phaser.GameObjects.Sprite, key: string, moving: boolean, face: number): void {
    const anim = `${key}:${moving ? 'walk' : 'idle'}`;
    if (this.anims.exists(anim) && s.anims.currentAnim?.key !== anim) s.play(anim);
    s.setFlipX(face < 0);
  }
  private setPetSprite(pet: Phaser.GameObjects.Sprite, species: string, shiny = false): void {
    const k = this.petKey(species, shiny);
    if (pet.getData('k') === k) return;
    pet.setData('k', k).setTexture(this.sheetOf(k), 0);
    pet.anims.stop();
  }
  private plate(x: number, y: number, label: string, color = '#ffffff'): Phaser.GameObjects.Text {
    return text(this, x, y, label, 16, color).setOrigin(0.5, 1).setBackgroundColor('rgba(11,12,18,0.55)').setPadding(5, 1, 5, 1);
  }

  private openWorld(): void {
    this.chunks?.destroyAll(); this.player?.destroy(); this.companion?.destroy(); this.alphaArt?.box.destroy(); this.myBubble?.destroy(); this.trackArrow?.destroy();
    this.rangeRing?.destroy(); this.playerShadow?.destroy(); this.companionShadow?.destroy(); this.myName?.destroy();
    for (const r of this.remotes.values()) r.view.destroy(); this.remotes.clear();
    this.alphaArt = undefined; this.target = undefined; this.miniBase = undefined;
    this.map = new ValleyMap(regionDef(this.save!.adventure!.region));
    this.chunks = new ChunkView(this, this.map, { onLoad: (rec) => {
      for (const o of rec.mapObjects) {
        const px = o.x * TILE_PX, py = o.y * TILE_PX;
        if (o.kind === 'building' && o.tiles) {
          o.tiles.forEach((row, y) => row.forEach((tile, x) => rec.objects.push(
            this.add.image(px + x * TILE_PX, py + y * TILE_PX, 'ow_tiles', tile).setOrigin(0).setScale(SCALE).setDepth(py + (o.h || 1) * TILE_PX),
          )));
        } else if (o.tile != null) {
          rec.objects.push(this.add.image(px, py, 'ow_tiles', o.tile).setOrigin(o.kind === 'tree' ? 0.5 : 0, o.kind === 'tree' ? 1 : 0).setScale(SCALE).setDepth(py + TILE_PX));
        } else if (o.kind === 'boulder') {
          rec.objects.push(this.add.image(px, py, 'boulder').setScale(SCALE).setDepth(py));
        }
      }
    }, onUnload: () => {} });
    const pos = this.save!.adventure!.pos;
    const avatar = avatarTextureKey(this.account!.avatar);
    this.playerShadow = this.add.image(pos.x, pos.y + 18, 'shadow').setScale(2.4, 2).setAlpha(0.55);
    this.player = this.add.sprite(pos.x, pos.y, this.sheetOf(avatar), 0).setScale(2).setDepth(10000).setData('k', avatar);
    this.companionShadow = this.add.image(pos.x - 30, pos.y + 22, 'shadow').setScale(2, 1.6).setAlpha(0.5);
    this.companion = this.add.sprite(pos.x - 30, pos.y + 8, this.sheetOf('charmander'), 0).setScale(1.5).setDepth(10001).setData('k', 'charmander');
    this.myName = this.plate(pos.x, pos.y - 30, this.account!.displayName, '#ffe080').setDepth(20000);
    this.myBubble = text(this, pos.x, pos.y - 60, '', 18, '#ffffff').setOrigin(0.5).setDepth(20000).setVisible(false);
    this.rangeRing = this.add.graphics().setDepth(5);
    this.trackArrow = this.add.triangle(0, 0, 0, -12, 10, 10, -10, 10, 0xffda65).setStrokeStyle(2, 0x2a1a00).setDepth(20001).setVisible(false);
    this.cameras.main.setBounds(0, 0, this.map.widthTiles * TILE_PX, this.map.heightTiles * TILE_PX).startFollow(this.player, true, 0.12, 0.12);
  }

  private roster(): void {
    if (!this.save) return;
    const adv = this.save.adventure!;
    this.el('[data-summary]').textContent = `${this.account!.displayName} · ${REGION_NAME[adv.region] ?? adv.region} · ${this.save.currency} xu`;
    const active = this.save.collection.find((p) => p.uid === adv.activeUid);
    if (this.time.now >= this.companionFxUntil) this.companion?.setVisible(!!active).setScale(1.5).setAlpha(1).clearTint();
    if (active && this.companion) this.setPetSprite(this.companion, active.species, active.shiny);
    this.companionShadow?.setVisible(!!active);
    const list = this.el('[data-roster]'); list.replaceChildren();
    const candies = CANDY_DEFS.filter((c) => (this.save!.inventory[c.id] || 0) > 0);
    const bag = document.createElement('p');
    bag.textContent = candies.length ? 'Túi kẹo: ' + candies.map((c) => `${c.name} ×${this.save!.inventory[c.id]}`).join(' · ') : 'Túi kẹo trống.';
    list.append(bag);
    // the roster shows the party; boxes live in the PC dialog
    const ordered = adv.party.map((u) => this.save!.collection.find((p) => p.uid === u)!).filter(Boolean);
    const stored = this.save.collection.length - ordered.length;
    if (stored > 0) { const n = document.createElement('p'); n.textContent = `${stored} Pokémon trong PC.`; list.append(n); }
    for (const p of ordered) {
      const row = document.createElement('div'); row.className = 'server-pokemon';
      if (p.uid === adv.activeUid) row.classList.add('active');
      const src = this.icon(p.species, !!p.shiny);
      if (src) { const img = document.createElement('img'); img.src = src; img.alt = ''; row.append(img); }
      const label = document.createElement('p');
      const inParty = adv.party.includes(p.uid);
      const hp = Math.round((p.hpFrac ?? 1) * 100);
      label.textContent = `${p.uid === adv.activeUid ? '● ' : ''}${p.nickname || p.species} · Lv${p.level} · ${inParty ? 'Đội' : 'PC'}${hp < 100 ? ` · HP ${hp}%` : ''}`; row.append(label);
      const buttons = document.createElement('div'); buttons.className = 'server-row';
      const add = (text: string, run: () => void) => { const b = document.createElement('button'); b.textContent = text; b.onclick = run; buttons.append(b); };
      if (inParty) add(p.uid === adv.activeUid ? 'Thu hồi' : 'Gọi ra', () => this.act(p.uid === adv.activeUid ? 'party.recall' : adv.activeUid ? 'party.switch' : 'party.setActive', { uid: p.uid }));
      if (candies.length) add('Dùng kẹo', () => this.renderCandy(p.uid));
      row.append(buttons);
      list.append(row);
    }
    if (this.candyFor) this.renderCandy(this.candyFor);
  }

  /** Candy dialog: candy → quantity (1/5/10/Max/custom) → preview → confirm. The server computes the real result. */
  private renderCandy(uid: string | null): void {
    const box = this.el('[data-candy]');
    this.candyFor = uid;
    const p = uid ? this.save?.collection.find((c) => c.uid === uid) : undefined;
    if (!p || !this.save) { box.hidden = true; box.replaceChildren(); this.candyFor = null; return; }
    const owned = CANDY_DEFS.filter((c) => (this.save!.inventory[c.id] || 0) > 0);
    if (!owned.length) { box.hidden = true; this.candyFor = null; return; }
    const prevSel = box.querySelector<HTMLSelectElement>('select')?.value;
    const prevQty = Number(box.querySelector<HTMLInputElement>('input')?.value || 1);
    box.hidden = false; box.replaceChildren();
    const title = document.createElement('p'); title.textContent = `Dùng kẹo cho ${name(p)} (Lv${p.level})`;
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Loại kẹo');
    for (const c of owned) { const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.name} ×${this.save.inventory[c.id]}`; sel.append(o); }
    if (prevSel && owned.some((c) => c.id === prevSel)) sel.value = prevSel;
    const qty = document.createElement('input'); qty.type = 'number'; qty.min = '1'; qty.setAttribute('aria-label', 'Số lượng kẹo');
    const preview = document.createElement('p'); preview.setAttribute('data-candy-preview', '');
    const limit = () => Math.min(this.save!.inventory[sel.value] || 0, maxUsefulCandy(p, sel.value));
    const refresh = () => {
      const max = Math.max(0, limit());
      qty.max = String(Math.max(1, max));
      const n = Math.max(1, Math.min(max || 1, Math.floor(Number(qty.value) || 1)));
      qty.value = String(n);
      const out = previewCandy(p, sel.value, max ? n : 0);
      preview.textContent = max
        ? `EXP hiện tại: ${p.exp}\nEXP sẽ nhận: +${out.expGained}\nCấp: Lv${out.beforeLevel} → Lv${out.afterLevel}\nSố kẹo dùng: ${out.used}`
        : 'Kẹo này không còn tác dụng (Lv100 / EXP tối đa).';
      ok.disabled = !max;
    };
    const row = document.createElement('div'); row.className = 'server-row';
    for (const [label, n] of [['×1', 1], ['×5', 5], ['×10', 10], ['Max', Infinity]] as const) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.onclick = () => { qty.value = String(n === Infinity ? limit() : n); refresh(); }; row.append(b);
    }
    const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = 'Xác nhận dùng';
    ok.onclick = () => this.act('candy.use', { uid: p.uid, candy: sel.value, qty: Number(qty.value) });
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Đóng';
    cancel.onclick = () => this.renderCandy(null);
    sel.onchange = refresh; qty.oninput = refresh;
    qty.value = String(prevQty || 1);
    const actions = document.createElement('div'); actions.className = 'server-row'; actions.append(ok, cancel);
    box.append(title, sel, row, qty, preview, actions);
    refresh();
  }

  private evolutionPrompt(p: OwnedPokemon, options: string[]): void {
    const box = this.el('[data-candy]');
    box.hidden = false; box.replaceChildren();
    const q = document.createElement('p'); q.textContent = `${name(p)} có thể tiến hóa!`;
    const row = document.createElement('div'); row.className = 'server-row';
    for (const to of options) {
      const b = document.createElement('button'); b.textContent = `Tiến hóa thành ${POKEMON.get(to)?.name ?? to}`;
      b.onclick = () => this.act('pokemon.evolve', { uid: p.uid, to }); row.append(b);
    }
    const later = document.createElement('button'); later.textContent = 'Để sau';
    later.onclick = () => { this.act('pokemon.declineEvolution', { uid: p.uid }); this.candyFor = null; this.renderCandy(null); };
    row.append(later);
    box.append(q, row);
  }

  /** Compact card over the map + full details in the Events tab. */
  private renderEvent(): void {
    const now = Date.now();
    const inc = this.el('[data-incoming]');
    const i = this.incoming;
    const startsIn = i ? Math.max(0, Math.ceil((i.startsAt - now) / 1000)) : 0;
    if (i) {
      inc.hidden = false;
      inc.textContent = `SỰ KIỆN SẮP DIỄN RA\n${i.name} · ${REGION_NAME[i.region] ?? i.region}\nBắt đầu sau ${clock(startsIn)}\nĐộ khó: ${i.difficulty} · gợi ý Lv${i.recommendedLevel}\nMục tiêu: ${i.objective}\nThưởng: ${i.rewards}`;
    } else inc.hidden = true;
    const e = this.event;
    const bar = this.el('[data-event-bar]');
    const card = this.el('[data-event-card]');
    if (!e || e.status !== 'active') {
      this.el('[data-event]').textContent = i ? `Sắp diễn ra: ${i.name}\nBắt đầu sau ${clock(startsIn)}` : e ? `${e.name}: ${e.status === 'completed' ? 'hoàn thành' : 'đã kết thúc'}` : 'Chưa có sự kiện.';
      card.classList.toggle('soon', !!i);
    } else card.classList.remove('soon');
    if (!e) { this.el('[data-event-detail]').textContent = 'Chưa có sự kiện.'; bar.hidden = true; return; }
    const left = Math.max(0, Math.ceil((e.endsAt - now) / 1000));
    const state = { active: `Còn ${clock(left)}`, completed: 'Hoàn thành', expired: 'Đã kết thúc' }[e.status];
    if (e.status === 'active') this.el('[data-event]').textContent = `${e.name}\n${e.progress}/${e.goal} · ${state}`;
    this.el('[data-event-detail]').textContent = `${e.name}${e.difficulty ? ` · ${e.difficulty}` : ''}\n${e.objective || 'Mục tiêu'}: ${e.progress}/${e.goal}\n${state} · ${e.participants ?? 0} người tham gia\nĐóng góp của bạn: ${e.myContribution ?? 0}${e.rewards ? `\nThưởng: ${e.rewards}` : ''}`;
    bar.hidden = e.status !== 'active';
    (bar.firstElementChild as HTMLElement).style.width = `${Math.min(100, e.progress / Math.max(1, e.goal) * 100)}%`;
  }

  private renderFriends(friends: ServerFriend[], requests: ServerFriend[]): void {
    const box = this.el('[data-friends]'); box.replaceChildren();
    if (!friends.length && !requests.length) { const p = document.createElement('p'); p.textContent = 'Chưa có bạn bè.'; box.append(p); return; }
    const line = (text: string, buttons: [string, () => void][]) => {
      const row = document.createElement('div'); row.className = 'server-pokemon';
      const p = document.createElement('p'); p.textContent = text; row.append(p);
      const actions = document.createElement('div'); actions.className = 'server-row';
      for (const [label, run] of buttons) { const b = document.createElement('button'); b.textContent = label; b.onclick = run; actions.append(b); }
      row.append(actions);
      box.append(row);
    };
    for (const f of friends) {
      if (f.status === 'blocked') { line(`${f.displayName} · đã chặn`, [['Bỏ chặn', () => this.friendOp('unblock', f.username)]]); continue; }
      line(`${f.displayName} · ${f.online ? 'online' : 'offline'}`, [
        ['Nhắn riêng', () => this.whisperTo(f.username)],
        ['Mời nhóm', () => this.partyOp('invite', f.username)],
        ['Xóa bạn', () => this.friendOp('remove', f.username)],
      ]);
    }
    for (const f of requests) {
      line(`${f.displayName} · ${f.incoming ? 'đang chờ bạn chấp nhận' : 'đã gửi lời mời'}`, f.incoming
        ? [['Chấp nhận', () => this.friendOp('accept', f.username)], ['Chặn', () => this.friendOp('block', f.username)]]
        : []);
    }
  }

  private whisperTo(username: string): void {
    this.openTab('chat');
    const i = this.el<HTMLInputElement>('[name=body]'); i.value = `/w ${username} `; i.focus();
  }

  private renderParty(invite: { partyId: string; fromName: string } | null): void {
    const inv = this.el('[data-invite]');
    inv.hidden = !invite; inv.replaceChildren();
    if (invite) {
      const p = document.createElement('p'); p.textContent = `${invite.fromName} mời bạn vào nhóm.`;
      const row = document.createElement('div'); row.className = 'server-row';
      const yes = document.createElement('button'); yes.textContent = 'Đồng ý'; yes.onclick = () => this.partyOp('accept');
      const no = document.createElement('button'); no.textContent = 'Từ chối'; no.onclick = () => this.partyOp('decline');
      row.append(yes, no); inv.append(p, row);
    }
    const box = this.el('[data-party-info]'); box.replaceChildren();
    const party = this.party;
    if (!party) { const p = document.createElement('p'); p.textContent = 'Chưa tham gia nhóm.'; box.append(p); return; }
    const head = document.createElement('p'); head.textContent = `Nhóm: ${party.members.map((m) => m.displayName).join(', ')} (${party.members.length}/4)`; box.append(head);
    const lead = party.leaderId === this.account?.id;
    for (const m of party.members) {
      const row = document.createElement('div'); row.className = 'server-pokemon';
      const p = document.createElement('p');
      const pet = m.species ? `${POKEMON.get(m.species)?.name ?? m.species} HP ${Math.round((m.hpFrac ?? 0) * 100)}%` : 'chưa gọi Pokémon';
      const where = !m.online ? 'offline' : m.region !== this.save?.adventure?.region ? (REGION_NAME[m.region ?? ''] ?? m.region ?? '?') : m.accountId === this.account?.id ? 'bạn' : `${m.distance ?? '?'} px`;
      p.textContent = `${m.accountId === party.leaderId ? '★ ' : ''}${m.displayName} · Lv${m.level} · ${pet} · ${where}`;
      row.append(p);
      if (lead && m.accountId !== this.account?.id) {
        const actions = document.createElement('div'); actions.className = 'server-row';
        for (const [label, op] of [['Trao trưởng nhóm', 'promote'], ['Mời ra', 'kick']] as const) {
          const b = document.createElement('button'); b.textContent = label; b.onclick = () => this.partyOp(op, m.username); actions.append(b);
        }
        row.append(actions);
      }
      box.append(row);
    }
    if (lead) { const b = document.createElement('button'); b.textContent = 'Giải tán nhóm'; b.onclick = () => this.partyOp('disband'); box.append(b); }
  }

  /** Player interaction menu (click another trainer). */
  private interact(p: ServerPlayerView): void {
    const box = this.el('[data-interact]');
    box.hidden = false; box.replaceChildren();
    const title = document.createElement('p'); title.textContent = `${p.displayName} · Lv${p.level}${p.species ? ` · ${POKEMON.get(p.species)?.name ?? p.species}` : ''}`;
    const row = document.createElement('div'); row.className = 'server-row';
    const add = (label: string, run: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { run(); box.hidden = true; }; row.append(b); };
    add('Kết bạn', () => this.friendOp('request', p.username));
    add('Mời nhóm', () => this.partyOp('invite', p.username));
    add('Nhắn riêng', () => this.whisperTo(p.username));
    add('Chặn', () => this.friendOp('block', p.username));
    add('Báo cáo', () => this.friendOp('report', p.username, 'Báo cáo từ menu người chơi'));
    add('Đóng', () => {});
    box.append(title, row);
  }

  /** full = the complete visible set; otherwise a delta (changed players + ids that left the view). */
  private presence(players: ServerPlayerView[], full: boolean, gone: string[]): void {
    const ids = new Set(players.map((p) => p.accountId));
    for (const [id, r] of this.remotes) if ((full && !ids.has(id)) || gone.includes(id)) { r.view.destroy(); this.remotes.delete(id); }
    const myParty = this.party?.id;
    for (const p of players) {
      let r = this.remotes.get(p.accountId);
      if (!r) {
        const avatar = avatarTextureKey(p.avatar);
        const shadow = this.add.image(0, 18, 'shadow').setScale(2.4, 2).setAlpha(0.55);
        const trainer = this.add.sprite(0, 0, this.sheetOf(avatar), 0).setScale(2).setData('k', avatar);
        const label = this.plate(0, -30, p.displayName);
        const pet = this.add.sprite(-30, 8, this.sheetOf('charmander'), 0).setScale(1.5).setData('k', 'charmander');
        const bubble = text(this, 0, -60, '', 18, '#ffffff').setOrigin(0.5).setVisible(false);
        const view = this.add.container(p.x, p.y, [shadow, pet, trainer, label, bubble]).setDepth(10000);
        r = { view, shadow, trainer, name: label, pet, bubble, data: p, tx: p.x, ty: p.y, face: 1, fxUntil: 0 };
        this.remotes.set(p.accountId, r);
      }
      r.data = p; r.tx = p.x; r.ty = p.y;
      // too far behind (teleport/corrected position): snap instead of sliding across the map
      if (Math.hypot(r.view.x - p.x, r.view.y - p.y) > 400) r.view.setPosition(p.x, p.y);
      r.name.setColor(myParty && p.partyId === myParty ? '#8fe3a3' : '#ffffff');
      if (this.time.now >= r.fxUntil) {
        r.pet.setVisible(!!p.species && p.petState !== 'none' && p.petState !== 'summoning').setScale(1.5).setAlpha(1).clearTint();
      }
      if (p.species) this.setPetSprite(r.pet, p.species, p.shiny);
      if (p.emote && Date.now() - p.emote.at < 4000 && !r.bubble.visible) this.showEmote(p.accountId, p.emote.kind);
    }
  }

  private trainerOf(accountId: string): { x: number; y: number; pet?: Phaser.GameObjects.Sprite; local: boolean } | undefined {
    if (accountId === this.account?.id && this.player) return { x: this.player.x, y: this.player.y, pet: this.companion, local: true };
    const r = this.remotes.get(accountId);
    return r ? { x: r.view.x, y: r.view.y, pet: r.pet, local: false } : undefined;
  }

  /** Summon: ball arc → pop + flash → Pokémon grows in. Recall: red beam → Pokémon shrinks away. */
  private petFx(accountId: string, kind: 'summon' | 'recall', species: string | null): void {
    const who = this.trainerOf(accountId);
    if (!who?.pet) return;
    const pet = who.pet;
    const remote = this.remotes.get(accountId);
    // a switch sends recall then summon: the summon starts when the recall ends
    const startAt = Math.max(this.time.now, remote ? remote.fxUntil : (who.local ? this.companionFxUntil : 0));
    const total = 700;
    const until = startAt + total;
    if (remote) remote.fxUntil = until; else this.companionFxUntil = until;
    this.time.delayedCall(startAt - this.time.now, () => {
      if (!pet.active) return;
      const t = this.trainerOf(accountId); if (!t) return;
      // remote pets live inside the trainer's container: effects are drawn in world space
      const px = remote ? t.x + pet.x : pet.x, py = remote ? t.y + pet.y : pet.y;
      if (kind === 'recall') {
        const beam = this.add.graphics().setDepth(20000);
        pet.setVisible(true).setTintFill(0xff4040);
        audio.play('zap');
        this.tweens.addCounter({ from: 0, to: 1, duration: total, onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          beam.clear().lineStyle(6 * (1 - k * 0.6), 0xff3030, 0.85).lineBetween(t.x, t.y - 10, px, py);
          pet.setScale(1.5 * (1 - k));
        }, onComplete: () => { beam.destroy(); pet.setVisible(false).setScale(1.5).clearTint(); } });
        return;
      }
      if (species) this.setPetSprite(pet, species);
      pet.setVisible(false);
      const ball = this.textures.exists('pokeball_big')
        ? this.add.image(t.x, t.y - 20, 'pokeball_big').setScale(SCALE)
        : this.add.circle(t.x, t.y - 20, 7, 0xe03030).setStrokeStyle(2, 0xffffff);
      ball.setDepth(20000);
      audio.play('whip');
      this.tweens.addCounter({ from: 0, to: 1, duration: 320, onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        ball.setPosition(t.x + (px - t.x) * k, t.y - 20 + (py - t.y + 20) * k - Math.sin(k * Math.PI) * 50).setAngle(k * 540);
      }, onComplete: () => {
        ball.destroy();
        const flash = this.add.circle(px, py, 10, 0xffffff, 0.9).setDepth(20000).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: flash, scale: 4, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
        audio.play('shield');
        pet.setVisible(true).setScale(0.1).setTintFill(0xffffff);
        this.tweens.add({ targets: pet, scale: 1.5, duration: 260, ease: 'Back.out', onComplete: () => pet.clearTint() });
      } });
    });
  }

  private showEmote(accountId: string, kind: EmoteKind): void {
    const bubble = accountId === this.account?.id ? this.myBubble : this.remotes.get(accountId)?.bubble;
    if (!bubble) return;
    bubble.setText(EMOTE_LABEL[kind]).setVisible(true).setAlpha(1);
    const r = this.remotes.get(accountId);
    if (r && kind === 'sit') r.trainer.setScale(2, 1.6); else if (r) r.trainer.setScale(2);
    this.tweens.killTweensOf(bubble);
    this.tweens.add({ targets: bubble, alpha: 0, delay: 2600, duration: 400, onComplete: () => { bubble.setVisible(false); if (r) r.trainer.setScale(2); } });
  }

  private alphaDistance(): number {
    const a = this.alpha;
    return a && a.status === 'active' && this.player ? Math.hypot(a.x - this.player.x, a.y - this.player.y) : Infinity;
  }

  /** One attack request (the server rolls the damage); a short local wind-up so the press feels immediate. */
  private attackAlpha(): void {
    if (!this.client.ready || this.time.now < this.nextAttackAt) return;
    this.nextAttackAt = this.time.now + ATTACK_COOLDOWN;
    this.client.send({ t: 'alpha.attack', actionId: actionId() });
    const art = this.alphaArt, pet = this.companion;
    if (!art || !pet?.visible || this.alphaDistance() > ALPHA_RANGE) return;
    const species = this.save?.collection.find((p) => p.uid === this.save?.adventure?.activeUid)?.species;
    const color = TYPE_COLOR[POKEMON.get(species ?? '')?.types[0] ?? 'normal'] ?? 0xffffff;
    this.animate(pet, pet.getData('k'), false, art.box.x < pet.x ? -1 : 1);
    if (this.anims.exists(`${pet.getData('k')}:attack`)) pet.play(`${pet.getData('k')}:attack`);
    const orb = this.add.circle(pet.x, pet.y - 6, 9, color, 1).setStrokeStyle(2, 0xffffff, 0.8).setDepth(20000).setBlendMode(Phaser.BlendModes.ADD);
    const trail = this.add.particles?.(0, 0, 'shadow', { follow: orb, scale: { start: 0.9, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: color, lifespan: 220, frequency: 18, blendMode: 'ADD' });
    trail?.setDepth(19999);
    audio.play('whip');
    this.tweens.add({ targets: orb, x: art.box.x, y: art.box.y - 20, duration: 240, ease: 'Quad.in', onComplete: () => {
      const burst = this.add.circle(orb.x, orb.y, 12, color, 0.8).setDepth(20000).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: burst, scale: 3, alpha: 0, duration: 260, onComplete: () => burst.destroy() });
      orb.destroy(); trail?.stop(); this.time.delayedCall(260, () => trail?.destroy());
    } });
  }

  private hitFx(damage: number): void {
    const art = this.alphaArt;
    if (!art) return;
    art.sprite.setTintFill(0xffffff);
    this.time.delayedCall(90, () => art.sprite.active && art.sprite.clearTint());
    this.tweens.add({ targets: art.sprite, x: { from: -6, to: 0 }, duration: 160, ease: 'Bounce.out' });
    const t = text(this, art.box.x + Phaser.Math.Between(-24, 24), art.box.y - 60, `-${damage}`, damage >= 100 ? 30 : 24, damage >= 100 ? '#ffd040' : '#ff8060').setOrigin(0.5).setDepth(20000);
    this.tweens.add({ targets: t, y: t.y - 46, alpha: 0, scale: 1.2, duration: 800, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  private defeatFx(): void {
    if (!this.alpha || this.alpha.status === 'active') return;
    const x = this.alpha.x, y = this.alpha.y;
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(x, y - 10, 20, 0xffe070, 0.6).setDepth(20000).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: ring, scale: 6, alpha: 0, delay: i * 140, duration: 700, onComplete: () => ring.destroy() });
    }
    audio.play('levelup');
  }

  private levelFx(): void {
    if (!this.companion) return;
    const c = this.companion;
    const ring = this.add.circle(c.x, c.y, 14, 0xffe070, 0.6).setDepth(20000).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    const t = text(this, c.x, c.y - 40, 'LEVEL UP!', 20, '#ffe070').setOrigin(0.5).setDepth(20000);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
    audio.play('levelup');
  }

  /** HUD card + detail text; the in-world Alpha (aura, animated sprite, HP bar) is kept and updated in place. */
  private drawAlpha(): void {
    const a = this.alpha;
    const live = !!a && a.status === 'active';
    const species = a ? POKEMON.get(a.species)?.name ?? a.species : '';
    this.el('[data-alpha]').textContent = live ? `ALPHA ${species} Lv${a!.level}\n${a!.hp}/${a!.maxHp} HP · ${a!.participantCount ?? a!.participants.length} người` : 'Alpha đang hồi sinh…';
    this.el<HTMLElement>('[data-alpha-hp]').style.width = live ? `${Math.max(0, a!.hp / Math.max(1, a!.maxHp) * 100)}%` : '0%';
    this.el('[data-alpha-card]').classList.toggle('down', !live);
    const top = a?.participants.slice(0, 3).map((p, i) => `${i + 1}. ${p.displayName} — ${p.damage}`).join('\n');
    this.el('[data-alpha-detail]').textContent = a ? `${species} · Lv${a.level} · HP ${a.hp}/${a.maxHp}\nVị trí: ${Math.round(a.x)}, ${Math.round(a.y)} · ${a.participantCount ?? a.participants.length} người đang đánh${top ? `\nSát thương cao nhất:\n${top}` : ''}` : 'Alpha đang hồi sinh…';
    if (!live) { this.alphaArt?.box.destroy(); this.alphaArt = undefined; return; }
    if (this.alphaArt && this.alphaArt.species !== a!.species) { this.alphaArt.box.destroy(); this.alphaArt = undefined; }
    if (!this.alphaArt) {
      const shadow = this.add.image(0, 26, 'shadow').setScale(5, 3.4).setAlpha(0.6);
      const aura = this.add.ellipse(0, 18, 120, 44, 0xe07732, 0.28).setStrokeStyle(3, 0xffcc33, 0.9);
      const sprite = this.add.sprite(0, -10, this.sheetOf(a!.species), 0).setScale(3);
      if (this.anims.exists(`${a!.species}:idle`)) sprite.play(`${a!.species}:idle`);
      const hp = this.add.graphics();
      const label = this.plate(0, -92, '', '#ffe080');
      const box = this.add.container(a!.x, a!.y, [shadow, aura, sprite, hp, label]).setDepth(a!.y + 20);
      this.tweens.add({ targets: aura, scaleX: 1.15, scaleY: 1.15, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.alphaArt = { box, aura, sprite, hp, label, species: a!.species };
    }
    const art = this.alphaArt;
    art.box.setPosition(a!.x, a!.y).setDepth(a!.y + 20);
    art.label.setText(`ALPHA · ${species} Lv${a!.level}`);
    const f = Phaser.Math.Clamp(a!.hp / Math.max(1, a!.maxHp), 0, 1), w = 110;
    art.hp.clear().fillStyle(0x000000, 0.75).fillRect(-w / 2 - 2, -84, w + 4, 12)
      .fillStyle(f > 0.5 ? 0x50e060 : f > 0.25 ? 0xf0d030 : 0xf04040, 1).fillRect(-w / 2, -82, w * f, 8);
  }

  private chat(id: number, line: string): void {
    if (this.chatIds.has(id)) return;
    this.chatIds.add(id); this.chatLines.push(line);
    if (this.chatLines.length > 80) this.chatLines.shift();
    const log = this.el('[data-chat]'); log.textContent = this.chatLines.join('\n'); log.scrollTop = log.scrollHeight;
    this.updateChatMini();
  }

  /** last chat lines over the map while the Chat tab is not on screen (tap to open it) */
  private updateChatMini(): void {
    const mini = this.el('[data-chat-mini]');
    mini.hidden = !this.chatLines.length || (this.drawerOpen && this.tab === 'chat');
    mini.textContent = this.chatLines.slice(-3).join('\n');
  }

  /** Region thumbnail (tile colours, drawn once) + live dots: you, others, party, Alpha, PC, portals. */
  private drawMinimap(): void {
    const map = this.map, canvas = this.el<HTMLCanvasElement>('[data-minimap]');
    if (!map || !this.player || !canvas.offsetWidth) return;
    if (!this.miniBase) {
      const base = document.createElement('canvas');
      base.width = map.widthTiles; base.height = map.heightTiles;
      const ctx = base.getContext('2d')!, img = ctx.createImageData(map.widthTiles, map.heightTiles);
      for (let y = 0; y < map.heightTiles; y++) for (let x = 0; x < map.widthTiles; x++) {
        const c = map.colorAt(x, y), i = (y * map.widthTiles + x) * 4;
        img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      this.miniBase = base;
    }
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(canvas.offsetWidth * dpr), H = Math.round(W * map.heightTiles / map.widthTiles);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; canvas.style.height = `${H / dpr}px`; }
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBase, 0, 0, W, H);
    const kx = W / (map.widthTiles * TILE_PX), ky = H / (map.heightTiles * TILE_PX);
    const dot = (x: number, y: number, r: number, fill: string) => { ctx.fillStyle = fill; ctx.fillRect(x * kx - r, y * ky - r, r * 2, r * 2); };
    for (const t of map.pcTerminalTiles()) dot(t.x * TILE_PX, t.y * TILE_PX, 2 * dpr, '#4ad8ff');
    for (const p of map.portals()) dot((p.x + 0.5) * TILE_PX, (p.y + 0.5) * TILE_PX, 2.5 * dpr, '#c080ff');
    const myParty = this.party?.id;
    for (const r of this.remotes.values()) dot(r.view.x, r.view.y, 1.6 * dpr, myParty && r.data.partyId === myParty ? '#8fe3a3' : '#ffffff');
    const a = this.alpha;
    if (a && a.status === 'active') {
      ctx.strokeStyle = '#ff5040'; ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.arc(a.x * kx, a.y * ky, (3 + (Math.sin(this.time.now / 200) + 1) * 1.5) * dpr, 0, Math.PI * 2); ctx.stroke();
      dot(a.x, a.y, 2.2 * dpr, '#ff5040');
    }
    ctx.strokeStyle = '#1a1200'; ctx.lineWidth = dpr;
    dot(this.player.x, this.player.y, 3 * dpr, '#ffe060');
    ctx.strokeRect(this.player.x * kx - 3 * dpr, this.player.y * ky - 3 * dpr, 6 * dpr, 6 * dpr);
  }

  update(time: number, delta: number): void {
    if (!this.player || !this.map) return;
    // remote trainers glide toward the latest server position (interpolation, no 10 Hz stutter)
    const k = 1 - Math.pow(0.001, Math.min(delta, 100) / 1000 * 1.6);
    const kPet = 1 - Math.pow(0.001, Math.min(delta, 100) / 1000 * 2.4);
    for (const r of this.remotes.values()) {
      const dx = r.tx - r.view.x, dy = r.ty - r.view.y;
      r.view.setPosition(r.view.x + dx * k, r.view.y + dy * k);
      r.view.setDepth(r.view.y + 16);
      if (Math.abs(dx) > 1) r.face = Math.sign(dx);
      const moving = r.data.moving || Math.hypot(dx, dy) > 3;
      this.animate(r.trainer, r.trainer.getData('k'), moving, r.face);
      // the pet trots behind its trainer, on the side it is walking away from
      r.pet.x += (-r.face * 30 - r.pet.x) * kPet; r.pet.y += (8 - r.pet.y) * kPet;
      this.animate(r.pet, r.pet.getData('k'), moving, r.face);
    }
    if (time - this.uiAt > 1000) { this.uiAt = time; this.renderEvent(); }
    if (time - this.miniAt > 200) { this.miniAt = time; this.drawMinimap(); }
    if (!this.client.ready) return;
    const typing = this.typing() || !!this.pc?.open;
    if (time - this.nearAt > 200) { this.nearAt = time; this.updateNearby(); }
    let dx = 0, dy = 0;
    if (!typing) {
      dx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
      dy = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    }
    if (dx || dy) this.target = undefined;
    else if (this.target && !typing) {
      dx = this.target.x - this.player.x; dy = this.target.y - this.player.y;
      if (Math.hypot(dx, dy) < 6) { dx = dy = 0; this.target = undefined; }
    }
    const distance = Math.hypot(dx, dy);
    if (distance) {
      const step = Math.min(240 * Math.min(delta, 50) / 1000, this.target ? distance : Infinity);
      const x = this.player.x + dx / distance * step, y = this.player.y + dy / distance * step;
      const clear = (x: number, y: number) => x >= 0 && y >= 0 && x < this.map!.widthTiles * TILE_PX && y < this.map!.heightTiles * TILE_PX && !this.map!.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX));
      if (clear(x, this.player.y)) this.player.x = x;
      if (clear(this.player.x, y)) this.player.y = y;
      if (Math.abs(dx) > 0.5) this.face = Math.sign(dx);
    }
    if (time - this.sentAt > 100) {
      this.sentAt = time;
      this.client.send({ t: 'move', x: this.player.x, y: this.player.y, facing: Math.atan2(dy, dx), moving: !!distance });
    }
    this.animate(this.player, this.player.getData('k'), !!distance, this.face);
    this.playerShadow?.setPosition(this.player.x, this.player.y + 18).setDepth(this.player.y + 10);
    this.myName?.setPosition(this.player.x, this.player.y - 30);
    const c = this.companion;
    if (c && time >= this.companionFxUntil) {
      const px = this.player.x - this.face * 30, py = this.player.y + 8;
      const gap = Math.hypot(px - c.x, py - c.y);
      c.setPosition(c.x + (px - c.x) * kPet, c.y + (py - c.y) * kPet);
      if (!c.anims.isPlaying || !c.anims.currentAnim?.key.endsWith(':attack')) this.animate(c, c.getData('k'), gap > 3, this.face);
    }
    this.companionShadow?.setPosition(c?.x ?? 0, (c?.y ?? 0) + 14).setDepth(this.player.y + 9).setVisible(!!c?.visible);
    this.myBubble?.setPosition(this.player.x, this.player.y - 60);
    this.player.setDepth(this.player.y + 16);
    c?.setDepth(this.player.y + 24);
    const a = this.alpha;
    const far = this.alphaDistance();
    // range ring around the Alpha when it is nearby; green once you can hit it
    this.rangeRing?.clear();
    if (a && a.status === 'active' && far < ALPHA_RANGE * 2.2) {
      const inside = far <= ALPHA_RANGE;
      this.rangeRing?.lineStyle(3, inside ? 0x60e080 : 0xffffff, inside ? 0.5 : 0.22).strokeCircle(a.x, a.y, ALPHA_RANGE)
        .fillStyle(inside ? 0x60e080 : 0xffffff, 0.05).fillCircle(a.x, a.y, ALPHA_RANGE);
    }
    const attack = this.el('[data-attack]');
    attack.classList.toggle('far', far > ALPHA_RANGE);
    attack.style.setProperty('--cd', String(Math.max(0, (this.nextAttackAt - time) / ATTACK_COOLDOWN)));
    if (this.autoAttack && !typing && far <= ALPHA_RANGE && this.lastActive) this.attackAlpha();
    if (this.trackArrow) {
      const show = this.tracking && !!a && far > ALPHA_RANGE && far < Infinity;
      this.trackArrow.setVisible(show);
      if (show) {
        const ang = Math.atan2(a!.y - this.player.y, a!.x - this.player.x);
        this.trackArrow.setPosition(this.player.x + Math.cos(ang) * 70, this.player.y + Math.sin(ang) * 70).setRotation(ang + Math.PI / 2);
      }
    }
    this.chunks?.update(this.cameras.main.worldView);
  }
}
