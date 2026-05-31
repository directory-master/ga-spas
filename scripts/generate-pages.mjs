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

import { SPAS, findCity } from '../js/data/spas.js';
import { GA_CITIES } from '../js/data/ga-cities.js';
import { IMPORTED } from '../js/data/spas-imported.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GA_DIR = join(ROOT, 'ga');
const MIN_LISTINGS = 1;                               // raise to ~3 before launch
const BASE_URL = 'https://ga.spas.artivicolab.com';   // for canonical + sitemap

// Build version for the footer: package.json version + git short SHA.
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
let SHA = '';
try { SHA = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git repo */ }
const BUILD = `v${VERSION}${SHA ? ` · ${SHA}` : ''}`;

// SPAS ONLY for now. Salons (Nail Salon, Hair Salon, Brow & Lash) come later —
// their listings stay in spas.js but aren't generated until added here.
const ACTIVE_TYPES = new Set(['Day Spa', 'Med Spa', 'Massage']);
const ALL = [...SPAS, ...IMPORTED];       // curated demo + scraped (all free) listings
const ACTIVE = ALL.filter(s => ACTIVE_TYPES.has(s.type));

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

const TIER_ORDER = { premium: 0, standard: 1, free: 2 };
const byRank = (list) => [...list].sort((a, b) =>
  (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || b.rating - a.rating);

const urls = [];
const noindexed = new Set(); // paths kept out of sitemap.xml
function write(relDir, html) {
  const dir = relDir ? join(GA_DIR, relDir) : GA_DIR;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  urls.push(`/${relDir ? relDir + '/' : ''}`);
}

function stars(r) {
  const f = Math.round(r);
  return `<span class="stars" title="${r} / 5"><span class="star-fill">${'★'.repeat(f)}</span>` +
    `<span class="star-empty">${'★'.repeat(5 - f)}</span><span class="rating-num"> ${r.toFixed(1)}</span></span>`;
}
function badges(spa) {
  const b = [];
  if (spa.tier === 'premium') b.push('<span class="badge badge-premium">✦ Premium</span>');
  if (spa.blackOwned) b.push('<span class="badge badge-bo">✶ Black-owned</span>');
  return b.length ? `<div class="badges">${b.join('')}</div>` : '';
}
function actions(spa) {
  const a = [];
  if (spa.phone) a.push(`<a class="action" href="tel:${spa.phone.replace(/[^\d+]/g, '')}"><span class="phone-shake" aria-hidden="true">📞</span> Call</a>`);
  if (spa.email) a.push(`<a class="action" href="mailto:${esc(spa.email)}"><span aria-hidden="true">✉</span> Email</a>`);
  return a.length ? `<div class="card-actions">${a.join('')}</div>` : '';
}
const TYPE_ICON = { 'Day Spa': '🌿', 'Med Spa': '✨', 'Massage': '🤲', 'Nail Salon': '💅', 'Hair Salon': '✂️', 'Brow & Lash': '👁️' };
const cityNameOf = (spa) => spa.cityName || (findCity(spa.city) || {}).name || spa.city;

// free / "normal" tier — regular photo card
function regularCard(spa) {
  const meta = [spa.type, spa.neighborhood || cityNameOf(spa)].filter(Boolean).join(' · ');
  return `<div class="listing-card free">
    <a href="${spaUrl(spa)}" class="card-link">
      <div class="card-photo">
        ${spa.image
          ? `<img class="card-img" src="${esc(spa.image)}" alt="${esc(spa.name)} — ${esc(spa.type)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('img-failed');this.removeAttribute('src')">`
          : '<div class="card-img img-failed"></div>'}
        ${badges(spa)}
      </div>
      <div class="body">
        <div class="name">${esc(spa.name)}</div>
        <div class="meta"><span>${esc(meta)}</span>${spa.price ? `<span class="price">${esc(spa.price)}</span>` : ''}</div>
        ${spa.rating ? `${stars(spa.rating)}<span class="reviews"> (${spa.reviews || 0})</span>` : ''}
      </div>
    </a>
  </div>`;
}

// standard tier — design 3 (full-bleed moody)
function standardCard(spa) {
  const tags = (spa.menu || []).slice(0, 5).map(m => `<span class="mc-tag">${esc(m.service)}</span>`).join('');
  return `<div class="listing-card moody-card">
    <img class="mc-bg" src="${esc(spa.image)}" alt="${esc(spa.name)} — ${esc(spa.type)}" loading="lazy"
         onerror="this.classList.add('img-failed');this.removeAttribute('src')">
    <div class="mc-overlay"></div>
    <a class="mc-stretch" href="${spaUrl(spa)}" aria-label="${esc(spa.name)}"></a>
    <div class="mc-badges">
      <span class="mc-badge std">✦ Standard</span>
      ${spa.blackOwned ? '<span class="mc-badge dark">✦ Black-Owned</span>' : ''}
    </div>
    <div class="mc-content">
      <div class="mc-cat">${esc(spa.type)}</div>
      <div class="mc-name">${esc(spa.name)}</div>
      <div class="mc-nbhd">${esc([spa.neighborhood, cityNameOf(spa), spa.price].filter(Boolean).join(' · '))}</div>
      ${spa.description ? `<div class="mc-desc">${esc(spa.description)}</div>` : ''}
      ${tags ? `<div class="mc-tags">${tags}</div>` : ''}
      <div class="mc-meta">
        <span>${stars(spa.rating)}<span class="reviews"> (${spa.reviews})</span></span>
        ${spa.hours ? `<div class="status" data-hours='${JSON.stringify(spa.hours)}'></div>` : ''}
      </div>
      <div class="mc-btns">
        ${spa.phone ? `<a class="mc-btn ghost" href="tel:${spa.phone.replace(/[^\d+]/g, '')}"><span class="phone-shake" aria-hidden="true">📞</span> Call</a>` : ''}
        ${spa.bookingUrl ? `<a class="mc-btn gold" href="${esc(spa.bookingUrl)}" target="_blank" rel="noopener">Request Appointment →</a>` : ''}
      </div>
    </div>
  </div>`;
}

// premium tier — design 10 (gold-trim dark)
function premiumCard(spa) {
  const tags = (spa.blackOwned ? '<span class="pc-tag bo">✦ Black-Owned</span>' : '')
    + (spa.menu || []).map(m => `<span class="pc-tag">${esc(m.service)}</span>`).join('')
    + (spa.amenities || []).map(a => `<span class="pc-tag">${esc(a)}</span>`).join('');
  return `<div class="listing-card premium-card">
    <a href="${spaUrl(spa)}" class="pc-link">
      <div class="pc-top">
        <div class="pc-top-row">
          <div><div class="pc-cat">${esc(spa.type)}</div><div class="pc-name">${esc(spa.name)}</div></div>
          <div class="pc-score"><div class="pc-score-num">${spa.rating.toFixed(1)}</div><div class="pc-score-label">${spa.reviews} reviews</div></div>
        </div>
        <div class="pc-badges">
          <span class="pc-badge gold">✦ Featured</span>
          ${spa.blackOwned ? '<span class="pc-badge dark">✦ Black-Owned</span>' : ''}
          ${spa.hours ? `<span class="pc-badge open pc-open" data-hours='${JSON.stringify(spa.hours)}'></span>` : ''}
        </div>
      </div>
      <div class="pc-body">
        <div class="pc-nbhd">${esc([spa.neighborhood, cityNameOf(spa), spa.price].filter(Boolean).join(' · '))}</div>
        ${spa.description ? `<div class="pc-desc">${esc(spa.description)}</div>` : ''}
        ${spa.offer ? `<div class="pc-promo">✦ ${esc(spa.offer)}</div>` : ''}
        ${spa.hours ? `<div class="pc-hours" data-hours='${JSON.stringify(spa.hours)}'></div>` : ''}
        ${tags ? `<div class="pc-tags">${tags}</div>` : ''}
      </div>
    </a>
    <div class="pc-actions">
      <div class="pc-btns">
        ${spa.phone ? `<a class="pc-btn ghost" href="tel:${spa.phone.replace(/[^\d+]/g, '')}"><span class="phone-shake" aria-hidden="true">📞</span> Call</a>` : ''}
        ${spa.bookingUrl ? `<a class="pc-btn gold" href="${esc(spa.bookingUrl)}" target="_blank" rel="noopener">Request Appointment →</a>` : ''}
      </div>
    </div>
  </div>`;
}

function card(spa) {
  if (spa.tier === 'premium') return premiumCard(spa);
  if (spa.tier === 'standard') return standardCard(spa);
  return regularCard(spa);
}

function shell({ title, desc, path, jsonLd = '', body, noindex = false }) {
  const canonical = BASE_URL + path;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">${noindex ? '\n  <meta name="robots" content="noindex,follow">' : ''}
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <script type="module" src="/js/site.js"></script>
  ${jsonLd}
</head>
<body>
  <header class="site-header">
    <div class="container">
      <div class="brand"><a href="/" style="color:inherit;text-decoration:none;">Spas<small>· Georgia</small></a></div>
      <nav class="nav">
        <a href="/">Cities</a>
        <a href="/black-owned/">Black-owned</a>
        <a href="/blog/">Blog</a>
        <a href="mailto:hello@example.com?subject=List%20my%20business">List your business</a>
      </nav>
    </div>
  </header>
  <main class="container">
${body}
  </main>
  <footer class="site-footer">
    <div class="container">© 2026 Spas · Georgia · <span class="version">${BUILD}</span></div>
  </footer>
</body>
</html>
`;
}

function listPage({ relDir, title, desc, h1, introHtml, listings }) {
  const path = `/${relDir ? relDir + '/' : ''}`;
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: title,
    about: byRank(listings).map((s, i) => ({
      '@type': 'LocalBusiness', position: i + 1, name: s.name, url: BASE_URL + spaUrl(s),
      ...(s.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: s.rating, reviewCount: s.reviews || 0 } } : {}),
      ...(s.address ? { address: s.address, telephone: s.phone } : {}),
    })),
  })}</script>`;
  // group by tier so rows never mix: premium grid, then standard, then free
  const grids = ['premium', 'standard', 'free']
    .map(t => byRank(listings.filter(s => s.tier === t)))
    .filter(g => g.length)
    .map(g => `<div class="listing-grid">\n      ${g.map(card).join('\n      ')}\n    </div>`)
    .join('\n    ');
  const body = `    <section class="hero">
      <h1>${esc(h1)}</h1>
      <p>${introHtml}</p>
    </section>
    ${grids}`;
  write(relDir, shell({ title, desc, path, jsonLd, body }));
}

function profilePage(spa) {
  const cityName = cityNameOf(spa);
  const path = spaUrl(spa);
  const title = `${spa.name} — ${spa.type} in ${spa.neighborhood || cityName}, GA`;
  const desc = `${spa.name}, a ${spa.type.toLowerCase()} in ${spa.neighborhood || cityName}, GA. ` +
    `Rated ${spa.rating}/5 (${spa.reviews} reviews).` +
    (spa.tier === 'premium' ? ' Book online, view the service menu, and get directions.' : '');
  const meta = [spa.type, spa.neighborhood].filter(Boolean).join(' · ');

  let panels = '';
  if (spa.tier !== 'free') {
    panels += `<div class="panel"><h3>Book an appointment</h3>
      ${spa.offer ? `<p style="margin:0 0 12px;color:var(--accent);font-weight:600;">${esc(spa.offer)}</p>` : ''}
      <a href="${esc(spa.bookingUrl)}" target="_blank" rel="noopener" class="btn">Book now</a></div>`;
    if (spa.menu && spa.menu.length) {
      panels += `<div class="panel"><h3>Service menu</h3><div class="menu-list">` +
        spa.menu.map(m => `<div class="menu-row"><span>${esc(m.service)}</span><span class="price">${esc(m.price)}</span></div>`).join('') +
        `</div></div>`;
    }
    panels += `<div class="panel"><h3>Location</h3>
      <iframe class="map-embed" loading="lazy" title="Map of ${esc(spa.name)}" src="https://maps.google.com/maps?q=${spa.lat},${spa.lng}&z=15&output=embed"></iframe>
      <p class="addr">${esc(spa.address)}</p>
      <a class="map-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spa.address)}" target="_blank" rel="noopener">Open in Google Maps →</a></div>`;
    panels += `<div class="panel"><h3>Contact</h3>
      <p style="margin:0;"><a href="tel:${spa.phone.replace(/[^\d+]/g, '')}" class="btn btn-secondary">Call ${esc(spa.phone)}</a></p></div>`;
  } else {
    const locked = (t, l) => `<div class="panel locked"><h3>${t}</h3><div class="lock-msg"><span class="lock-icon">🔒</span><span>${l} is available on premium listings only.</span></div></div>`;
    panels += locked('Book an appointment', 'Direct booking');
    panels += locked('Service menu &amp; offers', 'Pricing and promotions');
    panels += locked('Location', 'Exact address and map');
    panels += locked('Contact', 'Phone and contact form');
    panels += `<div class="upgrade-cta"><h3>Own ${esc(spa.name)}?</h3>
      <p>Claim this listing to add booking links, your service menu, address &amp; map, and contact info — and get pinned to the top of the city page.</p>
      <a class="btn" href="mailto:hello@example.com?subject=${encodeURIComponent('Claim listing: ' + spa.name)}">Claim this listing</a></div>`;
  }

  const similar = byRank(ACTIVE.filter(s => s.city === spa.city && s.id !== spa.id)).slice(0, 3);
  const similarHtml = similar.length
    ? `<div class="similar"><h2 class="section">Nearby spas</h2><div class="listing-grid">${similar.map(card).join('')}</div></div>`
    : '';

  const jsonLd = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'HealthAndBeautyBusiness',
    name: spa.name, image: spa.image || undefined, url: BASE_URL + path,
    ...(spa.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: spa.rating, reviewCount: spa.reviews || 0 } } : {}),
    ...(spa.address ? { address: spa.address, telephone: spa.phone } : {}),
    ...(typeof spa.lat === 'number' ? { geo: { '@type': 'GeoCoordinates', latitude: spa.lat, longitude: spa.lng } } : {}),
  })}</script>`;

  const body = `    <div class="detail-hero">
      ${spa.image
        ? `<img class="detail-img" src="${esc(spa.image)}" alt="${esc(spa.name)}" referrerpolicy="no-referrer" onerror="this.classList.add('img-failed');this.removeAttribute('src')">`
        : '<div class="detail-img img-failed"></div>'}
      ${badges(spa)}
    </div>
    <div class="detail-header">
      <div class="crumbs"><a href="/">Georgia</a> › <a href="${cityUrl(cityName)}">${esc(cityName)}</a></div>
      <h1>${esc(spa.name)}</h1>
      <div class="meta"><span>${esc(meta)}</span>${spa.price ? `<span class="price">${esc(spa.price)}</span>` : ''}</div>
      ${spa.rating ? `<div class="rating-row">${stars(spa.rating)}<span class="reviews"> ${spa.reviews || 0} reviews</span></div>` : ''}
      ${spa.tier !== 'free' && spa.hours ? `<div class="status" data-hours='${JSON.stringify(spa.hours)}'></div>` : ''}
    </div>
    ${panels}
    ${similarHtml}`;

  write(`spas/${spaSlug(spa)}`, shell({ title, desc, path, jsonLd, body }));
}

// ---------- run ----------
rmSync(GA_DIR, { recursive: true, force: true });
mkdirSync(GA_DIR, { recursive: true });
cpSync(join(ROOT, 'css'), join(GA_DIR, 'css'), { recursive: true }); // self-contained root
mkdirSync(join(GA_DIR, 'js'), { recursive: true });                  // only the client bits
cpSync(join(ROOT, 'js/hours.js'), join(GA_DIR, 'js/hours.js'));
cpSync(join(ROOT, 'js/site.js'), join(GA_DIR, 'js/site.js'));

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

// Georgia home — hero, category quick-links, featured, city directory
{
  const featured = byRank(ACTIVE).slice(0, 6).map(card).join('\n      ');
  const cityCards = live.map(p =>
    `<a class="city-card" href="/${p.slug}/"><div class="city-name">${esc(p.name)}</div>` +
    `<div class="city-count">${p.listings.length} ${p.listings.length === 1 ? 'spa' : 'spas'} →</div></a>`
  ).join('\n      ');
  const tc = (t) => ACTIVE.filter(s => s.type === t).length;
  const boCount = ACTIVE.filter(s => s.blackOwned).length;
  write('', shell({
    title: 'Best Spas in Georgia | GA Spa Directory',
    desc: 'Find and book day spas, med spas, and massage across Georgia. Browse by city, category, and Black-owned businesses.',
    path: '/',
    body: `    <section class="hero hero-home">
      <div class="hero-eyebrow">Georgia spa &amp; wellness directory</div>
      <h1>Find your next escape</h1>
      <p>Day spas, med spas, and massage across ${live.length} Georgia cities — discover, compare, and book your moment of calm.</p>
      <p class="home-stat">${ACTIVE.length} spas · ${live.length} cities${boCount ? ` · ${boCount} Black-owned` : ''}</p>
      <div class="cat-cards">
        <a class="cat-card" href="/category/day-spas/"><span class="ic">🌿</span>Day Spas<small>${tc('Day Spa')}</small></a>
        <a class="cat-card" href="/category/med-spas/"><span class="ic">✨</span>Med Spas<small>${tc('Med Spa')}</small></a>
        <a class="cat-card" href="/category/massage/"><span class="ic">🤲</span>Massage<small>${tc('Massage')}</small></a>
        <a class="cat-card bo" href="/black-owned/"><span class="ic">✶</span>Black-Owned<small>${boCount}</small></a>
      </div>
    </section>

    ${boCount ? `<div class="bo-banner">
      <div><h3>Support Black-owned wellness</h3><p>${boCount} Black-owned ${boCount === 1 ? 'spa' : 'spas'} across Georgia — easy to find, easy to book.</p></div>
      <a class="btn" href="/black-owned/">Explore →</a>
    </div>` : ''}

    <h2 class="section">Featured</h2>
    <div class="listing-grid">
      ${featured}
    </div>
    <h2 class="section">Browse by city</h2>
    <div class="city-grid">
      ${cityCards}
    </div>`,
  }));
}

for (const { slug, name, listings } of live) {
  counts.cities++;
  listPage({
    relDir: slug,
    title: `Best Spas in ${name} GA | GA Spa Directory`,
    desc: `Find and book the best spas in ${name}, Georgia — day spas, med spas & massage. Ratings, hours, and directions.`,
    h1: `Best spas in ${name}`,
    introHtml: `Looking for the best spas in ${name}, GA? We list ${listings.length} ${listings.length === 1 ? 'spa' : 'spas'} with ratings and directions.`,
    listings,
  });

  for (const type of [...new Set(listings.map(s => s.type))]) {
    const list = listings.filter(s => s.type === type);
    counts.category++;
    listPage({
      relDir: `${slug}/${catSlug(type)}`,
      title: `Best ${cap(catLabel(type))} in ${name} GA | GA Spa Directory`,
      desc: `Top ${catLabel(type)} in ${name}, Georgia. Compare ratings and book your appointment.`,
      h1: `${cap(catLabel(type))} in ${name}`,
      introHtml: `The best ${catLabel(type)} in ${name}, GA — ${list.length} to compare.`,
      listings: list,
    });
  }

  const cityBO = listings.filter(s => s.blackOwned);
  if (cityBO.length) {
    counts.cityBO++;
    listPage({
      relDir: `${slug}/black-owned`,
      title: `Black-Owned Spas in ${name} GA | GA Spa Directory`,
      desc: `Black-owned spas and wellness businesses in ${name}, Georgia. Discover, support, and book.`,
      h1: `Black-owned spas in ${name}`,
      introHtml: `Discover and support ${cityBO.length} Black-owned ${cityBO.length === 1 ? 'spa' : 'spas'} in ${name}, GA.`,
      listings: cityBO,
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
      <p>We're expanding our spa directory to ${esc(e.name)}, GA. No spas are listed here yet — if you own or know a great spa in ${esc(e.name)}, <a href="mailto:hello@example.com?subject=${encodeURIComponent('Add a spa in ' + e.name)}">tell us</a> and we'll add it.</p>
    </section>
    <h2 class="section">Browse spas in nearby cities</h2>
    <p>${liveLinks || '<a href="/">See all cities</a>'}</p>
    <h2 class="section">Browse by type</h2>
    <p><a href="/category/day-spas/">Day spas</a> · <a href="/category/med-spas/">Med spas</a> · <a href="/category/massage/">Massage</a> · <a href="/black-owned/">Black-owned spas</a></p>`,
  }));
  noindexed.add(`/${e.slug}/`);
}

