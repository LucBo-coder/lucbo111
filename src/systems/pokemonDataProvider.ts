import cache from '../data/pokeapi/pokeapi-cache.json';
import fakemon from '../data/fakemon.json';

// PokemonDataProvider — read-through access to PokéAPI data.
// Order: in-memory → bundled build-time cache (src/data/pokeapi) → IndexedDB runtime cache → network.
// The network is ONLY used when explicitly asked (e.g. "refresh from PokéAPI" in the Pokédex),
// never per frame or per attack. Every network call has a timeout, retries with backoff,
// validation + normalisation, and falls back to cached data on failure.

export interface SpeciesData {
  id: number;
  name: string;
  displayName: string;
  genus: string;
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  abilities: { name: string; hidden: boolean }[];
  heightDm: number;
  weightHg: number;
  baseExperience: number;
  captureRate: number;
  growthRate: string;
  habitat: string | null;
  flavorText: string;
  evolutions: { from: string; to: string; trigger: string; minLevel: number | null; item: string | null }[];
  levelUpMoves: { move: string; level: number }[];
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ProviderOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  baseUrl?: string;
  /** Runtime cache (IndexedDB in the browser; in-memory map in tests) */
  store?: { get(k: string): Promise<SpeciesData | undefined>; set(k: string, v: SpeciesData): Promise<void> };
  sleep?: (ms: number) => Promise<void>;
}

export class ProviderError extends Error {}

const BUNDLED: Record<string, SpeciesData> = { ...(cache as unknown as { species: Record<string, SpeciesData> }).species, ...(fakemon as unknown as Record<string, SpeciesData>) };

export function validateSpecies(d: unknown): d is SpeciesData {
  const s = d as SpeciesData;
  return !!s && typeof s.id === 'number' && typeof s.name === 'string' && Array.isArray(s.types) && s.types.length >= 1 && s.types.length <= 2 &&
    !!s.baseStats && ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].every((k) => Number.isFinite((s.baseStats as Record<string, number>)[k])) &&
    s.captureRate >= 1 && s.captureRate <= 255;
}

/** Normalises raw /pokemon + /pokemon-species responses into SpeciesData (same shape as the build script). */
export function normalizeSpecies(p: Record<string, any>, s: Record<string, any>): SpeciesData { // eslint-disable-line @typescript-eslint/no-explicit-any
  const stat = (n: string) => p.stats.find((x: { stat: { name: string } }) => x.stat.name === n)?.base_stat;
  const en = (arr: { language: { name: string } }[] | undefined, key: string) => (arr?.find((x) => x.language.name === 'en') as Record<string, string> | undefined)?.[key];
  return {
    id: p.id, name: p.name, displayName: en(s.names, 'name') ?? p.name, genus: en(s.genera, 'genus') ?? '',
    types: [...p.types].sort((a: { slot: number }, b: { slot: number }) => a.slot - b.slot).map((t: { type: { name: string } }) => t.type.name),
    baseStats: { hp: stat('hp'), atk: stat('attack'), def: stat('defense'), spa: stat('special-attack'), spd: stat('special-defense'), spe: stat('speed') },
    abilities: p.abilities.map((a: { ability: { name: string }; is_hidden: boolean }) => ({ name: a.ability.name, hidden: a.is_hidden })),
    heightDm: p.height, weightHg: p.weight, baseExperience: p.base_experience, captureRate: s.capture_rate,
    growthRate: s.growth_rate?.name ?? 'medium', habitat: s.habitat?.name ?? null,
    flavorText: String(en(s.flavor_text_entries, 'flavor_text') ?? '').replace(/\s+/g, ' ').trim(),
    evolutions: [], levelUpMoves: [],
  };
}

export class PokemonDataProvider {
  private mem = new Map<string, SpeciesData>();
  private o: Required<Omit<ProviderOptions, 'store'>> & { store?: ProviderOptions['store'] };

  constructor(opts: ProviderOptions = {}) {
    this.o = {
      fetch: opts.fetch ?? ((u, i) => fetch(u, i)),
      timeoutMs: opts.timeoutMs ?? 8000,
      retries: opts.retries ?? 2,
      baseUrl: opts.baseUrl ?? 'https://pokeapi.co/api/v2',
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      store: opts.store,
    };
  }

  /** Synchronous access to bundled data (used everywhere in gameplay). */
  local(name: string): SpeciesData | undefined {
    return this.mem.get(name) ?? BUNDLED[name];
  }

  /** Cached-first lookup; only hits the network when nothing is cached. */
  async get(name: string): Promise<SpeciesData | undefined> {
    const local = this.local(name);
    if (local) return local;
    const stored = await this.o.store?.get(name);
    if (stored) { this.mem.set(name, stored); return stored; }
    try {
      return await this.refresh(name);
    } catch {
      return undefined;
    }
  }

  /** Forces a network fetch (explicit user action). Falls back to the cached copy on failure. */
  async refresh(name: string): Promise<SpeciesData> {
    try {
      const p = (await this.fetchJson(`${this.o.baseUrl}/pokemon/${name}`)) as Record<string, unknown>;
      const s = (await this.fetchJson(`${this.o.baseUrl}/pokemon-species/${name}`)) as Record<string, unknown>;
      const prev = this.local(name);
      const n = normalizeSpecies(p, s);
      // keep build-time-only fields (evolution chain, learnset) if the quick refresh doesn't include them
      if (prev) { n.evolutions = prev.evolutions; n.levelUpMoves = prev.levelUpMoves; }
      if (!validateSpecies(n)) throw new ProviderError(`invalid data for ${name}`);
      this.mem.set(name, n);
      await this.o.store?.set(name, n);
      return n;
    } catch (e) {
      const fallback = this.local(name) ?? (await this.o.store?.get(name));
      if (fallback) return fallback;
      throw e instanceof ProviderError ? e : new ProviderError(String((e as Error)?.message ?? e));
    }
  }

  private async fetchJson(url: string): Promise<unknown> {
    let last: unknown;
    for (let attempt = 0; attempt <= this.o.retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.o.timeoutMs);
      try {
        const res = await Promise.race([
          this.o.fetch(url, { signal: ctrl.signal }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new ProviderError('timeout')), this.o.timeoutMs)),
        ]);
        if (!res.ok) throw new ProviderError(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        last = e;
        if (attempt < this.o.retries) await this.o.sleep(300 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw last;
  }
}

/** Browser IndexedDB store for refreshed species (separate DB from the save file). */
export function idbSpeciesStore(): ProviderOptions['store'] {
  const open = () => new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('pokeapi-cache', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('species');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return {
    async get(k) {
      try {
        const db = await open();
        return await new Promise((res) => {
          const q = db.transaction('species').objectStore('species').get(k);
          q.onsuccess = () => res(q.result as SpeciesData | undefined);
          q.onerror = () => res(undefined);
        });
      } catch { return undefined; }
    },
    async set(k, v) {
      try {
        const db = await open();
        await new Promise<void>((res) => {
          const tx = db.transaction('species', 'readwrite');
          tx.objectStore('species').put(v, k);
          tx.oncomplete = () => res();
          tx.onerror = () => res();
        });
      } catch { /* ignore: cache is best-effort */ }
    },
  };
}

export const pokemonData = new PokemonDataProvider(typeof indexedDB !== 'undefined' ? { store: idbSpeciesStore() } : {});
