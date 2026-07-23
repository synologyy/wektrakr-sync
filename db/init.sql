-- WeTrakr Relay — schema (plain Postgres, runs on first DB init)

create extension if not exists pgcrypto;

-- Short-lived pairing attempts (device-code flow)
create table if not exists pairings (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null default 'trakt',   -- 'trakt' | 'nuvio' | 'stremio'
  trakt_username      text,
  nuvio_refresh_token text,
  nuvio_profile_id    integer,
  stremio_auth_key    text,
  live_enabled        boolean not null default false,
  device_code         text not null,
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now()
);

-- Active connections
create table if not exists connections (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null default 'trakt',   -- 'trakt' | 'nuvio' | 'stremio'
  trakt_username      text,
  nuvio_refresh_token text,
  nuvio_profile_id    integer,
  stremio_auth_key    text,
  wetrakr_token       text not null,
  wetrakr_username    text,
  live_enabled        boolean not null default false,
  manage_token        text not null unique default encode(gen_random_bytes(24), 'hex'),
  last_watched_at     timestamptz,
  seen_ids            jsonb not null default '[]',
  watching_key        text,
  last_synced_at      timestamptz,
  last_error          text,
  created_at          timestamptz not null default now()
);

create index if not exists connections_trakt_idx on connections (trakt_username);
create index if not exists connections_source_idx on connections (source);
