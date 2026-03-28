from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import signal
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterator

import requests
from flask import Flask, Response, abort, jsonify, request
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from waitress import serve


GRAPH_FIELDS = ",".join(
    [
        "id",
        "caption",
        "media_product_type",
        "media_type",
        "media_url",
        "permalink",
        "thumbnail_url",
        "timestamp",
        "username",
        "children{media_type,media_url,thumbnail_url}",
    ]
)
STORY_FIELDS = ",".join(
    [
        "id",
        "media_product_type",
        "media_type",
        "media_url",
        "permalink",
        "thumbnail_url",
        "timestamp",
        "username",
    ]
)
@dataclass(frozen=True)
class Config:
    instagram_access_token: str
    instagram_ig_user_id: str
    discord_webhook_url: str
    graph_api_base_url: str
    poll_interval_seconds: int
    backfill_limit: int
    port: int
    log_level: str
    state_db_path: str
    webhook_path: str
    discord_mention: str | None
    meta_app_secret: str | None
    meta_webhook_verify_token: str | None


def load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def load_config() -> Config:
    load_dotenv()

    required = {
        "INSTAGRAM_ACCESS_TOKEN": os.getenv("INSTAGRAM_ACCESS_TOKEN", "").strip(),
        "INSTAGRAM_IG_USER_ID": os.getenv("INSTAGRAM_IG_USER_ID", "").strip(),
        "DISCORD_WEBHOOK_URL": os.getenv("DISCORD_WEBHOOK_URL", "").strip(),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

    return Config(
        instagram_access_token=required["INSTAGRAM_ACCESS_TOKEN"],
        instagram_ig_user_id=required["INSTAGRAM_IG_USER_ID"],
        discord_webhook_url=required["DISCORD_WEBHOOK_URL"],
        graph_api_base_url=os.getenv("GRAPH_API_BASE_URL", "https://graph.instagram.com/v25.0").rstrip("/"),
        poll_interval_seconds=max(60, int(os.getenv("POLL_INTERVAL_SECONDS", "300"))),
        backfill_limit=max(1, int(os.getenv("BACKFILL_LIMIT", "25"))),
        port=int(os.getenv("PORT", "8080")),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        state_db_path=os.getenv("STATE_DB_PATH", "/data/state.db"),
        webhook_path=normalize_webhook_path(os.getenv("WEBHOOK_PATH", "/meta/webhook")),
        discord_mention=(os.getenv("DISCORD_MENTION") or "").strip() or None,
        meta_app_secret=os.getenv("META_APP_SECRET") or None,
        meta_webhook_verify_token=os.getenv("META_WEBHOOK_VERIFY_TOKEN") or None,
    )


class StateStore:
    def __init__(self, path: str) -> None:
        self.path = path
        self._init_db()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path)
        try:
            conn.row_factory = sqlite3.Row
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        parent = os.path.dirname(self.path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with self.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sent_media (
                    media_id TEXT PRIMARY KEY,
                    media_product_type TEXT,
                    sent_at TEXT NOT NULL
                )
                """
            )

    def was_sent(self, media_id: str) -> bool:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM sent_media WHERE media_id = ? LIMIT 1",
                (media_id,),
            ).fetchone()
        return row is not None

    def mark_sent(self, media_id: str, media_product_type: str) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO sent_media (media_id, media_product_type, sent_at)
                VALUES (?, ?, ?)
                """,
                (media_id, media_product_type, utc_now_iso()),
            )


