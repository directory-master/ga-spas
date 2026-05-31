import {
  CITIES, SPAS, findCity, findSpa, spasByCity, spaCountByCity,
  sortListings, featuredSpas, spasNear, ZIP_CENTROIDS,
} from './data/spas.js';
import './site.js'; // paints live open/closed status + countdown on cards

function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid == null || kid === false) continue;
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
}

function param(name) {
  return new URLSearchParams(location.search).get(name);
}

// ---------- shared bits ----------
function stars(rating) {
  const full = Math.round(rating);
  return el('span', { class: 'stars', title: `${rating} / 5` }, [
    el('span', { class: 'star-fill', 'aria-hidden': 'true' }, '★★★★★'.slice(0, full)),
    el('span', { class: 'star-empty', 'aria-hidden': 'true' }, '★★★★★'.slice(full)),
    el('span', { class: 'rating-num' }, ` ${rating.toFixed(1)}`),
  ]);
}

// Photo with graceful gradient fallback if the remote image 404s.
function photo(spa, className) {
  return el('img', {
    class: className,
    src: spa.image,
    alt: `${spa.name} — ${spa.type}`,
    loading: 'lazy',
    onerror: function () { this.classList.add('img-failed'); this.removeAttribute('src'); },
  });
}

function badges(spa) {
  return el('div', { class: 'badges' }, [
    spa.tier === 'premium' ? el('span', { class: 'badge badge-premium' }, '✦ Premium') : null,
    spa.blackOwned ? el('span', { class: 'badge badge-bo' }, '✶ Black-owned') : null,
  ]);
}

function metaLine(spa) {
  const bits = [spa.type, spa.neighborhood].filter(Boolean).join(' · ');
  return el('div', { class: 'meta' }, [
    el('span', {}, bits),
    el('span', { class: 'price' }, spa.price),
  ]);
}

function statusEl(spa) {
  // empty placeholder; site.js fills it in and ticks the countdown
  return spa.hours ? el('div', { class: 'status', 'data-hours': JSON.stringify(spa.hours) }) : null;
}

// ---------- Home ----------
export function renderHome() {
  const grid = document.getElementById('city-grid');
  if (!grid) return;

  setupNearMe();

  const feat = document.getElementById('featured-row');
  if (feat) {
    for (const spa of featuredSpas(3)) feat.appendChild(listingCard(spa));
  }

  for (const city of CITIES) {
    const count = spaCountByCity(city.slug);
    grid.appendChild(
      el('a', { href: `city.html?city=${city.slug}`, class: 'city-card' }, [
        el('div', { class: 'city-name' }, city.name),
        el('div', { class: 'city-blurb' }, city.blurb),
        el('div', { class: 'city-count' }, `${count} ${count === 1 ? 'listing' : 'listings'} →`),
      ])
    );
  }
}

// ---------- City list ----------
export function renderCity() {
  const slug = param('city');
  const city = findCity(slug);
  const titleEl = document.getElementById('city-title');
  const blurbEl = document.getElementById('city-blurb');
  const results = document.getElementById('results');
  const empty = document.getElementById('empty');
  const toolbar = document.getElementById('toolbar');

  if (!city) {
    titleEl.textContent = 'City not found';
    blurbEl.textContent = 'Pick a city from the home page.';
    return;
  }

  document.title = `${city.name} — Georgia Spa Directory`;
  titleEl.textContent = `Spas & salons in ${city.name}`;
  blurbEl.textContent = city.blurb;

  const all = spasByCity(slug);
  const categories = ['All', ...new Set(all.map(s => s.type))];
  const state = { q: '', cat: 'All', blackOwned: false };

  // category chips
  const chipBox = document.getElementById('cat-chips');
  const chips = categories.map(cat => {
    const chip = el('button', {
      class: 'chip' + (cat === state.cat ? ' active' : ''),
      type: 'button',
      onclick: () => { state.cat = cat; chips.forEach(c => c.classList.toggle('active', c === chip)); apply(); },
    }, cat);
    chipBox.appendChild(chip);
    return chip;
  });

  document.getElementById('search').addEventListener('input', (e) => {
    state.q = e.target.value.trim().toLowerCase(); apply();
  });
  document.getElementById('bo-filter').addEventListener('change', (e) => {
    state.blackOwned = e.target.checked; apply();
  });

  function apply() {
    const list = all.filter(s => {
      if (state.cat !== 'All' && s.type !== state.cat) return false;
      if (state.blackOwned && !s.blackOwned) return false;
      if (state.q) {
        const hay = `${s.name} ${s.type} ${s.neighborhood}`.toLowerCase();
        if (!hay.includes(state.q)) return false;
      }
      return true;
    });

    // group by tier so rows never mix: premium, then standard, then free
    results.innerHTML = '';
    let count = 0;
    for (const tier of ['premium', 'standard', 'free']) {
      const group = sortListings(list.filter(s => s.tier === tier));
      if (!group.length) continue;
      results.appendChild(el('div', { class: 'listing-grid' }, group.map(s => listingCard(s))));
      count += group.length;
    }
    empty.hidden = count > 0;
    if (toolbar) toolbar.hidden = false;
  }

  apply();
}

