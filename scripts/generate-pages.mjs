// Static SEO site generator.
//
// Output dir `ga/` is the PUBLISH ROOT — it deploys to ga.spas.artivicolab.com,
// so URLs have no `/ga/` prefix. Clean-URL, folder-per-page tree:
//
//   ga/index.html                      → /                       (Georgia home)
//   ga/<city>/index.html               → /atlanta/               (city hub)
//   ga/<city>/<category>/index.html    → /atlanta/med-spas/      (city + category)
//   ga/<city>/<neighborhood>/index.html→ /atlanta/buckhead/      (neighborhood)
//   ga/<city>/black-owned/index.html   → /atlanta/black-owned/
//   ga/category/<category>/index.html  → /category/nail-salons/  (statewide cat)
//   ga/black-owned/index.html          → /black-owned/           (statewide BO)
//   ga/spas/<slug>/index.html          → /spas/<slug>/           (profile)
//   ga/blog/index.html, ga/blog/<post>/index.html
//   ga/css/style.css                   (copied in — publish root must be self-contained)
//   sitemap.xml
//
// Every page is pre-rendered static HTML (crawlers get full content; JS is only
// for small UI touches). A page is generated only when it has >= MIN_LISTINGS
// real listings — empty pages are doorway pages and hurt SEO. The full Georgia
// city roadmap lives in js/data/ga-cities.js; pending cities are reported below.
//
// Run after editing js/data/spas.js:   npm run build:pages

import { writeFileSync, readFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SPAS, findCity, ZIP_CENTROIDS } from '../js/data/spas.js';
import { GA_CITIES } from '../js/data/ga-cities.js';
import { IMPORTED } from '../js/data/spas-imported.js';
import { statusLong } from '../js/hours.js';
import { renderCard } from '../js/card.js';
import { topOfState, mostRated, mostRatedFiveStar, hiddenGem } from './top-spas.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GA_DIR = ROOT;   // publish AT the repo root so the deploy serves the home at "/" (no /ga segment)
const MIN_LISTINGS = 1;                               // raise to ~3 before launch
const BASE_URL = 'https://ga.spas.artivicolab.com';   // for canonical + sitemap

// Build version for the footer: package.json version + git short SHA.
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
let SHA = '';
try { SHA = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git repo */ }
const BUILD = `v${VERSION}${SHA ? ` · ${SHA}` : ''}`;
const ASSET_VER = encodeURIComponent(`${VERSION}${SHA ? `.${SHA}` : ''}`); // cache-bust ?v=

// PWA: manifest + icons so visitors can install GA.Spas to their home screen
// (the whole point — if they forget the URL, the icon's right there). Injected
// into every page <head>.
const PWA_HEAD = `<link rel="manifest" href="/manifest.webmanifest"/>
<meta name="theme-color" content="#2E3A2E"/>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"/>
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"/>
<link rel="shortcut icon" href="/favicon.ico"/>
<link rel="apple-touch-icon" sizes="180x180" href="/apple-icon-180x180.png"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-title" content="GA.Spas"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<script defer src="/js/pwa.js?v=${ASSET_VER}"></script>`;
let footerCities = ''; // set once `live` cities are known, used in every footer

// SPAS ONLY for now. Salons (Nail Salon, Hair Salon, Brow & Lash) come later —
// their listings stay in spas.js but aren't generated until added here.
const ACTIVE_TYPES = new Set(['Day Spa', 'Med Spa', 'Massage']);
const ALL = [...SPAS, ...IMPORTED];       // curated demo + scraped listings

// Auto-deactivate expired paid spots at BUILD time (zero backend): a paid
// listing runs for `paidDays` (default 30) from `paidAt`; once that window
// closes it reverts to a free listing and loses its pinned placement. Only
// touches spots with a real `paidAt` stamp — curated demo premium/standard
// listings (no paidAt) are the permanent showcase and are left alone.
const TODAY = Date.now();
const paidUntil = (s) => s.paidAt ? Date.parse(s.paidAt) + (s.paidDays ?? 30) * 864e5 : null;
let expiredCount = 0;
for (const s of ALL) {
  const until = paidUntil(s);
  if (s.paid && until != null && until < TODAY) { s.paid = false; s.tier = 'free'; expiredCount++; }
}
if (expiredCount) console.log(`auto-deactivated ${expiredCount} expired paid spot(s) → free`);

const ACTIVE = ALL.filter(s => ACTIVE_TYPES.has(s.type));

// Three superlative "spots" shown above the Top 10 — judged on raw review count
// (gated to 4★+ in top-spas.mjs). Dedupe internally so the perfect-5.0 spot and
// hidden gem never repeat the overall most-reviewed spa.
const MOST_RATED = mostRated();
const MOST_5STAR = mostRatedFiveStar(MOST_RATED?.id);
const GEM = hiddenGem(MOST_RATED?.id, MOST_5STAR?.id);
const TOP_SPOTS = [
  MOST_RATED && { label: 'Most reviewed', spa: MOST_RATED },
  MOST_5STAR && { label: 'Most reviewed · 5★', spa: MOST_5STAR },
  GEM && { label: '💎 Hidden gem', spa: GEM },
].filter(Boolean);
console.log('Top spots:', TOP_SPOTS.map(s => `${s.label}=${s.spa.name} (${s.spa.reviews})`).join('  '));

// Georgia's Top 10: best-rated spa from each city, then the 10 best cities
// (Bayesian score by stars × review count — see scripts/top-spas.mjs). EXCLUDE
// the superlative spots so no spa appears twice on the page (the reviewer caught
// "Atlanta Colonic & Massage Spa" showing up in both the spot row and the list).
const TOP10 = topOfState(10, TOP_SPOTS.map(s => s.spa.id));
console.log('Top 10 GA spas:', TOP10.map((s, i) => `${i + 1}.${s.name} (${s.rating}★)`).join('  '));

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kebab = (s) => String(s).toLowerCase()
  .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const CAT_LABEL = {
  'Day Spa': 'day spas', 'Med Spa': 'med spas', 'Nail Salon': 'nail salons',
  'Hair Salon': 'hair salons', 'Massage': 'massage', 'Brow & Lash': 'brow & lash studios',
};
const catSlug = (type) => kebab(type) + (/Salon$/.test(type) || type === 'Day Spa' || type === 'Med Spa' ? 's' : '');
const catLabel = (type) => CAT_LABEL[type] || type.toLowerCase();
const cap = (s) => s.replace(/^\w/, c => c.toUpperCase());

const citySlug = (name) => kebab(name);
const cityUrl = (name) => `/${citySlug(name)}/`;
const spaSlug = (spa) => kebab(`${spa.name} ${spa.neighborhood || spa.city}`);
const spaUrl = (spa) => `/spas/${spaSlug(spa)}/`;
// Cards are business cards — no per-spa landing page. The card name links OUT to
// the spa's own website, or a Google Maps search if it has none.
const spaLink = (spa) => spa.website
  || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spa.name}, ${spa.address || spa.cityName || spa.city || 'GA'}`)}`;

const TIER_ORDER = { premium: 0, standard: 1, free: 2 };
// tier first, then highest-rated, then most-reviewed (null ratings sort last)
const byRank = (list) => [...list].sort((a, b) =>
  (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9)
  || (b.rating || 0) - (a.rating || 0)
  || (b.reviews || 0) - (a.reviews || 0)
  || String(a.name).localeCompare(String(b.name)));

const urls = [];
const noindexed = new Set(); // paths kept out of sitemap.xml
function write(relDir, html) {
  const dir = relDir ? join(GA_DIR, relDir) : GA_DIR;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  urls.push(`/${relDir ? relDir + '/' : ''}`);
}

const cityNameOf = (spa) => spa.cityName || (findCity(spa.city) || {}).name || spa.city;

// A spa projected to a plain FREE card: used by the Top 10 ranking and the
// superlative spots, none of which have paid for placement. Force free tier and
// strip the paid signals (menu/price/offer/perks/hours/bookingUrl) so no premium
// chrome leaks in; the site-wide distance chip (lat/lng) still stays for all.
const freeView = (spa) => ({ ...spa, tier: 'free', menu: undefined, price: undefined, offer: undefined, perks: undefined, hours: undefined, bookingUrl: undefined });