// statewide Black-owned (highest-priority SEO asset)
const allBO = ACTIVE.filter(s => s.blackOwned);
if (allBO.length) {
  counts.statewide++;
  listPage({
    relDir: 'black-owned',
    title: 'Black-Owned Spas in Georgia | GA Spa Directory',
    desc: 'A directory of Black-owned spas and wellness businesses across Georgia — discover, support, and book.',
    h1: 'Black-owned spas in Georgia',
    introHtml: `Discover and support ${allBO.length} Black-owned spas and wellness businesses across Georgia — a community resource that makes them easy to find and book.`,
    listings: allBO,
  });
}

// statewide categories
for (const type of [...new Set(ACTIVE.map(s => s.type))]) {
  const list = ACTIVE.filter(s => s.type === type);
  counts.statewide++;
  listPage({
    relDir: `category/${catSlug(type)}`,
    title: `Best ${cap(catLabel(type))} in Georgia | GA Spa Directory`,
    desc: `Top ${catLabel(type)} across Georgia. Compare ratings and prices, then book.`,
    h1: `${cap(catLabel(type))} in Georgia`,
    introHtml: `The best ${catLabel(type)} across Georgia — ${list.length} to compare.`,
    listings: list,
  });
}

// individual spa profiles (spa types only)
for (const spa of ACTIVE) { profilePage(spa); counts.profiles++; }

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
    <div class="listing-grid">
      ${atl.map(card).join('\n      ')}
    </div>`,
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
