import { POKEMON, SKILLS } from '../core/data';
import { ITEM_DEFS } from '../core/evolution';
import { unlockedSkills } from '../core/learnset';
import { NATURES } from '../core/stats';
import type { OwnedPokemon } from '../core/progression';
import type { ActionType } from '../net/serverProtocol';
import type { SaveData } from '../systems/saveSchema';

// Online Pokémon PC (V7 §5.5): box list + paged grid, party column, search / filter / sort, detail pane,
// deposit / withdraw / move / favorite / nickname / box rename. Every change is a server action; the dialog
// only re-renders from the authoritative save it is given.

export interface PcDeps {
  save: () => SaveData | undefined;
  act: (type: ActionType, data?: Record<string, unknown>) => void;
  /** data URL of the species icon, or null while it is not available */
  icon: (species: string, shiny: boolean) => string | null;
  onClose: () => void;
}

type Filter = 'all' | 'favorite' | 'shiny' | `type:${string}`;
const TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const TYPE_VI: Record<string, string> = {
  normal: 'Thường', fire: 'Lửa', water: 'Nước', grass: 'Cỏ', electric: 'Điện', ice: 'Băng', fighting: 'Giác đấu', poison: 'Độc', ground: 'Đất',
  flying: 'Bay', psychic: 'Siêu linh', bug: 'Côn trùng', rock: 'Đá', ghost: 'Ma', dragon: 'Rồng', dark: 'Bóng tối', steel: 'Thép', fairy: 'Tiên',
};
const STAT_VI: Record<string, string> = { hp: 'HP', atk: 'Công', def: 'Thủ', spa: 'C.Đặc', spd: 'T.Đặc', spe: 'Tốc' };

const label = (p: OwnedPokemon) => p.nickname || POKEMON.get(p.species)?.name || p.species;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('data-') || k.startsWith('aria-')) e.setAttribute(k, String(v));
    else (e as unknown as Record<string, unknown>)[k] = v;
  }
  e.append(...kids);
  return e;
}

export class ServerPc {
  readonly root: HTMLDivElement;
  private box = 0;
  /** selected cell: a PC slot or a party member */
  private sel: { kind: 'pc'; box: number; slot: number } | { kind: 'party'; uid: string } | null = null;
  private query = '';
  private filter: Filter = 'all';
  private moving: string | null = null;
  /** the Pokémon the detail pane follows through deposit / withdraw / box moves */
  private follow: string | null = null;
  private renaming: 'box' | 'pokemon' | null = null;

  constructor(host: HTMLElement, private deps: PcDeps) {
    this.root = el('div', { className: 'server-pc ol-panel', role: 'dialog', 'aria-label': 'Máy PC Pokémon', tabIndex: -1 });
    this.root.hidden = true;
    this.root.addEventListener('keydown', (e) => this.key(e));
    host.append(this.root);
  }

  get open(): boolean { return !this.root.hidden; }

  show(): void {
    this.root.hidden = false;
    this.render();
    this.root.focus();
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true; this.moving = null; this.renaming = null;
    this.deps.onClose();
  }

  destroy(): void { this.root.remove(); }

  private owned(uid: string | null | undefined): OwnedPokemon | undefined {
    return uid ? this.deps.save()?.collection.find((p) => p.uid === uid) : undefined;
  }

  private selectedUid(): string | null {
    const save = this.deps.save();
    if (!this.sel || !save?.adventure) return null;
    if (this.sel.kind === 'party') return save.adventure.party.includes(this.sel.uid) ? this.sel.uid : null;
    return save.adventure.pc.boxes[this.sel.box]?.slots[this.sel.slot] ?? null;
  }

  private matches(p: OwnedPokemon): boolean {
    const q = this.query.trim().toLowerCase();
    if (q && !`${label(p)} ${p.species} ${POKEMON.get(p.species)?.name ?? ''}`.toLowerCase().includes(q)) return false;
    if (this.filter === 'favorite') return !!p.favorite;
    if (this.filter === 'shiny') return !!p.shiny;
    if (this.filter.startsWith('type:')) return (POKEMON.get(p.species)?.types ?? []).includes(this.filter.slice(5) as never);
    return true;
  }

  private filtering(): boolean { return !!this.query.trim() || this.filter !== 'all'; }

