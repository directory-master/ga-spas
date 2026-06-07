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
import { CITY_COUNTY, countySlug } from '../js/data/ga-counties.js';
import { IMPORTED } from '../js/data/spas-imported.js';
import { statusLong } from '../js/hours.js';
import { renderCard } from '../js/card.js';
import { topOfState, mostRated, mostRatedFiveStar, hiddenGem, score } from './top-spas.mjs';

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

// Google Analytics 4 (GA4). Injected immediately after <head> on EVERY page, so
// every page view is tracked. js/analytics.js adds event tracking for every spa
// card interaction (call / website / directions / save / claim / open) and every
// button & outbound link click.
const GA_ID = 'G-Y842GGLJVN';
const GA_HEAD = `<!-- Google tag (gtag.js) + Consent Mode v2 (GDPR) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
// Consent Mode v2: deny storage by default in the EEA/UK/CH until the visitor
// opts in (GDPR); allow it elsewhere. A stored choice (js/consent.js) overrides.
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500,region:['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH']});
gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
try{var _c=localStorage.getItem('ga-consent');if(_c==='granted'){gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});}else if(_c==='denied'){gtag('consent','update',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});}}catch(e){}
gtag('js', new Date());
gtag('config', '${GA_ID}');
</script>
<script defer src="/js/analytics.js?v=${ASSET_VER}"></script>
<script defer src="/js/consent.js?v=${ASSET_VER}"></script>`;
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

// A genuine descriptive paragraph for area pages (zip / neighborhood / city).
// Without it, the densest text on the page is card name·address lines, so Google
// scrapes those into a semicolon "address dump" snippet instead of our meta
// description. This gives the crawler real, query-relevant prose to quote.
const TYPE_NOUN = { 'Day Spa': 'day spa', 'Med Spa': 'med spa', 'Massage': 'massage studio' };
// `lead` answers "Need a spa ___?" (e.g. "near 31210"); `place` is the city we say
// the results sit "around" (only when it adds info the lead doesn't already carry).
const CLOSE_DISTANCE = 'are sorted by distance — compare ratings, hours, and directions in one place';
const CLOSE_STATEWIDE = 'are gathered in one place — compare ratings, hours, and directions';
function areaIntro(pool, lead, place = '', closer = CLOSE_DISTANCE) {
  const real = pool.filter(s => !s.example && s.name);
  const n = real.length;
  if (!n) return '';
  const present = ['Day Spa', 'Med Spa', 'Massage'].filter(t => real.some(s => s.type === t));
  const nouns = present.map(t => TYPE_NOUN[t] + 's');
  const mix = nouns.length > 1 ? nouns.slice(0, -1).join(', ') + ', and ' + nouns.slice(-1) : nouns[0];
  const at = place ? ` around ${place}` : '';
  if (n === 1) return `Need a spa ${lead}? One ${TYPE_NOUN[present[0]]}${at}, with ratings, hours, and directions.`;
  return `Need a spa ${lead}? These ${n} ${mix}${at} ${closer}.`;
}

// Curated demo seeds (example:true, spa types only) used to SHOW what the Premium
// and Standard tiers look like on EVERY city/county/zip page — so a tier row is
// never just empty "spot available" cards. renderCard marks them is-example with
// /pricing/ CTAs, so they read as previews, never as real bookable businesses.
const EXAMPLE_PREMIUM = byRank(SPAS.filter(s => s.example && s.tier === 'premium' && ACTIVE_TYPES.has(s.type)));
const EXAMPLE_STANDARD = byRank(SPAS.filter(s => s.example && s.tier === 'standard' && ACTIVE_TYPES.has(s.type)));

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

// compact spa records for an embedded map (#map-spas) — js/map.js plots these.
// A `rank` (1-based) is carried through when present (the home top-10 map).
const mapSpasJson = (list) => JSON.stringify(list.filter(s => s.lat && s.lng).map(s => ({
  name: s.name, lat: s.lat, lng: s.lng, type: s.type || '', city: cityNameOf(s),
  rating: s.rating || 0, reviews: s.reviews || 0, href: spaLink(s),
  ...(s.rank ? { rank: s.rank } : {}),
})));

function shell({ title, desc, path, jsonLd = '', body, noindex = false }) {
  const canonical = BASE_URL + path;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  ${GA_HEAD}
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
  <meta property="og:site_name" content="Georgia Spa Directory">
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
        <p>Georgia's spa & wellness directory — day spas, med spas, and massage across the state, compiled from public business listings and refreshed regularly.</p>
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
        <a href="/counties/">Spas by county</a>
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
        <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20enquiry">Contact us</a>
        <a href="/privacy/">Privacy policy</a>
        <a href="/terms/">Terms of service</a>
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
const GENERATED_ROOTS = new Set(['spas', 'cities', 'category', 'black-owned', 'county', 'counties']);
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
// Embedded client-side so "use my location" can route the visitor to the
// nearest live city PAGE (/<slug>/) — see js/home.js routeToNearestCity.
const CITY_CENTROIDS_JSON = JSON.stringify(
  Object.values(cityCentroid).map(c => ({ slug: c.slug, name: c.name, lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5) }))
);

// Client-side SEARCH INDEX — every real (non-example) spa as a compact record the
// /search/ page filters by name/city/type and renders into real cards (js/card.js).
// Only the fields a FREE card + its outbound link need are emitted, to keep it lean.
const searchIndex = byRank(ACTIVE.filter(s => !s.example)).map(s => ({
  id: s.id, name: s.name, type: s.type,
  cityName: cityNameOf(s), citySlug: citySlug(cityNameOf(s) || s.city || ''),
  rating: s.rating || 0, reviews: s.reviews || 0,
  ...(s.lat ? { lat: s.lat } : {}), ...(s.lng ? { lng: s.lng } : {}),
  ...(s.website ? { website: s.website } : {}),
  ...(s.address ? { address: s.address } : {}),
  ...(s.zip ? { zip: s.zip } : {}),
  ...(s.blackOwned ? { blackOwned: true } : {}),
}));
writeFileSync(join(ROOT, 'js', 'data', 'search-index.js'),
  `// AUTO-GENERATED by scripts/generate-pages.mjs — do not hand-edit.\n// ${searchIndex.length} spas, used by /search/ (js/search.js).\nexport const INDEX = ${JSON.stringify(searchIndex)};\n`);
footerCities = live.slice(0, 6).map(p => `<a href="/${p.slug}/">${esc(p.name)}</a>`).join('\n        ');

// Roll live cities up to their PRIMARY Georgia county (js/data/ga-counties.js).
// Built here (before any page emits) so the home page can offer "Browse by county"
// AND the /county/ + /counties/ hub pages below reuse the same array.
const countyReg = new Map();      // county name -> { name, slug, cities: [live entry] }
const unmappedCounties = new Set();
for (const p of live) {
  const cn = CITY_COUNTY[p.slug];
  if (!cn) { unmappedCounties.add(p.slug); continue; }
  const c = countyReg.get(cn) || { name: cn, slug: countySlug(cn), cities: [] };
  c.cities.push(p);
  countyReg.set(cn, c);
}
const counties = [...countyReg.values()].map(c => {
  const cities = c.cities.sort((a, b) => b.listings.length - a.listings.length || a.name.localeCompare(b.name));
  const listings = byRank(cities.flatMap(p => p.listings));
  return { ...c, cities, listings, count: listings.length };
}).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
if (unmappedCounties.size)
  console.log(`  ⚠ ${unmappedCounties.size} live cities have no county mapping (add to ga-counties.js):`, [...unmappedCounties].join(', '));
