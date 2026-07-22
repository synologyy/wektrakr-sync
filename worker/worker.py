#!/usr/bin/env python3
"""
WeTrakr Relay — sync worker
===========================

Runs continuously (Docker). Reads all connections from Postgres and, per
connection, mirrors watch history to WeTrakr.

Sources:
  - trakt: public Trakt profile (history + optional live now-playing)
  - nuvio: Nuvio Sync API (watch history only), authenticated per user

No Trakt OAuth is used. The WeTrakr part uses the unofficial Kodi webhook
(see github.com/wetrakr/wetrakr-kodi) — it can change at any time.
"""

import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras
import requests

TRAKT_BASE = "https://api.trakt.tv"
WETRAKR_BASE = os.environ.get("WETRAKR_API_URL", "https://api.wetrakr.com")
TRAKT_CLIENT_ID = os.environ["TRAKT_CLIENT_ID"]

NUVIO_BASE = os.environ.get("NUVIO_API_URL", "https://api.nuvio.tv")
NUVIO_KEY = os.environ.get(
    "NUVIO_PUBLISHABLE_KEY",
    "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN",
)

DATABASE_URL = os.environ["DATABASE_URL"]

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


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def conn_label(conn):
    if conn.get("source") == "nuvio":
        return f"nuvio#{conn.get('nuvio_profile_id') or 1}"
    return conn.get("trakt_username") or str(conn.get("id"))


# ─── Postgres ─────────────────────────────────────────────────────

_conn = None


def db():
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg2.connect(DATABASE_URL)
        _conn.autocommit = True
    return _conn


def _reset_db():
    global _conn
    try:
        if _conn is not None:
            _conn.close()
    except Exception:
        pass
    _conn = None


def fetch_connections():
    try:
        with db().cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("select * from connections order by created_at asc")
            rows = cur.fetchall()
    except psycopg2.Error:
        _reset_db()
        raise
    for row in rows:
        lw = row.get("last_watched_at")
        if isinstance(lw, datetime):
            row["last_watched_at"] = lw.astimezone(timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%S.000Z")
    return rows


def update_connection(conn_id, patch):
    if not patch:
        return
    cols = list(patch.keys())
    set_clause = ", ".join(f"{c} = %s" for c in cols)
    values = [
        psycopg2.extras.Json(patch[c]) if isinstance(patch[c], (list, dict))
        else patch[c]
        for c in cols
    ]
    values.append(conn_id)
    try:
        with db().cursor() as cur:
            cur.execute(
                f"update connections set {set_clause} where id = %s", values)
    except psycopg2.Error as e:
        log.warning("DB-Update fehlgeschlagen: %s", e)
        _reset_db()


# ─── Trakt (public endpoints only) ────────────────────────────────

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


# ─── Nuvio Sync (per-user auth, history only) ─────────────────────

def nuvio_headers(access_token=None):
    h = {"apikey": NUVIO_KEY, "Content-Type": "application/json",
         "User-Agent": USER_AGENT}
    if access_token:
        h["Authorization"] = f"Bearer {access_token}"
    return h


def nuvio_refresh(refresh_token):
    r = requests.post(
        f"{NUVIO_BASE}/auth/v1/token?grant_type=refresh_token",
        headers=nuvio_headers(),
        json={"refresh_token": refresh_token},
        timeout=20,
    )
    if r.status_code in (400, 401, 403):
        raise PermissionError("nuvio_auth")
    r.raise_for_status()
    d = r.json()
    return d["access_token"], d.get("refresh_token") or refresh_token


def nuvio_watched(access_token, profile_id, page_size=200):
    r = requests.post(
        f"{NUVIO_BASE}/rest/v1/rpc/sync_pull_watched_items",
        headers=nuvio_headers(access_token),
        json={"p_profile_id": profile_id, "p_page": 1, "p_page_size": page_size},
        timeout=30,
    )
    if r.status_code in (401, 403):
        raise PermissionError("nuvio_auth")
    r.raise_for_status()
    return r.json()


_SE_RE = re.compile(r"\s+s\d+\s*e\d+\s*$", re.IGNORECASE)


def strip_se(title):
    return _SE_RE.sub("", title or "").strip()


def nuvio_ids(content_id):
    ids = {"tmdb": None, "imdb": None, "tvdb": None}
    if not content_id or ":" not in content_id:
        return ids
    prefix, _, val = content_id.partition(":")
    prefix = prefix.lower()
    if prefix == "tmdb":
        try:
            ids["tmdb"] = int(val)
        except ValueError:
            pass
    elif prefix == "imdb":
        ids["imdb"] = val or None
    elif prefix == "tvdb":
        try:
            ids["tvdb"] = int(val)
        except ValueError:
            pass
    return ids


def build_payload_nuvio(item, event="scrobble", progress=100.0):
    ids = nuvio_ids(item.get("content_id"))
    if not any(ids.values()):
        return None
    ctype = item.get("content_type")
    if ctype == "movie":
        return {
            "event": event, "media_type": "movie",
            "title": item.get("title", ""), "year": 0,
            "ids": ids, "progress": round(progress, 1),
        }
    if ctype == "series":
        return {
            "event": event, "media_type": "episode",
            "title": "",
            "show_title": strip_se(item.get("title", "")),
            "show_ids": ids,
            "season": int(item.get("season") or 0),
            "episode": int(item.get("episode") or 0),
            "ids": {"tmdb": None, "imdb": None, "tvdb": None},
            "progress": round(progress, 1),
        }
    return None


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


# ─── Sync per connection ─────────────────────────────────────────

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
            "last_synced_at": now_iso(),
        })
        log.warning("[%s] history not readable: %s", username, e)
        return

    seen = set(conn.get("seen_ids") or [])
    new_items = [i for i in items if i["id"] not in seen]

    patch = {"last_synced_at": now_iso(), "last_error": None}

    for item in new_items:
        payload = build_payload(item)
        if not payload or not any(payload["ids"].values()):
            seen.add(item["id"])
            continue
        try:
            ok = send_to_wetrakr(conn["wetrakr_token"], payload)
        except PermissionError:
            patch["last_error"] = "wetrakr_auth"
            log.warning("[%s] WeTrakr token rejected", username)
            break
        if ok:
            seen.add(item["id"])
            patch["last_watched_at"] = item["watched_at"]
            log.info("[%s] → %s", username, describe(payload))
        time.sleep(SEND_DELAY)

    patch["seen_ids"] = list(seen)[-SEEN_CAP:]
    update_connection(conn["id"], patch)