class InstagramClient:
    def __init__(self, config: Config, session: requests.Session | None = None) -> None:
        self.config = config
        self.session = session or build_retry_session()

    def fetch_recent_media(self, limit: int) -> list[dict[str, Any]]:
        return self._fetch_collection("media", GRAPH_FIELDS, limit)

    def fetch_recent_stories(self, limit: int) -> list[dict[str, Any]]:
        return self._fetch_collection("stories", STORY_FIELDS, limit)

    def _fetch_collection(self, edge: str, fields: str, limit: int) -> list[dict[str, Any]]:
        url = f"{self.config.graph_api_base_url}/{self.config.instagram_ig_user_id}/{edge}"
        params = {
            "fields": fields,
            "limit": min(max(limit, 1), 100),
            "access_token": self.config.instagram_access_token,
        }
        media_items: list[dict[str, Any]] = []

        while url and len(media_items) < limit:
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            payload = response.json()
            media_items.extend(payload.get("data", []))
            paging = payload.get("paging", {})
            url = paging.get("next")
            params = None

        return media_items[:limit]


class DiscordClient:
    def __init__(self, config: Config, session: requests.Session | None = None) -> None:
        self.config = config
        self.webhook_url = config.discord_webhook_url
        self.session = session or build_retry_session()

    def send_media(self, media: dict[str, Any]) -> None:
        product_type = media.get("media_product_type") or "UNKNOWN"
        caption = (media.get("caption") or "").strip()
        media_url = media.get("media_url")
        thumbnail_url = media.get("thumbnail_url")
        permalink = media.get("permalink")

        embed: dict[str, Any] = {
            "title": build_title(product_type, media),
            "url": permalink or None,
            "description": caption[:4096] or None,
            "color": 0xE1306C,
            "timestamp": media.get("timestamp"),
            "footer": {"text": f"Instagram {product_type}"},
            "fields": [
                {
                    "name": "Media Type",
                    "value": media.get("media_type", "UNKNOWN"),
                    "inline": True,
                },
                {
                    "name": "Media ID",
                    "value": media["id"],
                    "inline": True,
                },
            ],
        }

        if media_url:
            embed["image"] = {"url": media_url}
        elif thumbnail_url:
            embed["image"] = {"url": thumbnail_url}

        child_urls = extract_child_urls(media)
        if child_urls:
            embed["fields"].append(
                {
                    "name": "Carousel Assets",
                    "value": "\n".join(child_urls[:10]),
                    "inline": False,
                }
            )

        payload = {
            "username": "Instagram Bridge",
            "content": build_content_line(
                product_type,
                permalink,
                media_url,
                self.config.discord_mention,
            ),
            "embeds": [strip_none(embed)],
        }

        response = self.session.post(self.webhook_url, json=payload, timeout=30)
        response.raise_for_status()


class SyncService:
    def __init__(self, config: Config, state: StateStore) -> None:
        self.config = config
        self.state = state
        self.instagram = InstagramClient(config)
        self.discord = DiscordClient(config)
        self.logger = logging.getLogger("sync")
        self.stop_event = threading.Event()
        self.force_run_event = threading.Event()
        self.thread = threading.Thread(target=self._run_loop, name="media-sync", daemon=True)

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        self.force_run_event.set()
        self.thread.join(timeout=5)

    def trigger_sync(self) -> None:
        self.force_run_event.set()

    def sync_once(self) -> dict[str, int]:
        media_items = self.instagram.fetch_recent_media(self.config.backfill_limit)
        story_items = self.instagram.fetch_recent_stories(self.config.backfill_limit)
        by_id = {item["id"]: item for item in media_items}
        by_id.update({item["id"]: item for item in story_items})
        media_items = list(by_id.values())
        media_items.sort(key=lambda item: item.get("timestamp", ""))

        processed = 0
        sent = 0
        for media in media_items:
            media_id = media["id"]
            processed += 1
            if self.state.was_sent(media_id):
                continue
            self.discord.send_media(media)
            self.state.mark_sent(media_id, media.get("media_product_type") or "UNKNOWN")
            sent += 1
            self.logger.info("Sent media %s to Discord", media_id)

        return {"processed": processed, "sent": sent}

    def _run_loop(self) -> None:
        self.logger.info("Background sync loop started")
        while not self.stop_event.is_set():
            try:
                result = self.sync_once()
                self.logger.info("Sync finished processed=%s sent=%s", result["processed"], result["sent"])
            except Exception:
                self.logger.exception("Sync loop failed")

            self.force_run_event.wait(timeout=self.config.poll_interval_seconds)
            self.force_run_event.clear()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_title(product_type: str, media: dict[str, Any]) -> str:
    username = media.get("username") or "Instagram"
    labels = {
        "FEED": "Yeni gonderi",
        "REELS": "Yeni reels",
        "STORY": "Yeni story",
        "AD": "Yeni reklam medyasi",
    }
    return f"{username} | {labels.get(product_type, 'Yeni medya')}"