const countyUrl = (c) => `/county/${c.slug}/`;

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
  showCounties = false, countiesEyebrow = 'By county', countiesH2 = 'Browse by county',
  topSpas = [], topSpots = [], topEyebrow = '', topH2 = '', fillCity = '', noindex = false, geoPoint = null, mapRadius = 0,
  mapEmbed = null, mapMarker = '', mapH2 = '', intro = '' }) {
  if (noindex) noindexed.add(canonical);
  const boCount = ACTIVE.filter(s => s.blackOwned).length;
  const fmtNbhd = (spa) => esc([spa.neighborhood, cityNameOf(spa) + ', GA', spa.price].filter(Boolean).join(' · '));

  // One shared renderer (js/card.js) → free / standard / premium. Runs here at
  // BUILD time so the body is static HTML (indexable), edited in exactly one place.
  const homeCard = (spa, photoClass, demoStatus) =>
    renderCard(spa, { href: spaLink(spa), cityName: cityNameOf(spa), photoClass, demoStatus });

  // Premium and standard NEVER share a row: premium (+ featured claim) on row 1,
  // standard on its own row 2. Only REAL paid spas count as paid here — example
  // seeds are demos used to fill the row (below), never treated as paying.
  const premiumSpas = byRank(pool.filter(s => s.tier === 'premium' && !s.example));
  const standardSpas = byRank(pool.filter(s => s.tier === 'standard' && !s.example));
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

  // Each paying tier gets its OWN row of EXACTLY 3 cards, in this order: real paid
  // spas → example DEMO cards (so every page shows what Premium/Standard look like,
  // never a row of blank "spot available" cards) → a claim card only if still short.
  // Premium row leads, standard row follows. Paid spas are never mixed with free.
  const padRow = (real, examples, claimCard, demo) => {
    const cards = real.map((s, i) => homeCard(s, i % 2 ? 'p2' : ''));
    for (let i = 0; cards.length < 3 && i < examples.length; i++) {
      const ex = examples[i];
      cards.push(homeCard(ex, cards.length % 2 ? 'p2' : '', demo ? DEMO_STATES[i % DEMO_STATES.length] : undefined));
    }
    while (cards.length < 3) cards.push(claimCard);
    return cards.join('\n      ');
  };
  const premiumCards = padRow(premiumSpas, EXAMPLE_PREMIUM, claimCard, true);
  const standardCards = padRow(standardSpas, EXAMPLE_STANDARD, standardClaimCard, false);

  // "All …" grid = every FREE spa (paid + example demos live in the rows above).
  // Ordered so CLAIMED listings (free spas with an image because the owner
  // contacted us) come first, then everyone else without an image — ranked within.
  const hasImg = (s) => ((s.images && s.images.length) || s.image) ? 0 : 1;
  const restSpas = byRank(pool.filter(s => s.tier !== 'premium' && s.tier !== 'standard' && !s.example)).sort((a, b) => hasImg(a) - hasImg(b));
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

  // Map section. Two modes:
  //  • EMBED (home): plot a fixed set of spas (e.g. the top 10) from a #map-spas
  //    JSON, optionally with pulsating star markers (mapMarker='star').
  //  • CITY / zip / neighborhood: read markers from the page's own cards + the
  //    visitor's location; city pages outline their county (authoritative
  //    CITY_COUNTY), zip/neighborhood draw their "within N miles" radius.
  const embedPts = (mapEmbed || []).filter(s => s.lat && s.lng);
  const mapCtr = geoPoint || (fillCity && cityCentroid[fillCity]);
  const mapCounty = fillCity ? (CITY_COUNTY[fillCity] || '') : '';
  let mapSection = '';
  if (embedPts.length) {
    const ctr = { lat: embedPts.reduce((a, s) => a + s.lat, 0) / embedPts.length, lng: embedPts.reduce((a, s) => a + s.lng, 0) / embedPts.length };
    mapSection = `<section class="band map-band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="eyebrow">On the map</div><h2 class="serif">${mapH2 || 'On the map'}</h2></div>
      <button class="map-locate" type="button" data-map-locate>📍 Show my location</button>
    </div>
    <div id="spa-map" class="spa-map" data-lat="${ctr.lat.toFixed(5)}" data-lng="${ctr.lng.toFixed(5)}" data-zoom="7"${mapMarker ? ` data-marker="${mapMarker}"` : ''} data-ver="${ASSET_VER}"></div>
  </div>
  <script type="application/json" id="map-spas">${mapSpasJson(embedPts)}</script>
  <script defer src="/vendor/leaflet/leaflet.js"></script>
  <script defer src="/js/map.js?v=${ASSET_VER}"></script>
</section>`;
  } else if (mapCtr) {
    mapSection = `<section class="band map-band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="eyebrow">On the map</div><h2 class="serif">${esc(spotPlace)} spas on the map</h2></div>
      <button class="map-locate" type="button" data-map-locate>📍 Show my location</button>
    </div>
    <div id="spa-map" class="spa-map" data-lat="${mapCtr.lat.toFixed(5)}" data-lng="${mapCtr.lng.toFixed(5)}" data-zoom="12"${mapCounty ? ` data-county="${esc(mapCounty)}"` : ''}${mapRadius ? ` data-radius="${mapRadius}"` : ''} data-ver="${ASSET_VER}"></div>
  </div>
  <script defer src="/vendor/leaflet/leaflet.js"></script>
  <script defer src="/js/map.js?v=${ASSET_VER}"></script>
</section>`;
  }
  const hasMap = !!mapSection;

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

  // Browse-by-county — same card design, links to /county/<slug>/ hub pages.
  const countyCards = !showCounties ? '' : counties.slice(0, 6).map((c, i) => {
    const top = c.listings.find(s => s.rating && !s.example) || c.listings[0];
    const teaser = (top && top.rating)
      ? `<div class="city-top"><span class="ct-star">★</span> ${top.rating.toFixed(1)} · ${esc(top.name)}</div>` : '';
    const sub = c.cities.slice(0, 3).map(p => esc(p.name)).join(', ');
    return `<a class="city${i === 0 ? ' hero-city' : ''}" href="${countyUrl(c)}"><div class="city-name">${esc(c.name)} County</div><div class="city-sub">${sub || 'Day spas, med spas & massage'}</div>${teaser}<div class="city-count">${c.count} ${c.count === 1 ? 'spa' : 'spas'} →</div></a>`;
  }).join('\n      ') +
    `\n      <a class="city all" href="/counties/"><div class="city-name">All ${counties.length} counties</div><div class="city-sub">${esc(counties.slice(6, 9).map(c => c.name + ' County').join(', '))} + more</div><div class="city-count">View all →</div></a>`;

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
    if (s.rating && s.reviews > 0) b.aggregateRating = { '@type': 'AggregateRating', ratingValue: s.rating, reviewCount: s.reviews };
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
  if (realSpas.length) {
    // Carousel requires every item.url to be unique. Chains / shared sites can
    // collide (two distinct spas, one website) → fall back to the per-spa maps
    // link (unique by name+address), then to an id-stamped one if even that ties.
    const usedUrls = new Set();
    graph.push({
      '@type': 'ItemList',
      itemListElement: realSpas.map((s, i) => {
        const b = business(s);
        if (usedUrls.has(b.url)) {
          const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name}, ${s.address || cityNameOf(s) || s.city || 'GA'}`)}`;
          b.url = usedUrls.has(maps) ? `${maps}&spa=${encodeURIComponent(s.id || i)}` : maps;
        }
        usedUrls.add(b.url);
        return { '@type': 'ListItem', position: i + 1, item: b };
      }),
    });
  }
  // WebPage + areaServed so Google knows the geographic area this page covers
  if (fillCity && spotPlace && spotPlace !== 'Georgia') graph.push({
    '@type': 'WebPage',
    name: title,
    url: BASE_URL + canonical,
    areaServed: { '@type': 'City', name: spotPlace, containedInPlace: { '@type': 'State', name: 'Georgia' } },
    about: { '@type': 'ItemList', name: `Spas in ${spotPlace}, Georgia`, numberOfItems: realSpas.length },
  });
  // Home only: WebSite (→ Google sitelinks search box, wired to /search/) +
  // Organization brand entity. These are what make the homepage SERP result rich.
  if (canonical === '/') {
    graph.push({
      '@type': 'WebSite', name: 'Georgia Spa Directory', alternateName: 'GA Spas', url: BASE_URL + '/',
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${BASE_URL}/search/?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    });
    graph.push({
      '@type': 'Organization', name: 'Georgia Spa Directory', alternateName: 'GA Spas', url: BASE_URL + '/', logo: `${BASE_URL}/images/og-cover.jpg`,
      description: `A directory of ${ACTIVE.length} day spas, med spas, and massage studios across Georgia.`,
    });
  }
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
<meta property="og:site_name" content="Georgia Spa Directory"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="${BASE_URL}/images/og-cover.jpg"/>`;
  const geoC = geoPoint || (fillCity && cityCentroid[fillCity]);
  const geoMeta = `<meta name="geo.region" content="US-GA"/>
<meta name="geo.placename" content="${esc((spotPlace && spotPlace !== 'Georgia') ? spotPlace + ', Georgia' : 'Georgia')}"/>${geoC ? `\n<meta name="geo.position" content="${geoC.lat.toFixed(4)};${geoC.lng.toFixed(4)}"/>\n<meta name="ICBM" content="${geoC.lat.toFixed(4)}, ${geoC.lng.toFixed(4)}"/>` : ''}`;

  write(relPath, `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta http-equiv="Cache-Control" content="no-cache">