function cardActions(spa) {
  const a = [];
  if (spa.phone) a.push(el('a', { class: 'action', href: `tel:${spa.phone.replace(/[^\d+]/g, '')}` }, [el('span', { class: 'phone-shake', 'aria-hidden': 'true' }, '📞'), ' Call']));
  if (spa.email) a.push(el('a', { class: 'action', href: `mailto:${spa.email}` }, [el('span', { 'aria-hidden': 'true' }, '✉'), ' Email']));
  return a.length ? el('div', { class: 'card-actions' }, a) : null;
}

const TYPE_ICON = { 'Day Spa': '🌿', 'Med Spa': '✨', 'Massage': '🤲', 'Nail Salon': '💅', 'Hair Salon': '✂️', 'Brow & Lash': '👁️' };
const cityNameOf = (spa) => (findCity(spa.city) || {}).name || spa.city;

function listingCard(spa, opts) {
  if (spa.tier === 'premium') return premiumListingCard(spa, opts);
  if (spa.tier === 'standard') return standardListingCard(spa, opts);
  return regularListingCard(spa, opts);
}

// free / "normal" tier — regular photo card
function regularListingCard(spa, opts) {
  const miles = opts && typeof opts.miles === 'number' ? opts.miles : null;
  return el('div', { class: 'listing-card free' }, [
    el('a', { href: `listing.html?id=${spa.id}`, class: 'card-link' }, [
      el('div', { class: 'card-photo' }, [
        photo(spa, 'card-img'),
        badges(spa),
        miles != null ? el('span', { class: 'dist-chip' }, `${miles < 0.1 ? '<0.1' : miles.toFixed(1)} mi`) : null,
      ]),
      el('div', { class: 'body' }, [
        el('div', { class: 'name' }, spa.name),
        metaLine(spa),
        stars(spa.rating),
        el('span', { class: 'reviews' }, ` (${spa.reviews})`),
      ]),
    ]),
    cardActions(spa),
  ]);
}

// standard tier — design 3 (full-bleed moody)
function standardListingCard(spa) {
  const tagEls = (spa.menu || []).slice(0, 5).map(m => el('span', { class: 'mc-tag' }, m.service));
  return el('div', { class: 'listing-card moody-card' }, [
    photo(spa, 'mc-bg'),
    el('div', { class: 'mc-overlay' }),
    el('a', { class: 'mc-stretch', href: `listing.html?id=${spa.id}`, 'aria-label': spa.name }),
    el('div', { class: 'mc-badges' }, [
      el('span', { class: 'mc-badge std' }, '✦ Standard'),
      spa.blackOwned ? el('span', { class: 'mc-badge dark' }, '✦ Black-Owned') : null,
    ]),
    el('div', { class: 'mc-content' }, [
      el('div', { class: 'mc-cat' }, spa.type),
      el('div', { class: 'mc-name' }, spa.name),
      el('div', { class: 'mc-nbhd' }, [spa.neighborhood, cityNameOf(spa), spa.price].filter(Boolean).join(' · ')),
      spa.description ? el('div', { class: 'mc-desc' }, spa.description) : null,
      tagEls.length ? el('div', { class: 'mc-tags' }, tagEls) : null,
      el('div', { class: 'mc-meta' }, [
        el('span', {}, [stars(spa.rating), el('span', { class: 'reviews' }, ` (${spa.reviews})`)]),
        statusEl(spa),
      ]),
      el('div', { class: 'mc-btns' }, [
        spa.phone ? el('a', { class: 'mc-btn ghost', href: `tel:${spa.phone.replace(/[^\d+]/g, '')}` }, [el('span', { class: 'phone-shake', 'aria-hidden': 'true' }, '📞'), ' Call']) : null,
        spa.bookingUrl ? el('a', { class: 'mc-btn gold', href: spa.bookingUrl, target: '_blank', rel: 'noopener' }, 'Request Appointment →') : null,
      ]),
    ]),
  ]);
}

