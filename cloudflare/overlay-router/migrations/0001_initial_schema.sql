PRAGMA foreign_keys = ON;

CREATE TABLE claims (
  username_key TEXT PRIMARY KEY,
  display_username TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  route_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'cooldown')),
  claimed_at TEXT NOT NULL,
  release_requested_at TEXT,
  reusable_after TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (state = 'active' AND release_requested_at IS NULL AND reusable_after IS NULL)
    OR
    (state = 'cooldown' AND release_requested_at IS NOT NULL AND reusable_after IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_claims_route_key
  ON claims(route_key);
CREATE INDEX idx_claims_active
  ON claims(clerk_user_id, username_key)
  WHERE state = 'active';

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL CHECK (
    length(token_hash) = 64
    AND token_hash = lower(token_hash)
    AND token_hash NOT GLOB '*[^0-9a-f]*'
  ),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX idx_devices_owner
  ON devices(clerk_user_id, revoked_at, device_id);

CREATE TABLE account_leases (
  clerk_user_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  tunnel_origin TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

CREATE INDEX idx_account_leases_unexpired
  ON account_leases(expires_at, clerk_user_id);

CREATE TABLE audit_events (
  event_id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  actor_clerk_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  username_key TEXT,
  device_id TEXT,
  result_code TEXT NOT NULL,
  cf_ray_id TEXT
);

CREATE INDEX idx_audit_events_pruning
  ON audit_events(occurred_at, event_id);

CREATE TABLE rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  action TEXT NOT NULL,
  counter INTEGER NOT NULL CHECK (counter >= 1),
  window_started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_rate_limit_buckets_expiry
  ON rate_limit_buckets(expires_at, bucket_key);