  /** Called after every authoritative save update. */
  render(): void {
    if (this.root.hidden) return;
    const save = this.deps.save();
    const adv = save?.adventure;
    if (!save || !adv) { this.hide(); return; }
    const pc = adv.pc;
    if (this.follow && this.selectedUid() !== this.follow) {
      if (adv.party.includes(this.follow)) this.sel = { kind: 'party', uid: this.follow };
      else {
        const loc = pc.boxes.map((b, i) => [i, b.slots.indexOf(this.follow)] as const).find(([, slot]) => slot >= 0);
        if (loc) { this.box = loc[0]; this.sel = { kind: 'pc', box: loc[0], slot: loc[1] }; } else this.follow = null;
      }
    }
    this.box = Math.max(0, Math.min(pc.boxes.length - 1, this.box));
    const box = pc.boxes[this.box];
    const focusSearch = document.activeElement?.getAttribute('data-pc-search') != null;
    this.root.replaceChildren();

    // ── header: title, box pager, close
    const pager = el('div', { className: 'server-row server-pc-pager' },
      el('button', { type: 'button', textContent: '◀', 'aria-label': 'Box trước', onclick: () => this.page(-1) }),
      this.renaming === 'box'
        ? this.inlineInput(box.name, 24, 'Tên box', (v) => this.deps.act('pc.boxName', { box: this.box, name: v }))
        : el('strong', { textContent: `${box.name} (${this.box + 1}/${pc.boxes.length})`, 'data-pc-box': '' }),
      el('button', { type: 'button', textContent: '▶', 'aria-label': 'Box sau', onclick: () => this.page(1) }),
      el('button', { type: 'button', textContent: '✎', 'aria-label': 'Đổi tên box', onclick: () => { this.renaming = 'box'; this.render(); } }),
    );
    const used = pc.boxes.reduce((n, b) => n + b.slots.filter(Boolean).length, 0), cap = pc.boxes.reduce((n, b) => n + b.slots.length, 0);
    this.root.append(el('header', {},
      el('h2', { textContent: 'Máy PC' }), el('span', { textContent: `${used}/${cap} ô` }),
      el('button', { type: 'button', textContent: 'Đóng', onclick: () => this.hide() })));

    // ── toolbar: search, filter, sort
    const search = el('input', { type: 'search', placeholder: 'Tìm tên / loài…', value: this.query, 'aria-label': 'Tìm Pokémon', 'data-pc-search': '' });
    search.oninput = () => { this.query = search.value; this.render(); };
    const filter = el('select', { 'aria-label': 'Lọc Pokémon' },
      el('option', { value: 'all', textContent: 'Tất cả' }), el('option', { value: 'favorite', textContent: '★ Đã khóa' }), el('option', { value: 'shiny', textContent: '✦ Shiny' }),
      ...TYPES.map((t) => el('option', { value: `type:${t}`, textContent: `Hệ ${TYPE_VI[t]}` })));
    filter.value = this.filter;
    filter.onchange = () => { this.filter = filter.value as Filter; this.render(); };
    const sort = el('select', { 'aria-label': 'Sắp xếp box' },
      el('option', { value: 'level', textContent: 'Theo cấp' }), el('option', { value: 'name', textContent: 'Theo tên' }),
      el('option', { value: 'recent', textContent: 'Mới bắt' }), el('option', { value: 'favorite', textContent: 'Đã khóa trước' }));
    this.root.append(el('div', { className: 'server-row server-pc-tools' }, search, filter, sort,
      el('button', { type: 'button', textContent: 'Sắp xếp box', onclick: () => this.deps.act('pc.sort', { box: this.box, mode: sort.value }) })));

    // ── body: party column | grid | detail
    const party = el('div', { className: 'server-pc-party', 'aria-label': 'Đội hình' }, el('p', { textContent: `Đội (${adv.party.length}/6)` }));
    for (const uid of adv.party) {
      const p = this.owned(uid); if (!p) continue;
      party.append(this.cell(p, this.sel?.kind === 'party' && this.sel.uid === uid, () => { this.sel = { kind: 'party', uid }; this.follow = uid; this.render(); }, uid === adv.activeUid ? '●' : ''));
    }
    const grid = el('div', { className: 'server-pc-grid', role: 'grid', 'aria-label': box.name });
    grid.addEventListener('wheel', (e) => { e.preventDefault(); this.page(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    box.slots.forEach((uid, slot) => {
      const p = this.owned(uid);
      const selected = this.sel?.kind === 'pc' && this.sel.box === this.box && this.sel.slot === slot;
      const pick = () => {
        if (this.moving) { this.deps.act('pc.move', { uid: this.moving, box: this.box, slot }); this.moving = null; }
        this.sel = { kind: 'pc', box: this.box, slot }; this.follow = uid ?? null; this.render();
      };
      grid.append(p ? this.cell(p, selected, pick) : el('button', { type: 'button', className: `server-pc-cell empty${selected ? ' sel' : ''}`, 'aria-label': `Ô trống ${slot + 1}`, onclick: pick }));
    });
    const hits = this.filtering() ? pc.boxes.map((b, i) => [i, b.slots.filter((u) => { const p = this.owned(u); return p && this.matches(p); }).length] as const).filter(([i, n]) => n > 0 && i !== this.box) : [];
    const center = el('div', { className: 'server-pc-center' }, pager, grid);
    if (this.filtering()) {
      center.append(el('div', { className: 'server-row' }, el('span', { textContent: hits.length ? 'Có kết quả ở:' : 'Không có kết quả ở box khác.' }),
        ...hits.map(([i, n]) => el('button', { type: 'button', textContent: `${pc.boxes[i].name} (${n})`, onclick: () => { this.box = i; this.render(); } }))));
    }
    if (this.moving) center.append(el('p', { className: 'server-pc-hint', textContent: `Chọn ô đích cho ${label(this.owned(this.moving)!)} (Esc để hủy).` }));
    this.root.append(el('div', { className: 'server-pc-body' }, party, center, this.detail()));
    this.root.append(el('p', { className: 'server-pc-hint', textContent: 'Phím mũi tên chọn ô · [ ] hoặc lăn chuột đổi box · Enter gửi/rút · Esc đóng' }));
    if (focusSearch) { const s = this.root.querySelector<HTMLInputElement>('[data-pc-search]'); s?.focus(); s?.setSelectionRange(s.value.length, s.value.length); }
    // re-rendering replaces the focused button: keep keyboard control on the dialog
    else if (!this.root.contains(document.activeElement)) this.root.focus({ preventScroll: true });
  }

  private cell(p: OwnedPokemon, selected: boolean, onclick: () => void, mark = ''): HTMLButtonElement {
    const src = this.deps.icon(p.species, !!p.shiny);
    const b = el('button', {
      type: 'button', className: `server-pc-cell${selected ? ' sel' : ''}${this.filtering() && !this.matches(p) ? ' dim' : ''}`,
      'aria-label': `${label(p)} Lv${p.level}`, 'aria-pressed': String(selected), onclick,
    });
    b.append(src ? el('img', { src, alt: '' }) : el('span', { className: 'abbr', textContent: label(p).slice(0, 3) }));
    b.append(el('small', { textContent: `${mark}${p.favorite ? '★' : ''}${p.shiny ? '✦' : ''}Lv${p.level}` }));
    return b;
  }

  private detail(): HTMLElement {
    const save = this.deps.save()!;
    const adv = save.adventure!;
    const uid = this.selectedUid();
    const p = this.owned(uid);
    const pane = el('div', { className: 'server-pc-detail', 'aria-live': 'polite' });
    if (!p) { pane.append(el('p', { textContent: 'Chọn một Pokémon để xem chi tiết.' })); return pane; }
    const def = POKEMON.get(p.species);
    const src = this.deps.icon(p.species, !!p.shiny);
    if (src) pane.append(el('img', { className: 'server-pc-portrait', src, alt: label(p) }));
    const inParty = adv.party.includes(p.uid);
    pane.append(
      this.renaming === 'pokemon'
        ? this.inlineInput(p.nickname ?? '', 20, 'Biệt danh', (v) => this.deps.act('pc.rename', { uid: p.uid, nickname: v }))
        : el('h3', { textContent: `${label(p)}${p.shiny ? ' ✦' : ''}${p.favorite ? ' ★' : ''}` }),
      el('p', { 'data-pc-detail': '', textContent: [
        `${def?.name ?? p.species} · Lv${p.level} · ${inParty ? (p.uid === adv.activeUid ? 'Đang ra sân' : 'Trong đội') : 'Trong PC'}`,
        `Hệ: ${(def?.types ?? []).map((t) => TYPE_VI[t] ?? t).join(' / ')}`,
        `EXP: ${p.exp} · HP ${Math.round((p.hpFrac ?? 1) * 100)}%`,
        `Tính cách: ${p.nature ? NATURES[p.nature]?.name ?? p.nature : '—'} · Đặc tính: ${def?.passive?.name ?? '—'}`,
        `IV: ${p.ivs ? Object.entries(p.ivs).map(([k, v]) => `${STAT_VI[k] ?? k} ${v}`).join(' ') : '—'}`,
        `EV: ${p.evs ? Object.entries(p.evs).filter(([, v]) => v).map(([k, v]) => `${STAT_VI[k] ?? k} ${v}`).join(' ') || '0' : '0'}`,
        `Chiêu: ${unlockedSkills(p.species, p.level).slice(-4).map((s) => SKILLS.get(s)?.name ?? s).join(', ') || '—'}`,
        `Vật phẩm: ${p.held ? ITEM_DEFS.get(p.held)?.name ?? p.held : 'không'} · Thân thiết ${p.friendship ?? 0}`,
      ].join('\n') }),
    );
    const row = el('div', { className: 'server-row' });
    const btn = (text: string, run: () => void, disabled = false) => row.append(el('button', { type: 'button', textContent: text, onclick: run, disabled }));
    if (inParty) btn('Gửi vào PC', () => this.deps.act('party.deposit', { uid: p.uid }), adv.party.length <= 1);
    else btn('Rút về đội', () => this.deps.act('party.withdraw', { uid: p.uid }), adv.party.length >= 6);
    btn(p.favorite ? 'Bỏ khóa ★' : 'Khóa ★', () => this.deps.act('pc.favorite', { uid: p.uid, favorite: !p.favorite }));
    btn('Biệt danh', () => { this.renaming = 'pokemon'; this.render(); });
    if (!inParty) btn('Di chuyển', () => { this.moving = p.uid; this.render(); });
    pane.append(row);
    if (!inParty) {
      const to = el('select', { 'aria-label': 'Chuyển sang box' }, ...adv.pc.boxes.map((b, i) => el('option', { value: String(i), textContent: `${b.name} (${b.slots.filter(Boolean).length}/${b.slots.length})` })));
      to.value = String(this.box);
      pane.append(el('div', { className: 'server-row' }, to, el('button', { type: 'button', textContent: 'Chuyển box', onclick: () => {
        const b = Number(to.value), slot = adv.pc.boxes[b].slots.indexOf(null);
        if (slot >= 0) this.deps.act('pc.move', { uid: p.uid, box: b, slot });
      } })));
    }
    return pane;
  }

  private inlineInput(value: string, max: number, aria: string, commit: (v: string) => void): HTMLElement {
    const input = el('input', { value, maxLength: max, 'aria-label': aria });
    const done = (save: boolean) => { if (save) commit(input.value.trim()); this.renaming = null; this.render(); };
    input.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
    queueMicrotask(() => input.focus());
    return el('span', { className: 'server-row' }, input, el('button', { type: 'button', textContent: 'Lưu', onclick: () => done(true) }));
  }

  private page(d: number): void {
    const n = this.deps.save()?.adventure?.pc.boxes.length ?? 1;
    this.box = (this.box + d + n) % n;
    if (this.sel?.kind === 'pc') this.sel = { kind: 'pc', box: this.box, slot: this.sel.slot };
    this.follow = this.selectedUid();
    this.render();
  }

  private key(e: KeyboardEvent): void {
    const typing = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT';
    if (e.key === 'Escape') { e.preventDefault(); if (this.moving) { this.moving = null; this.render(); } else this.hide(); return; }
    if (typing) return;
    if (e.key === '[' || e.key === 'PageUp') { e.preventDefault(); this.page(-1); return; }
    if (e.key === ']' || e.key === 'PageDown') { e.preventDefault(); this.page(1); return; }
    const save = this.deps.save(); if (!save?.adventure) return;
    const cols = 6, size = save.adventure.pc.boxes[this.box].slots.length;
    const cur = this.sel?.kind === 'pc' ? this.sel.slot : -1;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
    if (step[e.key] != null) {
      e.preventDefault();
      const slot = cur < 0 ? 0 : Math.max(0, Math.min(size - 1, cur + step[e.key]));
      this.sel = { kind: 'pc', box: this.box, slot };
      this.follow = this.selectedUid();
      this.render();
      this.root.querySelectorAll<HTMLButtonElement>('.server-pc-grid .server-pc-cell')[slot]?.focus();
      return;
    }
    if (e.key === 'Enter') {
      const uid = this.selectedUid(); if (!uid) return;
      e.preventDefault();
      this.deps.act(save.adventure.party.includes(uid) ? 'party.deposit' : 'party.withdraw', { uid });
    }
  }
}
