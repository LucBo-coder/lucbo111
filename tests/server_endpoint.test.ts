import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_URL_DEFAULT, cloudBase } from '../src/net/cloud';
import { defaultEndpoint, needsServerHint } from '../src/net/serverClient';
import { defaultLinkKind } from '../src/net/transport';

const at = (protocol: string, hostname: string, search = '') => vi.stubGlobal('location', { protocol, hostname, search });
const CLOUD_WORLD = `${CLOUD_URL_DEFAULT}/ws`;

describe('online server address (Cloudflare backend)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('GitHub Pages uses the deployed Worker for the world and the room relay', () => {
    at('https:', 'lucbo-coder.github.io');
    expect(CLOUD_URL_DEFAULT).toMatch(/^wss:\/\/.+\.workers\.dev$/);
    expect(defaultEndpoint(null)).toBe(CLOUD_WORLD);
    expect(needsServerHint()).toBe(false);
    expect(defaultLinkKind()).toBe('relay');
  });

  it('addresses saved by older builds that can never answer are replaced, a chosen server is kept', () => {
    at('https:', 'lucbo-coder.github.io');
    expect(defaultEndpoint('wss://lucbo-coder.github.io:8787/ws')).toBe(CLOUD_WORLD);
    expect(defaultEndpoint('ws://localhost:8787/ws')).toBe(CLOUD_WORLD);
    expect(defaultEndpoint('wss://game.example.com/ws')).toBe('wss://game.example.com/ws');
  });

  it('?cloud= overrides the backend, ?net= forces a transport', () => {
    at('https:', 'lucbo-coder.github.io', '?cloud=wss://other.example.dev/');
    expect(cloudBase()).toBe('wss://other.example.dev');
    expect(defaultEndpoint(null)).toBe('wss://other.example.dev/ws');
    at('http:', 'localhost', '?net=local');
    expect(defaultLinkKind()).toBe('local');
    at('http:', 'localhost', '?net=peer');
    expect(defaultLinkKind()).toBe('peer');
  });

  it('a saved local / LAN server is kept', () => {
    at('http:', '192.168.1.20');
    expect(defaultEndpoint('ws://192.168.1.20:8787/ws')).toBe('ws://192.168.1.20:8787/ws');
    at('http:', 'localhost');
    expect(defaultEndpoint('ws://localhost:8787/ws')).toBe('ws://localhost:8787/ws');
  });
});
