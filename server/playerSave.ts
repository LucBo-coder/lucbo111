import { AdventureState } from '../src/adventure/AdventureState';
import { POKEMON } from '../src/core/data';
import { TILE_PX } from '../src/core/map/tiles';
import { defaultSave, migrate, newAdventure, SaveData } from '../src/systems/saveSchema';
import type { OwnedPokemon } from '../src/core/progression';
import type { SqlDb as Db } from './sql';

export const STARTERS = ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'eevee'] as const;

export function seedSave(starter = 'charmander', now = Date.now()): SaveData {
  if (!(STARTERS as readonly string[]).includes(starter) || !POKEMON.has(starter)) starter = 'charmander';
  const s = defaultSave();
  s.adventure = newAdventure('vietnam');
  const st = new AdventureState(s, 'adventure');
  st.adv.started = true;
  st.adv.region = 'ca-mau';
  st.adv.lastWaypoint = 'wp-ca-mau-center';
  st.adv.waypoints = ['wp-ca-mau-center'];
  st.adv.pos = { x: 72 * TILE_PX, y: 94 * TILE_PX };
  st.adv.visited = { 'ca-mau': now };
  st.addPokemon(starter, 5, 'starter');
  // A small "professor's gift" already waiting in the PC: it teaches new players the storage
  // screen and gives them a legal second Pokémon to switch to after withdrawing it.
  const gift = st.addPokemon('pidgey', 4, 'gift');
  st.depositToPc(gift.uid);
  st.addItems({
    pokeball: 20, potion: 10, 'exp-candy-xs': 8, 'exp-candy-s': 3, 'exp-candy-m': 1, 'rare-candy': 3,
  });
  st.earn(1500);
  st.ensureStorage();
  return st.save;
}

/** Re-reads the canonical save and always applies the current migration (never trusts stored version). */
export function readSave(db: Db, accountId: string): SaveData {
  const row = db.one<{ save_json: string }>('SELECT save_json FROM players WHERE account_id = ?', accountId);
  if (!row) throw new Error('PLAYER_NOT_FOUND');
  try {
    return migrate(JSON.parse(row.save_json));
  } catch {
    throw new Error('SAVE_CORRUPT');
  }
}

export function writeSave(db: Db, accountId: string, save: SaveData, touchPresence = true): void {
  const now = Date.now();
  const active = activePokemon(save);
  db.run(
    'UPDATE players SET save_json = ?, updated_at = ?, active_uid = ? WHERE account_id = ?',
    JSON.stringify(save), now, active?.uid ?? null, accountId,
  );
  if (touchPresence) {
    db.run('UPDATE players SET last_seen = ? WHERE account_id = ?', now, accountId);
  }
}

export function activePokemon(save: SaveData): OwnedPokemon | null {
  const adv = save.adventure;
  if (!adv?.activeUid) return null;
  const p = save.collection.find((c) => c.uid === adv.activeUid);
  return p ?? null;
}

export function playerLevel(save: SaveData): number {
  const levels = (save.adventure?.party ?? [])
    .map((uid) => save.collection.find((p) => p.uid === uid)?.level ?? 0)
    .filter((n) => n > 0);
  return levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 1;
}
