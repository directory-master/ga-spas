# CLAUDE.md

Guidance for working in this repo.

## ⚠️ Versioning — bump it every change

**Always bump `version` in `package.json` for any change before committing.**
Semver: patch (`0.11.1 → 0.11.2`) for fixes/tweaks, minor (`0.11.x → 0.12.0`) for
features. The footer shows `v<version> · <git short SHA>` (the `BUILD` constant in
`scripts/generate-pages.mjs`, read from `package.json` + git at build time).
`ASSET_VER` (version + SHA) is also the `?v=` cache-buster on every CSS/JS link.

> **Footgun:** because `ASSET_VER` embeds the git SHA, *every commit changes the
> SHA*, so the next `build:pages` rewrites the `?v=` query on all ~600 pages with
> no real content change. That's why the tree looks "dirty" right after a commit.
> It's cosmetic — discard it (`git checkout -- .`) before committing if needed.

## What this is

**GA.Spas** (code name **spas**) — a zero-backend, **SEO-first static directory**
of **spas across Georgia** (day spas, med spas, massage — *not* salons/nails),
on a **freemium model**. Deploys to **`https://ga.spas.artivicolab.com`** via
GitHub Pages (repo `directory-master/ga-spas`). Made by **Artivicolab**.

The product is **the card** — there are no per-spa detail pages. Each card links
out to the spa's own site / Google Maps. Free listings make the directory rank;
the paid tiers unlock the commercial layer (photos, prices, booking, contact).

## Stack & constraints

- **Pure HTML / CSS / vanilla JS (ES modules).** No framework, no runtime deps.
- **One build step:** a Node static generator (`scripts/generate-pages.mjs`) that
  stamps out the whole site as static HTML at the **repo root** (clean-URL folders
  like `/atlanta/`, `/zip/30305/`). Crawlers get real, static content.
