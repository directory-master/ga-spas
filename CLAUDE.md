# CLAUDE.md

Guidance for working in this repo.

## What this is

**spas** (code name) — a zero-backend, static directory of spas & salons across
**Georgia**, built on a **freemium model**. Free listings exist to make the
directory useful enough to rank in search; the commercial actions (booking,
pricing, location, contact) are paid (premium).

## Stack & constraints

- **Pure HTML / CSS / vanilla JS (ES modules).** No build step, no backend, no
  framework, no dependencies.
- Designed to host on GitHub Pages or any static host.
- ES modules require a real HTTP server — they will **not** load over `file://`.

## Run locally

```bash
cd ~/spas
python3 -m http.server 8000   # http://localhost:8000
```

## Layout

| Path | Role |
|------|------|
| [index.html](index.html) | Landing — grid of Georgia cities |
| [city.html](city.html) | `?city=<slug>` — premium listings pinned to top, free below |
| [listing.html](listing.html) | `?id=<spa-id>` — detail page, gated by tier |
| [js/app.js](js/app.js) | All rendering logic: `renderHome`, `renderCity`, `renderListing` |
| [js/data/spas.js](js/data/spas.js) | `CITIES` + `SPAS` data and lookup helpers |
| [css/style.css](css/style.css) | All styles (CSS custom props in `:root`) |

Each HTML page imports the matching `render*` function from `js/app.js` and
calls it inline. `js/app.js` has a small `el(tag, attrs, kids)` DOM helper used
everywhere — prefer it over template strings for consistency.

## The freemium gate (the core concept)

Every entry in `SPAS` has a `tier: 'free' | 'premium'` field. The renderer reads
it to decide what to show:

| Field | Free | Premium |
|-------|:---:|:---:|
| Name, city/neighborhood, business type | ✓ | ✓ |
| Book Now link (`bookingUrl`) | — | ✓ |
| Price menu (`menu`) / offer (`offer`) | — | ✓ |
| Map pin + address (`address`, `lat`, `lng`) | — | ✓ |
| Phone / contact form (`phone`) | — | ✓ |
| Pinned to top of city list | — | ✓ |

Free listing detail pages show **locked panels** + a "Claim this listing" CTA.
When changing the gate, keep free/premium parity consistent across all three
surfaces: city card (`listingCard`), premium detail (`renderPremiumDetail`),
and free detail (`renderFreeDetail`).

## Adding a listing

Append an object to `SPAS` in [js/data/spas.js](js/data/spas.js) (don't reorder —
ids are referenced by URL). Required for all: `id`, `name`, `city` (must match a
`CITIES` slug), `type`, `tier`. Premium adds: `bookingUrl`, `phone`, `address`,
`lat`, `lng`, `menu` (array of `{ service, price }`), and optionally `offer`.

## Conventions

- `id` is a stable URL key (e.g. `atl-luxe-nail-studio`) — never change an
  existing one.
- `city` must equal a `CITIES[].slug`.
- Money/phone/address are demo placeholders today; contact form is a demo
  (`alert`), not wired to a backend.
- Demo contact emails point at `hello@example.com` — replace before launch.
