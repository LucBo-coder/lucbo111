import Phaser from 'phaser';
import type { AdventureScene } from '../scenes/AdventureScene';
import { worldSession } from '../net/worldSession';
import { actionId } from '../net/serverClient';
import type { EmoteKind, ServerChatMessage, ServerMsg, ServerPlayerView } from '../net/serverProtocol';
import { avatarTextureKey } from '../core/avatars';
import { POKEMON } from '../core/data';
import { creatureFootAnchor, sheetKey } from '../render/animation';
import { shinyKey } from '../render/lazyCreatures';
import { fitScale } from '../render/spriteRegistry';
import '../scenes/onlineTheme.css';
import './worldOnline.css';

// Thế giới online inside the Vietnam Odyssey campaign: the trainers of other players on the same map (and their
// lead Pokémon), local / party chat and whispers, friends, party, emotes and account settings. The campaign itself
// (quests, battles, catching, provinces) is the offline one; the account's save lives on the server (worldSession).

const SEND_EVERY = 100; // ms (the server relays presence at 10 Hz)
const NEAR = 90; // px: E talks to a player this close
const BUBBLE_MS = 4000;
const EMOTE_LABEL: Record<EmoteKind, string> = { wave: '👋 Chào!', cheer: '🎉 Hoan hô!', sit: '💤 Ngồi nghỉ', point: '👉 Bên này!' };
type Tab = 'chat' | 'friends' | 'party' | 'more';