<title>${title}</title>
<meta name="description" content="${esc(desc)}"/>${noindex ? '\n<meta name="robots" content="noindex,follow"/>' : ''}
<link rel="canonical" href="${BASE_URL}${canonical}"/>
${ogMeta}
${geoMeta}
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>${hasMap ? '\n<link rel="stylesheet" href="/vendor/leaflet/leaflet.css"/>' : ''}
${PWA_HEAD}
${ldJson}
</head>
<body>

<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
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
    <form class="search" id="home-search" action="/search/" method="get" autocomplete="off">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39D8E" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="home-q" name="q" type="search" placeholder="Search spas by name, city, or service…" aria-label="Search spas"/>
        <button class="btn btn-go" type="submit">Find spas</button>
      </div>
    </form>
    <p class="loc-note" id="home-loc-note" hidden></p>
    <div class="pills">
      <a class="pill${activePill === 'all' ? ' active' : ''}" href="/">All</a>
      <a class="pill" href="/spas-near-me/">📍 Near me</a>
      <a class="pill" href="/category/day-spas/">Day Spas</a>
      <a class="pill" href="/category/med-spas/">Med Spas</a>
      <a class="pill" href="/category/massage/">Massage</a>
      <a class="pill bo${activePill === 'bo' ? ' active' : ''}" href="/black-owned/">✦ Black-Owned</a>
    </div>
  </div>
</header>

${intro ? `<section class="band intro-band">
  <div class="wrap">
    <p class="area-intro">${intro}</p>
  </div>
</section>` : ''}

${premiumCards ? `<section class="band band--dots">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">${featEyebrow}</div>
        <h2 class="serif">${featH2}</h2>
      </div>
      <a class="sec-link" href="/cities/">View all spas →</a>
    </div>
    <div class="tier-row-label">Premium listings</div>
    <div class="feat-grid">
      ${premiumCards}
    </div>
    <div class="tier-row-label">Standard listings</div>
    <div class="feat-grid">
      ${standardCards}
    </div>
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

${mapSection}

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

${showCounties ? `<section class="band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">${countiesEyebrow}</div>
        <h2 class="serif">${countiesH2}</h2>
      </div>
      <a class="sec-link" href="/counties/">All ${counties.length} counties →</a>
    </div>
    <div class="cities-grid">
      ${countyCards}
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
        <div class="foot-tag">Georgia's spa & wellness directory — day spas, med spas, and massage across the state, compiled from public business listings and refreshed regularly.</div>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Explore</div>
        <a href="/spas-near-me/">Spas near me</a>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/black-owned/">Black-owned spas</a>
        <a href="/category/med-spas/">Med spas in GA</a>
        <a href="/areas/">Spas by area &amp; zip</a>
        <a href="/counties/">Spas by county</a>
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
        <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20enquiry">Contact us</a>
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/pricing/">List your spa →</a>
    </div>
  </div>
</footer>

<script type="application/json" id="zip-centroids">${JSON.stringify(ZIP_CENTROIDS)}</script>
<script type="application/json" id="city-centroids">${CITY_CENTROIDS_JSON}</script>
<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);
}

// Georgia home
homeStylePage({
  relPath: '', canonical: '/', pool: ACTIVE, activePill: 'all',
  title: 'Best Spas in Atlanta &amp; Georgia | Georgia Spa Directory',
  desc: `${ACTIVE.length} day spas, med spas & massage studios across Atlanta & ${live.length} Georgia cities — compare ratings & reviews, find Black-owned spas, and book direct.`,
  heroEyebrow: "Georgia's spa &amp; wellness directory",
  heroH1: 'Find your <em>perfect</em><br>spa in Georgia',
  heroSub: "Every day spa, med spa, and massage studio across Georgia — including Black-owned wellness businesses — gathered in one calm place. Compare ratings, find what's near you, and reach them direct.",
  heroProof: `<strong>${ACTIVE.length} spas</strong> across <strong>${live.length} Georgia cities</strong> — updated weekly`,
  featEyebrow: 'Hand-picked', featH2: "Georgia's best spas", showBoBand: true, showCities: true,
  showCounties: true, countiesEyebrow: 'By county', countiesH2: 'Browse spas by county',
  topSpas: TOP10, topSpots: TOP_SPOTS, topEyebrow: 'Ranked by stars &amp; reviews', topH2: "Georgia's top 10 spas",
  mapEmbed: TOP10.map((s, i) => ({ ...s, rank: i + 1 })), mapMarker: 'star', mapH2: "Georgia's top 10, mapped",
  intro: areaIntro(ACTIVE, 'in Georgia', '', CLOSE_STATEWIDE),
});