function shell({ title, desc, path, jsonLd = '', body, noindex = false }) {
  const canonical = BASE_URL + path;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta http-equiv="Cache-Control" content="no-cache">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">${noindex ? '\n  <meta name="robots" content="noindex,follow">' : ''}
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${BASE_URL}/images/og-cover.jpg">
  <meta property="og:image:width" content="1731">
  <meta property="og:image:height" content="909">
  <meta property="og:image:alt" content="GA.Spas — find your perfect spa in Georgia">
  <meta property="og:site_name" content="GA.Spas">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${BASE_URL}/images/og-cover.jpg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css?v=${ASSET_VER}">
  ${PWA_HEAD}
  <script type="module" src="/js/site.js?v=${ASSET_VER}"></script>
  ${jsonLd}
</head>
<body>
  <header class="site-header">
    <div class="container">
      <div class="brand"><a href="/">GA<span>.Spas</span></a></div>
      <nav class="nav">
        <a href="/">Cities</a>
        <a href="/black-owned/">Black-Owned</a>
        <a href="/blog/">Blog</a>
        <a class="nav-cta" href="/pricing/">List your spa</a>
      </nav>
    </div>
  </header>
  <main class="container">
${body}
  </main>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <div class="brand"><a href="/">GA<span>.Spas</span></a></div>
        <p>Georgia's hyper-local spa and wellness directory. Curated, not algorithmic. Every listing visited, verified, and written about by people who live here.</p>
        <div class="footer-social">
          <a href="https://instagram.com/" target="_blank" rel="noopener">Instagram</a>
          <a href="https://facebook.com/" target="_blank" rel="noopener">Facebook</a>
        </div>
      </div>
      <div class="footer-col">
        <h4>Explore</h4>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/black-owned/">Black-owned spas</a>
        <a href="/category/med-spas/">Med spas in GA</a>
        <a href="/category/day-spas/">Day spas near me</a>
        <a href="/cities/">All Georgia cities</a>
      </div>
      <div class="footer-col">
        <h4>For spa owners</h4>
        <a href="/pricing/">List your spa — Free</a>
        <a href="/pricing/#standard">Standard listing — $49/mo</a>
        <a href="/pricing/#premium">Premium listing — $149/mo</a>
        <a href="/pricing/">See all plans</a>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <a href="/pricing/">Pricing</a>
        <a href="/blog/">Blog</a>
        <a href="https://artivicolab.com/#contact" target="_blank" rel="noopener">Contact us</a>
        <a href="#">Privacy policy</a>
        <a href="#">Terms of service</a>
      </div>
    </div>
    <div class="container footer-base">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="btn btn-secondary" href="/pricing/">List your spa →</a>
    </div>
  </footer>
</body>
</html>
`;
}


// ---------- run ----------
// Output is the repo root: source css/ + js/ already live here and pages link them
// absolutely (/css/…, /js/…), so nothing to copy. Clean ONLY generated dirs — never
// the repo root or any source dir.
rmSync(join(ROOT, 'ga'), { recursive: true, force: true }); // retire the old /ga subfolder output
for (const f of ['city.html', 'listing.html', 'js/app.js']) rmSync(join(ROOT, f), { force: true });
const GENERATED_ROOTS = new Set(['spas', 'cities', 'category', 'black-owned', 'blog']);
for (const e of GA_CITIES) GENERATED_ROOTS.add(e.slug);
for (const s of ACTIVE) if (s.city) GENERATED_ROOTS.add(s.city);
for (const d of GENERATED_ROOTS) rmSync(join(ROOT, d), { recursive: true, force: true });

const counts = { cities: 0, comingSoon: 0, category: 0, cityBO: 0, statewide: 0, profiles: 0 };

// Live cities are derived from the actual data (curated demo + imported).
const cityReg = new Map(); // slug -> display name
for (const s of ACTIVE) {
  if (!s.city || /^private address/i.test(cityNameOf(s))) continue;
  cityReg.set(s.city, cityNameOf(s));
}
const live = [...cityReg]
  .map(([slug, name]) => ({ slug, name, listings: byRank(ACTIVE.filter(s => s.city === slug)) }))
  .filter(p => p.listings.length >= MIN_LISTINGS)
  .sort((a, b) => b.listings.length - a.listings.length);
const liveSlugs = new Set(live.map(p => p.slug));
const liveLinks = live.slice(0, 12).map(p => `<a href="/${p.slug}/">${esc(p.name)}</a>`).join(' · ');

// City centroids (avg of each city's spa coords) → nearest other live cities,
// used to fill thin Spotlights with a "more spas nearby" card.
const cityCentroid = {};
for (const p of live) {
  const pts = p.listings.filter(s => s.lat && s.lng);
  if (pts.length) cityCentroid[p.slug] = {
    slug: p.slug, name: p.name, count: p.listings.length,
    lat: pts.reduce((a, s) => a + s.lat, 0) / pts.length,
    lng: pts.reduce((a, s) => a + s.lng, 0) / pts.length,
  };
}
const milesBetween = (a, b) => {
  const R = 3959, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const nearestCities = (slug, n = 3) => {
  const c = cityCentroid[slug];
  if (!c) return [];
  return Object.values(cityCentroid)
    .filter(o => o.slug !== slug)
    .map(o => ({ ...o, mi: milesBetween(c, o) }))
    .sort((a, b) => a.mi - b.mi).slice(0, n);
};
footerCities = live.slice(0, 6).map(p => `<a href="/${p.slug}/">${esc(p.name)}</a>`).join('\n        ');

// Local-flavor subtext per city (our brand edge).
const CITY_BLURBS = {
  atlanta: 'Buckhead, Midtown, West End, Decatur', roswell: 'Canton Street district',
  alpharetta: 'Avalon area, Old Milton', duluth: 'Sugarloaf, Gwinnett Place',
  marietta: 'Downtown square, East Cobb', tucker: 'Main Street corridor',
  conyers: 'Rockdale County hub', 'johns-creek': 'Technology Corridor',
  decatur: 'Downtown, Oakhurst, Avondale', 'sandy-springs': 'Roswell Rd, Hammond Dr',
  savannah: 'Historic district, Ardsley Park', smyrna: 'Village Green, Vinings',
  norcross: 'Historic downtown & the Forum', chamblee: 'Peachtree Blvd & downtown',
  dunwoody: 'Perimeter & the Village', brookhaven: 'Dresden Dr & Town Brookhaven',
  'peachtree-corners': 'The Forum & Town Center', woodstock: 'Downtown & Towne Lake',
  'stone-mountain': 'Main Street & Memorial Dr', stonecrest: 'Mall area & Turner Hill',
  snellville: 'Scenic Hwy & Towne Center', doraville: 'Buford Hwy & Assembly',
  lilburn: 'Old Town & Mountain Park', lithonia: 'Stonecrest & Panola Rd',
  suwanee: 'Town Center & Old Town', milton: 'Crabapple & downtown',
};
const cityRow = (p) => `<a class="city-row" href="/${p.slug}/">
        <span class="city-row-name">${esc(p.name)}</span>
        <span class="city-row-blurb">${esc(CITY_BLURBS[p.slug] || '')}</span>
        <span class="city-row-count">${p.listings.length} spas →</span>
      </a>`;

// Calm, spa-like landing — reused for the Georgia home and the Black-Owned page.
function homeStylePage({ relPath, canonical, pool, title, desc, heroEyebrow, heroH1, heroSub, heroProof, activePill, featEyebrow, featH2, showBoBand, showCities,
  showAll = false, allEyebrow = '', allH2 = '', cityScope = 'all', citiesEyebrow = 'Local knowledge', citiesH2 = 'Browse by city', showTesti = true, spotPlace = 'Georgia',
  topSpas = [], topSpots = [], topEyebrow = '', topH2 = '', fillCity = '', noindex = false, geoPoint = null }) {
  if (noindex) noindexed.add(canonical);
  const boCount = ACTIVE.filter(s => s.blackOwned).length;
  const fmtNbhd = (spa) => esc([spa.neighborhood, cityNameOf(spa) + ', GA', spa.price].filter(Boolean).join(' · '));

  // One shared renderer (js/card.js) → free / standard / premium. Runs here at
  // BUILD time so the body is static HTML (indexable), edited in exactly one place.
  const homeCard = (spa, photoClass, demoStatus) =>
    renderCard(spa, { href: spaLink(spa), cityName: cityNameOf(spa), photoClass, demoStatus });

  // Premium and standard NEVER share a row: premium (+ featured claim) on row 1,
  // standard on its own row 2.
  const premiumSpas = byRank(pool.filter(s => s.tier === 'premium'));
  const standardSpas = byRank(pool.filter(s => s.tier === 'standard'));
  const claimCard = `<article class="card claim">
        <div class="card-pad">
          <div class="claim-eyebrow">Your spa here</div>
          <div class="claim-h serif">This ${spotPlace} spot<br>is available</div>
          <div class="claim-p">This featured placement is unclaimed. Be the first spa in ${spotPlace} at the top of every search.</div>
          <div class="claim-price">Premium · $149/mo · featured at the top of ${spotPlace} results</div>
          <a class="claim-btn" href="/pricing/#premium" data-claim-spot data-claim-tier="premium" data-claim-city="${esc(spotPlace)}">Claim this spot →</a>
        </div>
      </article>`;
  const standardClaimCard = `<article class="card claim">
        <div class="card-pad">
          <div class="claim-eyebrow">Your spa here</div>
          <div class="claim-h serif">This standard spot<br>is available</div>
          <div class="claim-p">Claim a standard listing in ${spotPlace} — your spa, photos, services, and contact shown on every relevant page.</div>
          <div class="claim-price">Standard listing · $49/mo · enhanced placement</div>
          <a class="claim-btn" href="/pricing/#standard" data-claim-spot data-claim-tier="standard" data-claim-city="${esc(spotPlace)}">Claim this spot →</a>
        </div>
      </article>`;
  // demo: stagger statuses so the showcase always shows a mix (one open, one closed, …)
  const DEMO_STATES = ['open', 'closed', 'closing', 'opening'];
  // Most city/category pages have no paid listings. Instead of filling the
  // Spotlight with "this spot is available" cards (which buries the real spas),
  // feature the top-rated REAL spas there. Claim cards only show where paid
  // tiers actually exist (e.g. the home and curated-demo cities).
  const hasPaid = premiumSpas.length || standardSpas.length;

  // NEVER feature an unpaid spa. With no paid listings the featured spots stay
  // "available" (the claim card) and the rest of the row is filled with non-spa
  // helper cards: a "more spas nearby" card and a browse-by-type card. The real
  // (unpaid) spas all appear below in the "All spas in …" list, not the Spotlight.
  const nb = fillCity ? nearestCities(fillCity, 3) : [];
  const nearbyCard = nb.length ? `<article class="card claim">
        <div class="card-pad">
          <div class="claim-eyebrow">Nearby</div>
          <div class="claim-h serif">More spas<br>near ${spotPlace}</div>
          <div class="claim-links">${nb.map(c => `<a href="/${c.slug}/">${esc(c.name)} <span>${c.count}</span></a>`).join('')}</div>
          <a class="claim-btn ghost" href="/cities/">All Georgia cities →</a>
        </div>
      </article>` : '';
  const categoryCard = `<article class="card claim">
        <div class="card-pad">
          <div class="claim-eyebrow">By treatment</div>
          <div class="claim-h serif">Browse<br>by type</div>
          <div class="claim-links">
            <a href="/category/day-spas/">Day Spas</a>
            <a href="/category/med-spas/">Med Spas</a>
            <a href="/category/massage/">Massage</a>
          </div>
        </div>
      </article>`;
  // claim spots lead — BOTH the premium and the standard spot are claimable in
  // every city — then a helper filler; cap at 3
  const premiumCards = hasPaid
    ? premiumSpas.slice(0, 2).map((s, i) => homeCard(s, i % 2 ? 'p2' : '', DEMO_STATES[i % DEMO_STATES.length])).join('\n      ') + '\n      ' + claimCard
    : [claimCard, standardClaimCard, nearbyCard, categoryCard].filter(Boolean).slice(0, 3).join('\n      ');
  const standardCards = hasPaid
    ? standardSpas.slice(0, 2).map((s, i) => homeCard(s, i % 2 ? 'p2' : '')).join('\n      ') + '\n      ' + standardClaimCard
    : '';

  // "All …" grid = every spa in the pool beyond the highlighted featured/standard rows
  const shownIds = new Set((hasPaid ? [...premiumSpas.slice(0, 2), ...standardSpas.slice(0, 2)] : []).map(s => s.id));
  const restSpas = byRank(pool.filter(s => !shownIds.has(s.id)));
  const ALL_SHOWN = 30; // show ~10 rows (3-col grid) before "Show more"
  const restCards = restSpas.map((s, i) => homeCard(s, i % 2 ? 'p2' : ''));
  const allSection = (showAll && restSpas.length) ? `<section class="band">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="eyebrow">${allEyebrow}</div><h2 class="serif">${allH2}</h2></div>
      ${restSpas.length > 1 ? `<label class="sort-ctrl">Sort
        <select data-sort>
          <option value="rating">Top rated</option>
          <option value="reviews">Most reviewed</option>
          <option value="name">Name (A–Z)</option>
          <option value="distance">Nearest</option>
        </select>
      </label>` : ''}
    </div>
    <div class="feat-grid all-grid${restSpas.length > ALL_SHOWN ? ' capped' : ''}" data-all-grid>
      ${restCards.join('\n      ')}
    </div>
    ${restSpas.length > ALL_SHOWN ? `<div class="show-more-wrap"><button class="show-more-btn" type="button" data-show-more>Show more · ${restSpas.length - ALL_SHOWN} more</button></div>` : ''}
  </div>
</section>` : '';

  // Browse-by-city — scoped to all spas or Black-owned only (links to per-city BO page)
  const cityList = cityScope === 'black-owned'
    ? live.map(p => ({ slug: p.slug, name: p.name, listings: p.listings.filter(s => s.blackOwned) })).filter(p => p.listings.length)
    : live;
  const cityHref = (slug) => cityScope === 'black-owned' ? `/${slug}/black-owned/` : `/${slug}/`;
  const cityNoun = cityScope === 'black-owned' ? 'Black-owned' : 'spas';
  const cityCards = cityList.slice(0, 6).map((p, i) => {
    const top = p.listings.find(s => s.rating && !s.example) || p.listings.find(s => !s.example) || p.listings[0];
    const teaser = (top && top.rating)
      ? `<div class="city-top"><span class="ct-star">★</span> ${top.rating.toFixed(1)} · ${esc(top.name)}</div>` : '';
    return `<a class="city${i === 0 ? ' hero-city' : ''}" href="${cityHref(p.slug)}"><div class="city-name">${esc(p.name)}</div><div class="city-sub">${esc(CITY_BLURBS[p.slug] || 'Day spas, med spas & massage')}</div>${teaser}<div class="city-count">${p.listings.length} ${cityNoun} →</div></a>`;
  }).join('\n      ') +
    (cityScope === 'all'
      ? `\n      <a class="city all" href="/cities/"><div class="city-name">All ${live.length} cities</div><div class="city-sub">${esc(live.slice(6, 9).map(p => p.name).join(', '))} + more</div><div class="city-count">View all →</div></a>`
      : '');

  // ---- SEO: JSON-LD (BreadcrumbList + ItemList of LocalBusiness), OG + geo ----
  const realSpas = pool.filter(s => !s.example && s.name);
  const bizType = (t) => t === 'Med Spa' ? 'MedicalBusiness' : t === 'Massage' ? 'HealthAndBeautyBusiness' : 'DaySpa';
  const teleOf = (p) => { const d = String(p || '').replace(/[^\d]/g, ''); return d ? (d.length === 10 ? '+1' + d : '+' + d) : undefined; };
  const streetOf = (a) => (String(a || '').split(',')[0] || '').trim() || undefined;
  const business = (s) => {
    const b = { '@type': bizType(s.type), name: s.name };
    const street = streetOf(s.address);
    if (street || s.zip) b.address = { '@type': 'PostalAddress', streetAddress: street, addressLocality: cityNameOf(s), addressRegion: 'GA', postalCode: s.zip || undefined };
    const tel = teleOf(s.phone); if (tel) b.telephone = tel;
    if (s.lat && s.lng) b.geo = { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng };
    if (s.rating) b.aggregateRating = { '@type': 'AggregateRating', ratingValue: s.rating, reviewCount: s.reviews || 0 };
    b.url = s.website || spaLink(s);
    return b;
  };
  const graph = [];
  if (spotPlace && spotPlace !== 'Georgia') graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Georgia Spas', item: BASE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: spotPlace, item: BASE_URL + canonical },
    ],
  });
  if (realSpas.length) graph.push({
    '@type': 'ItemList',
    itemListElement: realSpas.map((s, i) => ({ '@type': 'ListItem', position: i + 1, item: business(s) })),
  });
  // WebPage + areaServed so Google knows the geographic area this page covers
  if (fillCity && spotPlace && spotPlace !== 'Georgia') graph.push({
    '@type': 'WebPage',
    name: title,
    url: BASE_URL + canonical,
    areaServed: { '@type': 'City', name: spotPlace, containedInPlace: { '@type': 'State', name: 'Georgia' } },
    about: { '@type': 'ItemList', name: `Spas in ${spotPlace}, Georgia`, numberOfItems: realSpas.length },
  });
  const ldJson = graph.length
    ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>` : '';
  const ogMeta = `<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${BASE_URL}${canonical}"/>
<meta property="og:image" content="${BASE_URL}/images/og-cover.jpg"/>
<meta property="og:image:width" content="1731"/>
<meta property="og:image:height" content="909"/>
<meta property="og:image:alt" content="GA.Spas — find your perfect spa in Georgia"/>
<meta property="og:site_name" content="GA.Spas"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="${BASE_URL}/images/og-cover.jpg"/>`;
  const geoC = geoPoint || (fillCity && cityCentroid[fillCity]);
  const geoMeta = `<meta name="geo.region" content="US-GA"/>
<meta name="geo.placename" content="${esc((spotPlace && spotPlace !== 'Georgia') ? spotPlace + ', Georgia' : 'Georgia')}"/>${geoC ? `\n<meta name="geo.position" content="${geoC.lat.toFixed(4)};${geoC.lng.toFixed(4)}"/>\n<meta name="ICBM" content="${geoC.lat.toFixed(4)}, ${geoC.lng.toFixed(4)}"/>` : ''}`;

  write(relPath, `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta http-equiv="Cache-Control" content="no-cache">
<title>${title}</title>
<meta name="description" content="${esc(desc)}"/>${noindex ? '\n<meta name="robots" content="noindex,follow"/>' : ''}
<link rel="canonical" href="${BASE_URL}${canonical}"/>
${ogMeta}
${geoMeta}
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
${PWA_HEAD}
${ldJson}
</head>
<body>

<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
    <li><a href="/blog/">Blog</a></li>
  </ul>
  <a class="nav-cta" href="/pricing/">List your spa</a>
</nav>

<header class="hero hero--photo">
  <div class="hero-bg" data-hero-bg>
    <div class="hero-slide hslide-1 on"></div>
    <div class="hero-slide hslide-2"></div>
    <div class="hero-slide hslide-3"></div>
  </div>
  <div class="wrap hero-inner">
    <div class="eyebrow">${heroEyebrow}</div>
    <h1>${heroH1}</h1>
    <p class="hero-sub">${heroSub}</p>
    <p class="hero-proof">${heroProof}</p>
    <form class="search" id="home-search" action="/cities/" method="get" autocomplete="off">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39D8E" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="home-q" name="q" type="search" placeholder="Search by city, neighborhood, or service…" aria-label="Search spas"/>
        <button class="btn btn-go" type="submit">Find spas</button>
      </div>
    </form>
    <p class="loc-note" id="home-loc-note" hidden></p>
    <div class="pills">
      <a class="pill${activePill === 'all' ? ' active' : ''}" href="/">All</a>
      <a class="pill" href="/category/day-spas/">Day Spas</a>
      <a class="pill" href="/category/med-spas/">Med Spas</a>
      <a class="pill" href="/category/massage/">Massage</a>
      <a class="pill bo${activePill === 'bo' ? ' active' : ''}" href="/black-owned/">✦ Black-Owned</a>
    </div>
  </div>
</header>

${premiumCards ? `<section class="band band--dots">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">${featEyebrow}</div>
        <h2 class="serif">${featH2}</h2>
      </div>
      <a class="sec-link" href="/cities/">View all spas →</a>
    </div>
    <div class="feat-grid">
      ${premiumCards}
    </div>
    ${standardCards ? `<div class="tier-row-label">Standard listings</div>
    <div class="feat-grid">
      ${standardCards}
    </div>` : ''}
  </div>
</section>` : ''}

${topSpas.length ? `<section class="band top-band">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">${topEyebrow}</div>
        <h2 class="serif">${topH2}</h2>
      </div>
      <a class="sec-link" href="/cities/">Browse all cities →</a>
    </div>
    ${topSpots.length ? `<div class="feat-grid spot-grid">
      ${topSpots.map(({ label, spa }) =>
        `<div class="rank-card spot-card"><span class="spot-badge">${esc(label)}</span>${renderCard(freeView(spa), { href: spaLink(spa), cityName: cityNameOf(spa) })}</div>`).join('\n      ')}
    </div>` : ''}
    <div class="feat-grid top-grid">
      ${topSpas.map((s, i) =>
        `<div class="rank-card${i < 3 ? ' rank-top' : ''}"><span class="rank-badge">${i + 1}</span>${renderCard(freeView(s), { href: spaLink(s), cityName: cityNameOf(s) })}</div>`).join('\n      ')}
    </div>
  </div>
</section>` : ''}

${(showBoBand && boCount) ? `<section class="band" style="padding-top:0">
  <div class="wrap">
    <div class="bo-band">
      <div class="bo-grid">
        <div>
          <div class="eyebrow">Community first</div>
          <h2>We made Black-owned spas easy to find</h2>
          <p>Atlanta's Black professional community deserves a directory built for them. Every Black-owned spa is verified, featured prominently, and never buried in an algorithm.</p>
          <a class="bo-cta" href="/black-owned/">Browse Black-Owned Spas →</a>
        </div>
        <div class="bo-stat">
          ${boCount >= 20
            ? `<div class="bo-num">${boCount}</div>
          <div class="bo-stat-l">Black-owned spas listed across Georgia</div>`
            : `<div class="bo-num">✦</div>
          <div class="bo-stat-l">Every Black-owned spa in Georgia, in one place</div>`}
        </div>
      </div>
    </div>
  </div>
</section>` : ''}

${allSection}

${showCities ? `<section class="band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">${citiesEyebrow}</div>
        <h2 class="serif">${citiesH2}</h2>
      </div>
      ${cityScope === 'all' ? `<a class="sec-link" href="/cities/">All ${live.length} cities →</a>` : ''}
    </div>
    <div class="cities-grid">
      ${cityCards}
    </div>
  </div>
</section>` : ''}

${showTesti ? `<section class="band testi-band">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">Loved locally</div>
        <h2 class="serif">What Atlanta is saying</h2>
      </div>
    </div>
    <div class="testi-grid">
      <div class="testi">
        <div class="testi-stars">★★★★★</div>
        <div class="testi-q">"Found my go-to facial spot in Buckhead in five minutes — and she's Black-owned. Exactly what Atlanta needed."</div>
        <div class="testi-by"><div class="av">JW</div><div><div class="testi-name">Jasmine W.</div><div class="testi-detail">Buckhead · Day Spa</div></div></div>
      </div>
      <div class="testi">
        <div class="testi-stars">★★★★★</div>
        <div class="testi-q">"Finally a site that knows Atlanta neighborhoods. Not just 'Atlanta' — Decatur, West End, Midtown. Real local knowledge."</div>
        <div class="testi-by"><div class="av">MR</div><div><div class="testi-name">Marcus R.</div><div class="testi-detail">Decatur · Massage Studio</div></div></div>
      </div>
      <div class="testi">
        <div class="testi-stars">★★★★★</div>
        <div class="testi-q">"Booked a couples massage for our anniversary. The promo saved us $60. Zero stress, ten minutes flat."</div>
        <div class="testi-by"><div class="av">TN</div><div><div class="testi-name">Tanya N.</div><div class="testi-detail">Midtown · Couples Massage</div></div></div>
      </div>
    </div>
  </div>
</section>` : ''}

<footer>
  <div class="wrap">
    <div class="foot-top">
      <div>
        <div class="foot-logo">GA<span>.Spas</span></div>
        <div class="foot-tag">Georgia's hyper-local spa and wellness directory. Curated, not algorithmic — every listing visited, verified, and written about by people who live here.</div>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Explore</div>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/black-owned/">Black-owned spas</a>
        <a href="/category/med-spas/">Med spas in GA</a>
        <a href="/areas/">Spas by area &amp; zip</a>
        <a href="/cities/">All Georgia cities</a>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">For owners</div>
        <a href="/pricing/">List free</a>
        <a href="/pricing/#standard">Standard — $49/mo</a>
        <a href="/pricing/#premium">Premium — $149/mo</a>
        <a href="/pricing/">See all plans</a>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Company</div>
        <a href="/pricing/">Pricing</a>
        <a href="/blog/">Blog</a>
        <a href="https://artivicolab.com/#contact" target="_blank" rel="noopener">Contact us</a>
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/pricing/">List your spa →</a>
    </div>
  </div>
</footer>

<script type="application/json" id="zip-centroids">${JSON.stringify(ZIP_CENTROIDS)}</script>
<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);
}

// Georgia home
homeStylePage({
  relPath: '', canonical: '/', pool: ACTIVE, activePill: 'all',
  title: 'Best Spas in Atlanta &amp; Georgia | GA Spas Directory',
  desc: `Find your perfect spa day in Atlanta. ${ACTIVE.length} vetted day spas, med spas, and massage studios across ${live.length} Georgia cities — including the best Black-owned wellness businesses.`,
  heroEyebrow: "Georgia's spa &amp; wellness directory",
  heroH1: 'Find your <em>perfect</em><br>spa in Georgia',
  heroSub: "We've visited, vetted, and written about every spa on this list — day spas, med spas, massage studios, and Georgia's best Black-owned wellness businesses, all in one calm place.",
  heroProof: `<strong>${ACTIVE.length} spas</strong> across <strong>${live.length} Georgia cities</strong> — updated weekly`,
  featEyebrow: 'Hand-picked', featH2: "Georgia's best spas", showBoBand: true, showCities: true,
  topSpas: TOP10, topSpots: TOP_SPOTS, topEyebrow: 'Ranked by stars &amp; reviews', topH2: "Georgia's top 10 spas",
});

// Black-Owned — the home page, filtered to Black-owned spas
{
  const boSpas = ACTIVE.filter(s => s.blackOwned);
  homeStylePage({
    relPath: 'black-owned', canonical: '/black-owned/', pool: boSpas, activePill: 'bo',
    title: 'Black-Owned Spas in Atlanta &amp; Georgia | GA Spas',
    desc: `Discover Georgia's best Black-owned spas, med spas, and massage studios — verified, featured, and easy to find across Atlanta and beyond.`,
    heroEyebrow: 'Community first',
    heroH1: "Georgia's best<br><em>Black-owned</em> spas",
    heroSub: "Hand-picked Black-owned day spas, med spas, and massage studios across Atlanta and Georgia — verified, featured prominently, and never buried in an algorithm.",
    heroProof: `<strong>${boSpas.length} Black-owned ${boSpas.length === 1 ? 'spa' : 'spas'}</strong> featured across Georgia`,
    featEyebrow: 'Hand-picked', featH2: 'Featured Black-owned spas', showBoBand: false, showCities: true, spotPlace: 'Georgia Black-owned',
    showAll: true, allEyebrow: 'The full list', allH2: 'All Black-owned spas',
    cityScope: 'black-owned', citiesEyebrow: 'Community', citiesH2: 'Browse Black-owned by city',
  });
}