- Hosts on GitHub Pages. ES modules need a real HTTP server (won't load `file://`).

## Run / build locally

```bash
cd ~/spas
npm run build:pages   # regenerate the static site at the repo root
npm run serve         # python3 -m http.server 8000  → http://localhost:8000
npm run dev           # build:pages + serve
```

The generated pages are committed (GitHub Pages serves them). Always rebuild
after changing data, templates, or assets.

## Layout

| Path | Role |
|------|------|
| [scripts/generate-pages.mjs](scripts/generate-pages.mjs) | The generator. Builds home, city, category, zip, neighborhood, `/areas/`, `/pricing/`, `/privacy/`, `/terms/`, `/cities/`, `/liked/`, blog, plus `sitemap.xml`, `robots.txt`, `CNAME`, the GSC verification file, `404.html`. |
| [scripts/import-csv.mjs](scripts/import-csv.mjs) | Bing Maps scraper CSV → durable store → `js/data/spas-imported.js`. |
| [js/card.js](js/card.js) | `renderCard(spa, opts)` — the ONE shared card renderer (free / standard / premium / example). Run at build time → static HTML. |
| [js/data/spas.js](js/data/spas.js) | Curated demo **seeds**, all flagged `example: true` (previews shown on the pricing/marketing surfaces — never real businesses). |
| [js/data/spas-imported.js](js/data/spas-imported.js) | **AUTO-GENERATED** real listings (all `tier: 'free'`). Don't hand-edit. |
| [data/cities/](data/cities/) | Durable **spas-only** per-city JSON store (one file per city). The importer filters at ingest (`isSpaRow`) and MERGES; non-spa rows are **never** stored. Spa rows survive `~/Downloads` cleanup. |
| [js/home.js](js/home.js) | Home/city page client JS: hero crossfade, "Near me" (watchPosition), sort, Show-more, claim modal. |
| [js/analytics.js](js/analytics.js) | GA4 event tracking (every spa interaction + every button/link click). |
| [js/consent.js](js/consent.js) | GDPR cookie-consent banner (pairs with Consent Mode v2). |
| [js/pwa.js](js/pwa.js) | Reusable PWA: service worker + install button + app-feel CSS. |
| [css/home.css](css/home.css) | Home/city/zip/etc. styles. [css/style.css](css/style.css) — shell pages (pricing, legal, cities, 404). |

## The freemium gate (core concept)

Every spa has `tier: 'free' | 'standard' | 'premium'`. `renderCard` gates by tier;
**nothing gets more than its tier earns.** Pricing lives at **`/pricing/`** (Free
$0 / Standard **$9/mo** / Premium **$20/mo** — discounted from $49/$149, shown
struck-through on `/pricing/`).

| Feature | Free | Standard $9 | Premium $20 |
|---|:--:|:--:|:--:|
| Name, type, city, rating, distance | ✓ | ✓ | ✓ |
| Photo | — | 1 | up to 6 (gallery) |
| Hours, website link, price line | — | ✓ | ✓ |
| Booking / "Request Appointment" | — | — | ✓ |
| Pinned above free in results | — | ✓ | ✓ (top) |

- **Black-owned badge is free for all tiers** (verify by emailing from a business
  email — not a paid perk).
- Free cards show a **"Own this spa? …"** claim CTA; city/zip pages also show
  **Premium + Standard "claim this spot"** cards (open an in-page modal → `mailto`).
- Claim / lead emails go to **`artivicolab@gmail.com`** — but **never render that
  address as visible text** anywhere.

## Adding listings

**Don't hand-edit `spas-imported.js`.** Import real spas from Bing Maps scraper
CSVs:

```bash
node scripts/import-csv.mjs ~/Downloads/Bing_Maps_Scraper_*.csv   # or specific files
npm run build:pages
```

The importer keeps only GA + spa categories (Day Spa / Med Spa / Massage; excludes
nail/hair/brow/etc.), dedupes by Bing ID then name+address, MERGES into
`data/cities/*.json`, and regenerates `spas-imported.js`. Curated seeds in
`spas.js` must stay `example: true`.

**Spas-only store — never warehouse non-spa raw scraps.** The single `isSpaRow`
gate (GA address + spa category + spa-name rules, with a tight `med spa` rescue)
runs **at ingest**, so nail/hair/barber/lash/salon-supply rows are filtered out
*before* anything is written to `data/cities/` — they are not kept "for a future
nail/hair directory." Don't reintroduce a keep-everything raw store; if a salon/
nail directory is ever wanted, re-scrape for it separately.

## SEO surface

- **City pages** `/atlanta/`, plus per-type `/atlanta/day-spas/`, `/atlanta/black-owned/`.
- **Zip pages** `/zip/<code>/` — data-driven: one per GA zip with ≥3 spas; lists
  spas within 5 mi of the zip centroid, **sorted by distance**; <5 → `noindex`.
- **Atlanta neighborhood pages** `/atlanta/buckhead/` etc.
- **`/areas/` hub** links all zip (grouped by city) + neighborhood pages; also
  linked from every footer. Keep these **static** (each must be its own indexable
  URL — that's the whole SEO point; a single dynamic `?zip=` page can't rank).
- Every page: `LocalBusiness`/`DaySpa` JSON-LD (+ `BreadcrumbList`, `WebPage`
  `areaServed`), canonical, OG/Twitter, geo meta, `<h3>` card names.
- **CTR-tuned titles/descriptions.** Card-list `<title>`s use a `Best {industry}
  in {place}, GA — Top Rated ({YEAR})` formula (`YEAR` = build-time
  `new Date().getFullYear()`, a freshness hook), and descriptions open with a
  benefit/action ("Find & compare the best…", "verified ratings, hours &
  directions to book/plan your visit"). Keep descriptions **≤ ~155 rendered
  chars** (mind that `&amp;` is 1 rendered char, not 5). Don't revert these to the
  old flat "Spas in {City} — Directory" / "Browse … ratings, hours, and
  directions" copy.
- **Site name is `Georgia Spa Directory`** — must stay identical across `<title>`
  suffix (`| Georgia Spa Directory`), `og:site_name`, and the home-page `WebSite`
  + `Organization` schema `name` (with `alternateName: "GA Spas"`). Google derives
  the SERP site name from these; if they disagree it falls back to the parent
  domain (`artivicolab.com` → "ArtivicoLab"). Keep them in lockstep.
- **Carousel `ItemList` needs a UNIQUE `item.url` per entry** (Google rejects
  duplicates with "identical property values"). Two distinct spas can share a
  website → the builder dedupes by falling back to the per-spa maps link, then an
  id-stamped one. Don't reintroduce a raw `s.website || maps` without the guard.
- **Every static card-list page carries an `areaIntro()` paragraph** (`.area-intro`)
  right under the hero — real reader-facing prose so Google quotes it instead of
  scraping card `name · address` lines into a semicolon "address dump" snippet.
  Returns `''` for example-only pools (e.g. Black-owned pages with no real spas).
- **Thin-town orphans** (`< THIN_CITY = 3` own listings): the town page +
  sub-pages are `noindex,follow` (stop competing, stay crawlable), AND each spa is
  surfaced on the nearest indexed city (`>= THIN_CITY`) within `NEARBY_RADIUS = 25`
  mi as a **"Spas near {City}"** section. Real cities keep every category facet
  indexed. `aggregateRating` is only emitted when `reviews > 0`.
- Build also emits `sitemap.xml` (indexable URLs only), `robots.txt` (→ sitemap),
  `CNAME`, the Google Search Console verification file, and `404.html`.
- **Generator writes but doesn't prune** removed pages — after an import, diff
  `zip/*/` on disk vs the freshly-built `/areas/` links and `rm -rf` orphans.

## Analytics & consent

- **GA4** `G-Y842GGLJVN`, injected into every page `<head>` (`GA_HEAD`).
- **Consent Mode v2**: storage **denied by default in EEA/UK/CH**, granted
  elsewhere; `js/consent.js` shows the opt-in banner and stores the choice.
- GA only collects once the site is **deployed live** — the tag has to run on the
  real domain.

## Conventions

- `id` is a stable URL/key — never change an existing one. `city` must match a
  city slug.
- Site text is **selectable/copyable** (good for sharing + SEO) — don't re-add
  copy/selection blocking.
- Footer credits **Artivicolab** (`artivicolab.com`); contact via that site, never
  the gmail.
- Deploy = `git push` to `main` → GitHub Pages rebuilds. Verification, sitemap
  submission, and indexing all require the live deploy.