// premium tier — design 10 (gold-trim dark)
function premiumListingCard(spa) {
  const tagEls = [];
  if (spa.blackOwned) tagEls.push(el('span', { class: 'pc-tag bo' }, '✦ Black-Owned'));
  for (const m of (spa.menu || [])) tagEls.push(el('span', { class: 'pc-tag' }, m.service));
  for (const a of (spa.amenities || [])) tagEls.push(el('span', { class: 'pc-tag' }, a));
  return el('div', { class: 'listing-card premium-card' }, [
    el('a', { class: 'pc-link', href: `listing.html?id=${spa.id}` }, [
      el('div', { class: 'pc-top' }, [
        el('div', { class: 'pc-top-row' }, [
          el('div', {}, [el('div', { class: 'pc-cat' }, spa.type), el('div', { class: 'pc-name' }, spa.name)]),
          el('div', { class: 'pc-score' }, [el('div', { class: 'pc-score-num' }, spa.rating.toFixed(1)), el('div', { class: 'pc-score-label' }, `${spa.reviews} reviews`)]),
        ]),
        el('div', { class: 'pc-badges' }, [
          el('span', { class: 'pc-badge gold' }, '✦ Featured'),
          spa.blackOwned ? el('span', { class: 'pc-badge dark' }, '✦ Black-Owned') : null,
          spa.hours ? el('span', { class: 'pc-badge open pc-open', 'data-hours': JSON.stringify(spa.hours) }) : null,
        ]),
      ]),
      el('div', { class: 'pc-body' }, [
        el('div', { class: 'pc-nbhd' }, [spa.neighborhood, cityNameOf(spa), spa.price].filter(Boolean).join(' · ')),
        spa.description ? el('div', { class: 'pc-desc' }, spa.description) : null,
        spa.offer ? el('div', { class: 'pc-promo' }, `✦ ${spa.offer}`) : null,
        spa.hours ? el('div', { class: 'pc-hours', 'data-hours': JSON.stringify(spa.hours) }) : null,
        tagEls.length ? el('div', { class: 'pc-tags' }, tagEls) : null,
      ]),
    ]),
    el('div', { class: 'pc-actions' }, [
      el('div', { class: 'pc-btns' }, [
        spa.phone ? el('a', { class: 'pc-btn ghost', href: `tel:${spa.phone.replace(/[^\d+]/g, '')}` }, [el('span', { class: 'phone-shake', 'aria-hidden': 'true' }, '📞'), ' Call']) : null,
        spa.bookingUrl ? el('a', { class: 'pc-btn gold', href: spa.bookingUrl, target: '_blank', rel: 'noopener' }, 'Request Appointment →') : null,
      ]),
    ]),
  ]);
}

// ---------- Near me / ZIP ----------
function setupNearMe() {
  const locateBtn = document.getElementById('locate-btn');
  const zipInput = document.getElementById('zip');
  const zipGo = document.getElementById('zip-go');
  const msg = document.getElementById('locate-msg');
  if (!locateBtn) return;

  function say(text, isError) {
    msg.hidden = false;
    msg.textContent = text;
    msg.classList.toggle('error', !!isError);
  }

  function showNear(origin, label) {
    const section = document.getElementById('near-section');
    const row = document.getElementById('near-row');
    row.innerHTML = '';
    const results = spasNear(origin, 6);
    for (const { spa, miles } of results) row.appendChild(listingCard(spa, { miles }));
    section.hidden = false;
    say(`Showing the ${results.length} closest spas${label ? ` to ${label}` : ''}.`);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  locateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) { say('Geolocation is not supported on this browser — try a ZIP code.', true); return; }
    say('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => showNear({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'you'),
      () => say('Could not get your location. Enter a ZIP code instead.', true),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });

  function goZip() {
    const zip = (zipInput.value || '').trim();
    if (!/^\d{5}$/.test(zip)) { say('Enter a 5-digit ZIP code.', true); return; }
    const hit = ZIP_CENTROIDS[zip];
    if (!hit) { say(`We don't cover ${zip} yet — try a Georgia metro ZIP.`, true); return; }
    showNear({ lat: hit.lat, lng: hit.lng }, `${zip} (${hit.label})`);
  }
  zipGo.addEventListener('click', goZip);
  zipInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') goZip(); });
}

// ---------- Detail ----------
export function renderListing() {
  const id = param('id');
  const spa = findSpa(id);
  const root = document.getElementById('detail-root');

  if (!spa) {
    root.appendChild(el('p', {}, 'Listing not found.'));
    return;
  }

  const city = findCity(spa.city);
  document.title = `${spa.name} — ${city.name}`;

  // hero photo
  root.appendChild(
    el('div', { class: 'detail-hero' }, [
      photo(spa, 'detail-img'),
      badges(spa),
    ])
  );

  // header
  root.appendChild(
    el('div', { class: 'detail-header' }, [
      el('div', { class: 'crumbs' }, [
        el('a', { href: 'index.html' }, 'Georgia'),
        document.createTextNode(' › '),
        el('a', { href: `city.html?city=${city.slug}` }, city.name),
      ]),
      el('h1', {}, spa.name),
      metaLine(spa),
      el('div', { class: 'rating-row' }, [stars(spa.rating), el('span', { class: 'reviews' }, ` ${spa.reviews} reviews`)]),
      spa.tier !== 'free' ? statusEl(spa) : null,
    ])
  );

  if (spa.tier !== 'free') {
    renderPremiumDetail(root, spa);
  } else {
    renderFreeDetail(root, spa, city);
  }

  renderSimilar(root, spa);
}

