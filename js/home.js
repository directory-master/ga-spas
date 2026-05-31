// Home search + "Near me" — uses the embedded spa index on the homepage.
const idxEl = document.getElementById('spa-index');
let INDEX = [];
try { INDEX = JSON.parse(idxEl.textContent); } catch { /* no index */ }

const q = document.getElementById('home-q');
const results = document.getElementById('home-results');
const form = document.getElementById('home-search');
const near = document.getElementById('home-near');
if (q && results && form) {
  const render = (list, label) => {
    const top = list.slice(0, 8);
    if (!top.length) { results.hidden = true; return; }
    results.innerHTML = (label ? `<div class="hr-label">${label}</div>` : '') +
      top.map(r => `<a href="${r.u}"><span class="hr-name">${r.n}</span>` +
        `<span class="hr-meta">${r.t} · ${r.c}${r.d != null ? ` · ${r.d} mi` : ''}</span></a>`).join('');
    results.hidden = false;
  };

  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase();
    if (!term) { results.hidden = true; return; }
    render(INDEX.filter(r => `${r.n} ${r.c} ${r.t}`.toLowerCase().includes(term)));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const first = results.querySelector('a');
    if (first) location.href = first.getAttribute('href');
  });

  document.addEventListener('click', (e) => { if (!form.contains(e.target)) results.hidden = true; });

  near?.addEventListener('click', () => {
    if (!navigator.geolocation) return;
    near.textContent = '📍 Locating…';
    navigator.geolocation.getCurrentPosition((pos) => {
      near.textContent = '📍 Near me';
      const la = pos.coords.latitude, lo = pos.coords.longitude;
      const R = 3958.8, rad = (d) => d * Math.PI / 180;
      const withD = INDEX.filter(r => typeof r.a === 'number').map(r => {
        const dLat = rad(r.a - la), dLng = rad(r.o - lo);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(la)) * Math.cos(rad(r.a)) * Math.sin(dLng / 2) ** 2;
        return { ...r, d: Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10 };
      }).sort((x, y) => x.d - y.d);
      render(withD, 'Spas near you');
      q.value = '';
    }, () => { near.textContent = '📍 Near me'; });
  });
}
