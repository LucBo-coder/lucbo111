-- Account recovery without e-mail: a one-time recovery code shown at registration (only its scrypt hash is stored).
-- Using it resets the password, revokes every session and issues a new code.
ALTER TABLE accounts ADD COLUMN recovery_salt TEXT;
ALTER TABLE accounts ADD COLUMN recovery_hash TEXT;
ALTER TABLE accounts ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0;
