-- Server-side session revocation. Each session JWT embeds the user's current
-- token_version; getSession() rejects any cookie whose tv no longer matches
-- (logout bumps it) or whose user row is gone (account deletion). This closes
-- the gap where a signed session cookie stayed valid after logout/deletion.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