interface Remote {
  data: ServerPlayerView;
  body: Phaser.GameObjects.Sprite;
  sheet: string;
  pet: Phaser.GameObjects.Sprite | null;
  petKey: string;
  tag: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
  bubbleUntil: number;
  /** interpolation: from (fx, fy) at `at` towards (tx, ty) */
  fx: number; fy: number; tx: number; ty: number; at: number;
  x: number; y: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class WorldOnline {
  private root: HTMLDivElement;
  private remotes = new Map<string, Remote>();
  private offs: (() => void)[] = [];
  private lastSent = 0;
  private lastKey = '';
  private tab: Tab = 'chat';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private typing = false;
  private myBubble: Phaser.GameObjects.Text | null = null;
  private myBubbleUntil = 0;

  constructor(private scene: AdventureScene) {
    this.root = document.createElement('div');
    this.root.className = 'wo-root ol-root';
    this.root.innerHTML = `
      <button class="ol-btn ol-btn-teal wo-pill" data-pill aria-controls="wo-drawer" title="Thế giới online (Enter: chat)">🌐 Online</button>
      <p class="wo-toast faded" data-toast role="status"></p>
      <div class="wo-mini" data-mini hidden title="Mở chat"></div>
      <div class="wo-card ol-panel" data-card hidden></div>
      <aside class="wo-drawer ol-panel" id="wo-drawer" data-drawer hidden aria-label="Thế giới online">
        <nav class="wo-tabs" role="tablist">
          <button class="ol-btn" role="tab" data-tab="chat">Chat</button><button class="ol-btn" role="tab" data-tab="friends">Bạn bè</button>
          <button class="ol-btn" role="tab" data-tab="party">Nhóm</button><button class="ol-btn" role="tab" data-tab="more">Khác</button>
          <button class="ol-btn ol-btn-back" data-close aria-label="Đóng">✕</button>
        </nav>
        <section class="wo-panel" role="tabpanel" data-panel="chat">
          <div class="wo-log" data-log role="log" aria-live="polite"></div>
          <form class="wo-row" data-chat-form>
            <select name="channel" aria-label="Kênh chat"><option value="local">Khu vực</option><option value="party">Nhóm</option></select>
            <input name="body" aria-label="Tin nhắn" placeholder="Nói gì đó… (/w tên nội dung)" maxlength="240" autocomplete="off">
            <button class="ol-btn ol-btn-green">Gửi</button>
          </form>
        </section>
        <section class="wo-panel" role="tabpanel" data-panel="friends" hidden>
          <form class="wo-row" data-friend-form><input name="friend" aria-label="Tên đăng nhập" placeholder="Tên đăng nhập" maxlength="20" autocomplete="off"><button class="ol-btn ol-btn-blue">Kết bạn</button></form>
          <div data-friends></div>
        </section>
        <section class="wo-panel" role="tabpanel" data-panel="party" hidden>
          <div data-invite class="wo-entry" hidden></div>
          <form class="wo-row" data-party-form><input name="member" aria-label="Mời theo tên đăng nhập" placeholder="Tên đăng nhập" maxlength="20" autocomplete="off"><button class="ol-btn ol-btn-blue">Mời vào nhóm</button></form>
          <div class="wo-row"><button class="ol-btn" data-party-op="create">Tạo nhóm</button><button class="ol-btn" data-party-op="leave">Rời nhóm</button></div>
          <div data-party></div>
        </section>
        <section class="wo-panel" role="tabpanel" data-panel="more" hidden>
          <h2>Biểu cảm</h2>
          <div class="wo-row"><button class="ol-btn" data-emote="wave">👋 Vẫy</button><button class="ol-btn" data-emote="cheer">🎉 Cổ vũ</button><button class="ol-btn" data-emote="sit">💤 Ngồi</button><button class="ol-btn" data-emote="point">👉 Chỉ</button></div>
          <h2>Tài khoản</h2>
          <p data-account></p>
          <input data-acc-old type="password" aria-label="Mật khẩu hiện tại" placeholder="Mật khẩu hiện tại" autocomplete="current-password" maxlength="128">
          <input data-acc-new type="password" aria-label="Mật khẩu mới" placeholder="Mật khẩu mới" autocomplete="new-password" maxlength="128">
          <div class="wo-row"><button class="ol-btn" data-acc="changePassword">Đổi mật khẩu</button><button class="ol-btn" data-acc="recoveryCode">Mã khôi phục mới</button><button class="ol-btn" data-acc="logoutAll">Đăng xuất mọi thiết bị</button></div>
          <button class="ol-btn ol-btn-red" data-signout>Đăng xuất và về menu</button>
          <p class="wo-help">Tiến trình Việt Nam Odyssey của tài khoản được lưu trên máy chủ (tự động, và ngay khi đóng trang). Người chơi cùng bản đồ thấy nhau; đến gần và nhấn E (hoặc chạm vào họ) để kết bạn, mời nhóm, nhắn riêng. Enter: mở chat.</p>
        </section>
      </aside>`;
    document.body.append(this.root);
    this.wire();
    this.offs.push(worldSession.on((m) => this.receive(m)), worldSession.onStatus((s) => this.onStatus(s)));
    const kb = scene.input.keyboard!;
    const enter = () => { if (!this.typing && !scene.modal) { this.open('chat'); this.el<HTMLInputElement>('[name=body]').focus(); } };
    kb.on('keydown-ENTER', enter);
    this.offs.push(() => kb.off('keydown-ENTER', enter));
    const tap = (p: Phaser.Input.Pointer) => {
      const w = scene.cameras.main.getWorldPoint(p.x, p.y);
      const hit = [...this.remotes.values()].find((r) => Math.hypot(r.x - w.x, r.y - 30 - w.y) < 40);
      if (hit) this.openCard(hit.data.accountId);
    };
    scene.input.on('pointerdown', tap);
    this.offs.push(() => scene.input.off('pointerdown', tap));
    this.where();
    this.renderAll();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.setTyping(false);
    clearTimeout(this.toastTimer);
    for (const r of this.remotes.values()) this.drop(r);
    this.remotes.clear();
    this.myBubble?.destroy();
    this.root.remove();
  }

  /** Map id the campaign is on: a province, or a dungeon (others in the same dungeon see you). */
  get place(): string {
    const a = this.scene;
    return a.mapKind === 'valley' ? a.regionDef.id : `hang-${a.dungeonId}`;
  }

  private where(): void {
    const t = this.scene.world.trainer;
    worldSession.send({ t: 'adv.where', region: this.place, x: Math.round(t.x), y: Math.round(t.y) });
  }

  // ───────────────────────────── frame ─────────────────────────────

  update(now: number): void {
    const a = this.scene, t = a.world.trainer;
    if (now - this.lastSent >= SEND_EVERY) {
      const moving = Math.hypot(t.vx, t.vy) > 5;
      const key = `${Math.round(t.x)},${Math.round(t.y)},${t.facing},${moving}`;
      // idle players send nothing new except a heartbeat each second
      if (key !== this.lastKey || now - this.lastSent >= 1000) {
        worldSession.send({ t: 'move', x: Math.round(t.x), y: Math.round(t.y), facing: t.facing, moving });
        this.lastKey = key;
        this.lastSent = now;
      }
    }
    let near: Remote | null = null;
    for (const r of this.remotes.values()) {
      this.draw(r, now);
      const d = Math.hypot(r.x - t.x, r.y - t.y);
      if (d < NEAR && (!near || d < Math.hypot(near.x - t.x, near.y - t.y))) near = r;
    }
    if (near) {
      a.interactables.set('online-player', { kind: 'online', id: near.data.accountId, x: near.x, y: near.y, label: near.data.displayName, obj: { kind: 'npc', id: 'online-player', x: 0, y: 0 }, sprite: null as never });
    } else a.interactables.delete('online-player');
    if (this.myBubble) {
      if (now > this.myBubbleUntil) { this.myBubble.destroy(); this.myBubble = null; }
      else this.myBubble.setPosition(t.x, t.y - 96).setDepth(9200);
    }
  }

  private draw(r: Remote, now: number): void {
    const sc = this.scene, d = r.data;
    const k = Math.min(1, Math.max(0, (now - r.at) / SEND_EVERY));
    r.x = r.fx + (r.tx - r.fx) * k;
    r.y = r.fy + (r.ty - r.fy) * k;
    const avatar = avatarTextureKey(d.avatar);
    const sheet = sc.textures.exists(sheetKey(avatar)) ? sheetKey(avatar) : 'trainer_sheet';
    const bodyKey = sheet === sheetKey(avatar) ? avatar : 'trainer';
    if (r.sheet !== sheet) { r.body.setTexture(sheet, 0).setOrigin(0.5, creatureFootAnchor(bodyKey).y); r.sheet = sheet; }
    r.body.setPosition(r.x, r.y).setFlipX(d.facing < 0).setDepth(r.y);
    const anim = `${bodyKey}:${d.moving ? 'walk' : 'idle'}`;
    if (sc.anims.exists(anim)) { if (r.body.anims.currentAnim?.key !== anim) r.body.play(anim); } else r.body.stop();
    r.tag.setPosition(r.x, r.y - 46).setDepth(9100);
    const party = worldSession.party?.members.some((m) => m.accountId === d.accountId);
    r.tag.setColor(party ? '#80ffb0' : '#ffe080');
    if (now < r.bubbleUntil) r.bubble.setVisible(true).setPosition(r.x, r.y - 72).setDepth(9200);
    else r.bubble.setVisible(false);
    // lead Pokémon walking beside the trainer
    const key = d.species && POKEMON.has(d.species) ? (d.shiny ? shinyKey(d.species) : d.species) : null;
    if (key && sc.textures.exists(key)) {
      const pSheet = sc.textures.exists(sheetKey(key)) ? sheetKey(key) : '';
      if (!r.pet || r.petKey !== key) {
        r.pet?.destroy();
        r.pet = sc.add.sprite(0, 0, pSheet || key).setOrigin(0.5, creatureFootAnchor(key).y);
        r.petKey = key;
      }
      const petAnim = `${key}:${d.moving ? 'walk' : 'idle'}`;
      if (pSheet && sc.anims.exists(petAnim)) { if (r.pet.anims.currentAnim?.key !== petAnim) r.pet.play(petAnim); } else r.pet.stop();
      const face = d.facing < 0 ? -1 : 1;
      r.pet.setScale(fitScale(sc, key, 48)).setPosition(r.x - face * 40, r.y + 2 + Math.sin(now * 0.01) * (d.moving ? 2 : 0.5)).setDepth(r.y + 8);
    } else if (r.pet) { r.pet.destroy(); r.pet = null; r.petKey = ''; }
  }

  private add(p: ServerPlayerView): Remote {
    const sc = this.scene;
    const body = sc.add.sprite(p.x, p.y, 'trainer_sheet', 0).setScale(3);
    const style = { fontFamily: '"VT323", monospace', fontSize: '20px', color: '#ffe080', stroke: '#000', strokeThickness: 4 };
    const tag = sc.add.text(p.x, p.y - 46, p.displayName, style).setOrigin(0.5, 1);
    const bubble = sc.add.text(p.x, p.y - 72, '', { ...style, color: '#ffffff', backgroundColor: '#0c0e18cc', padding: { x: 6, y: 2 }, wordWrap: { width: 260 } }).setOrigin(0.5, 1).setVisible(false);
    const r: Remote = { data: p, body, sheet: '', pet: null, petKey: '', tag, bubble, bubbleUntil: 0, fx: p.x, fy: p.y, tx: p.x, ty: p.y, at: performance.now(), x: p.x, y: p.y };
    this.remotes.set(p.accountId, r);
    return r;
  }

  private drop(r: Remote): void {
    r.body.destroy(); r.pet?.destroy(); r.tag.destroy(); r.bubble.destroy();
  }

  // ───────────────────────────── server ─────────────────────────────

  private receive(m: ServerMsg): void {
    switch (m.t) {
      case 'presence': {
        if (m.region !== this.place) return;
        const ids = new Set(m.players.map((p) => p.accountId));
        for (const [id, r] of this.remotes) {
          if ((m.full && !ids.has(id)) || m.gone?.includes(id)) { this.drop(r); this.remotes.delete(id); }
        }
        const now = performance.now();
        for (const p of m.players) {
          const r = this.remotes.get(p.accountId) ?? this.add(p);
          r.fx = r.x; r.fy = r.y; r.tx = p.x; r.ty = p.y; r.at = now;
          if (r.data.displayName !== p.displayName) r.tag.setText(p.displayName);
          r.data = p;
        }
        this.updatePill();
        if (this.tab === 'party') this.renderParty();
        break;
      }
      case 'welcome':
        // resumed after a drop: the server forgot which map we are on
        this.where();
        this.toast('Đã kết nối lại máy chủ.');
        break;
      case 'chat': {
        const c = m.message;
        if (c.channel.startsWith('region:')) this.bubble(c.from, c.body);
        this.renderChat();
        break;
      }
      case 'chatHistory': case 'whisper': this.renderChat(); break;
      case 'emote': this.bubble(m.accountId, EMOTE_LABEL[m.kind]); break;
      case 'friends': this.renderFriends(); break;
      case 'party': this.renderParty(); this.renderChat(); break;
      case 'recoveryCode': this.showCode(m.code); break;
      case 'saved': if (!m.ok) this.toast(`Máy chủ không lưu được tiến trình: ${m.message ?? m.code}`); break;
      case 'error': case 'notice': case 'actionError': this.toast(m.message); break;
    }
  }

  private onStatus(s: string): void {
    this.updatePill();
    if (!worldSession.ready) {
      this.toast(`${s}\nTiến trình vẫn được giữ trên máy này và gửi lên khi có mạng lại.`);
      // keep a copy on this device in case the page is closed before the connection is back
      this.scene.persist();
    }
  }

  // ───────────────────────────── UI ─────────────────────────────

  private el<T extends HTMLElement = HTMLElement>(sel: string): T { return this.root.querySelector<T>(sel)!; }

  private wire(): void {
    this.el('[data-pill]').onclick = () => this.toggle();
    this.el('[data-close]').onclick = () => this.toggle(false);
    this.el('[data-mini]').onclick = () => this.open('chat');
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.onclick = () => this.open(b.dataset.tab as Tab));
    this.el<HTMLFormElement>('[data-chat-form]').onsubmit = (e) => {
      e.preventDefault();
      const field = this.el<HTMLInputElement>('[name=body]');
      if (this.sendChat(field.value.trim())) field.value = '';
    };
    this.el<HTMLFormElement>('[data-friend-form]').onsubmit = (e) => {
      e.preventDefault();
      const f = this.el<HTMLInputElement>('[name=friend]');
      if (f.value.trim()) { this.friendOp('request', f.value.trim()); f.value = ''; }
    };
    this.el<HTMLFormElement>('[data-party-form]').onsubmit = (e) => {
      e.preventDefault();
      const f = this.el<HTMLInputElement>('[name=member]');
      if (f.value.trim()) { this.partyOp('invite', f.value.trim()); f.value = ''; }
    };
    this.root.querySelectorAll<HTMLButtonElement>('[data-party-op]').forEach((b) => b.onclick = () => this.partyOp(b.dataset.partyOp as 'create' | 'leave'));
    this.root.querySelectorAll<HTMLButtonElement>('[data-emote]').forEach((b) => b.onclick = () => worldSession.send({ t: 'emote', kind: b.dataset.emote as EmoteKind }));
    this.root.querySelectorAll<HTMLButtonElement>('[data-acc]').forEach((b) => b.onclick = () => {
      const old = this.el<HTMLInputElement>('[data-acc-old]'), neu = this.el<HTMLInputElement>('[data-acc-new]');
      worldSession.send({ t: 'account', actionId: actionId(), op: b.dataset.acc as 'changePassword' | 'recoveryCode' | 'logoutAll', password: old.value, newPassword: neu.value });
      old.value = ''; neu.value = '';
    });
    this.el('[data-signout]').onclick = () => {
      worldSession.signOut = true;
      this.scene.exitToMenu();
    };
    // typing in a field must not walk the trainer or trigger shortcuts (W A S D, E, Space…)
    this.root.addEventListener('focusin', (e) => { if (/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) this.setTyping(true); });
    this.root.addEventListener('focusout', () => setTimeout(() => this.setTyping(this.root.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? '')), 0));
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { (document.activeElement as HTMLElement | null)?.blur(); this.scene.game.canvas.focus?.(); }
      e.stopPropagation();
    });
  }

  private setTyping(on: boolean): void {
    if (this.typing === on) return;
    this.typing = on;
    for (const s of [this.scene, this.scene.scene.get('AdvUI')]) {
      const kb = s?.input?.keyboard;
      if (!kb) continue;
      kb.enabled = !on;
      if (on) kb.resetKeys();
    }
    const kb = this.scene.input.keyboard;
    if (on) kb?.disableGlobalCapture(); else kb?.enableGlobalCapture();
  }

  private toggle(open?: boolean): void {
    const d = this.el('[data-drawer]');
    const show = open ?? d.hidden;
    d.hidden = !show;
    this.el('[data-pill]').setAttribute('aria-expanded', String(show));
    if (show) this.open(this.tab);
    this.renderMini();
  }

  private open(tab: Tab): void {
    this.tab = tab;
    this.el('[data-drawer]').hidden = false;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.root.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => p.hidden = p.dataset.panel !== tab);
    this.renderAll();
  }

  private renderAll(): void {
    this.updatePill();
    this.renderChat();
    this.renderFriends();
    this.renderParty();
    const acc = worldSession.account;
    this.el('[data-account]').textContent = acc ? `${acc.displayName} (${acc.username})` : '';
  }

  private updatePill(): void {
    const pill = this.el('[data-pill]');
    const ok = worldSession.ready;
    pill.dataset.off = ok ? '0' : '1';
    pill.textContent = ok ? `🌐 ${this.remotes.size + 1} người ở đây` : '🌐 Mất kết nối';
  }

  toast(message: string): void {
    const el = this.el('[data-toast]');
    el.textContent = message;
    el.classList.remove('faded');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('faded'), 4500);
  }

  private line(c: ServerChatMessage): string {
    const tag = c.channel === 'whisper' ? '[Riêng] ' : c.channel.startsWith('party:') ? '[Nhóm] ' : '';
    return `${tag}${c.fromName}: ${c.body}`;
  }

  private renderChat(): void {
    const log = this.el('[data-log]');
    const atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
    log.textContent = worldSession.chat.map((c) => this.line(c)).join('\n');
    if (atEnd) log.scrollTop = log.scrollHeight;
    this.renderMini();
  }

  private renderMini(): void {
    const mini = this.el('[data-mini]');
    const chatOpen = !this.el('[data-drawer]').hidden && this.tab === 'chat';
    mini.hidden = chatOpen || !worldSession.chat.length;
    mini.textContent = worldSession.chat.slice(-3).map((c) => this.line(c)).join('\n');
  }

  private sendChat(raw: string): boolean {
    if (!raw) return false;
    const whisper = /^\/w\s+(\S+)\s+(.+)$/i.exec(raw);
    if (whisper) return worldSession.send({ t: 'whisper', actionId: actionId(), target: whisper[1], body: whisper[2] });
    if (this.el<HTMLSelectElement>('[name=channel]').value === 'party') {
      if (!worldSession.party?.id) { this.toast('Bạn chưa ở trong nhóm.'); return false; }
      return worldSession.send({ t: 'chat', actionId: actionId(), channel: `party:${worldSession.party.id}`, body: raw });
    }
    return worldSession.send({ t: 'chat', actionId: actionId(), channel: `region:${this.place}`, body: raw });
  }

  private friendOp(op: 'request' | 'accept' | 'remove' | 'block' | 'unblock' | 'report', target: string, reason?: string): void {
    worldSession.send({ t: 'friend', actionId: actionId(), op, target, ...(reason ? { reason } : {}) });
  }

  private partyOp(op: 'create' | 'invite' | 'accept' | 'decline' | 'leave' | 'kick' | 'promote' | 'disband', target = ''): void {
    worldSession.send({ t: 'party', actionId: actionId(), op, target });
  }

  private whisperTo(username: string): void {
    this.open('chat');
    const i = this.el<HTMLInputElement>('[name=body]');
    i.value = `/w ${username} `;
    i.focus();
  }

  private entry(box: HTMLElement, text: string, buttons: [string, () => void][]): void {
    const row = document.createElement('div');
    row.className = 'wo-entry';
    const p = document.createElement('p');
    p.textContent = text;
    const actions = document.createElement('div');
    actions.className = 'wo-row';
    for (const [label, run] of buttons) {
      const b = document.createElement('button');
      b.className = 'ol-btn';
      b.textContent = label;
      b.onclick = run;
      actions.append(b);
    }
    row.append(p, actions);
    box.append(row);
  }

  private renderFriends(): void {
    const box = this.el('[data-friends]');
    box.replaceChildren();
    const { friends, requests } = worldSession;
    if (!friends.length && !requests.length) { box.innerHTML = '<p class="wo-help">Chưa có bạn bè. Gõ tên đăng nhập ở trên, hoặc chạm vào người chơi gần bạn.</p>'; return; }
    for (const f of requests) {
      this.entry(box, `${f.displayName} · ${f.incoming ? 'muốn kết bạn' : 'đã gửi lời mời'}`, f.incoming
        ? [['Chấp nhận', () => this.friendOp('accept', f.username)], ['Chặn', () => this.friendOp('block', f.username)]]
        : []);
    }
    for (const f of friends) {
      if (f.status === 'blocked') { this.entry(box, `${f.displayName} · đã chặn`, [['Bỏ chặn', () => this.friendOp('unblock', f.username)]]); continue; }
      this.entry(box, `${f.displayName} · ${f.online ? 'đang online' : 'offline'}`, [
        ['Nhắn riêng', () => this.whisperTo(f.username)],
        ['Mời nhóm', () => this.partyOp('invite', f.username)],
        ['Xóa bạn', () => this.friendOp('remove', f.username)],
      ]);
    }
  }

  private renderParty(): void {
    const inv = this.el('[data-invite]');
    const invite = worldSession.invite;
    inv.hidden = !invite;
    inv.replaceChildren();
    if (invite) this.entry(inv, `${invite.fromName} mời bạn vào nhóm.`, [['Đồng ý', () => this.partyOp('accept')], ['Từ chối', () => this.partyOp('decline')]]);
    const box = this.el('[data-party]');
    box.replaceChildren();
    const party = worldSession.party, me = worldSession.account?.id;
    if (!party) { box.innerHTML = '<p class="wo-help">Chưa có nhóm. Tạo nhóm rồi mời bạn bè (tối đa 4 người) để chat nhóm và thấy nhau ở đâu.</p>'; return; }
    const lead = party.leaderId === me;
    for (const m of party.members) {
      const where = !m.online ? 'offline' : m.accountId === me ? 'bạn' : m.region === this.place ? 'cùng bản đồ' : (m.region ?? '?');
      this.entry(box, `${m.accountId === party.leaderId ? '★ ' : ''}${m.displayName} · Lv${m.level} · ${where}`,
        lead && m.accountId !== me ? [['Trao trưởng nhóm', () => this.partyOp('promote', m.username)], ['Mời ra', () => this.partyOp('kick', m.username)]] : []);
    }
    if (lead) this.entry(box, '', [['Giải tán nhóm', () => this.partyOp('disband')]]);
  }

  /** Card of another player (E next to them, or a tap on them). */
  openCard(accountId: string): void {
    const r = this.remotes.get(accountId);
    if (!r) return;
    const p = r.data;
    const card = this.el('[data-card]');
    card.hidden = false;
    card.replaceChildren();
    const pet = p.species ? ` · ${POKEMON.get(p.species)?.name ?? p.species}` : '';
    this.entry(card, `${p.displayName} · Lv${p.level}${pet}`, [
      ['Kết bạn', () => this.friendOp('request', p.username)],
      ['Mời nhóm', () => this.partyOp('invite', p.username)],
      ['Nhắn riêng', () => this.whisperTo(p.username)],
      ['Chặn', () => this.friendOp('block', p.username)],
      ['Báo cáo', () => this.friendOp('report', p.username, 'Báo cáo từ thẻ người chơi')],
      ['Đóng', () => {}],
    ]);
    card.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { card.hidden = true; }));
  }

  private showCode(code: string): void {
    const card = this.el('[data-card]');
    card.hidden = false;
    card.innerHTML = `<p>MÃ KHÔI PHỤC TÀI KHOẢN</p><p class="wo-code" data-recovery-code="${esc(code)}">${esc(code)}</p><p class="wo-help">Ghi lại và cất giữ mã này: đây là cách duy nhất lấy lại tài khoản nếu quên mật khẩu. Mã không hiện lại.</p>`;
    const ok = document.createElement('button');
    ok.className = 'ol-btn ol-btn-green';
    ok.textContent = 'Tôi đã lưu mã';
    ok.onclick = () => { card.hidden = true; };
    card.append(ok);
  }

  /** Speech bubble over a player (chat / emote); `accountId` may be this player. */
  private bubble(accountId: string, body: string): void {
    const now = performance.now();
    const text = body.length > 60 ? body.slice(0, 57) + '…' : body;
    if (accountId === worldSession.account?.id) {
      const t = this.scene.world.trainer;
      this.myBubble ??= this.scene.add.text(t.x, t.y - 96, '', { fontFamily: '"VT323", monospace', fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 4, backgroundColor: '#0c0e18cc', padding: { x: 6, y: 2 }, wordWrap: { width: 260 } }).setOrigin(0.5, 1);
      this.myBubble.setText(text);
      this.myBubbleUntil = now + BUBBLE_MS;
      return;
    }
    const r = this.remotes.get(accountId);
    if (!r) return;
    r.bubble.setText(text);
    r.bubbleUntil = now + BUBBLE_MS;
  }
}
