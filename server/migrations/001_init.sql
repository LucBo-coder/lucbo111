-- Authoritative Adventure server: accounts, sessions, canonical saves, social, moderation, audit.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  avatar      TEXT NOT NULL DEFAULT 'avatar-1',
  pass_salt   TEXT NOT NULL,
  pass_hash   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','moderator','admin')),
  banned      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  last_login  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS players (
  account_id  TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  save_json   TEXT NOT NULL,
  region      TEXT NOT NULL DEFAULT 'ca-mau',
  x           REAL NOT NULL DEFAULT 2304,
  y           REAL NOT NULL DEFAULT 3008,
  facing      REAL NOT NULL DEFAULT 0,
  active_uid  TEXT,
  moving      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  friend_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('pending','accepted','blocked')),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (account_id, friend_id)
);
CREATE INDEX IF NOT EXISTS friends_target ON friends(friend_id, status);

CREATE TABLE IF NOT EXISTS parties (
  id          TEXT PRIMARY KEY,
  leader_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id    TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (party_id, account_id)
);

CREATE TABLE IF NOT EXISTS party_invites (
  id          TEXT PRIMARY KEY,
  party_id    TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  from_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
  UNIQUE (party_id, to_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT NOT NULL,
  from_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  moderated   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chat_channel_time ON chat_messages(channel, id DESC);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed','actioned'))
);

CREATE TABLE IF NOT EXISTS idempotency (
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  action_id   TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (account_id, action_id)
);
CREATE INDEX IF NOT EXISTS idempotency_created ON idempotency(created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  TEXT,
  action      TEXT NOT NULL,
  detail_json TEXT,
  created_at  INTEGER NOT NULL,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS audit_account_time ON audit_log(account_id, id DESC);
CREATE INDEX IF NOT EXISTS audit_action_time ON audit_log(action, id DESC);
