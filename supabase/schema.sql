-- WeTrakr Relay — Schema
-- Ausführen im Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Laufende Pairing-Versuche (Device-Code-Flow, kurzlebig)
create table if not exists pairings (
  id             uuid primary key default gen_random_uuid(),
  trakt_username text not null,
  live_enabled   boolean not null default false,
  device_code    text not null,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

-- Aktive Verbindungen
create table if not exists connections (
  id               uuid primary key default gen_random_uuid(),
  trakt_username   text not null,
  wetrakr_token    text not null,
  wetrakr_username text,
  live_enabled     boolean not null default false,
  manage_token     text not null unique default encode(gen_random_bytes(24), 'hex'),
  last_watched_at  timestamptz,
  seen_ids         jsonb not null default '[]',
  watching_key     text,
  last_synced_at   timestamptz,
  last_error       text,
  created_at       timestamptz not null default now()
);

create index if not exists connections_trakt_idx on connections (trakt_username);

-- Zugriff nur über den Service-Role-Key (Server & Worker).
-- RLS an, keine Policies => anon/authenticated kommen nicht ran.
alter table pairings    enable row level security;
alter table connections enable row level security;

-- Aufräumjob für abgelaufene Pairings (optional, braucht pg_cron):
-- select cron.schedule('purge-pairings', '*/15 * * * *',
--   $$delete from pairings where expires_at < now()$$);
