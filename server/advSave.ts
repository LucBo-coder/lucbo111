import { POKEMON } from '../src/core/data';
import { MAX_LEVEL } from '../src/core/progression';
import { defaultSave, migrate, newAdventure, type SaveData } from '../src/systems/saveSchema';

// Online Vietnam Odyssey: the browser runs the whole campaign (maps, quests, battles, catching) and keeps the
// account's progress on the server. The save arrives compressed, in parts (one client frame is ≤ 16 KB), and is
// checked before it replaces the stored one: well-formed, the online campaign, real Pokémon at legal levels,
// sane wallets and sizes. (The adventure simulation itself runs in the browser, like the offline campaign.)

/** compressed + base64 save, all parts together (characters) */
export const MAX_SAVE_B64 = 400_000;
/** decompressed save JSON (characters); a Durable Object row holds up to 2 MB */
export const MAX_SAVE_JSON = 1_500_000;
export const MAX_SAVE_PARTS = 40;
export const MAX_COLLECTION = 4_000;
export const MAX_WALLET = 99_999_999;
/** region / dungeon id the client reports it is on */
export const PLACE_RE = /^[a-z0-9-]{1,48}$/;

export class SaveRejected extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** A brand-new online character: the Vietnam Odyssey campaign before the professor's starter (picked in game). */
export function freshOnlineSave(): SaveData {
  const s = defaultSave();
  s.adventure = newAdventure('vietnam');
  return s;
}

/** base64(deflate-raw(JSON)) → JSON text (Node 18+ and Workers both have DecompressionStream). */
export async function inflateSave(b64: string): Promise<string> {
  if (b64.length > MAX_SAVE_B64) throw new SaveRejected('SAVE_TOO_LARGE', 'Bản lưu quá lớn.');
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    throw new SaveRejected('SAVE_INVALID', 'Bản lưu bị hỏng.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      // a small upload must not expand into a huge one
      if (size > MAX_SAVE_JSON * 3) { await reader.cancel(); throw new SaveRejected('SAVE_TOO_LARGE', 'Bản lưu quá lớn.'); }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof SaveRejected) throw e;
    throw new SaveRejected('SAVE_INVALID', 'Bản lưu bị hỏng.');
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  const text = new TextDecoder().decode(all);
  if (text.length > MAX_SAVE_JSON) throw new SaveRejected('SAVE_TOO_LARGE', 'Bản lưu quá lớn.');
  return text;
}

const wallet = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_WALLET;

/** Parses and checks an uploaded save; returns the migrated save to store. Throws SaveRejected. */
export function checkClientSave(json: string): SaveData {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new SaveRejected('SAVE_INVALID', 'Bản lưu bị hỏng.'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SaveRejected('SAVE_INVALID', 'Bản lưu bị hỏng.');
  const save = migrate(raw);
  const adv = save.adventure;
  if (!adv || adv.campaign !== 'vietnam') throw new SaveRejected('SAVE_WRONG_MODE', 'Thế giới online chỉ lưu chiến dịch Việt Nam Odyssey.');
  if (!PLACE_RE.test(String(adv.region))) throw new SaveRejected('SAVE_INVALID', 'Vị trí trong bản lưu không hợp lệ.');
  if (!wallet(save.vnCoins) || !wallet(save.currency) || !wallet(save.survivorCoins)) throw new SaveRejected('SAVE_INVALID', 'Số tiền không hợp lệ.');
  if (save.collection.length > MAX_COLLECTION) throw new SaveRejected('SAVE_INVALID', 'Quá nhiều Pokémon.');
  const uids = new Set<string>();
  for (const p of save.collection) {
    if (!p || typeof p.uid !== 'string' || uids.has(p.uid)) throw new SaveRejected('SAVE_INVALID', 'Danh sách Pokémon không hợp lệ.');
    uids.add(p.uid);
    if (!POKEMON.has(p.species)) throw new SaveRejected('SAVE_INVALID', `Pokémon không tồn tại: ${String(p.species).slice(0, 30)}.`);
    if (!Number.isInteger(p.level) || p.level < 1 || p.level > MAX_LEVEL) throw new SaveRejected('SAVE_INVALID', 'Cấp Pokémon không hợp lệ.');
  }
  for (const uid of adv.party) if (!uids.has(uid)) throw new SaveRejected('SAVE_INVALID', 'Đội hình không hợp lệ.');
  for (const [id, n] of Object.entries(save.inventory ?? {})) {
    if (!(typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 99_999) || id.length > 60) throw new SaveRejected('SAVE_INVALID', 'Túi đồ không hợp lệ.');
  }
  return save;
}
