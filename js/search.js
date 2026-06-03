// /search/ — directory-wide spa search, rendered client-side from the build's
// search index (js/data/search-index.js) using the ONE shared card renderer
// (js/card.js). The page hands us a cache-busting version via run(ver) so the
// dynamic imports below pick up fresh data/cards on every deploy.
//
// Searches LIVE as you type (debounced), keeps ?q in the URL (shareable), and
// highlights the typed text in each result. Why a dedicated page, not in-place
// filtering of the home page: filtering the home showcase mangled curated
// sections (Top 10 collapsed to bare rank badges) — search belongs on its own surface.

const BATCH = 36; // cards revealed per "Show more"
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function run(ver) {
  const v = ver ? `?v=${ver}` : '';
  const [{ renderCard }, { INDEX }] = await Promise.all([
    import(`/js/card.js${v}`),
    import(`/js/data/search-index.js${v}`),
  ]);

  const grid = document.getElementById('search-grid');
  const meta = document.getElementById('search-meta');
  const empty = document.getElementById('search-empty');
  const moreWrap = document.getElementById('search-more-wrap');
  const moreBtn = document.getElementById('search-more');
  const form = document.getElementById('home-search');
  const input = document.getElementById('home-q');
  if (!grid) return;

  // outbound link mirrors the generator's spaLink(): own site, else a Maps search
  const linkFor = (s) => s.website
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name}, ${s.address || s.cityName || 'GA'}`)}`;

  // Highlight token hits in EVERY field that fed the search — name, type, and the
  // location/address line (.card-nbhd). For the name we mark inside its <a> so the
  // outbound link survives (marking .card-name itself would replace the <a>).
  const markEl = (el, re) => {
    if (!el) return;
    const t = el.textContent;
    let out = '', last = 0, m; re.lastIndex = 0;
    while ((m = re.exec(t))) {
      out += esc(t.slice(last, m.index)) + `<mark class="hl">${esc(m[0])}</mark>`;
      last = m.index + m[0].length;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    out += esc(t.slice(last));
    el.innerHTML = out;
  };
  const highlight = (card, re) => {
    if (!re) return;
    markEl(card.querySelector('.card-name a') || card.querySelector('.card-name'), re);
    markEl(card.querySelector('.card-cat'), re);
    markEl(card.querySelector('.card-nbhd'), re);
  };

  let results = [], shown = 0, hlRe = null;
  const renderMore = () => {
    const start = grid.children.length;
    const slice = results.slice(shown, shown + BATCH);
    grid.insertAdjacentHTML('beforeend', slice.map((s) =>
      renderCard({ ...s, tier: 'free' }, { href: linkFor(s), cityName: s.cityName })).join(''));
    // highlight only the cards we just added
    if (hlRe) [...grid.children].slice(start).forEach((c) => highlight(c, hlRe));
    shown += slice.length;
    if (moreWrap) {
      const left = results.length - shown;
      moreWrap.hidden = left <= 0;
      if (moreBtn && left > 0) moreBtn.textContent = `Show more · ${left} more`;
    }
    // let home.js wire distance chips / likes / paint distances on the new cards
    document.dispatchEvent(new CustomEvent('cards:rendered'));
  };

  const update = (raw) => {
    const q = (raw || '').trim();
    // keep the URL shareable without reloading
    const url = q ? `/search/?q=${encodeURIComponent(q)}` : '/search/';
    history.replaceState(null, '', url);

    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    hlRe = tokens.length ? new RegExp(`(${tokens.map(escRe).join('|')})`, 'gi') : null;
    results = !tokens.length ? [] : INDEX.filter((s) => {
      const hay = `${s.name} ${s.cityName || ''} ${s.type || ''} ${s.address || ''} ${s.zip || ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    grid.innerHTML = '';
    shown = 0;
    if (moreWrap) moreWrap.hidden = true;

    if (!q) {
      empty && (empty.hidden = false, document.getElementById('search-empty-h').textContent = 'Search our spa directory',
        document.getElementById('search-empty-p').innerHTML = 'Type a spa name, city, or service above. We list day spas, med spas &amp; massage across Georgia — <a href="/cities/">browse by city</a>.');
      if (meta) meta.hidden = true;
      return;
    }
    if (!results.length) {
      if (empty) {
        empty.hidden = false;
        document.getElementById('search-empty-h').textContent = `No spas match “${q}”`;
        document.getElementById('search-empty-p').innerHTML = `We list day spas, med spas &amp; massage across Georgia — not nail or hair salons. Try a different name or <a href="/cities/">browse by city</a>.`;
      }
      if (meta) meta.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (meta) { meta.hidden = false; meta.textContent = `${results.length} spa${results.length === 1 ? '' : 's'} for “${q}”`; }
    renderMore();
  };

  moreBtn?.addEventListener('click', renderMore);
  // live search as you type (debounced so re-rendering stays smooth)
  let t;
  input?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => update(input.value), 130); });
  // Enter shouldn't reload the page — we're already filtering live
  form?.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(t); update(input?.value || ''); });

  // initial render from ?q
  const q0 = new URLSearchParams(location.search).get('q') || '';
  if (input && !input.value) input.value = q0;
  update(input?.value || q0);
}
