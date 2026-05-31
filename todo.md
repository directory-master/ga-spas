# TODO

Tracking work for **spas** — the Atlanta-area / Georgia spa & salon directory.

> **Scope: FREE for now.** Monetization is deferred — ignore paid/premium work
> (listing fees, featured-placement upsell, lead-gen charges, ads, payment).
> Build directory value as if everything is free. The `tier` field can stay in
> the data, but don't build the premium upgrade/payment flow yet.

## Done ✅

- Photo cards w/ ratings, price tier, Black-owned + Premium badges.
- **Live open/closed status** on cards & profiles — Open / Closing soon / Opening
  soon / Closed + the relevant time, computed client-side at view time from each
  spa's `hours` (`js/hours.js`; static pages use `js/site.js`). Add `hours:` to
  new spas via the `std()`/`wk()` helpers in `spas.js`.
- **Call / Email actions on every card** (`tel:`/`mailto:`). Card is now a
  container `<div>` with `.card-link` + a `.card-actions` row. All active spas
  have `phone` + `email` (demo `.example` addresses — replace before launch).
  Phone icon rings (staggered speeds/phases across cards).
- **2-hour closing/opening heads-up + live countdown timer** on the status badge
  (`SOON = 120` in `js/hours.js`); ticks every 30s, painted by `js/site.js`.
- **Premium cards get the gold treatment** (gradient bg, gold ring/shadow/glow,
  gold actions, ✦ Premium gradient badge); free cards stay neutral.
- [ ] Inconsistency: free-tier **profile** pages still show "Contact locked",
      but their cards now show Call/Email. Given free-for-now, unlock contact on
      free profiles too (or remove the lock).
- **Static SEO site generator** (`npm run build:pages`) → clean-URL tree in `ga/`
  (publish root for `ga.spas.artivicolab.com`): state home, a page for **every**
  GA city (Tiers 1–4), city+category, city + statewide Black-owned, statewide
  category, per-spa profiles, blog + sample post, `sitemap.xml`. Pure static HTML
  w/ per-page title/meta/canonical/OG + JSON-LD. **Spas-only** (Day/Med Spa,
  Massage); salons filtered out via `ACTIVE_TYPES`. Empty cities render a
  "coming soon" page marked **noindex** + excluded from sitemap until they get
  listings → 81 pages, 32 indexable.
- Legacy dynamic app (`index.html`/`city.html`/`listing.html` + JS search,
  filters, geolocation) still exists — **decide: retire it or keep as preview.**
  The static `ga/` tree is now the canonical, deployable site.

## Foundations

- [ ] `git init` + first commit (repo is not yet under version control).
- [ ] Decide hosting (Netlify or GitHub Pages) + deploy steps.
- [ ] Replace placeholder contact email `hello@example.com` in nav/CTAs.
- [ ] Replace demo data (photos, `bookingUrl`, `phone`, `address`, `menu`,
      ratings) with real info, or clearly label the site as a demo.
- [ ] Source real listing photos (currently Unsplash stock w/ gradient fallback).

## Content & coverage

- [ ] Seed ~20 real Atlanta listings; prioritize **Black-owned** businesses.
- [ ] Add `lat`/`lng` + `neighborhood` to every new listing (geolocation + the
      per-neighborhood SEO pages depend on them).
- [ ] Rewrite each spa's description in a warm, specific editorial voice.
- [ ] Define/standardize the business-type taxonomy.

## SEO (per [[seo-strategy]])

- [ ] **`black-owned-spas-atlanta` page** — highest-priority SEO asset (add to
      the generator as a special "filter" page, not a city).
- [ ] Per-**category** index pages (`/ga/atlanta-med-spas`, etc.).
- [ ] Add listings for Tier-1 ATL places so their pages can generate (Alpharetta,
      Marietta, Smyrna, Roswell, Dunwoody, Johns Creek). Full city roadmap lives
      in `js/data/ga-cities.js` (Tiers 1–4). **Rule: no page until ≥1 (ideally
      ≥3) real listings — empty pages = doorway penalty.**
- [ ] `sitemap.xml` generation (extend the build script).
- [ ] Per-page `<meta>` + OG on `index/city/listing` (only `/ga/*` has them now).
- [ ] Weekly roundup blog (1,200–2,000 words).
- [ ] Favicon / social share image; submit to Google Search Console once live.

## Polish

- [ ] Multi-image photo gallery on profiles (data has one `image`; spec wants 3–8).
- [ ] Friendly 404 for bad `?city=` / `?id=` (links back home).
- [ ] Expand `ZIP_CENTROIDS` coverage as listings grow.

## Deferred (paid — DO NOT build yet)

- Premium upgrade / payment flow, listing-fee tiers, featured-placement upsell,
  lead-gen inquiry forms + forwarding (Netlify Forms), advertising/sponsored.
