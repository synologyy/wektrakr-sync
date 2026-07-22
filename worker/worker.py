#!/usr/bin/env python3
"""
WeTrakr Relay — Sync-Worker
===========================

Läuft dauerhaft auf eigener Hardware (Docker). Holt alle Verbindungen aus
Supabase und synct pro Verbindung:

  - Watch-History (öffentliches Trakt-Profil -> WeTrakr scrobble), alle
    HISTORY_INTERVAL Sekunden
  - Now Playing (öffentlicher /watching-Endpoint -> WeTrakr playing), alle
    WATCH_INTERVAL Sekunden, nur für Verbindungen mit live_enabled

Kein Trakt-OAuth: gelesen werden ausschließlich öffentliche Profile über
die Client-ID. Der WeTrakr-Teil nutzt den inoffiziellen Kodi-Webhook
(siehe github.com/wetrakr/wetrakr-kodi) — kann sich jederzeit ändern.
"""

import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone

import requests

TRAKT_BASE = "https://api.trakt.tv"
WETRAKR_BASE = os.environ.get("WETRAKR_API_URL", "https://api.wetrakr.com")
TRAKT_CLIENT_ID = os.environ["TRAKT_CLIENT_ID"]

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HISTORY_INTERVAL = int(os.environ.get("HISTORY_INTERVAL", "300"))
WATCH_INTERVAL = int(os.environ.get("WATCH_INTERVAL", "60"))
SEND_DELAY = float(os.environ.get("SEND_DELAY", "0.5"))
SEEN_CAP = 500
USER_AGENT = "WeTrakr-Kodi/1.1.9"

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("relay")


# ─── Supabase (PostgREST) ─────────────────────────────────────────

def sb_headers(extra=None):
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def fetch_connections():
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/connections",
        headers=sb_headers(),
        params={"select": "*", "order": "created_at.asc"},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


def update_connection(conn_id, patch):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/connections",
        headers=sb_headers({"Prefer": "return=minimal"}),
        params={"id": f"eq.{conn_id}"},
        json=patch,
        timeout=20,
    )
    if r.status_code >= 300:
        log.warning("Supabase-Update fehlgeschlagen (%s): %s",
                    r.status_code, r.text[:200])


# ─── Trakt (nur öffentliche Endpoints) ────────────────────────────

def trakt_headers():
    return {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": TRAKT_CLIENT_ID,
        "User-Agent": "WeTrakr-Relay/1.0",
    }


def fetch_history(username, start_at=None):
    items, page, pages = [], 1, 1
    params = {"limit": 100}
    if start_at:
        params["start_at"] = start_at

    while page <= pages:
        params["page"] = page
        r = requests.get(
            f"{TRAKT_BASE}/users/{username}/history",
            headers=trakt_headers(), params=params, timeout=30,
        )
        if r.status_code in (403, 404):
            raise PermissionError(f"trakt_{r.status_code}")
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        items.extend(batch)
        pages = int(r.headers.get("X-Pagination-Page-Count", 1))
        page += 1

    if start_at:
        items = [i for i in items if i.get("watched_at", "") > start_at]
    items.reverse()
    return items


def fetch_watching(username):
    r = requests.get(
        f"{TRAKT_BASE}/users/{username}/watching",
        headers=trakt_headers(), timeout=15,
    )
    if r.status_code == 204 or not r.text.strip():
        return None
    if r.status_code in (403, 404):
        raise PermissionError(f"trakt_{r.status_code}")
    r.raise_for_status()
    return r.json()


# ─── Mapping & WeTrakr ────────────────────────────────────────────

def map_ids(trakt_ids):
    tmdb = trakt_ids.get("tmdb")
    tvdb = trakt_ids.get("tvdb")
    return {
        "tmdb": int(tmdb) if tmdb else None,
        "imdb": trakt_ids.get("imdb") or None,
        "tvdb": int(tvdb) if tvdb else None,
    }


def build_payload(item, event="scrobble", progress=100.0):
    if item.get("type") == "movie":
        m = item["movie"]
        return {
            "event": event, "media_type": "movie",
            "title": m.get("title", ""), "year": m.get("year", 0),
            "ids": map_ids(m.get("ids", {})),
            "progress": round(progress, 1),
        }
    if item.get("type") == "episode":
        ep, show = item["episode"], item.get("show", {})
        return {
            "event": event, "media_type": "episode",
            "title": ep.get("title", ""),
            "show_title": show.get("title", ""),
            "show_ids": map_ids(show.get("ids", {})),
            "season": ep.get("season", 0),
            "episode": ep.get("number", 0),
            "ids": map_ids(ep.get("ids", {})),
            "progress": round(progress, 1),
        }
    return None


