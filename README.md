# spas (code name)

A zero-backend, static spa & salon directory for **Georgia**.

## Freemium model

| Field                           | Free listing | Premium listing |
|---------------------------------|:------------:|:---------------:|
| Store name                      | ✓            | ✓               |
| City / neighborhood             | ✓            | ✓               |
| Business type (e.g. Nail Salon) | ✓            | ✓               |
| **Book Now link**               | —            | ✓               |
| **Price menu / special offers** | —            | ✓               |
| **Map pin + exact address**     | —            | ✓               |
| **Phone / contact form**        | —            | ✓               |
| **Pinned to top of city list**  | —            | ✓               |

Free listings exist so the directory is useful enough to rank in search and
give visitors a sense of what's nearby. The commercial actions — booking,
calling, pricing, location — are paid.

## Stack

Pure HTML/CSS/JS. No build step, no backend, no framework. Host on GitHub
Pages (or any static host). Listing data lives in [js/data/spas.js](js/data/spas.js)
as a JS module — each entry has a `tier: 'free' | 'premium'` field that the
renderer reads to decide what to show or hide.

## Pages

- [index.html](index.html) — landing, list of Georgia cities
- [city.html](city.html) — `?city=<slug>` — premium listings pinned to top,
  free listings underneath
- [listing.html](listing.html) — `?id=<spa-id>` — detail page with gating

## Run locally

```bash
cd ~/spas
python3 -m http.server 8000   # http://localhost:8000
```

A static server is required (ES modules won't load over `file://`).

## Adding a listing

Append an object to `SPAS` in [js/data/spas.js](js/data/spas.js). Required:
`id`, `name`, `city` (must match a `CITIES` slug), `type`, `tier`. Premium
listings additionally provide `bookingUrl`, `phone`, `address`, `lat`, `lng`,
`menu`, and (optionally) `offer`.
