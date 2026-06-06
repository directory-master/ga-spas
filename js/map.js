// Spa map — plots spa markers + the visitor's location on an OpenStreetMap map
// via self-hosted Leaflet (/vendor/leaflet/, global `L`). No API key, no billing.
//
// Two data sources for #spa-map:
//   • default: the spa cards already on the page (city pages) — read from
//     data-lat / data-lng / data-spa on each .card.
//   • data-source="index": the whole directory (the /map/ page) — dynamically
//     imported from js/data/search-index.js (data-ver carries the cache-buster).
//
// Markers are canvas circleMarkers (fast even with ~2k points). The user's
// location is shared with js/home.js via localStorage 'gaspas:location'.
(function () {
  const el = document.getElementById('spa-map');
  if (!el || !window.L) return;
  const L = window.L;

  const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? null : n; };
  const TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const milesBetween = (a, b) => {
    const R = 3958.8, rad = (d) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // saved location (shared with js/home.js): GPS coords or a ZIP centroid
  function userPoint() {
    let loc = null; try { loc = JSON.parse(localStorage.getItem('gaspas:location') || 'null'); } catch {}
    if (!loc) return null;
    if (typeof loc.lat === 'number' && typeof loc.lng === 'number') return { lat: loc.lat, lng: loc.lng };
    const zip = loc.query && loc.query.match(/\b\d{5}\b/);
    if (zip) { try { const Z = JSON.parse(document.getElementById('zip-centroids')?.textContent || '{}'); if (Z[zip[0]]) return Z[zip[0]]; } catch {} }
    return null;
  }

  function spasFromCards() {
    // skip .is-example demo cards — they're tier previews (often another city's
    // spa) shown to illustrate Premium/Standard, not real local listings to map.
    return [...document.querySelectorAll('.card[data-lat][data-lng]:not(.is-example)')].map((c) => {
      const lat = num(c.dataset.lat), lng = num(c.dataset.lng);
      if (lat == null || lng == null) return null;
      const a = c.querySelector('.card-name a');
      return {
        name: c.dataset.spa || (a ? a.textContent : 'Spa'), lat, lng,
        type: c.querySelector('.card-cat')?.textContent || '', city: c.dataset.city || '',
        rating: num(c.dataset.rating) || 0, reviews: num(c.dataset.reviews) || 0,
        href: a ? a.href : null,
      };
    }).filter(Boolean);
  }

  async function spasFromIndex() {
    const ver = el.dataset.ver || '';
    const mod = await import('/js/data/search-index.js' + (ver ? `?v=${ver}` : ''));
    return mod.INDEX.filter((s) => s.lat && s.lng).map((s) => ({
      name: s.name, lat: s.lat, lng: s.lng, type: s.type || '', city: s.cityName || '',
      rating: s.rating || 0, reviews: s.reviews || 0,
      href: s.website || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name}, ${s.address || s.cityName || 'GA'}`)}`,
    }));
  }

  // `getUser` returns the live user point so distance recomputes after locating;
  // the popup is bound as a function and re-rendered on each open.
  function popupHtml(s, getUser) {
    const meta = [esc(s.type), esc(s.city)].filter(Boolean).join(' · ');
    const r = Math.round(s.rating);
    const rating = s.rating
      ? `<div class="map-pop-rate"><span class="map-pop-stars">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span> ${s.rating.toFixed(1)}${s.reviews ? ` · ${s.reviews} review${s.reviews === 1 ? '' : 's'}` : ''}</div>`
      : `<div class="map-pop-rate map-pop-new">New · no reviews yet</div>`;
    const u = getUser && getUser();
    const dist = u ? `<div class="map-pop-dist">📍 ${(() => { const mi = milesBetween(u, s); return mi < 10 ? mi.toFixed(1) : Math.round(mi); })()} mi away</div>` : '';
    const dest = `${s.lat},${s.lng}`;
    const origin = u ? `&origin=${u.lat},${u.lng}` : '';
    const visit = s.href ? `<a href="${esc(s.href)}" target="_blank" rel="noopener nofollow">Visit</a> · ` : '';
    const rank = s.rank ? `<span class="map-pop-rank">#${s.rank}</span> ` : '';
    return `<div class="map-pop">${rank}<strong>${esc(s.name)}</strong>${meta ? `<div class="map-pop-meta">${meta}</div>` : ''}${rating}${dist}` +
      `<div class="map-pop-links">${visit}<a href="https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}" target="_blank" rel="noopener">Directions</a></div></div>`;
  }

  // embedded spa list (county pages): a <script type="application/json" id="map-spas">
  function spasFromEmbedded() {
    try {
      const raw = document.getElementById('map-spas')?.textContent;
      if (raw) return JSON.parse(raw).filter((s) => s.lat && s.lng);
    } catch {}
    return null;
  }

  async function init() {
    const embedded = spasFromEmbedded();
    const spas = el.dataset.source === 'index' ? await spasFromIndex() : (embedded || spasFromCards());
    const center = [num(el.dataset.lat) ?? 32.9, num(el.dataset.lng) ?? -83.5];
    const map = L.map(el, { scrollWheelZoom: false, preferCanvas: true }).setView(center, num(el.dataset.zoom) || 11);
    L.tileLayer(TILE, { attribution: ATTR, maxZoom: 19 }).addTo(map);

    // live user point — read once now, refreshed when "Show my location" runs;
    // distances in popups recompute against this on every open.
    let currentUser = userPoint();
    const getUser = () => currentUser;

    // county border(s) — drawn FIRST so spa markers sit on top. A single county
    // on city/zip/county pages (data-county), or all of them on /map/
    // (data-counties="all"). Geometry comes from js/data/ga-county-borders.js.
    let countyLayer = null;
    try {
      const ver = el.dataset.ver || '';
      const { COUNTIES } = await import('/js/data/ga-county-borders.js' + (ver ? `?v=${ver}` : ''));
      if (el.dataset.counties === 'all') {
        const feats = Object.values(COUNTIES).map((g) => ({ type: 'Feature', geometry: g, properties: {} }));
        L.geoJSON(feats, { style: { color: '#9aa38c', weight: 1, fill: false, interactive: false } }).addTo(map);
      } else if (el.dataset.county && COUNTIES[el.dataset.county]) {
        countyLayer = L.geoJSON(COUNTIES[el.dataset.county], { style: { color: '#6E7E61', weight: 2.5, fillColor: '#8B9A7E', fillOpacity: 0.08, interactive: false } }).addTo(map);
      }
    } catch (e) { /* border data is optional — map still works without it */ }

    // optional catchment circle — zip / neighborhood pages list "spas within N
    // miles" of a centroid; draw that radius so the area is clear.
    let radiusLayer = null;
    const radiusMi = num(el.dataset.radius);
    if (radiusMi) {
      radiusLayer = L.circle(center, { radius: radiusMi * 1609.34, color: '#6E7E61', weight: 1.5, dashArray: '5 5', fillColor: '#8B9A7E', fillOpacity: 0.06, interactive: false }).addTo(map);
    }

    // marker style: default clay canvas dot, or a pulsating gold STAR when the
    // container asks for it (data-marker="star" — used by the home top-10 map).
    const useStar = el.dataset.marker === 'star';
    // pulsating gold star; when the spa has a rank, its number rides on the star
    const starIcon = (rank) => L.divIcon({ className: 'spa-star-wrap', html: `<span class="spa-star">★${rank ? `<b class="spa-star-rank">${rank}</b>` : ''}</span>`, iconSize: [32, 32] });
    const renderer = L.canvas({ padding: 0.5 });
    const bounds = [];
    spas.forEach((s) => {
      const m = useStar
        ? L.marker([s.lat, s.lng], { icon: starIcon(s.rank), zIndexOffset: s.rank ? (100 - s.rank) * 10 : 0 })
        : L.circleMarker([s.lat, s.lng], { renderer, radius: 7, color: '#fff', weight: 1.5, fillColor: '#BE7B54', fillOpacity: 0.92 });
      m.bindPopup(() => popupHtml(s, getUser)).addTo(map);
      bounds.push([s.lat, s.lng]);
    });

    // user location — a distinct pulsing dot, shared with the rest of the site
    const userIcon = L.divIcon({ className: 'user-dot-wrap', html: '<span class="user-dot"></span>', iconSize: [20, 20] });
    let userMarker = null;
    const setUser = (lat, lng, pan) => {
      currentUser = { lat, lng };
      if (userMarker) userMarker.setLatLng([lat, lng]);
      else userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map).bindPopup('You are here');
      if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 12));
    };
    if (currentUser) { setUser(currentUser.lat, currentUser.lng, false); bounds.push([currentUser.lat, currentUser.lng]); }

    // fit to the county outline / radius circle when shown (so the whole area is
    // visible), else to the spas
    let fitB = bounds.length ? L.latLngBounds(bounds) : null;
    if (countyLayer) { const cb = countyLayer.getBounds(); fitB = fitB ? fitB.extend(cb) : cb; }
    if (radiusLayer) { const rb = radiusLayer.getBounds(); fitB = fitB ? fitB.extend(rb) : rb; }
    if (fitB && fitB.isValid()) map.fitBounds(fitB, { padding: [30, 30], maxZoom: el.dataset.counties === 'all' ? 9 : 13 });

    const btn = document.querySelector('[data-map-locate]');
    btn?.addEventListener('click', () => {
      if (!navigator.geolocation) { btn.textContent = 'Location unavailable'; return; }
      const label = btn.textContent;
      btn.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = +pos.coords.latitude.toFixed(5), lng = +pos.coords.longitude.toFixed(5);
          try { localStorage.setItem('gaspas:location', JSON.stringify({ lat, lng, label: 'your location', ts: Date.now() })); } catch {}
          setUser(lat, lng, true);
          btn.textContent = '📍 Location on';
        },
        () => { btn.textContent = label; },
        { enableHighAccuracy: false, timeout: 9000, maximumAge: 120000 }
      );
    });
  }

  init();
})();