// "all cities" index (the home's "view all" link) — on the SAME design system as
// every other page (home.css / home.js), not the retired shell() template.
const cityIndexCard = (p, i) => {
  const top = p.listings.find(s => s.rating && !s.example) || p.listings.find(s => !s.example) || p.listings[0];
  const teaser = (top && top.rating)
    ? `<div class="city-top"><span class="ct-star">★</span> ${top.rating.toFixed(1)} · ${esc(top.name)}</div>` : '';
  const n = p.listings.length;
  return `<a class="city${i === 0 ? ' hero-city' : ''}" href="/${p.slug}/"><div class="city-name">${esc(p.name)}</div><div class="city-sub">${esc(CITY_BLURBS[p.slug] || 'Day spas, med spas & massage')}</div>${teaser}<div class="city-count">${n} ${n === 1 ? 'spa' : 'spas'} →</div></a>`;
};
write('cities', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta http-equiv="Cache-Control" content="no-cache">
<title>All Georgia spa cities | GA Spas</title>
<meta name="description" content="Browse spas in all ${live.length} Georgia cities — day spas, med spas, and massage from Atlanta to Savannah."/>
<link rel="canonical" href="${BASE_URL}/cities/"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
${PWA_HEAD}
</head>
<body>

<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
    <li><a href="/blog/">Blog</a></li>
  </ul>
  <a class="nav-cta" href="/pricing/">List your spa</a>
</nav>

<header class="hero hero--photo">
  <div class="hero-bg" data-hero-bg>
    <div class="hero-slide hslide-1 on"></div>
    <div class="hero-slide hslide-2"></div>
    <div class="hero-slide hslide-3"></div>
  </div>
  <div class="wrap hero-inner">
    <div class="eyebrow">Every city we cover</div>
    <h1><em>All</em> Georgia<br>spa cities</h1>
    <p class="hero-sub">From Atlanta to Savannah — browse day spas, med spas, and massage studios in every Georgia city we've mapped.</p>
    <p class="hero-proof"><strong>${ACTIVE.length} spas</strong> across <strong>${live.length} cities</strong></p>
    <form class="search" id="home-search" action="/cities/" method="get" autocomplete="off">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39D8E" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="home-q" name="q" type="search" placeholder="Search by city, neighborhood, or service…" aria-label="Search spas"/>
        <button class="btn btn-go" type="submit">Find spas</button>
      </div>
    </form>
    <p class="loc-note" id="home-loc-note" hidden></p>
    <div class="pills">
      <a class="pill" href="/">All</a>
      <a class="pill" href="/category/day-spas/">Day Spas</a>
      <a class="pill" href="/category/med-spas/">Med Spas</a>
      <a class="pill" href="/category/massage/">Massage</a>
      <a class="pill bo" href="/black-owned/">✦ Black-Owned</a>
    </div>
  </div>
</header>

<section class="band">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">The full directory</div>
        <h2 class="serif">Every Georgia spa city</h2>
      </div>
      <a class="sec-link" href="/">← Back home</a>
    </div>
    <div class="cities-grid">
      ${live.map(cityIndexCard).join('\n      ')}
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-top">
      <div>
        <div class="foot-logo">GA<span>.Spas</span></div>
        <div class="foot-tag">Georgia's hyper-local spa and wellness directory. Curated, not algorithmic — every listing visited, verified, and written about by people who live here.</div>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Explore</div>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/black-owned/">Black-owned spas</a>
        <a href="/category/med-spas/">Med spas in GA</a>
        <a href="/areas/">Spas by area &amp; zip</a>
        <a href="/cities/">All Georgia cities</a>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">For owners</div>
        <a href="/pricing/">List free</a>
        <a href="/pricing/#standard">Standard — $49/mo</a>
        <a href="/pricing/#premium">Premium — $149/mo</a>
        <a href="/pricing/">See all plans</a>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Company</div>
        <a href="/pricing/">Pricing</a>
        <a href="/blog/">Blog</a>
        <a href="https://artivicolab.com/#contact" target="_blank" rel="noopener">Contact us</a>
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/pricing/">List your spa →</a>
    </div>
  </div>
</footer>

<script type="application/json" id="zip-centroids">${JSON.stringify(ZIP_CENTROIDS)}</script>
<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);