// Black-Owned — the home page, filtered to Black-owned spas
{
  const boSpas = ACTIVE.filter(s => s.blackOwned);
  homeStylePage({
    relPath: 'black-owned', canonical: '/black-owned/', pool: boSpas, activePill: 'bo',
    title: 'Black-Owned Spas in Atlanta &amp; Georgia | Georgia Spa Directory',
    desc: `Discover Georgia's best Black-owned spas, med spas, and massage studios — verified, featured, and easy to find across Atlanta and beyond.`,
    heroEyebrow: 'Community first',
    heroH1: "Georgia's best<br><em>Black-owned</em> spas",
    heroSub: "Hand-picked Black-owned day spas, med spas, and massage studios across Atlanta and Georgia — verified, featured prominently, and never buried in an algorithm.",
    heroProof: `<strong>${boSpas.length} Black-owned ${boSpas.length === 1 ? 'spa' : 'spas'}</strong> featured across Georgia`,
    featEyebrow: 'Hand-picked', featH2: 'Featured Black-owned spas', showBoBand: false, showCities: true, spotPlace: 'Georgia Black-owned',
    showAll: true, allEyebrow: 'The full list', allH2: 'All Black-owned spas',
    cityScope: 'black-owned', citiesEyebrow: 'Community', citiesH2: 'Browse Black-owned by city',
    intro: areaIntro(boSpas, 'in Georgia', '', CLOSE_STATEWIDE),
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
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta http-equiv="Cache-Control" content="no-cache">
<title>All Georgia spa cities | Georgia Spa Directory</title>
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
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/counties/">Counties</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
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
    <form class="search" id="home-search" action="/search/" method="get" autocomplete="off">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39D8E" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="home-q" name="q" type="search" placeholder="Search spas by name, city, or service…" aria-label="Search spas"/>
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
        <div class="foot-tag">Georgia's spa & wellness directory — day spas, med spas, and massage across the state, compiled from public business listings and refreshed regularly.</div>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Explore</div>
        <a href="/spas-near-me/">Spas near me</a>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/black-owned/">Black-owned spas</a>
        <a href="/category/med-spas/">Med spas in GA</a>
        <a href="/areas/">Spas by area &amp; zip</a>
        <a href="/counties/">Spas by county</a>
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
        <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20enquiry">Contact us</a>
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/pricing/">List your spa →</a>
    </div>
  </div>
</footer>

<script type="application/json" id="zip-centroids">${JSON.stringify(ZIP_CENTROIDS)}</script>
<script type="application/json" id="city-centroids">${CITY_CENTROIDS_JSON}</script>
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
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta http-equiv="Cache-Control" content="no-cache">
<title>Pricing — list your spa | Georgia Spa Directory</title>
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
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
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
    <p class="pricing-note">Three tiers. One card. The difference is visible at a glance — free cards look thin, standard cards look solid, premium cards look like the place you want to book. Questions? <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20enquiry">Contact us</a>.</p>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-top">
      <div>
        <div class="foot-logo">GA<span>.Spas</span></div>
        <div class="foot-tag">Georgia's spa & wellness directory — day spas, med spas, and massage across the state, compiled from public business listings and refreshed regularly.</div>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Explore</div>
        <a href="/spas-near-me/">Spas near me</a>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/black-owned/">Black-owned spas</a>
        <a href="/category/med-spas/">Med spas in GA</a>
        <a href="/areas/">Spas by area &amp; zip</a>
        <a href="/counties/">Spas by county</a>
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
        <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20enquiry">Contact us</a>
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/pricing/">List your spa →</a>
    </div>
  </div>
</footer>

<script type="application/json" id="zip-centroids">${JSON.stringify(ZIP_CENTROIDS)}</script>
<script type="application/json" id="city-centroids">${CITY_CENTROIDS_JSON}</script>
<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);

// hair salons — coming soon (keeps the homepage pill from 404ing)
write('category/hair-salons', shell({
  title: 'Hair salons in Georgia | Georgia Spa Directory',
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
    title: `${listings.length} ${listings.length === 1 ? 'Spa' : 'Spas'} in ${name}, GA | Georgia Spa Directory`,
    desc: `All ${listings.length} ${listings.length === 1 ? 'spa' : 'spas'} in ${name}, GA — day spas, med spas & massage. Compare ratings & reviews${listings.some(s => s.blackOwned) ? ', find Black-owned spas' : ''}, and reach them direct.`,
    heroEyebrow: `Spa directory · ${name}, Georgia`,
    heroH1: `<em>Spas</em><br>in ${name}`,
    heroSub: `Every day spa, med spa, and massage studio in ${name}, Georgia — with ratings, hours, and directions.`,
    heroProof: `<strong>${listings.length} ${listings.length === 1 ? 'spa' : 'spas'}</strong> listed in ${name}, Georgia`,
    featEyebrow: 'Spotlight', featH2: `Featured in ${name}`, spotPlace: name, fillCity: slug,
    showBoBand: false, showCities: true, showTesti: false,
    showAll: true, allEyebrow: 'The full list', allH2: `All spas in ${name}`,
    cityScope: 'all', citiesEyebrow: 'Explore', citiesH2: 'Other Georgia cities',
    intro: areaIntro(listings, `in ${name}, Georgia`),
  });

  for (const type of [...new Set(listings.map(s => s.type))]) {
    const list = listings.filter(s => s.type === type);
    counts.category++;
    homeStylePage({
      relPath: `${slug}/${catSlug(type)}`, canonical: `/${slug}/${catSlug(type)}/`, pool: list, activePill: 'all',
      title: `${list.length} ${cap(catLabel(type))} in ${name}, GA | Georgia Spa Directory`,
      desc: `All ${list.length} ${catLabel(type)} in ${name}, GA — compare ratings & reviews, find the right one, and reach them direct.`,
      heroEyebrow: `${cap(catLabel(type))} · ${name}, Georgia`,
      heroH1: `<em>${cap(catLabel(type))}</em><br>in ${name}`,
      heroSub: `Every ${catLabel(type)} listing in ${name}, Georgia — with ratings, hours, and directions.`,
      heroProof: `<strong>${list.length}</strong> ${catLabel(type)} listed in ${name}`,
      featEyebrow: 'Spotlight', featH2: `Featured ${catLabel(type)}`, spotPlace: name,
      showBoBand: false, showCities: false, showTesti: false,
      showAll: true, allEyebrow: 'The full list', allH2: `All ${catLabel(type)} in ${name}`,
      intro: areaIntro(list, `in ${name}, GA`),
    });
  }

  const cityBO = listings.filter(s => s.blackOwned);
  if (cityBO.length) {
    counts.cityBO++;
    homeStylePage({
      relPath: `${slug}/black-owned`, canonical: `/${slug}/black-owned/`, pool: cityBO, activePill: 'bo',
      title: `Black-Owned Spas in ${name}, GA | Georgia Spa Directory`,
      desc: `Black-owned spas and wellness businesses in ${name}, Georgia. Discover, support, and book.`,
      heroEyebrow: 'Community first',
      heroH1: `<em>Black-owned</em> spas<br>in ${name}`,
      heroSub: `Support Black-owned day spas, med spas, and massage studios in ${name} — verified and featured.`,
      heroProof: `<strong>${cityBO.length} Black-owned ${cityBO.length === 1 ? 'spa' : 'spas'}</strong> in ${name}`,
      featEyebrow: 'Hand-picked', featH2: `Featured Black-owned in ${name}`, spotPlace: `${name} Black-owned`,
      showBoBand: false, showCities: false, showTesti: false,
      showAll: true, allEyebrow: 'The full list', allH2: `All Black-owned spas in ${name}`,
      intro: areaIntro(cityBO, `in ${name}, GA`),
    });
  }
}

// ---------------------------------------------------------------------------
// County hub pages: /county/<name>/ rolls every live city up to its PRIMARY
// Georgia county (js/data/ga-counties.js) and groups that county's spas BY city.
// Distinct from city pages — a navigational hub that wins "spas in Fulton County
// GA" queries and routes them to the right city pages, while surfacing the
// county's top-rated spas as real cards. /counties/ indexes them all.
// ---------------------------------------------------------------------------
// Index card for the /counties/ hub — mirrors cityIndexCard, but for a county.
const countyIndexCard = (c, i) => {
  const top = c.listings.find(s => s.rating && !s.example) || c.listings[0];
  const teaser = (top && top.rating)
    ? `<div class="city-top"><span class="ct-star">★</span> ${top.rating.toFixed(1)} · ${esc(top.name)}</div>` : '';
  const sub = c.cities.slice(0, 3).map(p => esc(p.name)).join(', ');
  return `<a class="city${i === 0 ? ' hero-city' : ''}" href="${countyUrl(c)}"><div class="city-name">${esc(c.name)} County</div><div class="city-sub">${sub || 'Day spas, med spas & massage'}</div>${teaser}<div class="city-count">${c.count} ${c.count === 1 ? 'spa' : 'spas'} · ${c.cities.length} ${c.cities.length === 1 ? 'city' : 'cities'} →</div></a>`;
};

for (const c of counties) {
  counts.county = (counts.county || 0) + 1;
  // Tiers NEVER mix. Premium row (top) then standard row — each EXACTLY 3 cards,
  // real paid spas first then "spot available" claim cards padding empty slots.
  // Then free spas: CLAIMED (have an image) first, the rest (no image) after.
  const cCard = (s, i) => renderCard(s, { href: spaLink(s), cityName: cityNameOf(s), photoClass: i % 2 ? 'p2' : '' });
  const cPremium = byRank(c.listings.filter(s => s.tier === 'premium' && !s.example));
  const cStandard = byRank(c.listings.filter(s => s.tier === 'standard' && !s.example));
  const cHasImg = (s) => ((s.images && s.images.length) || s.image) ? 0 : 1;
  const cFree = byRank(c.listings.filter(s => s.tier !== 'premium' && s.tier !== 'standard' && !s.example)).sort((a, b) => cHasImg(a) - cHasImg(b));
  const cPlace = `${c.name} County`;
  const cPremClaim = `<article class="card claim">
        <div class="card-pad">
          <div class="claim-eyebrow">Your spa here</div>
          <div class="claim-h serif">This ${esc(cPlace)}<br>premium spot is open</div>
          <div class="claim-p">Be a featured premium spa in ${esc(cPlace)} — top of every relevant page, full gallery, booking.</div>
          <div class="claim-price">Premium · $149/mo · featured at the top</div>
          <a class="claim-btn" href="/pricing/#premium" data-claim-spot data-claim-tier="premium" data-claim-city="${esc(cPlace)}">Claim this spot →</a>
        </div>
      </article>`;
  const cStdClaim = `<article class="card claim">
        <div class="card-pad">
          <div class="claim-eyebrow">Your spa here</div>
          <div class="claim-h serif">This ${esc(cPlace)}<br>standard spot is open</div>
          <div class="claim-p">Claim a standard listing in ${esc(cPlace)} — your photo, services, hours, and website link.</div>
          <div class="claim-price">Standard · $49/mo · enhanced placement</div>
          <a class="claim-btn" href="/pricing/#standard" data-claim-spot data-claim-tier="standard" data-claim-city="${esc(cPlace)}">Claim this spot →</a>
        </div>
      </article>`;
  // real paid first → example DEMO cards (show the tier) → claim card if still short
  const cPad = (real, examples, claim) => {
    const cards = real.map(cCard);
    for (let i = 0; cards.length < 3 && i < examples.length; i++) cards.push(cCard(examples[i], cards.length));
    while (cards.length < 3) cards.push(claim);
    return cards.join('\n      ');
  };
  const topCards =
    `<div class="tier-row-label">Premium listings</div>\n    <div class="feat-grid">\n      ${cPad(cPremium, EXAMPLE_PREMIUM, cPremClaim)}\n    </div>` +
    `\n    <div class="tier-row-label">Standard listings</div>\n    <div class="feat-grid">\n      ${cPad(cStandard, EXAMPLE_STANDARD, cStdClaim)}\n    </div>` +
    `\n    <div class="tier-row-label">More spas</div>\n    <div class="feat-grid">\n      ${cFree.slice(0, 12).map(cCard).join('\n      ')}\n    </div>`;
  const cityCards = c.cities.map(cityIndexCard).join('\n      ');
  // county map: ALL of the county's spas (not just the top cards) + the county border
  const countyPts = c.listings.filter(s => s.lat && s.lng);
  const countyMapSpas = JSON.stringify(countyPts.map(s => ({
    name: s.name, lat: s.lat, lng: s.lng, type: s.type || '', city: cityNameOf(s),
    rating: s.rating || 0, reviews: s.reviews || 0, href: spaLink(s),
  })));
  const countyCtr = countyPts.length
    ? { lat: countyPts.reduce((a, s) => a + s.lat, 0) / countyPts.length, lng: countyPts.reduce((a, s) => a + s.lng, 0) / countyPts.length }
    : { lat: 32.9, lng: -83.5 };
  const moreCounties = counties.filter(o => o.slug !== c.slug).slice(0, 8)
    .map(o => `<a href="${countyUrl(o)}">${esc(o.name)} County <span>${o.count}</span></a>`).join('\n        ');
  const canonical = `${BASE_URL}${countyUrl(c)}`;
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: `Spas in ${c.name} County, Georgia`, url: canonical,
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'GA Spas', item: BASE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: 'Counties', item: BASE_URL + '/counties/' },
      { '@type': 'ListItem', position: 3, name: `${c.name} County`, item: canonical },
    ] },
    about: { '@type': 'AdministrativeArea', name: `${c.name} County, Georgia` },
  })}</script>`;
  write(`county/${c.slug}`, `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta http-equiv="Cache-Control" content="no-cache">