def sync_history_nuvio(conn):
    label = conn_label(conn)
    profile_id = conn.get("nuvio_profile_id") or 1

    try:
        access, new_refresh = nuvio_refresh(conn["nuvio_refresh_token"])
        items = nuvio_watched(access, profile_id)
    except PermissionError:
        update_connection(conn["id"], {
            "last_error": "nuvio_auth", "last_synced_at": now_iso()})
        log.warning("[%s] Nuvio auth failed", label)
        return
    except requests.RequestException:
        return

    patch = {"last_synced_at": now_iso(), "last_error": None}
    if new_refresh != conn["nuvio_refresh_token"]:
        patch["nuvio_refresh_token"] = new_refresh

    seen = set(conn.get("seen_ids") or [])
    for item in reversed(items):  # oldest first
        key = "n|%s|%s|%s|%s" % (
            item.get("content_id"), item.get("season"),
            item.get("episode"), item.get("watched_at"))
        if key in seen:
            continue
        payload = build_payload_nuvio(item)
        if not payload:
            seen.add(key)
            continue
        try:
            ok = send_to_wetrakr(conn["wetrakr_token"], payload)
        except PermissionError:
            patch["last_error"] = "wetrakr_auth"
            log.warning("[%s] WeTrakr token rejected", label)
            break
        if ok:
            seen.add(key)
            log.info("[%s] → %s", label, describe(payload))
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
                log.info("[%s] playing: %s", username, describe(payload))
                update_connection(conn["id"], {"watching_key": key})
    except PermissionError:
        update_connection(conn["id"], {"last_error": "wetrakr_auth"})


# ─── Main loop ───────────────────────────────────────────────────

def run():
    log.info("Relay worker running — history %ds, now playing %ds",
             HISTORY_INTERVAL, WATCH_INTERVAL)
    last_history = 0.0

    while True:
        now = time.time()
        try:
            conns = fetch_connections()
        except Exception:
            log.exception("database unreachable")
            time.sleep(WATCH_INTERVAL)
            continue

        if now - last_history >= HISTORY_INTERVAL:
            log.info("history run: %d connections", len(conns))
            for c in conns:
                try:
                    if c.get("source") == "nuvio":
                        sync_history_nuvio(c)
                    else:
                        sync_history(c)
                except Exception:
                    log.exception("[%s] history sync failed", conn_label(c))
            last_history = now

        for c in conns:
            if c.get("live_enabled") and c.get("source") != "nuvio":
                try:
                    sync_watching(c)
                except Exception:
                    log.exception("[%s] watching poll failed", conn_label(c))

        time.sleep(WATCH_INTERVAL)


if __name__ == "__main__":
    run()
