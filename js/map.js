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
  const dirLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

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
    return [...document.querySelectorAll('.card[data-lat][data-lng]')].map((c) => {
      const lat = num(c.dataset.lat), lng = num(c.dataset.lng);
      if (lat == null || lng == null) return null;
      const a = c.querySelector('.card-name a');
      return {
        name: c.dataset.spa || (a ? a.textContent : 'Spa'), lat, lng,
        type: c.querySelector('.card-cat')?.textContent || '', city: c.dataset.city || '',
        href: a ? a.href : null,
      };
    }).filter(Boolean);
  }

  async function spasFromIndex() {
    const ver = el.dataset.ver || '';
    const mod = await import('/js/data/search-index.js' + (ver ? `?v=${ver}` : ''));
    return mod.INDEX.filter((s) => s.lat && s.lng).map((s) => ({
      name: s.name, lat: s.lat, lng: s.lng, type: s.type || '', city: s.cityName || '',
      href: s.website || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name}, ${s.address || s.cityName || 'GA'}`)}`,
    }));
  }

  function popupHtml(s) {
    const meta = [esc(s.type), esc(s.city)].filter(Boolean).join(' · ');
    const visit = s.href ? `<a href="${esc(s.href)}" target="_blank" rel="noopener nofollow">Visit</a> · ` : '';
    return `<div class="map-pop"><strong>${esc(s.name)}</strong>${meta ? `<div class="map-pop-meta">${meta}</div>` : ''}` +
      `<div class="map-pop-links">${visit}<a href="${dirLink(s.lat, s.lng)}" target="_blank" rel="noopener">Directions</a></div></div>`;
  }

  async function init() {
    const spas = el.dataset.source === 'index' ? await spasFromIndex() : spasFromCards();
    const center = [num(el.dataset.lat) ?? 32.9, num(el.dataset.lng) ?? -83.5];
    const map = L.map(el, { scrollWheelZoom: false, preferCanvas: true }).setView(center, num(el.dataset.zoom) || 11);
    L.tileLayer(TILE, { attribution: ATTR, maxZoom: 19 }).addTo(map);

    const renderer = L.canvas({ padding: 0.5 });
    const bounds = [];
    spas.forEach((s) => {
      L.circleMarker([s.lat, s.lng], { renderer, radius: 7, color: '#fff', weight: 1.5, fillColor: '#BE7B54', fillOpacity: 0.92 })
        .bindPopup(popupHtml(s)).addTo(map);
      bounds.push([s.lat, s.lng]);
    });

    // user location — a distinct pulsing dot, shared with the rest of the site
    const userIcon = L.divIcon({ className: 'user-dot-wrap', html: '<span class="user-dot"></span>', iconSize: [20, 20] });
    let userMarker = null;
    const setUser = (lat, lng, pan) => {
      if (userMarker) userMarker.setLatLng([lat, lng]);
      else userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map).bindPopup('You are here');
      if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 12));
    };
    const up = userPoint();
    if (up) { setUser(up.lat, up.lng, false); bounds.push([up.lat, up.lng]); }

    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });

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