// ---------- pricing page (the freemium tiers — the card IS the product) ----------
const tierFeats = (items) => items.map(f =>
  `<li class="${f[0]}">${f[1]}</li>`).join('\n          ');
const FREE_FEATS = [
  ['', 'Spa name'],
  ['', 'Category — Day Spa, Med Spa, Massage'],
  ['', 'City &amp; neighborhood'],
  ['', 'Phone number + <strong>Call</strong> button'],
  ['', 'Google rating &amp; review count'],
  ['off', 'No photos'],
  ['off', 'No hours, services, or description'],
  ['off', 'Sorted last in results'],
];
const STD_FEATS = [
  ['hd', 'Everything in Free, plus —'],
  ['', '1 photo'],
  ['', 'Short description (written by us)'],
  ['', 'Up to 5 service tags'],
  ['', 'Amenity badges — parking, couples, walk-ins, gift cards'],
  ['', 'Price range ($–$$$$)'],
  ['', 'Hours + open / closed status'],
  ['', 'Website link'],
  ['off', 'No promos, no ads — just a complete, honest card'],
];
const PREM_FEATS = [
  ['hd', 'Everything in Standard, plus —'],
  ['', 'Up to 6 photos (gallery)'],
  ['', 'Full editorial description'],
  ['', 'Unlimited service tags'],
  ['', 'Promotional offer line — your current deal'],
  ['', '<strong>Request Appointment</strong> button'],
  ['', 'Featured placement — gold card, top of results'],
  ['', 'Full hours shown on hover'],
  ['', 'Optional “Sponsored” tag'],
];
write('pricing', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta http-equiv="Cache-Control" content="no-cache">
<title>Pricing — list your spa | GA Spas</title>
<meta name="description" content="Simple pricing for Georgia spa owners. Free ghost listing, Standard at $49/mo, Premium at $149/mo. The card is the product — scan, compare, call."/>
<link rel="canonical" href="${BASE_URL}/pricing/"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
${PWA_HEAD}
</head>
<body>

<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
    <li><a href="/blog/">Blog</a></li>
  </ul>
  <a class="nav-cta" href="/pricing/">List your spa</a>
</nav>

<header class="hero hero--photo">
  <div class="hero-bg" data-hero-bg>
    <div class="hero-slide hslide-1 on"></div>
    <div class="hero-slide hslide-2"></div>
    <div class="hero-slide hslide-3"></div>
  </div>
  <div class="wrap hero-inner">
    <div class="eyebrow">For spa owners</div>
    <h1><em>Simple</em> pricing.<br>The card is the product.</h1>
    <p class="hero-sub">No profile pages, no dashboards, no clicking through. Visitors scan, compare, and call — your card does the selling. Pay only for how much of it you want to show.</p>
    <p class="hero-proof"><strong>${ACTIVE.length.toLocaleString()} spas</strong> already listed across Georgia</p>
  </div>
</header>

<section class="band">
  <div class="wrap">
    <div class="pricing-grid">

      <article class="tier">
        <div class="tier-name">Free</div>
        <div class="tier-price">$0<span>/mo</span></div>
        <div class="tier-tag">The ghost listing. Exists, but barely.</div>
        <a class="tier-cta ghost" href="mailto:artivicolab@gmail.com?subject=GASpas%20List%20My%20Spa%20(Free)">List free →</a>
        <ul class="tier-feats">
          ${tierFeats(FREE_FEATS)}
        </ul>
      </article>

      <article class="tier" id="standard">
        <div class="tier-name">Standard</div>
        <div class="tier-price">$49<span>/mo</span></div>
        <div class="tier-tag">A complete, professional card. Looks credible.</div>
        <a class="tier-cta" href="mailto:artivicolab@gmail.com?subject=GASpas%20Standard%20Listing%20(%2449%2Fmo)">Go Standard →</a>
        <ul class="tier-feats">
          ${tierFeats(STD_FEATS)}
        </ul>
      </article>

      <article class="tier tier--featured" id="premium">
        <div class="tier-flag">Most popular</div>
        <div class="tier-name">Premium</div>
        <div class="tier-price">$149<span>/mo</span></div>
        <div class="tier-tag">The full card. Packed. Stands out immediately.</div>
        <a class="tier-cta" href="mailto:artivicolab@gmail.com?subject=GASpas%20Premium%20Listing%20(%24149%2Fmo)">Go Premium →</a>
        <ul class="tier-feats">
          ${tierFeats(PREM_FEATS)}
        </ul>
      </article>

    </div>
    <div class="bo-free">✦ <strong>The Black-owned badge is free on every plan</strong> — even Free. Just message us from your business email and we'll verify and add it. <a href="mailto:artivicolab@gmail.com?subject=GASpas%20Black-owned%20verification">Verify your spa →</a></div>
    <p class="pricing-note">Three tiers. One card. The difference is visible at a glance — free cards look thin, standard cards look solid, premium cards look like the place you want to book. Questions? <a href="https://artivicolab.com/#contact" target="_blank" rel="noopener">Contact us</a>.</p>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-top">
      <div>
        <div class="foot-logo">GA<span>.Spas</span></div>
        <div class="foot-tag">Georgia's hyper-local spa and wellness directory. Curated, not algorithmic — every listing visited, verified, and written about by people who live here.</div>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Explore</div>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/black-owned/">Black-owned spas</a>
        <a href="/category/med-spas/">Med spas in GA</a>
        <a href="/areas/">Spas by area &amp; zip</a>
        <a href="/cities/">All Georgia cities</a>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">For owners</div>
        <a href="/pricing/">List free</a>
        <a href="/pricing/#premium">Standard — $49/mo</a>
        <a href="/pricing/#premium">Premium — $149/mo</a>
        <a href="/pricing/">See all plans</a>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Company</div>
        <a href="/pricing/">Pricing</a>
        <a href="/blog/">Blog</a>
        <a href="https://artivicolab.com/#contact" target="_blank" rel="noopener">Contact us</a>
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/pricing/">List your spa →</a>
    </div>
  </div>
</footer>

<script type="application/json" id="zip-centroids">${JSON.stringify(ZIP_CENTROIDS)}</script>
<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);

