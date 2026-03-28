# Instagram to Discord Bridge

Bu proje Instagram Professional hesabinizdaki icerikleri resmi Meta Graph API ile okuyup Discord webhook'una yollar.

Onemli teknik sinir:

- Meta'nin resmi Instagram webhook alanlari yeni gonderi, yeni reels veya yeni story olusumu icin dogrudan event vermiyor.
- Meta dokumaninda `comments`, `live_comments`, `mentions`, `messages` gibi alanlar var; yeni media publish eventi listelenmiyor.
- Bu nedenle bu servis tamamen legal kalmak icin scraping yapmaz. Yeni icerikleri Graph API uzerinden periyodik olarak tarar ve Discord'a yollar.

## Gereksinimler

- Instagram Professional hesap
- Meta app
- Instagram API icin uygun izinler
- Discord webhook URL
- Ngrok authtoken

## Ortam Degiskenleri

`.env.example` dosyasini referans alin.

Zorunlu:

- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_IG_USER_ID`
- `DISCORD_WEBHOOK_URL`
- `NGROK_AUTHTOKEN`

Opsiyonel:

- `GRAPH_API_BASE_URL` varsayilan `https://graph.instagram.com/v25.0`
- `POLL_INTERVAL_SECONDS` varsayilan `300`
- `BACKFILL_LIMIT` varsayilan `25`
- `PORT` varsayilan `8080`
- `LOG_LEVEL` varsayilan `INFO`
- `STATE_DB_PATH` varsayilan `/data/state.db`
- `WEBHOOK_PATH` varsayilan `/meta/webhook`
- `DISCORD_MENTION` ornek `@here`
- `META_APP_SECRET` webhook imza dogrulamasi icin
- `META_WEBHOOK_VERIFY_TOKEN` Meta webhook verify icin

## Docker ile Kurulum

```bash
docker compose up -d --build
```

Public ngrok URL'sini ogrenmek icin:

```bash
curl -s http://127.0.0.1:4040/api/tunnels
```

JSON icindeki `public_url` degerinin sonuna `WEBHOOK_PATH` ekleyin.

Ornek:

```text
https://abc123.ngrok-free.app/meta/webhook
```

Meta panelinde:

- `Callback URL`: `https://abc123.ngrok-free.app/meta/webhook`
- `Verify token`: `.env` icindeki `META_WEBHOOK_VERIFY_TOKEN`

## Docker Olmadan Kurulum

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

## Endpoint'ler

- `GET /health`: servis durumu
- `GET /meta/webhook`: Meta verify endpoint
- `POST /meta/webhook`: Meta event endpoint
- `POST /sync`: elle senkronizasyon tetikleme

## Calisma Mantigi

1. Servis arka planda `/<IG_USER_ID>/media` Graph API endpoint'ini cagirir.
2. Donen medya kayitlarinda `media_product_type` degerine bakar.
3. `FEED`, `REELS`, `STORY` gibi tipleri ayirir.
4. Daha once Discord'a gonderilmemis medya kayitlarini SQLite icinde tutar.
5. Her yeni medyayi Discord webhook'una embed olarak yollar.
6. Meta webhook gelirse arka planda hemen yeni bir sync tetikler.

## Guvenlik ve Stabilite

- Uygulama Docker icinde non-root user ile calisir.
- SQLite verisi Docker volume icinde tutulur.
- Uygulama portu host'a acilmaz; internete sadece ngrok servisi cikar.
- HTTP isteklerinde retry/backoff uygulanir.
- Uygulama Flask development server yerine Waitress ile calisir.

## Meta Dokumanina Gore

- Webhooks: https://developers.facebook.com/docs/instagram-platform/webhooks/
- IG User Media: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
- IG Media reference: https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/

Dokumandaki ilgili noktalar:

- Webhook abonelik alani ornekleri `comments`, `live_comments`, `mentions`, `messages` gibi alanlari icerir.
- `media_product_type` alani `FEED`, `STORY`, `REELS`, `AD` degerleri donebilir.

## Notlar

- Story medya URL'leri sureli olabilir; servis hizli calisirsa Discord'a aktarim sorunsuz olur.
- Carousel paylasimlarinda cocuk medya URL'leri de embed icine eklenir.
- Discord tarafinda rate limit olusursa retry mantigi devreye girebilir ama kalici hata yine loglanir.
- Discord mesaj icerigi varsayilan olarak `@here | 📢 New Post! | <link>` benzeri eski stile yakin gonderilir.