def send_to_wetrakr(token, payload):
    r = requests.post(
        f"{WETRAKR_BASE}/webhooks/kodi/{token}",
        json=payload,
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
        timeout=15,
    )
    if r.status_code in (401, 403):
        raise PermissionError("wetrakr_auth")
    return 200 <= r.status_code < 300


def watching_progress(data):
    try:
        started = datetime.fromisoformat(data["started_at"].replace("Z", "+00:00"))
        expires = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return 0.0
    total = (expires - started).total_seconds()
    if total <= 0:
        return 0.0
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    return max(0.0, min(100.0, elapsed / total * 100))


def item_key(data):
    if data.get("type") == "movie":
        return f"movie:{data.get('movie', {}).get('ids', {}).get('trakt')}"
    return f"episode:{data.get('episode', {}).get('ids', {}).get('trakt')}"


def describe(p):
    if p["media_type"] == "movie":
        return f"{p['title']} ({p.get('year', '?')})"
    return f"{p['show_title']} S{p['season']:02d}E{p['episode']:02d}"


# ─── Sync pro Verbindung ─────────────────────────────────────────

def sync_history(conn):
    username = conn["trakt_username"]
    start_at = conn.get("last_watched_at")
    if not start_at:
        start_at = (datetime.now(timezone.utc) - timedelta(days=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.000Z")

    try:
        items = fetch_history(username, start_at)
    except PermissionError as e:
        update_connection(conn["id"], {
            "last_error": str(e),
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
        })
        log.warning("[%s] History nicht lesbar: %s", username, e)
        return

    seen = set(conn.get("seen_ids") or [])
    new_items = [i for i in items if i["id"] not in seen]

    patch = {
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
        "last_error": None,
    }

    for item in new_items:
        payload = build_payload(item)
        if not payload or not any(payload["ids"].values()):
            seen.add(item["id"])
            continue
        try:
            ok = send_to_wetrakr(conn["wetrakr_token"], payload)
        except PermissionError:
            patch["last_error"] = "wetrakr_auth"
            log.warning("[%s] WeTrakr-Token abgelehnt", username)
            break
        if ok:
            seen.add(item["id"])
            patch["last_watched_at"] = item["watched_at"]
            log.info("[%s] → %s", username, describe(payload))
        time.sleep(SEND_DELAY)

    patch["seen_ids"] = list(seen)[-SEEN_CAP:]
    update_connection(conn["id"], patch)


def sync_watching(conn):
    username = conn["trakt_username"]
    try:
        data = fetch_watching(username)
    except (PermissionError, requests.RequestException):
        return

    if not data:
        if conn.get("watching_key"):
            update_connection(conn["id"], {"watching_key": None})
        return

    payload = build_payload(data, event="playing", progress=watching_progress(data))
    if not payload or not any(payload["ids"].values()):
        return

    key = item_key(data)
    try:
        if send_to_wetrakr(conn["wetrakr_token"], payload):
            if conn.get("watching_key") != key:
                log.info("[%s] läuft: %s", username, describe(payload))
                update_connection(conn["id"], {"watching_key": key})
    except PermissionError:
        update_connection(conn["id"], {"last_error": "wetrakr_auth"})


# ─── Hauptschleife ───────────────────────────────────────────────

def run():
    log.info("Relay-Worker läuft — History %ds, Now Playing %ds",
             HISTORY_INTERVAL, WATCH_INTERVAL)
    last_history = 0.0

    while True:
        now = time.time()
        try:
            conns = fetch_connections()
        except Exception:
            log.exception("Supabase nicht erreichbar")
            time.sleep(WATCH_INTERVAL)
            continue

        if now - last_history >= HISTORY_INTERVAL:
            log.info("History-Durchlauf: %d Verbindungen", len(conns))
            for c in conns:
                try:
                    sync_history(c)
                except Exception:
                    log.exception("[%s] History-Sync fehlgeschlagen",
                                  c["trakt_username"])
            last_history = now

        for c in conns:
            if c.get("live_enabled"):
                try:
                    sync_watching(c)
                except Exception:
                    log.exception("[%s] Watching-Poll fehlgeschlagen",
                                  c["trakt_username"])

        time.sleep(WATCH_INTERVAL)


if __name__ == "__main__":
    run()
