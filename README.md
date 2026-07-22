# WeTrakr Relay

Mirror your watch history (and, for Trakt, an optional live *now playing*
status) into **WeTrakr** — from **Trakt** or **Nuvio**, for every player, even
the ones that can't talk to WeTrakr directly.

## Why this exists

Trakt allows only a single connected community app on free accounts, and some
players (e.g. **Nuvio**, **Fusion**) can't connect to WeTrakr at all. Relay
reads your history from a source you already use and forwards new
movies/episodes to your WeTrakr account. Nothing gets installed on the player.

```
Fusion ─▶ Trakt (public profile) ─┐
                                  ├─▶ Relay worker ─▶ WeTrakr
Nuvio  ─▶ Nuvio Sync (your login) ┘
```

## Sources

| Source    | How it reads                                   | Auth stored              | Live now-playing |
|-----------|------------------------------------------------|--------------------------|------------------|
| **Trakt** | your **public** Trakt profile (no OAuth slot)  | just the username        | ✅ optional      |
| **Nuvio** | Nuvio Sync API (`sync_pull_watched_items`)     | a Nuvio **refresh token**| — (history only) |

The user picks the source in the wizard. For Nuvio they sign in (email +
password); the password is used only to obtain a token and is never stored.

## Architecture

Fully self-contained — `docker compose up` needs no external accounts:

| Service  | Role                                                            |
|----------|----------------------------------------------------------------|
| `db`     | Postgres — schema created on first boot from `db/init.sql`      |
| `web`    | Next.js — landing page, pairing wizard, manage page            |
| `worker` | Python — syncs each connection to WeTrakr every 5 min          |

`web` and `worker` talk to Postgres directly. Per connection we store the
source, the WeTrakr scrobble token, and (for Nuvio) a refresh token. No login,
no passwords — each connection gets a random manage link.

## Quick start

```bash
cp .env.example .env
# edit .env and set TRAKT_CLIENT_ID (from https://trakt.tv/oauth/applications)

docker compose up -d --build
```

Then open `http://<server-ip>:8088` and run the wizard.

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

Nuvio uses the public Nuvio API (`https://api.nuvio.tv`) with the documented
publishable key; override via `NUVIO_PUBLISHABLE_KEY` if needed.

## Notes

- **Unofficial WeTrakr endpoints.** Relay speaks the same device-pairing and
  webhook endpoints as the open-source WeTrakr Kodi add-on. They may change.
- **Public Trakt profile required** for the Trakt source (no OAuth).
- **Timestamps.** The scrobble endpoint doesn't accept `watched_at`, so Relay
  only forwards new activity. Use WeTrakr's own import for your back catalog.
