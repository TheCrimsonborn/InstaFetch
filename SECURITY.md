# Security Policy

## Supported Versions

Bu repo icin aktif olarak desteklenen branch `main` branch'idir.
Guvenlik duzeltmeleri dogrudan `main` uzerinden yayinlanir.

## Reporting a Vulnerability

Guvenlik acigi bulursaniz issue acarak public paylasmayin.

Bunun yerine:

1. GitHub uzerinden repository owner ile private olarak iletisim kurun.
2. Acigin teknik etkisini, tekrar uretme adimlarini ve varsa PoC bilgisini ekleyin.
3. Sorun dogrulandiysa duzeltme hazirlanana kadar detaylari public paylasmayin.

Rapor iceriginde su basliklar olmali:

- Etkilenen dosya veya endpoint
- Etki seviyesi
- Tekrar uretme adimlari
- Olası gecici onlem

## Secrets

Repo icinde secret tutulmamalidir.

Sunlar sadece `.env` veya deployment secret store icinde tutulmalidir:

- Instagram access token
- Discord webhook URL
- Ngrok authtoken
- Admin password
- Session secret
- Meta app secret

## Operational Guidance

- Secretlar sızmis kabul ediliyorsa rotate edilmelidir.
- Dependabot guvenlik uyarilari mumkun olan en kisa surede uygulanmalidir.
- Public issue tracker icinde token, webhook veya oturum bilgisi paylasilmamalidir.