function renderPremiumDetail(root, spa) {
  // Book Now
  root.appendChild(
    el('div', { class: 'panel' }, [
      el('h3', {}, 'Book an appointment'),
      spa.offer ? el('p', { style: 'margin:0 0 12px; color: var(--accent); font-weight: 600;' }, spa.offer) : null,
      el('a', { href: spa.bookingUrl, target: '_blank', rel: 'noopener', class: 'btn' }, 'Book now'),
    ])
  );

  // Menu
  if (spa.menu && spa.menu.length) {
    root.appendChild(
      el('div', { class: 'panel' }, [
        el('h3', {}, 'Service menu'),
        el('div', { class: 'menu-list' },
          spa.menu.map(m => el('div', { class: 'menu-row' }, [
            el('span', {}, m.service),
            el('span', { class: 'price' }, m.price),
          ]))
        ),
      ])
    );
  }

  // Location — real map embed
  const mapsQuery = encodeURIComponent(spa.address);
  root.appendChild(
    el('div', { class: 'panel' }, [
      el('h3', {}, 'Location'),
      el('iframe', {
        class: 'map-embed', loading: 'lazy', title: `Map of ${spa.name}`,
        src: `https://maps.google.com/maps?q=${spa.lat},${spa.lng}&z=15&output=embed`,
      }),
      el('p', { class: 'addr' }, spa.address),
      el('a', { class: 'map-link', href: `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`, target: '_blank', rel: 'noopener' }, 'Open in Google Maps →'),
    ])
  );

  // Contact
  root.appendChild(
    el('div', { class: 'panel' }, [
      el('h3', {}, 'Contact'),
      el('p', { style: 'margin:0 0 12px;' }, [
        el('a', { href: `tel:${spa.phone.replace(/[^\d+]/g,'')}`, class: 'btn btn-secondary' }, `Call ${spa.phone}`),
      ]),
      el('form', { class: 'contact-form', onsubmit: (e) => { e.preventDefault(); alert('Message sent (demo).'); } }, [
        el('div', { class: 'field' }, [
          el('label', { for: 'cf-name' }, 'Your name'),
          el('input', { id: 'cf-name', type: 'text', required: 'required' }),
        ]),
        el('div', { class: 'field' }, [
          el('label', { for: 'cf-email' }, 'Email'),
          el('input', { id: 'cf-email', type: 'email', required: 'required' }),
        ]),
        el('div', { class: 'field' }, [
          el('label', { for: 'cf-msg' }, 'Message'),
          el('textarea', { id: 'cf-msg', required: 'required' }),
        ]),
        el('button', { type: 'submit', class: 'btn' }, 'Send message'),
      ]),
    ])
  );
}

function renderFreeDetail(root, spa, city) {
  const lockedPanel = (title, label) =>
    el('div', { class: 'panel locked' }, [
      el('h3', {}, title),
      el('div', { class: 'lock-msg' }, [
        el('span', { class: 'lock-icon' }, '🔒'),
        el('span', {}, `${label} is available on premium listings only.`),
      ]),
    ]);

  root.appendChild(lockedPanel('Book an appointment', 'Direct booking'));
  root.appendChild(lockedPanel('Service menu & offers', 'Pricing and promotions'));
  root.appendChild(lockedPanel('Location', 'Exact address and map'));
  root.appendChild(lockedPanel('Contact', 'Phone and contact form'));

  root.appendChild(
    el('div', { class: 'upgrade-cta' }, [
      el('h3', {}, `Own ${spa.name}?`),
      el('p', {}, 'Claim this listing to add booking links, your service menu, address & map, and a phone/contact form — and get pinned to the top of the city page.'),
      el('a', { class: 'btn', href: `mailto:hello@example.com?subject=${encodeURIComponent('Claim listing: ' + spa.name)}` }, 'Claim this listing'),
    ])
  );
}

function renderSimilar(root, spa) {
  const similar = sortListings(
    spasByCity(spa.city).filter(s => s.id !== spa.id)
  ).slice(0, 3);
  if (!similar.length) return;

  root.appendChild(
    el('div', { class: 'similar' }, [
      el('h2', { class: 'section' }, 'Nearby spas'),
      el('div', { class: 'listing-grid' }, similar.map(listingCard)),
    ])
  );
}