<title>Spas in ${esc(c.name)} County, GA — Directory | Georgia Spa Directory</title>
<meta name="description" content="Browse ${c.count} spas across ${c.cities.length} ${c.cities.length === 1 ? 'city' : 'cities'} in ${esc(c.name)} County, Georgia — day spas, med spas & massage, with ratings, hours, and directions."/>
<link rel="canonical" href="${canonical}"/>
<meta property="og:title" content="Spas in ${esc(c.name)} County, GA | Georgia Spa Directory"/>
<meta property="og:description" content="Day spas, med spas & massage across ${esc(c.name)} County, Georgia."/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="${BASE_URL}/images/og-cover.jpg"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
<link rel="stylesheet" href="/vendor/leaflet/leaflet.css"/>
${PWA_HEAD}
${jsonLd}
</head>
<body>

<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/counties/">Counties</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
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
    <div class="eyebrow">Georgia county · spa directory</div>
    <h1><em>Spas</em> in<br>${esc(c.name)} County</h1>
    <p class="hero-sub">Every day spa, med spa, and massage studio in ${esc(c.name)} County, Georgia — grouped by city, with ratings, hours, and directions.</p>
    <p class="hero-proof"><strong>${c.count} ${c.count === 1 ? 'spa' : 'spas'}</strong> across <strong>${c.cities.length} ${c.cities.length === 1 ? 'city' : 'cities'}</strong> in ${esc(c.name)} County</p>
    <div class="pills">
      <a class="pill" href="/cities/">All cities</a>
      <a class="pill" href="/counties/">All counties</a>
      <a class="pill" href="/category/day-spas/">Day Spas</a>
      <a class="pill" href="/category/med-spas/">Med Spas</a>
      <a class="pill bo" href="/black-owned/">✦ Black-Owned</a>
    </div>
  </div>
</header>

${(() => { const ai = areaIntro(c.listings, `in ${esc(c.name)} County, GA`, '', CLOSE_STATEWIDE); return ai ? `<section class="band intro-band">
  <div class="wrap">
    <p class="area-intro">${ai}</p>
  </div>
</section>` : ''; })()}

<section class="band">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="eyebrow">Top rated</div><h2 class="serif">Top spas in ${esc(c.name)} County</h2></div>
      <a class="sec-link" href="/counties/">← All counties</a>
    </div>
    ${topCards}
  </div>
</section>

<section class="band map-band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="eyebrow">On the map</div><h2 class="serif">${esc(c.name)} County spas on the map</h2></div>
      <button class="map-locate" type="button" data-map-locate>📍 Show my location</button>
    </div>
    <div id="spa-map" class="spa-map" data-county="${esc(c.name)}" data-lat="${countyCtr.lat.toFixed(5)}" data-lng="${countyCtr.lng.toFixed(5)}" data-zoom="10" data-ver="${ASSET_VER}"></div>
  </div>
  <script type="application/json" id="map-spas">${countyMapSpas}</script>
  <script defer src="/vendor/leaflet/leaflet.js"></script>
  <script defer src="/js/map.js?v=${ASSET_VER}"></script>
</section>

<section class="band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="eyebrow">By city</div><h2 class="serif">Spas by city in ${esc(c.name)} County</h2></div>
    </div>
    <div class="cities-grid">
      ${cityCards}
    </div>
  </div>
</section>

<section class="band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">Nearby</div><h2 class="serif">Other Georgia counties</h2></div></div>
    <div class="claim-links county-more">
        ${moreCounties}
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-top">
      <div>
        <div class="foot-logo">GA<span>.Spas</span></div>
        <div class="foot-tag">Georgia's spa & wellness directory — day spas, med spas, and massage across the state, compiled from public business listings and refreshed regularly.</div>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Explore</div>
        <a href="/spas-near-me/">Spas near me</a>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/cities/">All Georgia cities</a>
        <a href="/counties/">Spas by county</a>
        <a href="/areas/">Spas by area &amp; zip</a>
        <a href="/black-owned/">Black-owned spas</a>
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
        <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20enquiry">Contact us</a>
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/pricing/">List your spa →</a>
    </div>
  </div>
</footer>

<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);
}

// /counties/ — index hub linking every county page (crawl path + browsable index).
{
  const total = counties.reduce((a, c) => a + c.count, 0);
  write('counties', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta http-equiv="Cache-Control" content="no-cache">
<title>Spas by county in Georgia — all ${counties.length} counties | Georgia Spa Directory</title>
<meta name="description" content="Browse spas in every Georgia county — day spas, med spas, and massage across ${counties.length} counties, from Fulton and DeKalb to Chatham and Glynn."/>
<link rel="canonical" href="${BASE_URL}/counties/"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
${PWA_HEAD}
</head>
<body>

<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/counties/">Counties</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
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
    <div class="eyebrow">Browse by county</div>
    <h1><em>Spas</em> by<br>Georgia county</h1>
    <p class="hero-sub">From Fulton and DeKalb to Chatham and Glynn — browse day spas, med spas, and massage studios in every Georgia county we've mapped.</p>
    <p class="hero-proof"><strong>${total} spas</strong> across <strong>${counties.length} counties</strong></p>
    <div class="pills">
      <a class="pill" href="/cities/">All cities</a>
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
        <h2 class="serif">Every Georgia spa county</h2>
      </div>
      <a class="sec-link" href="/cities/">Browse by city →</a>
    </div>
    <div class="cities-grid">
      ${counties.map(countyIndexCard).join('\n      ')}
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-top">
      <div>
        <div class="foot-logo">GA<span>.Spas</span></div>
        <div class="foot-tag">Georgia's spa & wellness directory — day spas, med spas, and massage across the state, compiled from public business listings and refreshed regularly.</div>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Explore</div>
        <a href="/spas-near-me/">Spas near me</a>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/cities/">All Georgia cities</a>
        <a href="/counties/">Spas by county</a>
        <a href="/areas/">Spas by area &amp; zip</a>
        <a href="/black-owned/">Black-owned spas</a>
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
        <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20enquiry">Contact us</a>
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/pricing/">List your spa →</a>
    </div>
  </div>
</footer>

<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);
}

