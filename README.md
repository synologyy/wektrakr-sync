# WeTrakr Relay

Mirror your **Trakt** watch history (and an optional live *now playing* status)
into **WeTrakr** — for every player, even the ones that can't talk to WeTrakr
directly.

## Why this exists

Trakt allows only a single connected community app on free accounts, and some
players (e.g. **Nuvio**, **Fusion**) can scrobble to Trakt but have **no WeTrakr
integration** at all. Relay reads your **public Trakt profile** — no matter which
player produced the history — and forwards new movies/episodes to your WeTrakr
account. Nothing gets installed on the player, and it doesn't consume your one
Trakt connection slot.

```
Players (Plex / Nuvio / Fusion / …) ──> Trakt (public profile) ──> Relay worker ──> WeTrakr
```

## Architecture

Fully self-contained — `docker compose up` needs no external accounts:

| Service  | Role                                                            |
|----------|----------------------------------------------------------------|
| `db`     | Postgres — schema created on first boot from `db/init.sql`      |
| `web`    | Next.js — landing page, pairing wizard, manage page            |
| `worker` | Python — syncs Trakt → WeTrakr every 5 min (live: every 1 min) |

`web` and `worker` talk to Postgres directly (no ORM, no external API layer).
Only two things are stored per user: the (public) Trakt username and the WeTrakr
scrobble token. No login, no password — each connection gets a random manage link.

## Quick start

```bash
cp .env.example .env
# edit .env and set TRAKT_CLIENT_ID (from https://trakt.tv/oauth/applications)

docker compose up -d --build
```

Then open `http://<server-ip>:8088` and run the wizard:
Trakt username → confirm the WeTrakr code → done.

### Deploy on a Hetzner Cloud server

```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/synologyy/wektrakr-sync.git
cd wektrakr-sync
cp .env.example .env && nano .env      # set TRAKT_CLIENT_ID (+ POSTGRES_PASSWORD, APP_URL)
docker compose up -d --build
```

Point your reverse proxy (Pangolin/newt, nginx, Caddy) at port `8088`.

## Configuration (`.env`)

| Variable            | Required | Notes                                                            |
|---------------------|----------|------------------------------------------------------------------|
| `TRAKT_CLIENT_ID`   | ✅       | One Trakt API app for the whole service (reads public profiles)  |
| `POSTGRES_PASSWORD` |          | Password for the bundled Postgres                                |
| `APP_URL`           |          | Public URL for the manage link; blank = auto-detect from browser |
| `WEB_PORT`          |          | Host port for the UI (default `8088`)                            |
| `WETRAKR_API_URL`   |          | WeTrakr API base (unofficial, default `https://api.wetrakr.com`) |

## Notes

- **Unofficial WeTrakr endpoints.** Relay speaks the same device-pairing and
  webhook endpoints as the open-source WeTrakr Kodi add-on. They may change.
- **Public Trakt profile required.** Relay uses only Trakt's documented public
  API (no OAuth), so the profile must be public.
- **Timestamps.** The scrobble endpoint doesn't accept `watched_at`, so Relay
  only forwards new activity (from connection time). Use WeTrakr's own Trakt
  import for your back catalog.