def build_content_line(
    product_type: str,
    permalink: str | None,
    media_url: str | None,
    mention: str | None,
) -> str:
    label = {
        "FEED": "📢 New Post!",
        "REELS": "🎬 New Reel!",
        "STORY": "📸 New Story!",
        "AD": "📣 New Media!",
    }.get(product_type, "📣 New Media!")
    parts: list[str] = []
    if mention:
        parts.append(mention)
    parts.append(label)
    if permalink:
        parts.append(permalink)
    elif media_url:
        parts.append(media_url)
    return " | ".join(parts)


def extract_child_urls(media: dict[str, Any]) -> list[str]:
    children = media.get("children", {}).get("data", [])
    urls: list[str] = []
    for child in children:
        child_url = child.get("media_url") or child.get("thumbnail_url")
        if child_url:
            urls.append(child_url)
    return urls


def strip_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: strip_none(val) for key, val in value.items() if val is not None}
    if isinstance(value, list):
        return [strip_none(item) for item in value if item is not None]
    return value


def verify_meta_signature(app_secret: str, payload: bytes, signature_header: str | None) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    provided = signature_header.split("=", 1)[1]
    return hmac.compare_digest(expected, provided)


def build_retry_session() -> requests.Session:
    retry = Retry(
        total=5,
        backoff_factor=1.0,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def normalize_webhook_path(path: str) -> str:
    normalized = path.strip() or "/meta/webhook"
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    return normalized.rstrip("/") or "/"


def create_app(config: Config, sync_service: SyncService) -> Flask:
    app = Flask(__name__)
    logger = logging.getLogger("http")

    @app.get("/health")
    def health() -> Response:
        return jsonify({"status": "ok", "time": utc_now_iso()})

    @app.get(config.webhook_path)
    def verify_webhook() -> Response:
        mode = request.args.get("hub.mode")
        challenge = request.args.get("hub.challenge")
        verify_token = request.args.get("hub.verify_token")

        if mode != "subscribe" or not challenge:
            abort(400)
        if config.meta_webhook_verify_token and verify_token != config.meta_webhook_verify_token:
            abort(403)
        return Response(challenge, mimetype="text/plain")

    @app.post(config.webhook_path)
    def receive_webhook() -> Response:
        raw_payload = request.get_data()
        signature = request.headers.get("X-Hub-Signature-256")

        if config.meta_app_secret:
            if not verify_meta_signature(config.meta_app_secret, raw_payload, signature):
                abort(403)

        payload = request.get_json(silent=True) or {}
        logger.info("Received Meta webhook: %s", json.dumps(payload, ensure_ascii=True))

        # Instagram's official webhooks do not publish "new media created" events.
        # We still trigger an immediate sync so supported events can reduce latency.
        sync_service.trigger_sync()
        return jsonify({"status": "accepted"})

    @app.post("/sync")
    def sync_now() -> Response:
        result = sync_service.sync_once()
        return jsonify(result)

    return app


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def main() -> None:
    config = load_config()
    configure_logging(config.log_level)
    state = StateStore(config.state_db_path)
    sync_service = SyncService(config, state)
    app = create_app(config, sync_service)

    def shutdown_handler(signum: int, frame: Any) -> None:
        logging.getLogger("app").info("Received signal %s, shutting down", signum)
        sync_service.stop()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    sync_service.start()
    serve(app, host="0.0.0.0", port=config.port, threads=8)


if __name__ == "__main__":
    main()
