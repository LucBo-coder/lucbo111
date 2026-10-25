import Phaser from 'phaser';
import { AdventureState } from '../adventure/AdventureState';
import { monFromOwned } from '../net/duel';
import { coopSession } from '../net/coop';
import { net } from '../net/session';
import { gameModes } from '../systems/gameMode';
import { saveStore } from '../systems/save';
import { newAdventure, type Campaign } from '../systems/saveSchema';
import './onlineHub.css';

export class OnlineHubScene extends Phaser.Scene {
  private root!: HTMLDivElement;
  private busy = false;
  private leaving = false;
  constructor() { super('OnlineHub'); }

  create(): void {
    this.busy = false; this.leaving = false;
    this.cameras.main.setBackgroundColor('#152b31');
    this.root = document.createElement('div'); this.root.className = 'online-hub';
    this.root.innerHTML = `<main>
      <header><div><p>Pokémon Survivor · Chơi cùng bạn</p><h1>Sảnh Online</h1></div><button data-back>Về sảnh chính</button></header>
      <p data-status role="status">Chọn hành trình, tạo phòng rồi gửi mã 6 ký tự cho bạn.</p>
      <div class="online-options"><label>Ô lưu cho co-op<select data-slot></select></label>
      <label>Pokémon khởi đầu<select data-starter><option value="charmander">Charmander</option><option value="bulbasaur">Bulbasaur</option><option value="squirtle">Squirtle</option></select></label></div>
      <section class="online-modes" aria-label="Chọn mode online">
        <article><span>01 · Sinh tồn</span><h2>Sống sót cùng nhau</h2><p>Hai người cùng chiến đấu, cứu đồng đội và vượt các đợt quái trong lượt sinh tồn.</p><button data-host="survivor">Tạo phòng Sinh tồn</button></article>
        <article><span>02 · Phiêu lưu</span><h2>Khám phá sáu vùng đất</h2><p>Tiếp tục ô lưu Phiêu lưu, cùng săn boss, vào hầm ngục và chia chiến lợi phẩm.</p><button data-host="classic">Tạo phòng Phiêu lưu</button></article>
        <article><span>03 · Việt Nam Odyssey</span><h2>Hẹn nhau ở Đất Mũi</h2><p>Hành trình Cà Mau, An Giang, Cần Thơ cùng bạn. Nhiệm vụ theo tiến trình chủ phòng.</p><button data-host="vietnam">Tạo phòng Việt Nam</button></article>
      </section>
      <section class="online-join"><div><h2>Đã có mã phòng co-op?</h2><p>Chọn ô lưu để mang đội Pokémon của bạn. Ô trống được mượn Pokémon khởi đầu.</p></div><form data-join><label>Mã phòng<input name="code" aria-label="Mã phòng co-op" pattern="[A-Za-z0-9]{6}" minlength="6" maxlength="6" required autocomplete="off"></label><button>Vào phòng co-op</button></form></section>
      <footer><button data-pvp>Đấu PvP online</button><button data-server>Thế giới online · tài khoản</button><p>Co-op: 2 người/phòng · Thử thách chung có thưởng · Chủ phòng giữ kết nối khi chơi.</p></footer>
    </main>`;
    document.body.append(this.root);
    void this.fillSlots();
    this.root.querySelectorAll<HTMLButtonElement>('[data-host]').forEach((b) => b.onclick = () => void this.run(() => this.host(b.dataset.host as 'survivor' | Campaign)));
    this.root.querySelector<HTMLFormElement>('[data-join]')!.onsubmit = (e) => { e.preventDefault(); void this.run(() => this.join()); };
    this.root.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => { if (!this.busy) gameModes.toMenu(this); };
    this.root.querySelector<HTMLButtonElement>('[data-pvp]')!.onclick = () => { if (!this.busy) gameModes.start(this, 'online'); };
    this.root.querySelector<HTMLButtonElement>('[data-server]')!.onclick = () => { if (!this.busy) gameModes.start(this, 'online', { entry: 'ServerWorld' }); };
    this.events.once('shutdown', () => { this.root.remove(); if (!this.leaving && coopSession.active) { coopSession.active = false; net.leave(); } });
  }

  private async fillSlots(): Promise<void> {
    const slots = await saveStore.listSlots();
    if (!this.scene.isActive()) return;
    const select = this.root.querySelector<HTMLSelectElement>('[data-slot]')!;
    slots.forEach((slot, i) => {
      const option = document.createElement('option'); option.value = String(i + 1);
      option.textContent = `Ô ${i + 1} · ${!slot ? 'Trống' : slot.campaign === 'vietnam' ? 'Việt Nam Odyssey' : 'Phiêu lưu'}${slot ? ` · ${slot.collection} Pokémon` : ''}`;
      option.selected = saveStore.slot === i + 1; select.append(option);
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.disabled = true);
    const status = this.root.querySelector<HTMLElement>('[data-status]')!;
    status.textContent = 'Đang chuẩn bị kết nối…';
    try { await fn(); } catch (e) { coopSession.active = false; net.leave(); status.textContent = (e as Error).message; }
    finally { this.busy = false; this.root.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.disabled = false); }
  }

  private get slot(): number { return Number(this.root.querySelector<HTMLSelectElement>('[data-slot]')!.value) || saveStore.slot; }
  private get starter(): string { return this.root.querySelector<HTMLSelectElement>('[data-starter]')!.value; }

  private async host(mode: 'survivor' | Campaign): Promise<void> {
    const slots = await saveStore.listSlots(), slot = this.slot;
    if (mode !== 'survivor' && slots[slot - 1] && slots[slot - 1]!.campaign !== mode) throw new Error('Ô lưu này thuộc hành trình khác. Hãy chọn ô trống hoặc ô đúng hành trình.');
    net.setProfile(saveStore.playerName, saveStore.avatar);
    await net.host();
    await saveStore.loadSlot(slot);
    if (mode !== 'survivor') {
      if (!saveStore.data.adventure) saveStore.data.adventure = newAdventure(mode);
      if (!slots[slot - 1]) saveStore.data.adventure = newAdventure(mode);
      const state = new AdventureState(saveStore.data);
      if (!state.party().length) state.addPokemon(this.starter, 5, 'starter');
      await saveStore.save();
    }
    coopSession.active = true; this.leaving = true;
    gameModes.start(this, mode === 'survivor' ? 'survivor' : 'adventure', { starter: this.starter });
  }

  private async join(): Promise<void> {
    const code = this.root.querySelector<HTMLInputElement>('[name=code]')!.value.trim().toUpperCase();
    await saveStore.loadSlot(this.slot);
    const ids = saveStore.data.adventure?.party ?? [];
    const owned = saveStore.data.collection.filter((p) => ids.includes(p.uid)).slice(0, 3);
    const party = owned.length ? owned.map(monFromOwned) : [{ species: this.starter, level: 5 }];
    net.setProfile(saveStore.playerName, saveStore.avatar);
    await net.join(code);
    coopSession.active = true; this.leaving = true;
    gameModes.start(this, 'online', { entry: 'CoopGuest', party, returnTo: 'menu' });
  }
}
