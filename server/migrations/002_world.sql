-- Server-only world scheduler: 10-minute regional events + shared Alpha raids.
CREATE TABLE IF NOT EXISTS world_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  region      TEXT NOT NULL,
  starts_at   INTEGER NOT NULL,
  ends_at     INTEGER NOT NULL,
  goal        INTEGER NOT NULL,
  progress    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','expired')),
  legendary   INTEGER NOT NULL DEFAULT 0,
  min_level   INTEGER NOT NULL DEFAULT 0,
  data_json   TEXT
);
CREATE INDEX IF NOT EXISTS world_events_region_time ON world_events(region, starts_at DESC);
CREATE INDEX IF NOT EXISTS world_events_status ON world_events(status, ends_at);

CREATE TABLE IF NOT EXISTS event_participants (
  event_id    TEXT NOT NULL REFERENCES world_events(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contribution INTEGER NOT NULL DEFAULT 0,
  rewarded    INTEGER NOT NULL DEFAULT 0,
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (event_id, account_id)
);

CREATE TABLE IF NOT EXISTS alpha_spawns (
  id          TEXT PRIMARY KEY,
  region      TEXT NOT NULL,
  species     TEXT NOT NULL,
  level       INTEGER NOT NULL,
  hp          INTEGER NOT NULL,
  max_hp      INTEGER NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','defeated')),
  spawned_at  INTEGER NOT NULL,
  defeated_at INTEGER,
  event_id    TEXT REFERENCES world_events(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS alpha_region_status ON alpha_spawns(region, status, spawned_at DESC);

CREATE TABLE IF NOT EXISTS alpha_contributions (
  alpha_id    TEXT NOT NULL REFERENCES alpha_spawns(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  damage      INTEGER NOT NULL DEFAULT 0,
  rewarded    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (alpha_id, account_id)
);
