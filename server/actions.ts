import { AdventureState } from '../src/adventure/AdventureState';
import type { ActionType, ServerMsg } from '../src/net/serverProtocol';
import type { Db } from './db';
import { readSave, writeSave } from './playerSave';

// Everything that changes a player's canonical save goes through here:
//   token/ownership checks → shared pure game logic → one SQLite transaction → idempotency + audit log.
// The client never sends EXP, levels, damage, prices or inventory counts it computed itself.

export class ActionError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export interface ActionResult {
  save: Record<string, unknown>;
  result?: Record<string, unknown>;
}

const ACTION_RE = /^[A-Za-z0-9_-]{6,80}$/;

function str(data: Record<string, unknown> | undefined, key: string, max = 64): string {
  const v = data?.[key];
  if (typeof v !== 'string' || !v || v.length > max) throw new ActionError('BAD_INPUT', `Thiếu hoặc sai trường ${key}.`);
  return v;
}

function int(data: Record<string, unknown> | undefined, key: string, min: number, max: number): number {
  const v = Number(data?.[key]);
  if (!Number.isFinite(v) || Math.floor(v) !== v || v < min || v > max) throw new ActionError('BAD_INPUT', `Trường ${key} không hợp lệ.`);
  return v;
}

function optStr(data: Record<string, unknown> | undefined, key: string, max = 64): string | undefined {
  const v = data?.[key];
  if (v == null) return undefined;
  if (typeof v !== 'string' || v.length > max) throw new ActionError('BAD_INPUT', `Trường ${key} không hợp lệ.`);
  return v;
}

function apply(st: AdventureState, type: ActionType, data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  switch (type) {
    case 'party.setActive':
    case 'party.switch': {
      const uid = str(data, 'uid');
      if (!st.setActive(uid)) throw new ActionError('CANNOT_ACTIVATE', 'Pokémon không có trong đội hoặc đã gục.');
      return { activeUid: st.activeUid };
    }
    case 'party.recall': {
      if (!st.recallActive()) throw new ActionError('NO_ACTIVE', 'Không có Pokémon nào đang ở ngoài bóng.');
      return { activeUid: null };
    }
    case 'party.deposit': {
      const uid = str(data, 'uid');
      if (!st.depositToPc(uid)) throw new ActionError('CANNOT_DEPOSIT', 'Không thể gửi Pokémon này vào PC (đội phải còn ít nhất 1, hoặc PC đầy).');
      return { activeUid: st.activeUid, pc: st.pcLocation(uid) };
    }
    case 'party.withdraw': {
      const uid = str(data, 'uid');
      if (!st.withdrawFromPc(uid)) throw new ActionError('CANNOT_WITHDRAW', 'Đội đã đủ 6 hoặc Pokémon không ở trong PC.');
      return { activeUid: st.activeUid };
    }
    case 'pc.move': {
      const uid = str(data, 'uid');
      const box = int(data, 'box', 0, 63), slot = int(data, 'slot', 0, 59);
      if (!st.moveInPc(uid, box, slot)) throw new ActionError('CANNOT_MOVE', 'Ô đích không hợp lệ.');
      return { location: st.pcLocation(uid) };
    }
    case 'pc.favorite': {
      const uid = str(data, 'uid');
      if (!st.setFavorite(uid, !!data?.favorite)) throw new ActionError('NOT_FOUND', 'Không sở hữu Pokémon này.');
      return { favorite: !!data?.favorite };
    }
    case 'pc.rename': {
      const uid = str(data, 'uid');
      if (!st.renamePokemon(uid, optStr(data, 'nickname', 20) ?? '')) throw new ActionError('NOT_FOUND', 'Không sở hữu Pokémon này.');
      return { nickname: st.owned(uid)?.nickname ?? null };
    }
    case 'pc.boxName': {
      const box = int(data, 'box', 0, 63);
      const name = str(data, 'name', 24);
      if (!st.renameBox(box, name)) throw new ActionError('BAD_INPUT', 'Tên box không hợp lệ.');
      return { name: st.pc.boxes[box].name };
    }
    case 'pc.sort': {
      const box = int(data, 'box', 0, 63);
      const mode = str(data, 'mode', 16) as 'level' | 'name' | 'recent' | 'favorite';
      if (!['level', 'name', 'recent', 'favorite'].includes(mode)) throw new ActionError('BAD_INPUT', 'Kiểu sắp xếp không hợp lệ.');
      if (!st.sortPc(box, mode)) throw new ActionError('CANNOT_SORT', 'Box trống hoặc không tồn tại.');
      return { mode };
    }
    case 'candy.use': {
      const uid = str(data, 'uid');
      const candy = str(data, 'candy', 32);
      const qty = int(data, 'qty', 1, 999);
      const out = st.useCandy(uid, candy, qty);
      if (out.used <= 0) throw new ActionError('CANDY_NO_EFFECT', 'Không thể dùng kẹo này cho Pokémon đó (hết kẹo, Lv100 hoặc EXP đã tối đa).');
      return { ...out };
    }
    case 'pokemon.evolve': {
      // Only level-up evolutions the rule engine offers right now (e.g. after candy). Stones go through the bag.
      const uid = str(data, 'uid');
      const to = str(data, 'to', 40);
      if (!st.owned(uid)) throw new ActionError('NOT_FOUND', 'Không sở hữu Pokémon này.');
      if (!st.pendingEvolutions(uid).includes(to) || !st.evolve(uid, to)) throw new ActionError('CANNOT_EVOLVE', 'Pokémon chưa đủ điều kiện tiến hóa thành loài này.');
      return { species: to };
    }
    case 'pokemon.declineEvolution': {
      const uid = str(data, 'uid');
      if (!st.owned(uid)) throw new ActionError('NOT_FOUND', 'Không sở hữu Pokémon này.');
      st.declineEvolution(uid);
      return { declined: true };
    }
    case 'player.import':
      throw new ActionError('IMPORT_DISABLED', 'Máy chủ đã có dữ liệu; hãy dùng lệnh chuyển dữ liệu có xác nhận.');
    default:
      throw new ActionError('UNKNOWN_ACTION', 'Hành động không được hỗ trợ.');
  }
}

