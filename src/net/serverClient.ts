import { SERVER_PROTOCOL, type ClientMsg, type ServerMsg } from './serverProtocol';
import { cloudBase } from './cloud';

/** Errors after which reconnecting would be wrong (another tab took over, logout, ban). */
const FINAL_ERRORS = new Set(['SESSION_REPLACED', 'LOGGED_OUT', 'BANNED', 'AUTH_REQUIRED', 'BAD_TOKEN', 'EXPIRED_TOKEN']);
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

/** One socket per online scene. No writes to the offline save store. */
export class ServerClient {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private url = '';
  private token = '';
  private retries = 0;
  private final = false;
  ready = false;
  /** true while a dropped session is being resumed with its token (the UI keeps the world open) */
  reconnecting = false;
  constructor(private receive: (msg: ServerMsg) => void, private status: (message: string) => void) {}

  connect(url: string, auth: Extract<ClientMsg, { t: 'login' | 'register' | 'resume' | 'recover' }>): void {
    this.close();
    const endpoint = new URL(url);
    if (!['ws:', 'wss:'].includes(endpoint.protocol)) throw new Error('Địa chỉ phải bắt đầu bằng ws:// hoặc wss://.');
    if (location.protocol === 'https:' && endpoint.protocol !== 'wss:' && !isLocalHost(endpoint.hostname)) throw new Error('Trang HTTPS cần máy chủ wss:// (hoặc ws://localhost).');
    this.url = url;
    this.final = false;
    this.open(endpoint, auth);
  }

  private open(endpoint: URL, auth: Extract<ClientMsg, { t: 'login' | 'register' | 'resume' | 'recover' }>): void {
    const socket = this.socket = new WebSocket(endpoint);
    this.status(this.reconnecting ? `Mất kết nối — đang kết nối lại (lần ${this.retries})…` : 'Đang kết nối…');
    this.timer = setTimeout(() => {
      if (this.socket !== socket) return;
      this.drop(socket, unreachable(endpoint, 'Kết nối quá hạn'));
    }, 12_000);
    socket.onopen = () => socket.send(JSON.stringify(auth));
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      let msg: ServerMsg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.t === 'welcome') {
        clearTimeout(this.timer);
        if (msg.protocol !== SERVER_PROTOCOL) {
          this.final = true;
          this.close(); this.status('Phiên bản máy chủ không tương thích. Hãy cập nhật game.'); return;
        }
        this.ready = true;
        this.reconnecting = false;
        this.retries = 0;
        this.token = msg.token;
        this.status('Đã kết nối');
      }
      if (msg.t === 'error' && FINAL_ERRORS.has(msg.code)) this.final = true;
      if (msg.t === 'error' && !this.ready) {
        this.reconnecting = false;
        this.close(); this.status(msg.message); return;
      }
      this.receive(msg);
    };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      this.drop(socket, unreachable(endpoint, 'Không kết nối được máy chủ'));
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.drop(socket, 'Đã mất kết nối. Đăng nhập lại để tiếp tục.');
    };
  }

  /** Unexpected loss: resume the same session with its token (server keeps party, items and position). */
  private drop(socket: WebSocket, message: string): void {
    const canRetry = !this.final && !!this.token && (this.ready || this.reconnecting) && this.retries < RETRY_DELAYS_MS.length;
    this.detach(socket);
    if (!canRetry) {
      this.reconnecting = false;
      this.status(message);
      return;
    }
    this.reconnecting = true;
    const delay = RETRY_DELAYS_MS[this.retries++];
    this.status(`Mất kết nối — thử lại sau ${Math.round(delay / 1000)}s…`);
    this.retryTimer = setTimeout(() => {
      if (!this.reconnecting) return;
      this.open(new URL(this.url), { t: 'resume', token: this.token });
    }, delay);
  }

  private detach(socket: WebSocket): void {
    clearTimeout(this.timer);
    if (this.socket === socket) this.socket = undefined;
    this.ready = false;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try { socket.close(); } catch { /* already closed */ }
  }

  send(msg: ClientMsg): boolean {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(msg)); return true;
  }

  /** Test hook / network-change helper: drop the socket as if the network failed. */
  simulateDrop(): void {
    this.socket?.close();
  }

  close(): void {
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
    this.reconnecting = false;
    const old = this.socket;
    this.socket = undefined; this.ready = false;
    if (old) { old.onopen = old.onmessage = old.onerror = old.onclose = null; old.close(); }
  }

  /** Logout / leaving the scene: never reconnect afterwards. */
  shutdown(): void {
    this.final = true;
    this.token = '';
    this.retries = 0;
    this.close();
  }
}

const isLocalHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
const isPrivateHost = (host: string) => isLocalHost(host) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host) || host.endsWith('.local');

function unreachable(endpoint: URL, what: string): string {
  const hint = isLocalHost(endpoint.hostname)
    ? 'Máy chủ chưa chạy? Mở terminal trong thư mục game và chạy: npm run server'
    : 'Kiểm tra máy chủ đang chạy, địa chỉ / cổng đúng và tường lửa cho phép kết nối.';
  return `${what}: ${endpoint.href}\n${hint}`;
}

/**
 * Server address shown in the login form. Order: the last address the player used, the build-time VITE_SERVER_URL,
 * then the page's own host when it is a local / LAN dev server. A static host (GitHub Pages) cannot run the game
 * server, so there the fallback is a server on this computer (browsers allow ws://localhost from HTTPS pages).
 */
export function defaultEndpoint(saved: string | null): string {
  const host = location.hostname || 'localhost';
  const configured = configuredServer();
  const own = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${host}:8787/ws`;
  const fallback = configured || (isPrivateHost(host) ? own : LOCAL_SERVER);
  // older builds saved "<static host>:8787" (can never answer) or the local fallback: a configured server replaces them
  const stale = !isPrivateHost(host) && (saved === own || (!!configured && saved === LOCAL_SERVER));
  if (saved && !stale) return saved;
  return fallback;
}

/** True when nobody configured a server for this (static) build: the login form explains how to get one. */
export function needsServerHint(): boolean {
  return !configuredServer() && !isPrivateHost(location.hostname || 'localhost');
}

const LOCAL_SERVER = 'ws://localhost:8787/ws';

/** VITE_SERVER_URL, else the Cloudflare backend's world socket. */
function configuredServer(): string {
  const explicit = (import.meta.env?.VITE_SERVER_URL as string | undefined)?.trim();
  if (explicit) return explicit;
  const cloud = cloudBase();
  return cloud ? `${cloud}/ws` : '';
}

let sequence = 0;
export function actionId(): string {
  return `web_${Date.now().toString(36)}_${(++sequence).toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
