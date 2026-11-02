import type { AdventureScene } from '../scenes/AdventureScene';
import { party, PARTY_MAX, type PartyMsg } from '../net/party';
import { TradeSession } from '../net/tradeSession';
import { itemBlock, monBlock, type TradeOffer } from '../core/trade';
import type { OwnedPokemon } from '../core/progression';
import { POKEMON } from '../core/data';
import { regionDef } from '../core/map/regionDefs';
import { ITEMS } from './AdventureState';
import { saveStore } from '../systems/save';
import '../scenes/onlineTheme.css';
import './worldOnline.css';
import './partyPanel.css';

// "Chơi chung" panel (Phiêu lưu / Việt Nam Odyssey): create or join a room of up to 4 players, see where everyone
// is, chat, and trade items / Pokémon. Same-map play itself is SharedWorld; the room is the PartySession.

type Tab = 'room' | 'chat' | 'trade';
const CAMPAIGN: Record<string, string> = { classic: 'Phiêu lưu', vietnam: 'Việt Nam Odyssey' };
const CHAT_KEEP = 60;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const kindOf = (id: string): string | undefined => ITEMS[id]?.kind;
const monLabel = (p: OwnedPokemon) => `${p.nickname || POKEMON.get(p.species)?.name || p.species} Lv${p.level}${p.shiny ? ' ✦' : ''}`;

/** chat lines survive map changes (the panel is rebuilt with each map) */
const chatLog: string[] = [];

export class PartyPanel {
  private root: HTMLDivElement;
  private offs: (() => void)[] = [];
  private tab: Tab = 'room';
  private typing = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private trade: TradeSession | null = null;
  private busy = false;
  /** the item stack being picked (kept when the other side's offer redraws the panel) */
  private pick = { item: '', qty: '1' };
  /** trade + state + my offer version the trade tab was last fully drawn for */
  private tradeKey = '';

  constructor(private scene: AdventureScene) {
    this.root = document.createElement('div');
    this.root.className = 'wo-root ol-root pp-root';
    this.root.innerHTML = `
      <button class="ol-btn ol-btn-teal wo-pill pp-pill" data-pill aria-controls="pp-drawer" title="Chơi chung (tối đa ${PARTY_MAX} người)">👥 Chơi chung</button>
      <p class="wo-toast faded" data-toast role="status"></p>
      <div class="wo-mini" data-mini hidden title="Mở chat"></div>
      <aside class="wo-drawer ol-panel" id="pp-drawer" data-drawer hidden aria-label="Chơi chung">
        <nav class="wo-tabs" role="tablist">
          <button class="ol-btn" role="tab" data-tab="room">Phòng</button><button class="ol-btn" role="tab" data-tab="chat">Chat</button>
          <button class="ol-btn" role="tab" data-tab="trade">Trao đổi</button>
          <button class="ol-btn ol-btn-back" data-close aria-label="Đóng">✕</button>
        </nav>
        <section class="wo-panel" role="tabpanel" data-panel="room"></section>
        <section class="wo-panel" role="tabpanel" data-panel="chat" hidden>
          <div class="wo-log" data-log role="log" aria-live="polite"></div>
          <form class="wo-row" data-chat-form>
            <input name="body" aria-label="Tin nhắn" placeholder="Nhắn cho cả phòng…" maxlength="200" autocomplete="off">
            <button class="ol-btn ol-btn-green">Gửi</button>
          </form>
        </section>
        <section class="wo-panel" role="tabpanel" data-panel="trade" hidden></section>
      </aside>`;
    document.body.append(this.root);
    this.wire();
    this.offs.push(party.on((m, from) => this.receive(m, from)), party.onChange(() => this.onChange()));
    const kb = scene.input.keyboard!;
    const enter = () => { if (party.active && !this.typing && !scene.modal) { this.toggle(true); this.open('chat'); this.el<HTMLInputElement>('[name=body]').focus(); } };
    kb.on('keydown-ENTER', enter);
    this.offs.push(() => kb.off('keydown-ENTER', enter));
    this.onChange();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.setTyping(false);
    clearTimeout(this.toastTimer);
    // a trade still waiting for the other side is called off (a committed one finishes on its own messages)
    if (this.trade?.busy && this.trade.state !== 'committed') this.trade.cancel();
    this.root.remove();
  }

  /** Per frame: the button and drawer step aside while a full-screen game menu is open. */
  update(): void {
    const hide = !!this.scene.ui?.menuOpen;
    if (this.root.classList.contains('pp-under') !== hide) this.root.classList.toggle('pp-under', hide);
  }