// hair salons — coming soon (keeps the homepage pill from 404ing)
write('category/hair-salons', shell({
  title: 'Hair salons in Georgia | GA Spas',
  desc: 'Hair salons are coming soon to GA Spas.',
  path: '/category/hair-salons/', noindex: true,
  body: `    <section class="hero"><h1>Hair salons — coming soon</h1>
      <p>We're a spa directory first; hair salons are next. <a href="/">Browse spas</a> in the meantime.</p></section>`,
}));
noindexed.add('/category/hair-salons/');

for (const { slug, name, listings } of live) {
  counts.cities++;
  homeStylePage({
    relPath: slug, canonical: `/${slug}/`, pool: listings, activePill: 'all',
    title: `Spas in ${name}, GA — Directory | GA Spas`,
    desc: `Browse every spa in ${name}, Georgia — day spas, med spas & massage. Ratings, hours, and directions.`,
    heroEyebrow: `Spa directory · ${name}, Georgia`,
    heroH1: `<em>Spas</em><br>in ${name}`,
    heroSub: `Every day spa, med spa, and massage studio in ${name}, Georgia — with ratings, hours, and directions.`,
    heroProof: `<strong>${listings.length} ${listings.length === 1 ? 'spa' : 'spas'}</strong> listed in ${name}, Georgia`,
    featEyebrow: 'Spotlight', featH2: `Featured in ${name}`, spotPlace: name, fillCity: slug,
    showBoBand: false, showCities: true, showTesti: false,
    showAll: true, allEyebrow: 'The full list', allH2: `All spas in ${name}`,
    cityScope: 'all', citiesEyebrow: 'Explore', citiesH2: 'Other Georgia cities',
  });

  for (const type of [...new Set(listings.map(s => s.type))]) {
    const list = listings.filter(s => s.type === type);
    counts.category++;
    homeStylePage({
      relPath: `${slug}/${catSlug(type)}`, canonical: `/${slug}/${catSlug(type)}/`, pool: list, activePill: 'all',
      title: `${cap(catLabel(type))} in ${name}, GA | GA Spas`,
      desc: `Browse ${catLabel(type)} in ${name}, Georgia — ratings, hours, and directions.`,
      heroEyebrow: `${cap(catLabel(type))} · ${name}, Georgia`,
      heroH1: `<em>${cap(catLabel(type))}</em><br>in ${name}`,
      heroSub: `Every ${catLabel(type)} listing in ${name}, Georgia — with ratings, hours, and directions.`,
      heroProof: `<strong>${list.length}</strong> ${catLabel(type)} listed in ${name}`,
      featEyebrow: 'Spotlight', featH2: `Featured ${catLabel(type)}`, spotPlace: name,
      showBoBand: false, showCities: false, showTesti: false,
      showAll: true, allEyebrow: 'The full list', allH2: `All ${catLabel(type)} in ${name}`,
    });
  }

  const cityBO = listings.filter(s => s.blackOwned);
  if (cityBO.length) {
    counts.cityBO++;
    homeStylePage({
      relPath: `${slug}/black-owned`, canonical: `/${slug}/black-owned/`, pool: cityBO, activePill: 'bo',
      title: `Black-Owned Spas in ${name} GA | GA Spas`,
      desc: `Black-owned spas and wellness businesses in ${name}, Georgia. Discover, support, and book.`,
      heroEyebrow: 'Community first',
      heroH1: `<em>Black-owned</em> spas<br>in ${name}`,
      heroSub: `Support Black-owned day spas, med spas, and massage studios in ${name} — verified and featured.`,
      heroProof: `<strong>${cityBO.length} Black-owned ${cityBO.length === 1 ? 'spa' : 'spas'}</strong> in ${name}`,
      featEyebrow: 'Hand-picked', featH2: `Featured Black-owned in ${name}`, spotPlace: `${name} Black-owned`,
      showBoBand: false, showCities: false, showTesti: false,
      showAll: true, allEyebrow: 'The full list', allH2: `All Black-owned spas in ${name}`,
    });
  }
}

