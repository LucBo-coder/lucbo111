import Phaser from 'phaser';
import { defaultEndpoint, needsServerHint } from '../net/serverClient';
import type { ServerAccount, ServerMsg } from '../net/serverProtocol';
import { worldSession } from '../net/worldSession';
import type { SaveData } from '../systems/saveSchema';
import { saveStore } from '../systems/save';
import { gameModes } from '../systems/gameMode';
import './onlineTheme.css';
import './serverScene.css';

// Thế giới online — sign in / create an account, then the account's Vietnam Odyssey campaign starts (the full
// offline campaign, with the save kept on the server and the other players on the same map; see WorldOnline).

export class ServerScene extends Phaser.Scene {
  private root!: HTMLDivElement;
  private offs: (() => void)[] = [];
  /** the session was handed to the campaign (do not close it with this scene) */
  private entered = false;

  constructor() { super('ServerWorld'); }

  create(): void {
    this.entered = false;
    this.cameras.main.setBackgroundColor('#16382e');
    this.root = document.createElement('div');
    this.root.className = 'server-world ol-root';
    this.root.innerHTML = `
      <section class="server-panel ol-panel" aria-label="Thế giới online" data-login>
        <header><button class="ol-btn ol-btn-back" data-exit>◀ Quay lại</button><h1 class="ol-title">THẾ GIỚI ONLINE</h1></header>
        <p data-status role="status">Việt Nam Odyssey đầy đủ — cùng bạn bè, trên máy chủ</p>
        <form data-auth>
          <label>Máy chủ<input name="endpoint" aria-label="Máy chủ" required></label>
          <p class="server-card server-incoming" data-server-hint hidden>Bản web này không kèm máy chủ online. Chạy máy chủ trên máy tính (<b>npm run server</b> trong thư mục game) rồi giữ địa chỉ ws://localhost:8787/ws, hoặc nhập địa chỉ wss:// của máy chủ bạn bè đã dựng.</p>
          <label>Tên đăng nhập<input name="username" aria-label="Tên đăng nhập" autocomplete="username" pattern="[A-Za-z0-9_]{3,20}" minlength="3" maxlength="20" required></label>
          <label>Mật khẩu<input name="password" aria-label="Mật khẩu" type="password" autocomplete="current-password" minlength="6" maxlength="128" required></label>
          <div class="server-auth-actions"><button class="ol-btn ol-btn-green" type="submit" value="login">Đăng nhập</button><button class="ol-btn ol-btn-blue" type="submit" value="register">Tạo tài khoản</button></div>
          <p>Toàn bộ chiến dịch Việt Nam Odyssey (các tỉnh, nhiệm vụ, HLV, boss, bắt Pokémon) chơi online: tiến trình lưu trên máy chủ theo tài khoản, người chơi cùng bản đồ thấy nhau, chat, kết bạn, lập nhóm. Tài khoản mới chọn Pokémon khởi đầu Gen 1–9 với giáo sư ở Cà Mau. Ô lưu offline không bị đụng tới.</p>
          <details data-recover-box><summary>Quên mật khẩu?</summary>
            <label>Mã khôi phục<input name="code" aria-label="Mã khôi phục" autocomplete="off" maxlength="40"></label>
            <label>Mật khẩu mới<input name="newPassword" aria-label="Mật khẩu mới" type="password" autocomplete="new-password" minlength="6" maxlength="128"></label>
            <button type="button" data-recover>Khôi phục tài khoản</button>
          </details>
        </form>
        <div class="server-card server-incoming" data-recovery hidden></div>
      </section>`;
    document.body.append(this.root);
    const form = this.el<HTMLFormElement>('[data-auth]');
    const endpoint = form.elements.namedItem('endpoint') as HTMLInputElement;
    let saved: string | null = null;
    try { saved = localStorage.getItem('survivor.server.endpoint'); } catch { /* storage disabled */ }
    endpoint.value = defaultEndpoint(saved);
    if (needsServerHint()) this.el('[data-server-hint]').hidden = false;
    try { (form.elements.namedItem('username') as HTMLInputElement).value = localStorage.getItem('survivor.server.username') ?? ''; } catch { /* optional */ }
    const client = worldSession.connection();
    this.offs.push(worldSession.on((m) => this.receive(m)), worldSession.onStatus((s) => this.status(s)));
    form.onsubmit = (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const t = (event.submitter as HTMLButtonElement)?.value === 'register' ? 'register' : 'login';
      try {
        // 'pick': a new account starts the campaign before the professor's starter (every generation offered)
        client.connect(endpoint.value.trim(), { t, username: String(data.get('username')), password: String(data.get('password')), ...(t === 'register' ? { starter: 'pick' } : {}) });
        try { localStorage.setItem('survivor.server.endpoint', endpoint.value.trim()); localStorage.setItem('survivor.server.username', String(data.get('username')).trim()); } catch { /* optional */ }
      } catch (e) { this.status((e as Error).message); }
    };
    this.el('[data-recover]').onclick = () => {
      const data = new FormData(form);
      try {
        client.connect(endpoint.value.trim(), { t: 'recover', username: String(data.get('username')).trim(), code: String(data.get('code')), newPassword: String(data.get('newPassword')) });
      } catch (e) { this.status((e as Error).message); }
    };
    this.el('[data-exit]').onclick = () => gameModes.toMenu(this);
    this.events.once('shutdown', () => {
      for (const off of this.offs) off();
      this.offs = [];
      this.root.remove();
      // back to the menu without signing in: close the socket
      if (!this.entered && !worldSession.active) void worldSession.end();
    });
  }

  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }

  private status(message: string): void {
    this.el('[data-status]').textContent = message;
  }

  private receive(msg: ServerMsg): void {
    if (msg.t === 'error') this.status(msg.message);
    if (msg.t !== 'welcome' || this.entered) return;
    this.el<HTMLInputElement>('[name=password]').value = '';
    if (msg.recoveryCode) this.showRecovery(msg.recoveryCode, () => this.enter(msg.account, msg.save));
    else this.enter(msg.account, msg.save);
  }

  /** Signed in: the account's campaign replaces the local slot until the player goes back to the menu. */
  private enter(account: ServerAccount, serverSave: SaveData): void {
    if (this.entered) return;
    this.entered = true;
    const save = worldSession.begin(account, serverSave);
    saveStore.enterRemote(save, (s, urgent) => worldSession.queue(s, urgent));
    gameModes.start(this, 'adventure', { map: 'valley' });
  }

  private showRecovery(code: string, then: () => void): void {
    this.el('[data-auth]').hidden = true;
    const box = this.el('[data-recovery]');
    box.hidden = false;
    box.replaceChildren();
    const p = document.createElement('p');
    p.textContent = `MÃ KHÔI PHỤC TÀI KHOẢN\n${code}\nGhi lại và cất giữ mã này. Đây là cách duy nhất lấy lại tài khoản nếu quên mật khẩu; máy chủ không lưu mã ở dạng đọc được và sẽ không hiện lại.`;
    p.setAttribute('data-recovery-code', code);
    const ok = document.createElement('button');
    ok.className = 'ol-btn ol-btn-green';
    ok.textContent = 'Tôi đã lưu mã — vào thế giới';
    ok.onclick = then;
    box.append(p, ok);
  }
}