  /** Opens the drawer (the Adventure menu's "Chơi chung" button). */
  show(): void { this.toggle(true); this.open(party.active ? this.tab : 'room'); }

  private el<T extends HTMLElement = HTMLElement>(sel: string): T { return this.root.querySelector(sel) as T; }

  private wire(): void {
    this.el('[data-pill]').onclick = () => this.toggle();
    this.el('[data-close]').onclick = () => this.toggle(false);
    this.el('[data-mini]').onclick = () => { this.toggle(true); this.open('chat'); };
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.onclick = () => this.open(b.dataset.tab as Tab);
    this.el<HTMLFormElement>('[data-chat-form]').onsubmit = (e) => {
      e.preventDefault();
      const input = this.el<HTMLInputElement>('[name=body]');
      const body = input.value.trim().slice(0, 200);
      if (!body || !party.active) return;
      party.send({ t: 'chat', body });
      this.addChat(`${party.profile.name}: ${body}`, true);
      input.value = '';
    };
    // typing in a field must not walk the trainer or trigger shortcuts (W A S D, E, Space…)
    this.root.addEventListener('focusin', (e) => { if (/INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) this.setTyping(true); });
    this.root.addEventListener('focusout', () => setTimeout(() => this.setTyping(this.root.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? '')), 0));
    // a click / tap on the panel must not reach the game under it (Phaser listens on window: the minimap opens the map)
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'wheel']) {
      this.root.addEventListener(type, (e) => { if (e.target !== this.root) e.stopPropagation(); });
    }
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
    this.el('[data-pill]').hidden = !party.active && !show;
    if (show) this.open(this.tab);
    this.renderMini();
  }

  private open(tab: Tab): void {
    this.tab = tab;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    for (const p of this.root.querySelectorAll<HTMLElement>('[data-panel]')) p.hidden = p.dataset.panel !== tab;
    if (tab === 'room') this.renderRoom();
    if (tab === 'chat') this.renderChat();
    if (tab === 'trade') this.renderTrade();
  }

  private toast(text: string): void {
    const t = this.el('[data-toast]');
    t.textContent = text;
    t.classList.remove('faded');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('faded'), 4000);
  }

  // ───────────────────────────── room ─────────────────────────────

  private onChange(): void {
    // same-map play follows the room
    if (party.active) this.scene.startShared(); else this.scene.stopShared();
    const pill = this.el('[data-pill]');
    pill.textContent = party.active ? `👥 ${party.code} · ${party.members.size + 1}/${PARTY_MAX}` : '👥 Chơi chung';
    pill.dataset.off = party.status === 'closed' ? '1' : '';
    // outside a room the way in is the menu (Cài đặt → Chơi chung); the button shows while in one or with it open
    pill.hidden = !party.active && this.el('[data-drawer]').hidden;
    if (this.trade?.busy && this.trade.state !== 'committed' && !party.members.has(this.trade.partner)) {
      this.trade.cancel('Người kia đã rời phòng');
    }
    if (!this.el('[data-drawer]').hidden) this.open(this.tab);
  }

  private where(map: string, campaign: string): string {
    if (!map) return '—';
    if (map.startsWith('dungeon:')) return 'trong hầm ngục';
    if (campaign !== this.scene.state.adv.campaign) return CAMPAIGN[campaign] ?? campaign;
    try { return regionDef(map).name; } catch { return map; }
  }

  private renderRoom(): void {
    const p = this.el('[data-panel=room]');
    if (!party.active) {
      p.innerHTML = `
        <h2>Chơi chung · tối đa ${PARTY_MAX} người</h2>
        <p class="wo-help">Mỗi người chơi bằng ô lưu của mình và đi đâu cũng được. Đứng cùng một bản đồ (cùng chế độ ${esc(CAMPAIGN[this.scene.state.adv.campaign] ?? '')}) thì thấy nhau và đánh chung quái hoang, boss; người ra đòn cuối nhận EXP, tiền và nhiệm vụ. Hầm ngục là của riêng từng người. Có chat và trao đổi vật phẩm / Pokémon.</p>
        ${party.error ? `<p class="pp-error">${esc(party.error)}</p>` : ''}
        <button class="ol-btn ol-btn-green" data-create>Tạo phòng mới</button>
        <form class="wo-row" data-join><input name="code" aria-label="Mã phòng" placeholder="Mã phòng (6 ký tự)" maxlength="6" autocomplete="off"><button class="ol-btn ol-btn-blue">Vào phòng</button></form>`;
      this.el<HTMLButtonElement>('[data-create]').onclick = () => void this.connect(null);
      this.el<HTMLFormElement>('[data-join]').onsubmit = (e) => { e.preventDefault(); void this.connect(this.el<HTMLInputElement>('[name=code]').value); };
      return;
    }
    const me = `<div class="wo-entry pp-me"><b>${esc(party.profile.name)}</b> (bạn) · ${esc(this.where(party.profile.map, party.profile.campaign))}</div>`;
    const here = new Set(party.sameMap().map((m) => m.id));
    const rows = party.others().map((m) => `
      <div class="wo-entry">
        <b>${esc(m.name)}</b>${m.online ? '' : ' <span class="pp-dim">(mất kết nối…)</span>'} · ${esc(CAMPAIGN[m.campaign] ?? '…')} · ${esc(this.where(m.map, m.campaign))}${here.has(m.id) ? ' · <span class="pp-here">cùng bản đồ</span>' : ''}
        <div class="wo-row"><button class="ol-btn ol-btn-blue" data-trade="${esc(m.id)}" ${this.trade?.busy ? 'disabled' : ''}>Trao đổi</button></div>
      </div>`).join('');
    p.innerHTML = `
      <h2>Phòng</h2>
      <p class="wo-code" title="Gửi mã này cho bạn bè">${esc(party.code)}</p>
      <p class="wo-help">Gửi mã cho bạn bè (tối đa ${PARTY_MAX} người). Không ai là chủ phòng: ai rời đi thì phòng vẫn còn cho những người khác.</p>
      ${me}${rows || '<p class="wo-help">Đang chờ bạn bè vào phòng…</p>'}
      <button class="ol-btn ol-btn-back" data-leave>Rời phòng</button>`;
    for (const b of p.querySelectorAll<HTMLButtonElement>('[data-trade]')) b.onclick = () => this.startTrade(b.dataset.trade!);
    this.el<HTMLButtonElement>('[data-leave]').onclick = () => { party.leave(); this.toast('Đã rời phòng'); };
  }

  private async connect(code: string | null): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    party.setProfile({ name: saveStore.playerName, avatar: saveStore.avatar, campaign: this.scene.state.adv.campaign, map: this.scene.shared?.mapKey() ?? '' });
    try {
      if (code === null) { const c = await party.create(); this.toast(`Đã tạo phòng ${c} — gửi mã cho bạn bè`); }
      else { await party.join(code); this.toast(`Đã vào phòng ${party.code}`); }
      this.scene.persist();
    } catch (e) {
      this.toast(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy = false;
      this.open('room');
    }
  }

  // ───────────────────────────── chat ─────────────────────────────

  private unread = 0;
  private addChat(line: string, mine = false): void {
    chatLog.push(line);
    if (chatLog.length > CHAT_KEEP) chatLog.shift();
    const reading = this.tab === 'chat' && !this.el('[data-drawer]').hidden;
    if (!reading && !mine) this.unread++;
    this.renderChat();
    this.renderMini();
  }

  private renderChat(): void {
    if (this.tab === 'chat' && !this.el('[data-drawer]').hidden) this.unread = 0;
    this.el('[data-tab=chat]').textContent = this.unread ? `Chat (${this.unread})` : 'Chat';
    const log = this.el('[data-log]');
    log.textContent = chatLog.join('\n') || 'Chưa có tin nhắn.';
    log.scrollTop = log.scrollHeight;
  }

  private renderMini(): void {
    const mini = this.el('[data-mini]');
    const show = party.active && this.el('[data-drawer]').hidden && chatLog.length > 0;
    mini.hidden = !show;
    if (show) mini.textContent = chatLog.slice(-3).join('\n');
  }

  // ───────────────────────────── messages ─────────────────────────────

  private receive(m: PartyMsg, from: string): void {
    const name = party.nameOf(from);
    if (m.t === 'joined') { this.toast(`${name} đã vào phòng`); this.addChat(`• ${name} đã vào phòng`); return; }
    if (m.t === 'left') { if (name !== 'Người chơi') this.addChat(`• ${name} đã rời phòng`); return; }
    if (m.t === 'chat' && typeof m.body === 'string') { this.addChat(`${name}: ${m.body.slice(0, 200)}`); return; }
    if (m.t === 'trReq' && typeof m.tid === 'string') {
      if (this.trade?.busy) { party.send({ t: 'trEnd', tid: m.tid }, from); return; }
      this.trade = this.newTrade(m.tid, from, false);
      this.toast(`${name} muốn trao đổi với bạn`);
      this.toggle(true); this.open('trade');
      return;
    }
    if (m.t.startsWith('tr') && this.trade) this.trade.receive(m, from);
  }

  // ───────────────────────────── trade ─────────────────────────────

  private newTrade(tid: string, partner: string, inviting: boolean): TradeSession {
    return new TradeSession(tid, partner, inviting, {
      send: (msg, to) => party.send(msg, to),
      save: () => saveStore.data,
      kindOf,
      applied: (added, _gave, got) => {
        // the field and the bag follow the save
        this.scene.applyParty();
        this.scene.persist();
        const what = [got.mon ? monLabel(got.mon) : '', ...Object.entries(got.items).map(([id, q]) => `${ITEMS[id]?.name ?? id} ×${q}`)].filter(Boolean).join(', ');
        this.toast(`Trao đổi xong! Bạn nhận: ${what || 'không có gì'}`);
        this.addChat(`• Trao đổi với ${party.nameOf(partner)} thành công${added ? ` — ${monLabel(added)} đã vào ${saveStore.data.adventure?.party.includes(added.uid) ? 'đội' : 'PC'}` : ''}`);
      },
      changed: () => { if (this.tab === 'trade' && !this.el('[data-drawer]').hidden) this.renderTrade(); else if (this.tab === 'room') this.renderRoom(); },
    });
  }

  private startTrade(partner: string): void {
    if (this.trade?.busy) { this.open('trade'); return; }
    this.trade = this.newTrade(`${party.me}-${Date.now().toString(36)}`, partner, true);
    this.open('trade');
  }

  private offerText(o: TradeOffer): string {
    const parts = [o.mon ? `🔴 ${monLabel(o.mon)}` : '', ...Object.entries(o.items).map(([id, q]) => `${ITEMS[id]?.name ?? id} ×${q}`)].filter(Boolean);
    return parts.length ? parts.map(esc).join('<br>') : '<span class="pp-dim">(chưa có gì)</span>';
  }

  private renderTrade(): void {
    const p = this.el('[data-panel=trade]');
    const t = this.trade;
    if (!t) { p.innerHTML = '<p class="wo-help">Chọn một người trong tab Phòng rồi nhấn Trao đổi.</p>'; return; }
    const who = esc(party.nameOf(t.partner));
    if (t.state === 'invited') {
      p.innerHTML = `<h2>Lời mời trao đổi</h2><p>${who} muốn trao đổi vật phẩm / Pokémon với bạn.</p>
        <div class="wo-row"><button class="ol-btn ol-btn-green" data-yes>Đồng ý</button><button class="ol-btn ol-btn-back" data-no>Từ chối</button></div>`;
      this.el<HTMLButtonElement>('[data-yes]').onclick = () => t.accept();
      this.el<HTMLButtonElement>('[data-no]').onclick = () => t.cancel();
      return;
    }
    if (t.state === 'asking') {
      p.innerHTML = `<h2>Trao đổi</h2><p>Đang chờ ${who} đồng ý…</p><button class="ol-btn ol-btn-back" data-no>Hủy</button>`;
      this.el<HTMLButtonElement>('[data-no]').onclick = () => t.cancel();
      return;
    }
    if (t.state === 'done' || t.state === 'closed') {
      p.innerHTML = `<h2>Trao đổi</h2><p>${esc(t.note)}</p><button class="ol-btn" data-ok>Đóng</button>`;
      this.el<HTMLButtonElement>('[data-ok]').onclick = () => { this.trade = null; this.renderTrade(); };
      return;
    }
    const save = saveStore.data;
    const locked = t.state === 'committed';
    const status = `Bạn: ${t.myReady ? '✅ đã đồng ý' : '… chưa đồng ý'} · ${who}: ${t.theirReady ? '✅ đã đồng ý' : '… chưa đồng ý'}${locked ? '<br>Đang hoàn tất…' : ''}`;
    // only the other side changed: refresh their column and the status, never my half-filled form
    const key = `${t.tid}|${t.state}|${t.myV}`;
    if (key === this.tradeKey && p.querySelector('[data-theirs]')) {
      this.el('[data-theirs]').innerHTML = this.offerText(t.theirs);
      this.el('[data-status]').innerHTML = status;
      this.el<HTMLButtonElement>('[data-confirm]').disabled = locked || t.myReady;
      return;
    }
    this.tradeKey = key;
    const st = this.scene.state;
    const mons = [...st.party(), ...st.pcPokemon(), ...st.unplacedPokemon()].filter((m, i, a) => a.indexOf(m) === i);
    const monOpts = mons.map((m) => {
      const why = monBlock(save, m.uid);
      return `<option value="${esc(m.uid)}" ${t.mine.mon?.uid === m.uid ? 'selected' : ''} ${why ? 'disabled' : ''}>${esc(monLabel(m))} · ${st.inParty(m.uid) ? 'đội' : 'PC'}${why ? ' (không thể)' : ''}</option>`;
    }).join('');
    const items = Object.entries(save.inventory).filter(([id, q]) => q > 0 && kindOf(id) && kindOf(id) !== 'key')
      .map(([id, q]) => `<option value="${esc(id)}" ${this.pick.item === id ? 'selected' : ''}>${esc(ITEMS[id]?.name ?? id)} (có ${q})</option>`).join('');
    const stacks = Object.entries(t.mine.items).map(([id, q]) => `<div class="wo-row">${esc(ITEMS[id]?.name ?? id)} ×${q}<button class="ol-btn" data-rm="${esc(id)}" ${locked ? 'disabled' : ''}>✕</button></div>`).join('');
    p.innerHTML = `
      <h2>Trao đổi với ${who}</h2>
      <div class="pp-cols">
        <div class="pp-col"><b>Bạn đưa</b>
          <label class="pp-field">Pokémon <select data-mon ${locked ? 'disabled' : ''}><option value="">— Không —</option>${monOpts}</select></label>
          <div class="wo-row"><select data-item ${locked ? 'disabled' : ''}><option value="">Vật phẩm…</option>${items}</select><input data-qty type="number" min="1" max="999" value="${esc(this.pick.qty)}" aria-label="Số lượng" ${locked ? 'disabled' : ''}><button class="ol-btn" data-add ${locked ? 'disabled' : ''}>Thêm</button></div>
          ${stacks}
        </div>
        <div class="pp-col"><b>${who} đưa</b><p data-theirs>${this.offerText(t.theirs)}</p></div>
      </div>
      <p class="pp-status" data-status>${status}</p>
      <p class="pp-error" data-err></p>
      <div class="wo-row"><button class="ol-btn ol-btn-green" data-confirm ${locked || t.myReady ? 'disabled' : ''}>Đồng ý trao đổi</button><button class="ol-btn ol-btn-back" data-no ${locked ? 'disabled' : ''}>Hủy</button></div>
      <p class="wo-help">Đổi đề nghị sẽ bỏ cả hai lượt đồng ý. Pokémon nhận được vào đội (hoặc PC nếu đội đã đủ 6).</p>`;
    const err = (s: string) => { this.el('[data-err]').textContent = s; };
    const offer = (): TradeOffer => ({ mon: t.mine.mon ? { ...t.mine.mon } : null, items: { ...t.mine.items } });
    this.el<HTMLSelectElement>('[data-mon]').onchange = (e) => {
      const uid = (e.target as HTMLSelectElement).value;
      const o = offer();
      o.mon = uid ? st.owned(uid) ?? null : null;
      err(t.setOffer(o));
    };
    const itemSel = this.el<HTMLSelectElement>('[data-item]'), qtyIn = this.el<HTMLInputElement>('[data-qty]');
    itemSel.onchange = () => { this.pick.item = itemSel.value; };
    qtyIn.oninput = () => { this.pick.qty = qtyIn.value; };
    this.el<HTMLButtonElement>('[data-add]').onclick = () => {
      const id = this.el<HTMLSelectElement>('[data-item]').value;
      const q = Math.floor(Number(this.el<HTMLInputElement>('[data-qty]').value) || 0);
      if (!id) return;
      const o = offer();
      const total = (o.items[id] ?? 0) + q;
      const why = itemBlock(save, id, total, kindOf(id));
      if (why) { err(why); return; }
      o.items[id] = total;
      this.pick = { item: '', qty: '1' };
      err(t.setOffer(o));
    };
    for (const b of p.querySelectorAll<HTMLButtonElement>('[data-rm]')) b.onclick = () => { const o = offer(); delete o.items[b.dataset.rm!]; err(t.setOffer(o)); };
    this.el<HTMLButtonElement>('[data-confirm]').onclick = () => err(t.confirm());
    this.el<HTMLButtonElement>('[data-no]').onclick = () => t.cancel();
  }
}