// roadmap: GA_CITIES not yet covered → noindex "expanding soon" page
for (const e of GA_CITIES) {
  if (liveSlugs.has(e.slug)) continue;
  counts.comingSoon++;
  write(e.slug, shell({
    title: `Spas in ${e.name} GA | GA Spa Directory`,
    desc: `Spas in ${e.name}, Georgia — we're expanding here soon. Explore nearby cities in the meantime.`,
    path: `/${e.slug}/`, noindex: true,
    body: `    <section class="hero">
      <h1>Spas in ${esc(e.name)}</h1>
      <p>We're expanding our spa directory to ${esc(e.name)}, GA. No spas are listed here yet — if you own or know a great spa in ${esc(e.name)}, <a href="mailto:artivicolab@gmail.com?subject=${encodeURIComponent('Add a spa in ' + e.name)}">tell us</a> and we'll add it.</p>
    </section>
    <h2 class="section">Browse spas in nearby cities</h2>
    <p>${liveLinks || '<a href="/">See all cities</a>'}</p>
    <h2 class="section">Browse by type</h2>
    <p><a href="/category/day-spas/">Day spas</a> · <a href="/category/med-spas/">Med spas</a> · <a href="/category/massage/">Massage</a> · <a href="/black-owned/">Black-owned spas</a></p>`,
  }));
  noindexed.add(`/${e.slug}/`);
}

