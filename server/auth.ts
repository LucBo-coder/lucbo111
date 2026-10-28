import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { SaveData } from '../src/systems/saveSchema';
import type { ServerAccount } from '../src/net/serverProtocol';
import type { SqlDb as Db } from './sql';
import { activePokemon, readSave, seedSave } from './playerSave';

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export class AuthError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** Async on purpose: scrypt is slow and must not freeze the game server for every other player. */
async function hashPassword(password: string, salt: string): Promise<string> {
  return (await scryptAsync(password, salt, SCRYPT_KEYLEN)).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cleanName(raw: string): string {
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
  return s || 'Huấn luyện viên';
}

export interface AuthResult {
  token: string;
  account: ServerAccount;
  save: SaveData;
  /** only on register / recovery / regeneration: shown once, never stored in clear */
  recoveryCode?: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 16 random symbols (80 bits) in 4 groups, e.g. "K7QM-2ZPA-…"; ambiguous characters left out. */
function newRecoveryCode(): string {
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

function normalizeCode(raw: string): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

interface PreparedRecovery { code: string; salt: string; hash: string }

/** Hashes a new recovery code before the database transaction opens (the transaction itself is synchronous). */
async function prepareRecovery(): Promise<PreparedRecovery> {
  const code = newRecoveryCode();
  const salt = randomBytes(16).toString('hex');
  return { code, salt, hash: await hashPassword(normalizeCode(code), salt) };
}

function storeRecovery(db: Db, accountId: string, rec: PreparedRecovery): string {
  db.run('UPDATE accounts SET recovery_salt = ?, recovery_hash = ? WHERE id = ?', rec.salt, rec.hash, accountId);
  return rec.code;
}

function checkPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new AuthError('BAD_PASSWORD', 'Mật khẩu phải từ 6 đến 128 ký tự.');
  }
}

async function matches(hashHex: string, secret: string, salt: string): Promise<boolean> {
  const expected = Buffer.from(hashHex, 'hex');
  const actual = Buffer.from(await hashPassword(secret, salt), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

interface AccountRow {
  id: string; username: string; display_name: string; avatar: string; pass_salt: string; pass_hash: string;
  role: ServerAccount['role']; banned: number;
}

function view(row: AccountRow): ServerAccount {
  return {
    id: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar,
    role: row.role, banned: !!row.banned,
  };
}

function createSession(db: Db, accountId: string, ip?: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.run(
    'INSERT INTO sessions (token_hash, account_id, created_at, expires_at, last_seen, ip) VALUES (?, ?, ?, ?, ?, ?)',
    hashToken(token), accountId, now, now + SESSION_TTL_MS, now, ip ?? null,
  );
  return token;
}

export async function register(db: Db, username: string, password: string, displayName?: string, starter?: string, ip?: string): Promise<AuthResult> {
  const user = String(username ?? '').trim();
  if (!USERNAME_RE.test(user)) throw new AuthError('BAD_USERNAME', 'Tên đăng nhập 3–20 ký tự: chữ, số, dấu _.');
  checkPassword(password);
  const id = randomUUID();
  const salt = randomBytes(16).toString('hex');
  const now = Date.now();
  const save = seedSave(starter, now);
  const active = activePokemon(save);
  const pos = save.adventure?.pos ?? { x: 2304, y: 3008 };
  const passHash = await hashPassword(password, salt);
  const recovery = await prepareRecovery();
  const token = db.tx(() => {
    // checked inside the transaction: two registrations of the same name cannot both pass
    if (db.one('SELECT 1 AS x FROM accounts WHERE username = ?', user)) {
      throw new AuthError('USERNAME_TAKEN', 'Tên đăng nhập đã có người dùng.');
    }
    db.run(
      'INSERT INTO accounts (id, username, display_name, avatar, pass_salt, pass_hash, role, banned, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
      id, user, cleanName(displayName || user), 'avatar-1', salt, passHash, 'player', now, now,
    );
    db.run(
      'INSERT INTO players (account_id, save_json, region, x, y, facing, active_uid, updated_at, last_seen) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
      id, JSON.stringify(save), 'ca-mau', pos.x, pos.y, active?.uid ?? null, now, now,
    );
    db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at, ip) VALUES (?, ?, ?, ?, ?)',
      id, 'account.register', JSON.stringify({ username: user, starter: starter ?? 'charmander' }), now, ip ?? null);
    return { session: createSession(db, id, ip), code: storeRecovery(db, id, recovery) };
  });
  const row = db.one<AccountRow>('SELECT * FROM accounts WHERE id = ?', id)!;
  return { token: token.session, account: view(row), save, recoveryCode: token.code };
}

export async function login(db: Db, username: string, password: string, ip?: string): Promise<AuthResult> {
  const user = String(username ?? '').trim();
  const row = db.one<AccountRow>('SELECT * FROM accounts WHERE username = ?', user);
  if (!row) throw new AuthError('BAD_CREDENTIALS', 'Sai tên đăng nhập hoặc mật khẩu.');
  if (row.banned) throw new AuthError('BANNED', 'Tài khoản đã bị khóa.');
  if (!(await matches(row.pass_hash, String(password ?? ''), row.pass_salt))) {
    throw new AuthError('BAD_CREDENTIALS', 'Sai tên đăng nhập hoặc mật khẩu.');
  }
  const now = Date.now();
  db.run('UPDATE accounts SET last_login = ? WHERE id = ?', now, row.id);
  db.run('INSERT INTO audit_log (account_id, action, created_at, ip) VALUES (?, ?, ?, ?)', row.id, 'account.login', now, ip ?? null);
  const token = db.tx(() => createSession(db, row.id, ip));
  return { token, account: view(row), save: readSave(db, row.id) };
}

export function resume(db: Db, token: string): AuthResult {
  const hash = hashToken(String(token ?? ''));
  const row = db.one<AccountRow & { expires_at: number; session_account: string }>(
    `SELECT a.*, s.expires_at, s.account_id AS session_account
       FROM sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = ?`, hash,
  );
  if (!row) throw new AuthError('BAD_TOKEN', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  if (row.expires_at < Date.now()) {
    db.run('DELETE FROM sessions WHERE token_hash = ?', hash);
    throw new AuthError('EXPIRED_TOKEN', 'Phiên đăng nhập đã hết hạn.');
  }
  if (row.banned) throw new AuthError('BANNED', 'Tài khoản đã bị khóa.');
  db.run('UPDATE sessions SET last_seen = ? WHERE token_hash = ?', Date.now(), hash);
  return { token, account: view(row), save: readSave(db, row.id) };
}

export function logout(db: Db, token: string): void {
  db.run('DELETE FROM sessions WHERE token_hash = ?', hashToken(String(token ?? '')));
}

export function purgeExpiredSessions(db: Db): number {
  return db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now()).changes;
}

/** Forgotten password: the recovery code resets it, revokes every session and is replaced by a new code. */
export async function recover(db: Db, username: string, code: string, newPassword: string, ip?: string): Promise<AuthResult> {
  checkPassword(newPassword);
  const row = db.one<AccountRow & { recovery_salt: string | null; recovery_hash: string | null }>('SELECT * FROM accounts WHERE username = ?', String(username ?? '').trim());
  if (!row || !row.recovery_hash || !row.recovery_salt || !(await matches(row.recovery_hash, normalizeCode(code), row.recovery_salt))) {
    throw new AuthError('BAD_RECOVERY', 'Tên đăng nhập hoặc mã khôi phục không đúng.');
  }
  if (row.banned) throw new AuthError('BANNED', 'Tài khoản đã bị khóa.');
  const now = Date.now();
  const salt = randomBytes(16).toString('hex');
  const passHash = await hashPassword(newPassword, salt);
  const recovery = await prepareRecovery();
  const out = db.tx(() => {
    db.run('UPDATE accounts SET pass_salt = ?, pass_hash = ?, password_changed_at = ?, last_login = ? WHERE id = ?', salt, passHash, now, now, row.id);
    db.run('DELETE FROM sessions WHERE account_id = ?', row.id);
    db.run('INSERT INTO audit_log (account_id, action, created_at, ip) VALUES (?, ?, ?, ?)', row.id, 'account.recover', now, ip ?? null);
    return { session: createSession(db, row.id, ip), code: storeRecovery(db, row.id, recovery) };
  });
  return { token: out.session, account: view(row), save: readSave(db, row.id), recoveryCode: out.code };
}

/** Logged-in password change: needs the current password; other sessions are signed out. */
export async function changePassword(db: Db, accountId: string, keepToken: string, oldPassword: string, newPassword: string): Promise<void> {
  checkPassword(newPassword);
  const row = db.one<AccountRow>('SELECT * FROM accounts WHERE id = ?', accountId);
  if (!row || !(await matches(row.pass_hash, String(oldPassword ?? ''), row.pass_salt))) throw new AuthError('BAD_CREDENTIALS', 'Mật khẩu hiện tại không đúng.');
  const salt = randomBytes(16).toString('hex');
  const now = Date.now();
  const passHash = await hashPassword(newPassword, salt);
  db.tx(() => {
    db.run('UPDATE accounts SET pass_salt = ?, pass_hash = ?, password_changed_at = ? WHERE id = ?', salt, passHash, now, accountId);
    db.run('DELETE FROM sessions WHERE account_id = ? AND token_hash <> ?', accountId, hashToken(keepToken));
    db.run('INSERT INTO audit_log (account_id, action, created_at) VALUES (?, ?, ?)', accountId, 'account.password', now);
  });
}

/** New recovery code (old one stops working); requires the current password. */
export async function regenerateRecovery(db: Db, accountId: string, password: string): Promise<string> {
  const row = db.one<AccountRow>('SELECT * FROM accounts WHERE id = ?', accountId);
  if (!row || !(await matches(row.pass_hash, String(password ?? ''), row.pass_salt))) throw new AuthError('BAD_CREDENTIALS', 'Mật khẩu hiện tại không đúng.');
  const recovery = await prepareRecovery();
  db.run('INSERT INTO audit_log (account_id, action, created_at) VALUES (?, ?, ?)', accountId, 'account.recovery_code', Date.now());
  return storeRecovery(db, accountId, recovery);
}

export function logoutAll(db: Db, accountId: string): void {
  db.run('DELETE FROM sessions WHERE account_id = ?', accountId);
}