/** A replayed actionId returns its stored response without re-running (or re-checking cooldowns). */
export function hasCachedAction(db: Db, accountId: string, actionId: string): boolean {
  return !!db.one('SELECT 1 AS x FROM idempotency WHERE account_id = ? AND action_id = ?', accountId, actionId);
}

export function performAction(db: Db, accountId: string, actionId: string, type: ActionType, data: Record<string, unknown> | undefined): ActionResult {
  if (!ACTION_RE.test(actionId)) throw new ActionError('BAD_ACTION_ID', 'actionId không hợp lệ (6–80 ký tự).');
  const cached = db.one<{ response_json: string }>(
    'SELECT response_json FROM idempotency WHERE account_id = ? AND action_id = ?', accountId, actionId,
  );
  if (cached) return JSON.parse(cached.response_json) as ActionResult;

  return db.tx(() => {
    const save = readSave(db, accountId);
    const st = new AdventureState(save);
    const result = apply(st, type, data);
    st.ensureStorage();
    const out: ActionResult = { save: st.save as unknown as Record<string, unknown>, result };
    writeSave(db, accountId, st.save);
    const now = Date.now();
    db.run(
      'INSERT INTO idempotency (account_id, action_id, response_json, created_at) VALUES (?, ?, ?, ?)',
      accountId, actionId, JSON.stringify(out), now,
    );
    db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
      accountId, 'action.' + type, JSON.stringify({ actionId, data, result }), now);
    // keep the idempotency table bounded
    db.run('DELETE FROM idempotency WHERE created_at < ?', now - 24 * 60 * 60 * 1000);
    return out;
  });
}

export function actionErrorMsg(actionId: string, e: unknown): ServerMsg {
  if (e instanceof ActionError) return { t: 'actionError', actionId, ok: false, code: e.code, message: e.message };
  return { t: 'actionError', actionId, ok: false, code: 'SERVER_ERROR', message: 'Máy chủ không xử lý được hành động.' };
}