// (statewide Black-owned /black-owned/ is now a home-style page — see homeStylePage above)

// statewide categories
for (const type of [...new Set(ACTIVE.map(s => s.type))]) {
  const list = ACTIVE.filter(s => s.type === type);
  counts.statewide++;
  homeStylePage({
    relPath: `category/${catSlug(type)}`, canonical: `/category/${catSlug(type)}/`, pool: list, activePill: 'all',
    title: `${cap(catLabel(type))} in Georgia | GA Spas`,
    desc: `Browse ${catLabel(type)} across Georgia — ratings, hours, and directions.`,
    heroEyebrow: `${cap(catLabel(type))} across Georgia`,
    heroH1: `<em>${cap(catLabel(type))}</em><br>in Georgia`,
    heroSub: `Every ${catLabel(type)} listing across Georgia — with ratings, hours, and directions.`,
    heroProof: `<strong>${list.length}</strong> ${catLabel(type)} across ${live.length} Georgia cities`,
    featEyebrow: 'Spotlight', featH2: `Featured ${catLabel(type)}`,
    showBoBand: false, showCities: true, showTesti: false,
    showAll: true, allEyebrow: 'The full list', allH2: `All ${catLabel(type)} in Georgia`,
    cityScope: 'all', citiesEyebrow: 'Explore', citiesH2: 'Browse by city',
  });
}

// ---------------------------------------------------------------------------
// "Spas near me" surface: zip-code pages (/zip/30305/) + Atlanta neighborhood
// pages (/atlanta/buckhead/). Each is the full spa pool filtered to within
// RADIUS miles of a fixed centroid, sorted by our usual rank. We can't win the
// Google Maps 3-pack for "spa near me" (we're a directory, not a business), but
// these win the organic "day spas near 30305" / "spa near Buckhead" queries
// where almost no quality pages exist. Thin results (<5 spas) are noindex'd so
// we don't flood the index. Discovery: the /areas/ hub + every footer links here.
// ---------------------------------------------------------------------------
const AREA_RADIUS = 5;          // miles from centroid
const AREA_INDEX_MIN = 5;       // index only if >= this many spas nearby
const withinArea = (c) => ACTIVE
  .filter(s => s.lat && s.lng && milesBetween(c, s) <= AREA_RADIUS)
  .map(s => ({ s, mi: milesBetween(c, s) }))
  .sort((a, b) => a.mi - b.mi)
  .map(o => o.s);

// High-value Georgia zip codes (centroids are zip-area centers).
const ZIP_AREAS = [
  { zip: '30305', area: 'Buckhead', city: 'Atlanta', lat: 33.8380, lng: -84.3790 },
  { zip: '30308', area: 'Midtown', city: 'Atlanta', lat: 33.7710, lng: -84.3800 },
  { zip: '30309', area: 'Midtown / Arts Center', city: 'Atlanta', lat: 33.7930, lng: -84.3870 },
  { zip: '30326', area: 'Lenox / Buckhead', city: 'Atlanta', lat: 33.8470, lng: -84.3620 },
  { zip: '30328', area: 'Sandy Springs', city: 'Atlanta', lat: 33.9350, lng: -84.3780 },
  { zip: '30342', area: 'Buckhead / Sandy Springs', city: 'Atlanta', lat: 33.8860, lng: -84.3780 },
  { zip: '30033', area: 'Decatur', city: 'Decatur', lat: 33.8150, lng: -84.2790 },
  { zip: '30030', area: 'Downtown Decatur', city: 'Decatur', lat: 33.7740, lng: -84.2960 },
  { zip: '30022', area: 'Alpharetta / Johns Creek', city: 'Alpharetta', lat: 34.0270, lng: -84.2430 },
  { zip: '30005', area: 'Alpharetta', city: 'Alpharetta', lat: 34.0750, lng: -84.2220 },
  { zip: '30076', area: 'Roswell', city: 'Roswell', lat: 34.0340, lng: -84.3020 },
  { zip: '30009', area: 'Downtown Alpharetta', city: 'Alpharetta', lat: 34.0730, lng: -84.2950 },
  { zip: '30024', area: 'Suwanee', city: 'Suwanee', lat: 34.0520, lng: -84.0690 },
  { zip: '30092', area: 'Peachtree Corners', city: 'Peachtree Corners', lat: 33.9690, lng: -84.2210 },
  { zip: '30096', area: 'Duluth', city: 'Duluth', lat: 33.9620, lng: -84.1490 },
  { zip: '30097', area: 'Duluth / Johns Creek', city: 'Duluth', lat: 34.0260, lng: -84.1510 },
  { zip: '30062', area: 'East Cobb, Marietta', city: 'Marietta', lat: 33.9980, lng: -84.4750 },
  { zip: '30068', area: 'East Cobb, Marietta', city: 'Marietta', lat: 33.9650, lng: -84.4520 },
  { zip: '30067', area: 'Marietta / Vinings', city: 'Marietta', lat: 33.9380, lng: -84.4800 },
  { zip: '30080', area: 'Smyrna', city: 'Smyrna', lat: 33.8650, lng: -84.5130 },
  { zip: '30082', area: 'Smyrna', city: 'Smyrna', lat: 33.8630, lng: -84.5530 },
  { zip: '30060', area: 'Downtown Marietta', city: 'Marietta', lat: 33.9260, lng: -84.5300 },
];

const zipPages = [];
for (const z of ZIP_AREAS) {
  const pool = withinArea(z);
  if (!pool.length) continue;
  const ni = pool.length < AREA_INDEX_MIN;
  const place = `${z.area} (${z.zip})`;
  counts.zip = (counts.zip || 0) + 1;
  zipPages.push({ ...z, count: pool.length, ni });
  homeStylePage({
    relPath: `zip/${z.zip}`, canonical: `/zip/${z.zip}/`, pool, activePill: 'all',
    noindex: ni, geoPoint: { lat: z.lat, lng: z.lng },
    title: `Spas near ${z.zip} — ${z.area}, ${z.city} GA | GA Spas`,
    desc: `Day spas, med spas & massage near zip code ${z.zip} (${z.area}, ${z.city}, GA) — ratings, hours, and directions, sorted by distance.`,
    heroEyebrow: `Spas near ${z.zip} · ${z.city}, Georgia`,
    heroH1: `<em>Spas near</em><br>${z.zip}`,
    heroSub: `Day spas, med spas, and massage within ${AREA_RADIUS} miles of ${z.area} (${z.zip}), ${z.city}, GA — ratings, hours, and directions.`,
    heroProof: `<strong>${pool.length} ${pool.length === 1 ? 'spa' : 'spas'}</strong> near ${z.zip} · ${z.area}`,
    featEyebrow: 'Closest to you', featH2: `Top spas near ${z.zip}`, spotPlace: place,
    showBoBand: false, showCities: false, showTesti: false,
    showAll: true, allEyebrow: 'The full list', allH2: `All spas near ${z.zip}`,
  });
}

// Atlanta neighborhood pages — "spa near Buckhead" style queries.
const ATL_HOODS = [
  { slug: 'buckhead', name: 'Buckhead', lat: 33.8470, lng: -84.3710 },
  { slug: 'midtown', name: 'Midtown', lat: 33.7810, lng: -84.3830 },
  { slug: 'west-end', name: 'West End', lat: 33.7350, lng: -84.4130 },
  { slug: 'decatur', name: 'Decatur', lat: 33.7740, lng: -84.2960 },
  { slug: 'sandy-springs', name: 'Sandy Springs', lat: 33.9240, lng: -84.3780 },
  { slug: 'east-atlanta', name: 'East Atlanta', lat: 33.7400, lng: -84.3410 },
  { slug: 'college-park', name: 'College Park', lat: 33.6530, lng: -84.4490 },
  { slug: 'dunwoody', name: 'Dunwoody', lat: 33.9460, lng: -84.3340 },
  { slug: 'brookhaven', name: 'Brookhaven', lat: 33.8600, lng: -84.3390 },
  { slug: 'inman-park', name: 'Inman Park', lat: 33.7620, lng: -84.3530 },
];

