import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultEndpoint, needsServerHint } from '../src/net/serverClient';

const at = (protocol: string, hostname: string) => vi.stubGlobal('location', { protocol, hostname });

describe('online server address', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a static host (GitHub Pages) falls back to a server on this computer and explains it', () => {
    at('https:', 'lucbo-coder.github.io');
    expect(defaultEndpoint(null)).toBe('ws://localhost:8787/ws');
    expect(needsServerHint()).toBe(true);
    // the old default saved by earlier builds can never answer: it is dropped
    expect(defaultEndpoint('wss://lucbo-coder.github.io:8787/ws')).toBe('ws://localhost:8787/ws');
    expect(defaultEndpoint('wss://game.example.com/ws')).toBe('wss://game.example.com/ws');
  });

  it('local and LAN dev servers use their own host', () => {
    at('http:', 'localhost');
    expect(defaultEndpoint(null)).toBe('ws://localhost:8787/ws');
    expect(needsServerHint()).toBe(false);
    at('http:', '192.168.1.20');
    expect(defaultEndpoint(null)).toBe('ws://192.168.1.20:8787/ws');
    expect(defaultEndpoint('ws://192.168.1.20:8787/ws')).toBe('ws://192.168.1.20:8787/ws');
  });
});
