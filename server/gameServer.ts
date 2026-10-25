import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { Db } from './db';
import { DEFAULT_CONFIG, GameServerConfig, MAX_FRAME, WorldServer, WorldSocket } from './world';

export { DEFAULT_CONFIG };
export type { GameServerConfig };

/** Node host of the world: HTTP /healthz + `ws` WebSocket server on /ws, SQLite through node:sqlite. */
export class GameServer extends WorldServer {
  declare readonly db: Db;
  private readonly http: http.Server;
  private readonly wss: WebSocketServer;
  readonly ready: Promise<number>;

  constructor(overrides: Partial<GameServerConfig> = {}) {
    const config = { ...DEFAULT_CONFIG, ...overrides };
    super(config, new Db(config.dbPath));
    this.http = http.createServer((req, res) => {
      if (req.url === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ...this.health(), memory: process.memoryUsage(), cpu: process.cpuUsage() }));
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Pokémon Survivor authoritative server. WebSocket: /ws');
    });
    this.wss = new WebSocketServer({ server: this.http, path: '/ws', maxPayload: MAX_FRAME });
    this.wss.on('connection', (ws, req) => {
      const sock: WorldSocket = {
        get open() { return ws.readyState === WebSocket.OPEN; },
        send: (data) => ws.send(data),
        close: () => ws.close(),
        ping: () => ws.ping(),
      };
      this.attach(sock, req.socket.remoteAddress ?? undefined);
      ws.on('message', (raw) => void this.receive(sock, raw.toString()));
      ws.on('close', () => this.detach(sock));
      ws.on('error', () => this.detach(sock));
      ws.on('pong', () => this.alive(sock));
    });
    this.ready = new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.config.port, this.config.host, () => {
        const addr = this.http.address();
        const port = typeof addr === 'object' && addr ? addr.port : this.config.port;
        this.startSchedulers();
        if (this.config.verbose) console.log('[server]', `listening on ${this.config.host}:${port} (regions: ${this.config.enabledRegions.join(', ')})`);
        resolve(port);
      });
    });
  }

  async close(): Promise<void> {
    this.shutdown();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
    this.db.close();
  }
}

export function startGameServer(overrides: Partial<GameServerConfig> = {}): { server: GameServer; port: Promise<number> } {
  const server = new GameServer(overrides);
  return { server, port: server.ready };
}
