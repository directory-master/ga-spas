// /spas-near-me/ — captures "spa near me" search intent. On load it asks for the
// visitor's location, then renders the CLOSEST spas (distance-sorted) as real
// cards from the build's search index, reusing the shared renderer (js/card.js).
// If location is denied/unavailable, the static city + area links below carry the
// page (and the SEO). Saves the location (shared 'gaspas:location') so the linked
// /map/ centers on the visitor too.

const LIMIT = 24;

export async function run(ver) {
  const v = ver ? `?v=${ver}` : '';
  const [{ renderCard }, { INDEX }] = await Promise.all([
    import(`/js/card.js${v}`),
    import(`/js/data/search-index.js${v}`),
  ]);

  const grid = document.getElementById('nearme-grid');
  const note = document.getElementById('nearme-note');
  const btn = document.getElementById('nearme-btn');
  const fallback = document.getElementById('nearme-fallback');
  if (!grid) return;

  const miles = (a, b) => {
    const R = 3958.8, rad = (d) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const linkFor = (s) => s.website
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name}, ${s.address || s.cityName || 'GA'}`)}`;
  const say = (msg) => { if (note) { note.textContent = msg; note.hidden = false; } };

  const render = (lat, lng) => {
    try { localStorage.setItem('gaspas:location', JSON.stringify({ lat, lng, label: 'your location', ts: Date.now() })); } catch {}
    const near = INDEX.filter((s) => s.lat && s.lng)
      .map((s) => ({ s, mi: miles({ lat, lng }, s) }))
      .sort((a, b) => a.mi - b.mi).slice(0, LIMIT);
    grid.innerHTML = near.map(({ s }) => renderCard({ ...s, tier: 'free' }, { href: linkFor(s), cityName: s.cityName })).join('');
    grid.hidden = false;
    if (fallback) fallback.hidden = true;
    say(`📍 ${near.length} spas nearest you — closest first.`);
    // let js/home.js paint the distance chips + wire likes on the new cards
    document.dispatchEvent(new CustomEvent('cards:rendered'));
  };

  const locate = () => {
    if (!navigator.geolocation) { say('Location isn’t available here — browse by city or ZIP below.'); if (fallback) fallback.hidden = false; return; }
    say('📍 Finding spas near you…');
    navigator.geolocation.getCurrentPosition(
      (pos) => render(+pos.coords.latitude.toFixed(5), +pos.coords.longitude.toFixed(5)),
      (err) => {
        say(err && err.code === 1
          ? 'Allow location to see spas near you — or browse by city/ZIP below.'
          : 'Couldn’t pin your location. Browse by city or ZIP below.');
        if (fallback) fallback.hidden = false;
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 120000 }
    );
  };

  btn?.addEventListener('click', locate);

  // reuse a known location if we have one; otherwise auto-ask on load
  let saved = null; try { saved = JSON.parse(localStorage.getItem('gaspas:location') || 'null'); } catch {}
  if (saved && typeof saved.lat === 'number' && typeof saved.lng === 'number') render(saved.lat, saved.lng);
  else locate();
}