const hoodPages = [];
for (const h of ATL_HOODS) {
  // spas within radius OR whose address explicitly names the neighborhood
  const near = new Set(withinArea(h));
  for (const s of ACTIVE) if (s.address && s.address.toLowerCase().includes(h.name.toLowerCase())) near.add(s);
  const pool = [...near]
    .filter(s => s.lat && s.lng)
    .map(s => ({ s, mi: milesBetween(h, s) }))
    .sort((a, b) => a.mi - b.mi)
    .map(o => o.s);
  if (!pool.length) continue;
  const ni = pool.length < AREA_INDEX_MIN;
  counts.hood = (counts.hood || 0) + 1;
  hoodPages.push({ ...h, count: pool.length, ni });
  homeStylePage({
    relPath: `atlanta/${h.slug}`, canonical: `/atlanta/${h.slug}/`, pool, activePill: 'all',
    noindex: ni, geoPoint: { lat: h.lat, lng: h.lng },
    title: `Day Spas in ${h.name}, Atlanta GA | GA Spas`,
    desc: `Day spas, med spas & massage in ${h.name}, Atlanta, GA — ratings, hours, and directions, sorted by distance.`,
    heroEyebrow: `${h.name} · Atlanta, Georgia`,
    heroH1: `<em>Spas in</em><br>${h.name}`,
    heroSub: `Day spas, med spas, and massage in and around ${h.name}, Atlanta — ratings, hours, and directions.`,
    heroProof: `<strong>${pool.length} ${pool.length === 1 ? 'spa' : 'spas'}</strong> in ${h.name}, Atlanta`,
    featEyebrow: 'Hand-picked', featH2: `Top spas in ${h.name}`, spotPlace: `${h.name}, Atlanta`,
    showBoBand: false, showCities: false, showTesti: false,
    showAll: true, allEyebrow: 'The full list', allH2: `All spas in ${h.name}`,
  });
}

// /areas/ hub — links every neighborhood + zip page (crawl path + a useful index).
{
  const hoodLinks = hoodPages.map(h =>
    `<a class="area-link" href="/atlanta/${h.slug}/">${esc(h.name)} <span>${h.count}</span></a>`).join('\n        ');
  const zipLinks = zipPages.map(z =>
    `<a class="area-link" href="/zip/${z.zip}/">${z.zip} · ${esc(z.area)} <span>${z.count}</span></a>`).join('\n        ');
  write('areas', shell({
    title: 'Spas near you — by neighborhood & zip code in Georgia | GA Spas',
    desc: 'Find spas near you in Georgia by neighborhood (Buckhead, Midtown, Sandy Springs) or by zip code. Day spas, med spas & massage sorted by distance.',
    path: '/areas/',
    body: `    <section class="hero"><h1>Spas near you</h1>
      <p>Browse Georgia spas by Atlanta neighborhood or by metro-area zip code — each list is sorted by distance. Looking for the closest spa right now? Use <a href="/">Near me</a> on the home page.</p></section>
    <h2 class="section">Atlanta neighborhoods</h2>
    <div class="area-links">
        ${hoodLinks || '<a href="/atlanta/">Atlanta spas</a>'}
    </div>
    <h2 class="section">Spas by zip code</h2>
    <div class="area-links">
        ${zipLinks}
    </div>
    <h2 class="section">Browse by city instead</h2>
    <p>${liveLinks || '<a href="/cities/">All Georgia cities</a>'}</p>`,
  }));
}

// NO per-spa landing pages — the card IS the listing (a "business card"). It links
// out to the spa's own site / Google Maps. Avoids 500+ thin pages for churning spas.

// like index (every active spa, keyed by its URL) — used by the client-rendered
// /liked/ page to re-render saved cards with the shared renderCard().
{
  const likeIndex = {};
  for (const s of ACTIVE) likeIndex[s.id] = { ...s, href: spaLink(s), cityName: cityNameOf(s) };
  writeFileSync(join(ROOT, 'js/liked-index.js'),
    '// AUTO-GENERATED by scripts/generate-pages.mjs — do not edit by hand.\n' +
    'export const LIKE_INDEX = ' + JSON.stringify(likeIndex) + ';\n');
}

// /liked/ — the user's saved spas, rendered client-side from localStorage (noindex)
write('liked', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta name="robots" content="noindex,follow">
<title>Your saved spas | GA Spas</title>
<meta name="description" content="The spas you've saved on GA Spas."/>
<link rel="canonical" href="${BASE_URL}/liked/"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
${PWA_HEAD}
</head>
<body>
<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
    <li><a href="/blog/">Blog</a></li>
  </ul>
  <a class="nav-cta" href="/pricing/">List your spa</a>
</nav>

<section class="band" style="padding-top:130px">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">Saved by you</div>
        <h2 class="serif">Your saved spas</h2>
      </div>
      <a class="sec-link" href="/">Browse more spas →</a>
    </div>
    <div class="feat-grid" id="liked-grid"></div>
    <div class="liked-empty" id="liked-empty" hidden>
      <div class="le-heart">♥</div>
      <h2>No liked spas yet</h2>
      <p>Tap the heart on any spa to save it here. <a href="/">Start browsing →</a></p>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-bot">
      <span>© 2026 GA Spas · Built in Atlanta</span>
      <a class="foot-list" href="/">← Back to GA Spas</a>
    </div>
  </div>
</footer>

<script type="module">
  import { renderCard } from '/js/card.js?v=${ASSET_VER}';
  import { LIKE_INDEX } from '/js/liked-index.js?v=${ASSET_VER}';
  const grid = document.getElementById('liked-grid');
  const empty = document.getElementById('liked-empty');
  const read = () => { try { return JSON.parse(localStorage.getItem('gaspas:likes') || '[]'); } catch { return []; } };
  const items = read().map((h) => LIKE_INDEX[h]).filter(Boolean);
  grid.innerHTML = items.map((s) => renderCard(s, { href: s.href, cityName: s.cityName })).join('');
  empty.hidden = items.length > 0;
  // when a card is un-liked here, drop it from the grid
  document.addEventListener('likeschanged', () => {
    const liked = new Set(read());
    grid.querySelectorAll('.like-btn[data-like]').forEach((b) => { if (!liked.has(b.dataset.like)) b.closest('.card')?.remove(); });
    empty.hidden = !!grid.querySelector('.card');
  });
</script>
<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);
noindexed.add('/liked/');

// blog index + one sample post
write('blog', shell({
  title: 'The Georgia Spa Blog | Local Guides & Roundups',
  desc: 'Local guides and roundups: the best day spas, med spas, and massage across Georgia, neighborhood by neighborhood.',
  path: '/blog/',
  body: `    <section class="hero"><h1>The Georgia Spa Blog</h1>
      <p>Roundups and local guides, written by people who live here.</p></section>
    <div class="listing-grid">
      <a class="city-card" href="/blog/best-spas-atlanta/"><div class="city-name">The Best Spas in Atlanta (2026)</div><div class="city-blurb">A neighborhood-by-neighborhood roundup of Atlanta's top day spas and med spas.</div><div class="city-count">Read →</div></a>
    </div>`,
}));

const atl = byRank(ACTIVE.filter(s => s.city === 'atlanta')).slice(0, 6);
write('blog/best-spas-atlanta', shell({
  title: 'The Best Spas in Atlanta (2026) | GA Spa Directory',
  desc: 'Our roundup of the best spas in Atlanta — top day spas, med spas, and massage, including standout Black-owned wellness across Buckhead, Midtown, and beyond.',
  path: '/blog/best-spas-atlanta/',
  body: `    <section class="hero"><h1>The best spas in Atlanta (2026)</h1>
      <p>From Midtown day spas to Buckhead wellness studios, here are the Atlanta spots worth booking right now — with a few standout <a href="/black-owned/">Black-owned</a> picks.</p></section>
    <ul class="blog-spa-list">
      ${atl.map(s => `<li><a href="${spaLink(s)}" target="_blank" rel="noopener nofollow">${esc(s.name)}</a> · ${esc(cityNameOf(s))}${s.rating ? ` · ${s.rating}★` : ''}</li>`).join('\n      ')}
    </ul>
    <p><a href="/atlanta/">See all Atlanta spas →</a></p>`,
}));

// sitemap.xml at the publish root (excludes noindex "coming soon" pages)
const indexed = [...new Set(urls)].filter(u => !noindexed.has(u));
writeFileSync(join(GA_DIR, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexed.map(u => `  <url><loc>${BASE_URL}${u}</loc></url>`).join('\n')}
</urlset>
`);

// report
console.log('Built static tree (publish root = ga/, deploys to ' + BASE_URL + '):');
console.log(`  live cities ${counts.cities} · city+category ${counts.category} · city black-owned ${counts.cityBO}`);
console.log(`  statewide ${counts.statewide} · profiles ${counts.profiles} · blog 2 · home 1`);
console.log(`  coming-soon cities (noindex until they get listings): ${counts.comingSoon}`);
console.log(`  total pages: ${urls.length}   sitemap.xml: ${indexed.length} indexable URLs`);
