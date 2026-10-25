// Address of the Cloudflare backend (Workers + Durable Objects): PvP / co-op rooms on `/room/<CODE>`, the online world
// on `/ws`. Priority: `?cloud=<wss url>` (tests, trying another server) > build-time VITE_CLOUD_URL > the deployed default.

/** The deployed Worker (Documents/Pokemon-Cloudflare/pokemon-server). Empty = no cloud backend (rooms use WebRTC). */
export const CLOUD_URL_DEFAULT = 'wss://pokemon-server.pokemon-server.workers.dev';

export function cloudBase(): string {
  let raw = '';
  try { raw = new URLSearchParams(location.search).get('cloud') ?? ''; } catch { /* no location (tests) */ }
  raw ||= (import.meta.env?.VITE_CLOUD_URL as string | undefined) ?? '';
  raw ||= CLOUD_URL_DEFAULT;
  return raw.trim().replace(/\/+$/, '');
}