// roadmap: GA_CITIES not yet covered → noindex "expanding soon" page
for (const e of GA_CITIES) {
  if (liveSlugs.has(e.slug)) continue;
  counts.comingSoon++;
  write(e.slug, shell({
    title: `Spas in ${e.name}, GA | Georgia Spa Directory`,
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
    title: `${cap(catLabel(type))} in Georgia | Georgia Spa Directory`,
    desc: `Browse ${catLabel(type)} across Georgia — ratings, hours, and directions.`,
    heroEyebrow: `${cap(catLabel(type))} across Georgia`,
    heroH1: `<em>${cap(catLabel(type))}</em><br>in Georgia`,
    heroSub: `Every ${catLabel(type)} listing across Georgia — with ratings, hours, and directions.`,
    heroProof: `<strong>${list.length}</strong> ${catLabel(type)} across ${live.length} Georgia cities`,
    featEyebrow: 'Spotlight', featH2: `Featured ${catLabel(type)}`,
    showBoBand: false, showCities: true, showTesti: false,
    showAll: true, allEyebrow: 'The full list', allH2: `All ${catLabel(type)} in Georgia`,
    cityScope: 'all', citiesEyebrow: 'Explore', citiesH2: 'Browse by city',
    intro: areaIntro(list, 'in Georgia', '', CLOSE_STATEWIDE),
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

// Curated labels make the busiest metro zips read like neighborhoods ("Buckhead"
// instead of just "Atlanta"). Every other zip is derived straight from the data.
const ZIP_LABELS = {
  '30305': 'Buckhead', '30308': 'Midtown', '30309': 'Midtown / Arts Center', '30326': 'Lenox / Buckhead',
  '30328': 'Sandy Springs', '30342': 'Buckhead / Sandy Springs', '30030': 'Downtown Decatur',
  '30022': 'Alpharetta / Johns Creek', '30009': 'Downtown Alpharetta', '30092': 'Peachtree Corners',
  '30097': 'Duluth / Johns Creek', '30062': 'East Cobb, Marietta', '30068': 'East Cobb, Marietta',
  '30067': 'Marietta / Vinings', '30060': 'Downtown Marietta', '30024': 'Suwanee',
};
const ZIP_MIN_ANCHOR = 3; // need >= this many spas physically IN the zip to warrant a page
const dominant = (arr, key) => {
  const c = {};
  for (const s of arr) { const v = s[key]; if (v) c[v] = (c[v] || 0) + 1; }
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};
// group every active spa by its own zip → one page per zip-area, statewide
const byZipRaw = {};
for (const s of ACTIVE) {
  const z = String(s.zip || '');
  if (s.lat && s.lng && /^\d{5}$/.test(z)) (byZipRaw[z] ||= []).push(s);
}
const ZIP_AREAS = Object.entries(byZipRaw)
  .filter(([, arr]) => arr.length >= ZIP_MIN_ANCHOR)
  .map(([zip, arr]) => {
    const city = dominant(arr, 'cityName') || 'Georgia';
    return {
      zip, city, area: ZIP_LABELS[zip] || city,
      lat: arr.reduce((a, s) => a + s.lat, 0) / arr.length,
      lng: arr.reduce((a, s) => a + s.lng, 0) / arr.length,
    };
  })
  .sort((a, b) => a.zip.localeCompare(b.zip));

const zipPages = [];
for (const z of ZIP_AREAS) {
  const pool = withinArea(z);
  if (!pool.length) continue;
  const ni = pool.length < AREA_INDEX_MIN;
  const loc = z.area === z.city ? `${z.city}, GA` : `${z.area}, ${z.city}, GA`;
  counts.zip = (counts.zip || 0) + 1;
  zipPages.push({ ...z, count: pool.length, ni });
  homeStylePage({
    relPath: `zip/${z.zip}`, canonical: `/zip/${z.zip}/`, pool, activePill: 'all',
    noindex: ni, geoPoint: { lat: z.lat, lng: z.lng }, mapRadius: AREA_RADIUS,
    title: `Spas near ${z.zip} — ${loc} | Georgia Spa Directory`,
    desc: `Day spas, med spas & massage near zip code ${z.zip} (${loc}) — ratings, hours, and directions, sorted by distance.`,
    heroEyebrow: `Spas near ${z.zip} · ${z.city}, Georgia`,
    heroH1: `<em>Spas near</em><br>${z.zip}`,
    heroSub: `Day spas, med spas, and massage within ${AREA_RADIUS} miles of ${z.area} (${z.zip}), ${z.city}, GA — ratings, hours, and directions.`,
    heroProof: `<strong>${pool.length} ${pool.length === 1 ? 'spa' : 'spas'}</strong> near ${z.zip} · ${z.area}`,
    featEyebrow: 'Closest to you', featH2: `Top spas near ${z.zip}`, spotPlace: `${z.area} (${z.zip})`,
    showBoBand: false, showCities: false, showTesti: false,
    showAll: true, allEyebrow: 'The full list', allH2: `All spas near ${z.zip}`,
    intro: areaIntro(pool, `near ${z.zip}`, loc),
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
    noindex: ni, geoPoint: { lat: h.lat, lng: h.lng }, mapRadius: AREA_RADIUS,
    title: `Day Spas in ${h.name}, Atlanta, GA | Georgia Spa Directory`,
    desc: `Day spas, med spas & massage in ${h.name}, Atlanta, GA — ratings, hours, and directions, sorted by distance.`,
    heroEyebrow: `${h.name} · Atlanta, Georgia`,
    heroH1: `<em>Spas in</em><br>${h.name}`,
    heroSub: `Day spas, med spas, and massage in and around ${h.name}, Atlanta — ratings, hours, and directions.`,
    heroProof: `<strong>${pool.length} ${pool.length === 1 ? 'spa' : 'spas'}</strong> in ${h.name}, Atlanta`,
    featEyebrow: 'Hand-picked', featH2: `Top spas in ${h.name}`, spotPlace: `${h.name}, Atlanta`,
    showBoBand: false, showCities: false, showTesti: false,
    showAll: true, allEyebrow: 'The full list', allH2: `All spas in ${h.name}`,
    intro: areaIntro(pool, `in ${h.name}, Atlanta, GA`, ''),
  });
}

// /areas/ hub — links every neighborhood + zip page (crawl path + a useful index).
{
  const hoodLinks = hoodPages.map(h =>
    `<a class="area-link" href="/atlanta/${h.slug}/">${esc(h.name)} <span>${h.count}</span></a>`).join('\n        ');
  // group the zip pages by their dominant city so the hub stays browsable
  const zipByCity = {};
  for (const z of zipPages) (zipByCity[z.city] ||= []).push(z);
  const zipLinks = Object.entries(zipByCity)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([city, zs]) => `<div class="area-group"><h3 class="area-city">${esc(city)}</h3>
        <div class="area-links">${zs.sort((a, b) => a.zip.localeCompare(b.zip)).map(z =>
          `<a class="area-link" href="/zip/${z.zip}/">${z.zip}${z.area !== z.city ? ` · ${esc(z.area)}` : ''} <span>${z.count}</span></a>`).join('')}</div></div>`)
    .join('\n      ');
  write('areas', shell({
    title: 'Spas near you — by neighborhood & zip code in Georgia | Georgia Spa Directory',
    desc: 'Find spas near you in Georgia by neighborhood (Buckhead, Midtown, Sandy Springs) or by zip code. Day spas, med spas & massage sorted by distance.',
    path: '/areas/',
    body: `    <section class="hero"><h1>Spas near you</h1>
      <p>Browse Georgia spas by Atlanta neighborhood or by metro-area zip code — each list is sorted by distance. Looking for the closest spa right now? <a href="/spas-near-me/"><strong>Find spas near me →</strong></a> uses your location to show the nearest ones instantly.</p></section>
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
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta name="robots" content="noindex,follow">
<title>Your saved spas | Georgia Spa Directory</title>
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
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
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


// /search/ — directory-wide spa search. Results are rendered client-side from
// the build's search index (js/search.js + js/data/search-index.js) using the
// shared card renderer. noindex (query pages aren't indexable surfaces); the
// home/city search boxes point here via action="/search/".
write('search', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta name="robots" content="noindex,follow">
<title>Search spas across Georgia | Georgia Spa Directory</title>
<meta name="description" content="Search every day spa, med spa, and massage studio in the GA Spas directory by name, city, or service."/>
<link rel="canonical" href="${BASE_URL}/search/"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
${PWA_HEAD}
</head>
<body>
<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
  </ul>
  <a class="nav-cta" href="/pricing/">List your spa</a>
</nav>

<section class="band" style="padding-top:120px">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">Search</div>
        <h2 class="serif">Search Georgia spas</h2>
      </div>
      <a class="sec-link" href="/cities/">Browse by city →</a>
    </div>
    <form class="search" id="home-search" action="/search/" method="get" autocomplete="off" style="max-width:640px;margin-top:0">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39D8E" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="home-q" name="q" type="search" placeholder="Search spas by name, city, or service…" aria-label="Search spas"/>
        <button class="btn btn-go" type="submit">Search</button>
      </div>
    </form>
    <p class="loc-note" id="search-meta" hidden style="margin-top:18px"></p>
    <div class="feat-grid" id="search-grid" style="margin-top:22px"></div>
    <div class="show-more-wrap" id="search-more-wrap" hidden><button class="show-more-btn" type="button" id="search-more">Show more</button></div>
    <div class="liked-empty" id="search-empty" hidden>
      <div class="le-heart">🔍</div>
      <h2 id="search-empty-h">Search our spa directory</h2>
      <p id="search-empty-p">Type a spa name, city, or service above. We list day spas, med spas &amp; massage across Georgia — <a href="/cities/">browse by city</a>.</p>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/">← Back to GA Spas</a>
    </div>
  </div>
</footer>

<script type="application/json" id="zip-centroids">${JSON.stringify(ZIP_CENTROIDS)}</script>
<script type="application/json" id="city-centroids">${CITY_CENTROIDS_JSON}</script>
<script type="module">
  import { run } from '/js/search.js?v=${ASSET_VER}';
  run('${ASSET_VER}');
</script>
<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);
noindexed.add('/search/');


// /map/ — the whole directory on one OpenStreetMap (Leaflet) map. All spa
// markers come from the build's search index (data-source="index"); js/map.js
// plots them on a canvas renderer + the visitor's location. noindex (JS-only).
write('map', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta name="robots" content="noindex,follow">
<title>Map of spas across Georgia | Georgia Spa Directory</title>
<meta name="description" content="Every day spa, med spa, and massage studio in the GA Spas directory, plotted on a map with your location."/>
<link rel="canonical" href="${BASE_URL}/map/"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
<link rel="stylesheet" href="/vendor/leaflet/leaflet.css"/>
${PWA_HEAD}
</head>
<body>
<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
  </ul>
  <a class="nav-cta" href="/pricing/">List your spa</a>
</nav>

<section class="band" style="padding-top:120px">
  <div class="wrap">
    <div class="sec-head">
      <div>
        <div class="eyebrow">On the map</div>
        <h2 class="serif">Georgia spas, mapped</h2>
      </div>
      <button class="map-locate" type="button" data-map-locate>📍 Show my location</button>
    </div>
    <div id="spa-map" class="spa-map spa-map--full" data-source="index" data-counties="all" data-ver="${ASSET_VER}" data-lat="32.9" data-lng="-83.5" data-zoom="7"></div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/">← Back to GA Spas</a>
    </div>
  </div>
</footer>

<script type="application/json" id="zip-centroids">${JSON.stringify(ZIP_CENTROIDS)}</script>
<script defer src="/vendor/leaflet/leaflet.js"></script>
<script defer src="/js/map.js?v=${ASSET_VER}"></script>
<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);
noindexed.add('/map/');


// /spas-near-me/ — INDEXABLE landing page for the head query "spa near me" /
// "spas near me". Auto-asks the visitor's location and renders the closest spas
// (js/near-me.js); the static city + area links carry the SEO and serve anyone who
// declines location. This is the page Google should match "spa near me" to.
{
  const nmCities = live.slice(0, 18).map(cityIndexCard).join('\n      ');
  const nmCityLinks = live.map(p => `<a class="pill" href="/${p.slug}/">${esc(p.name)}</a>`).join('\n        ');
  const canonical = `${BASE_URL}/spas-near-me/`;
  const faqs = [
    ['How do I find a spa near me in Georgia?', `Open this page and allow location access — GA Spas instantly lists the day spas, med spas, and massage studios closest to you, sorted by distance, across all ${live.length} Georgia cities. You can also browse by city or ZIP code below.`],
    ['Are the spas near me open now?', 'Each listing links to the spa’s own site and Google Maps for current hours, and shows ratings and reviews so you can pick with confidence before you go.'],
    ['Does GA Spas show Black-owned spas near me?', 'Yes — every Black-owned spa carries a badge, and you can browse the dedicated Black-owned directory. Black-owned status is free to display for any listing.'],
  ];
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const pageLd = { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Spas near me in Georgia', url: canonical,
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'GA Spas', item: BASE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: 'Spas near me', item: canonical },
    ] } };
  write('spas-near-me', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<title>Spas Near Me — Day Spas, Med Spas &amp; Massage | Georgia Spa Directory</title>
<meta name="description" content="Find spas near me in Georgia — see the closest day spas, med spas &amp; massage instantly, sorted by distance, with ratings, reviews, and directions."/>
<link rel="canonical" href="${canonical}"/>
<meta property="og:title" content="Spas near me in Georgia | Georgia Spa Directory"/>
<meta property="og:description" content="The day spas, med spas & massage studios closest to you, across Georgia — sorted by distance."/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="${BASE_URL}/images/og-cover.jpg"/>
<meta name="geo.region" content="US-GA"/>
<meta name="geo.placename" content="Georgia"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
${PWA_HEAD}
<script type="application/ld+json">${JSON.stringify(pageLd)}</script>
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head>
<body>
<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
  </ul>
  <a class="nav-cta" href="/pricing/">List your spa</a>
</nav>

<section class="band" style="padding-top:120px">
  <div class="wrap">
    <div class="eyebrow">Find a spa near you</div>
    <h1 class="serif" style="font-size:clamp(34px,5vw,58px);font-weight:500;line-height:1.05;margin:8px 0 14px">Spas near me</h1>
    <p class="hero-sub" style="max-width:620px">Allow location and GA Spas shows the day spas, med spas, and massage studios <strong>closest to you</strong> — sorted by distance, with ratings, reviews, and directions. Covering ${ACTIVE.length} spas across ${live.length} Georgia cities.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:20px">
      <button class="btn btn-go" id="nearme-btn" type="button" style="padding:13px 24px">📍 Find spas near me</button>
      <a class="sec-link" href="/map/">See them on the map →</a>
    </div>
    <p class="loc-note" id="nearme-note" hidden style="margin-top:18px"></p>
    <div class="feat-grid" id="nearme-grid" hidden style="margin-top:24px"></div>
  </div>
</section>

<section class="band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">By city</div><h2 class="serif">Spas near you, by city</h2></div>
      <a class="sec-link" href="/cities/">All ${live.length} cities →</a></div>
    <div class="cities-grid">
      ${nmCities}
    </div>
  </div>
</section>

<section class="band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">By area &amp; ZIP</div><h2 class="serif">Or find a spa near your ZIP code</h2></div>
      <a class="sec-link" href="/areas/">All areas &amp; ZIPs →</a></div>
    <p class="hero-sub" style="max-width:640px;margin-bottom:18px">Searching from a specific area? Jump straight to spas near your neighborhood or ZIP code — each page lists the spas within ${AREA_RADIUS} miles, sorted by distance.</p>
    <div class="pills">
        ${nmCityLinks}
    </div>
  </div>
</section>

<section class="band" style="padding-top:0">
  <div class="wrap">
    <div class="sec-head"><div><div class="eyebrow">Good to know</div><h2 class="serif">Finding a spa near you</h2></div></div>
    <div class="cities-grid">
      ${faqs.map(([q, a]) => `<div class="city" style="cursor:default"><div class="city-name" style="font-size:18px">${esc(q)}</div><div class="city-sub" style="-webkit-line-clamp:unset">${esc(a)}</div></div>`).join('\n      ')}
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/">← Back to GA Spas</a>
    </div>
  </div>
</footer>

<script type="application/json" id="zip-centroids">${JSON.stringify(ZIP_CENTROIDS)}</script>
<script type="application/json" id="city-centroids">${CITY_CENTROIDS_JSON}</script>
<script type="module">
  import { run } from '/js/near-me.js?v=${ASSET_VER}';
  run('${ASSET_VER}');
</script>
<script type="module" src="/js/home.js?v=${ASSET_VER}"></script>
</body>
</html>
`);
}


// ---------------------------------------------------------------------------
// Legal: /privacy/ and /terms/. Static content pages on the shell template, so
// they pick up the standard header/footer. Footer links across the site point
// here (was href="#"). Plain-language and accurate to what the site does: a
// zero-backend static directory with no accounts; the only data we receive is
// what people email us when they claim/contact about a listing.
// ---------------------------------------------------------------------------
// brandPage — content page in the live brand style (home.css + brand nav/footer),
// so /privacy/ and /terms/ match the rest of the site instead of the old shell.
const brandPage = ({ title, desc, path, body, noindex = false }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta http-equiv="Cache-Control" content="no-cache">
<title>${title}</title>
<meta name="description" content="${esc(desc)}"/>${noindex ? '\n<meta name="robots" content="noindex,follow"/>' : ''}
<link rel="canonical" href="${BASE_URL}${path}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${BASE_URL}${path}"/>
<meta property="og:image" content="${BASE_URL}/images/og-cover.jpg"/>
<meta property="og:site_name" content="Georgia Spa Directory"/>
<meta name="twitter:card" content="summary_large_image"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
${PWA_HEAD}
</head>
<body>

<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
    <li><a href="/liked/">♥ Saved <span class="like-count" hidden></span></a></li>
  </ul>
  <a class="nav-cta" href="/pricing/">List your spa</a>
</nav>

<main class="wrap">
${body}
</main>

<footer>
  <div class="wrap">
    <div class="foot-top">
      <div>
        <div class="foot-logo">GA<span>.Spas</span></div>
        <div class="foot-tag">Georgia's spa & wellness directory — day spas, med spas, and massage across the state, compiled from public business listings and refreshed regularly.</div>
      </div>
      <div class="foot-col">
        <div class="foot-col-h">Explore</div>
        <a href="/spas-near-me/">Spas near me</a>
        <a href="/atlanta/">Atlanta spas</a>
        <a href="/black-owned/">Black-owned spas</a>
        <a href="/category/med-spas/">Med spas in GA</a>
        <a href="/areas/">Spas by area &amp; zip</a>
        <a href="/counties/">Spas by county</a>
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
        <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20enquiry">Contact us</a>
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 GA Spas · Made by <a class="foot-by" href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a></span>
      <a class="foot-list" href="/pricing/">List your spa →</a>
    </div>
  </div>
</footer>
</body>
</html>`;

const LEGAL_UPDATED = 'June 1, 2026';
write('privacy', brandPage({
  title: 'Privacy Policy | Georgia Spa Directory',
  desc: 'How GA.Spas handles information — a static spa directory with no accounts and no backend.',
  path: '/privacy/',
  body: `    <section class="legal">
      <h1>Privacy Policy</h1>
      <p class="legal-date">Last updated ${LEGAL_UPDATED}</p>

      <h2>The short version</h2>
      <p>GA.Spas is a static directory of spas across Georgia. There are no user accounts, no login, and no server collecting data about you as you browse. We don't run ad networks or sell data.</p>

      <h2>Information we receive</h2>
      <ul>
        <li><strong>When you contact or claim a listing.</strong> Our "claim this listing" and contact actions open your own email app with a pre-filled message. If you choose to send it, we receive what you write — typically your name, business, email address, and any details you add. We use it only to respond and to manage your listing.</li>
        <li><strong>Listing data.</strong> Spa names, addresses, phone numbers, ratings, and hours come from publicly available business listings and directories. If you own a business and want a correction or removal, contact us and we'll handle it.</li>
      </ul>

      <h2>Stored only in your browser</h2>
      <p>Some features use your device locally and never send data to us:</p>
      <ul>
        <li><strong>Saved spas</strong> are kept in your browser's local storage on your device.</li>
        <li><strong>"Near me"</strong> uses your browser's location only to sort results in your browser. Your location is not transmitted to or stored by us.</li>
        <li><strong>Install / offline.</strong> Installing the app or visiting offline uses a service worker that caches pages on your device.</li>
      </ul>

      <h2>Third parties</h2>
      <p>The site is served as static files by our hosting provider, which may log standard request data (such as IP address) for security and reliability. Map and "directions" links open Google or Bing Maps, and "Book"/website links open the spa's own site — those services have their own privacy policies.</p>

      <h2>Children</h2>
      <p>GA.Spas is intended for adults and is not directed to children under 13.</p>

      <h2>Contact</h2>
      <p>Questions, corrections, or removal requests: <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20privacy%20request">email us</a>. This policy may be updated; the date above reflects the latest version.</p>
    </section>`,
}));

write('terms', brandPage({
  title: 'Terms of Use | Georgia Spa Directory',
  desc: 'The terms for using GA.Spas, a static directory of spas across Georgia.',
  path: '/terms/',
  body: `    <section class="legal">
      <h1>Terms of Use</h1>
      <p class="legal-date">Last updated ${LEGAL_UPDATED}</p>

      <p>By using GA.Spas (the "Site"), you agree to these terms. If you don't agree, please don't use the Site.</p>

      <h2>What GA.Spas is</h2>
      <p>The Site is an informational directory of spas, med spas, and massage studios across Georgia. It's provided for convenience to help people discover businesses. We are not a spa, do not provide spa services, and do not book or process payments on behalf of the businesses listed.</p>

      <h2>Accuracy</h2>
      <p>Listing details (names, addresses, phone numbers, hours, ratings) come from third-party and public sources and may be incomplete, out of date, or incorrect. We make no warranty as to accuracy. Always confirm details directly with the business before visiting or booking. Ratings and reviews originate with third-party platforms and reflect their users' opinions, not ours.</p>

      <h2>Not an endorsement or affiliation</h2>
      <p>A listing is not an endorsement. Unless a business has a paid listing it claimed, inclusion does not imply any relationship between GA.Spas and that business. Business names and marks belong to their respective owners.</p>

      <h2>Listings for business owners</h2>
      <p>Free listings exist to make the directory useful. Paid listings (Standard and Premium) and what each includes are described on our <a href="/pricing/">pricing page</a>. Claiming or paying for a listing means you represent the business or are authorized to act for it. We may edit or remove any listing at our discretion, including for inaccurate or inappropriate content.</p>

      <h2>Acceptable use</h2>
      <p>Don't scrape, copy, or republish the directory in bulk, attempt to disrupt the Site, or use it to send unsolicited messages to listed businesses.</p>

      <h2>Disclaimer &amp; liability</h2>
      <p>The Site is provided "as is," without warranties of any kind. To the fullest extent allowed by law, GA.Spas and Artivicolab are not liable for any damages arising from your use of the Site or reliance on its information, including dealings with any business you find here.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the State of Georgia, USA.</p>

      <h2>Contact</h2>
      <p>GA.Spas is made by <a href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a>. Questions about these terms? <a href="mailto:artivicolab@gmail.com?subject=GA.Spas%20terms%20question">Email us</a>. We may update these terms; the date above reflects the latest version.</p>
    </section>`,
}));

// sitemap.xml at the publish root (excludes noindex "coming soon" pages)
const indexed = [...new Set(urls)].filter(u => !noindexed.has(u));
writeFileSync(join(GA_DIR, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexed.map(u => `  <url><loc>${BASE_URL}${u}</loc></url>`).join('\n')}
</urlset>
`);

// robots.txt at the publish root — allow everything, point crawlers at the sitemap
writeFileSync(join(GA_DIR, 'robots.txt'),
  `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`);

// CNAME — GitHub Pages reads this to serve the site at the custom subdomain.
writeFileSync(join(GA_DIR, 'CNAME'), 'ga.spas.artivicolab.com\n');

// Google Search Console — HTML-file verification. Google fetches this exact file
// at the site root; keep it emitted on every build so it's never dropped.
writeFileSync(join(GA_DIR, 'google6684b3e744e7932a.html'),
  'google-site-verification: google6684b3e744e7932a.html');

// Branded 404 at the publish root. Standalone (loads home.css so the hero +
// search box are fully styled); static hosts / GitHub Pages serve /404.html for
// unknown paths. noindex so it never lands in search.
writeFileSync(join(GA_DIR, '404.html'), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
${GA_HEAD}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
<meta name="robots" content="noindex,follow"/>
<title>Page not found | Georgia Spa Directory</title>
<meta name="description" content="That page wandered off. Search Georgia spas or head back to the directory."/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/home.css?v=${ASSET_VER}"/>
${PWA_HEAD}
</head>
<body>
<nav>
  <a class="logo" href="/">GA<span>.Spas</span></a>
  <ul class="nav-links">
    <li><a href="/cities/">Cities</a></li>
    <li><a href="/spas-near-me/">Near me</a></li>
    <li><a href="/map/">Map</a></li>
    <li><a href="/black-owned/">Black-Owned</a></li>
  </ul>
  <a class="nav-cta" href="/pricing/">List your spa</a>
</nav>

<header class="hero hero--photo" style="min-height:72vh;display:flex;align-items:center">
  <div class="hero-bg" data-hero-bg>
    <div class="hero-slide hslide-1 on"></div>
  </div>
  <div class="wrap hero-inner">
    <div class="eyebrow">404 · Page not found</div>
    <h1><em>This page</em><br>took a day off</h1>
    <p class="hero-sub">We couldn't find that one. Search for a city, neighborhood, or service — or head back to the directory.</p>
    <form class="search" action="/search/" method="get" autocomplete="off">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A39D8E" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input name="q" type="search" placeholder="Search spas by name, city, or service…" aria-label="Search spas"/>
        <button class="btn btn-go" type="submit">Find spas</button>
      </div>
    </form>
    <div class="pills">
      <a class="pill" href="/">Home</a>
      <a class="pill" href="/cities/">All Georgia cities</a>
      <a class="pill bo" href="/black-owned/">✦ Black-Owned</a>
    </div>
  </div>
</header>
</body>
</html>
`);

// report
console.log('Built static tree (publish root = ga/, deploys to ' + BASE_URL + '):');
console.log(`  live cities ${counts.cities} · city+category ${counts.category} · city black-owned ${counts.cityBO}`);
console.log(`  statewide ${counts.statewide} · profiles ${counts.profiles} · home 1`);
console.log(`  coming-soon cities (noindex until they get listings): ${counts.comingSoon}`);
console.log(`  total pages: ${urls.length}   sitemap.xml: ${indexed.length} indexable URLs`);
