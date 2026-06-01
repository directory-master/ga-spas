// GA Spas home — featured-card interactions + location capture.
import { status, fmtCountdown } from '/js/hours.js';

// Hero background — slow crossfade through the spa photos.
(() => {
  const bg = document.querySelector('[data-hero-bg]');
  if (!bg) return;
  const slides = [...bg.querySelectorAll('.hero-slide')];
  if (slides.length < 2) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  setInterval(() => {
    slides[i].classList.remove('on');
    i = (i + 1) % slides.length;
    slides[i].classList.add('on');
  }, 6000);
})();

// Photo bleed — the card's background image continues the photo window's crop
// downward, so the part the 156px window crops off (square images especially)
// shows behind the text. The window shows the vertical-centre strip (cover), so
// we offset the backdrop up by half the hidden height to line the two up.
const PH_WIN = 156; // must match .card-photo height in css/home.css
const urlIn = (s) => (s.match(/url\(['"]?(.*?)['"]?\)/) || [])[1];
document.querySelectorAll('.card.has-photo').forEach((card) => {
  const first = card.querySelector('.ph-slide');
  let cur = first?.dataset.src || urlIn(card.style.getPropertyValue('--card-img'));
  const apply = () => {
    if (!cur) return;
    const w = card.clientWidth;
    const im = new Image();
    im.onload = () => {
      const dispH = w * (im.naturalHeight / im.naturalWidth); // height at background-size:100% auto
      if (dispH <= PH_WIN + 1) {            // landscape: nothing meaningful below — just cover it
        card.style.backgroundSize = 'cover';
        card.style.backgroundPositionY = 'center';
      } else {
        card.style.backgroundSize = '100% auto';
        card.style.backgroundPositionY = `-${(dispH - PH_WIN) / 2}px`;
      }
    };
    im.src = cur;
  };
  card._setBleed = (src) => { if (!src || src === cur) { apply(); return; } cur = src; card.style.setProperty('--card-img', `url('${src}')`); apply(); };
  apply();
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(card);
});

// Card photo carousels — each rotates on its own timer, pauses on hover.
document.querySelectorAll('.card[data-carousel]').forEach((box, idx) => {
  const slides = [...box.querySelectorAll('.ph-slide')];
  const dots = [...box.querySelectorAll('.ph-dot')];
  if (slides.length < 2) return;
  let i = 0;
  const go = (n) => {
    slides[i].classList.remove('on'); dots[i]?.classList.remove('on');
    i = (n + slides.length) % slides.length;
    slides[i].classList.add('on'); dots[i]?.classList.add('on');
    box._setBleed?.(slides[i].dataset.src); // backdrop follows the current slide
  };
  const period = 3800 + idx * 900 + Math.round(Math.random() * 600);
  let timer = setInterval(() => go(i + 1), period);
  const stop = () => clearInterval(timer);
  const start = () => { stop(); timer = setInterval(() => go(i + 1), period); };
  dots.forEach((d, n) => d.addEventListener('click', () => { go(n); start(); }));
  box.addEventListener('mouseenter', stop);
  box.addEventListener('mouseleave', start);
});

// Live open/closed status on premium cards, computed in the browser so it stays
// accurate: open · closing soon (≤2h) · opening soon (≤2h) · closed.
// demo helper: build a weekly schedule relative to *now* so a card reliably shows
// a given state (open / closing / opening / closed) whenever the page is viewed.
const demoWeek = (state) => {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const clamp = (m) => Math.max(1, Math.min(1438, m));
  let span;
  if (state === 'closing') span = [cur - 150, cur + 55];        // open, closes in <2h
  else if (state === 'opening') span = [cur + 55, cur + 260];   // opens in <2h
  else if (state === 'closed') span = [cur + 200, cur + 400];   // opens in >2h
  else span = [cur - 150, cur + 220];                           // open
  span = [clamp(span[0]), clamp(span[1])];
  if (span[0] >= span[1]) span = [clamp(cur - 150), clamp(cur + 220)];
  return Array(7).fill(span);
};

document.querySelectorAll('.cb-status[data-hours]').forEach((el) => {
  let week;
  try { week = JSON.parse(el.getAttribute('data-hours')); } catch { return; }
  const demo = el.dataset.demoStatus;
  const text = {
    open: (s) => 'Open',
    closing: (s) => `Closing soon · ${fmtCountdown(s.mins)}`,
    opening: (s) => `Opening soon · ${fmtCountdown(s.mins)}`,
    closed: () => 'Closed',
  };
  const callBtn = el.closest('.card')?.querySelector('.card-btn.ghost');
  const paint = () => {
    const s = status(demo ? demoWeek(demo) : week);
    if (!s) { el.hidden = true; return; }
    el.className = `cb cb-status state-${s.state}`;
    el.innerHTML = `<span class="bell">🔔</span>${text[s.state](s)}`;
    el.title = s.detail || '';
    el.hidden = false;
    // open store (open or closing-soon) → green, ringing Call button
    callBtn?.classList.toggle('is-open', s.state === 'open' || s.state === 'closing');
  };
  paint();
  setInterval(paint, 60000); // keep the timer/status fresh
});

// "Show more" reveals the listing grid in batches (not all at once). Each click
// adds another BATCH; the button disappears once everything's visible. Re-applies
// after a sort (listens for the 'recap' event the sort control dispatches).
const SHOW_BATCH = 30;
document.querySelectorAll('[data-show-more]').forEach((btn) => {
  const wrap = btn.closest('.wrap');
  const grid = wrap?.querySelector('.all-grid');
  if (!grid) return;
  grid.classList.remove('capped'); // JS now controls visibility
  let shown = SHOW_BATCH;
  const apply = () => {
    const kids = [...grid.children];
    kids.forEach((c, i) => { c.style.display = i < shown ? '' : 'none'; });
    const left = kids.length - shown;
    if (left <= 0) btn.closest('.show-more-wrap')?.remove();
    else btn.textContent = `Show more · ${left} more`;
  };
  grid.addEventListener('recap', apply);
  btn.addEventListener('click', () => { shown += SHOW_BATCH; apply(); });
  apply();
});

// Sort control for the "all spas" grid — reorders cards in place.
document.querySelectorAll('[data-all-grid]').forEach((grid) => {
  const sel = grid.closest('.wrap')?.querySelector('[data-sort]');
  if (!sel) return;
  const num = (c, k) => parseFloat(c.dataset[k]) || 0;
  const userPt = () => { try { const l = JSON.parse(localStorage.getItem('gaspas:location') || 'null'); if (l && typeof l.lat === 'number') return l; } catch {} return null; };
  const distMi = (c, u) => {
    const la = parseFloat(c.dataset.lat), ln = parseFloat(c.dataset.lng);
    if (!u || Number.isNaN(la) || Number.isNaN(ln)) return Infinity;
    const R = 3958.8, r = (d) => d * Math.PI / 180;
    const dLat = r(la - u.lat), dLng = r(ln - u.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(u.lat)) * Math.cos(r(la)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  sel.addEventListener('change', () => {
    const v = sel.value;
    const u = v === 'distance' ? userPt() : null;
    [...grid.children]
      .sort((a, b) => {
        if (v === 'name') return (a.dataset.name || '').localeCompare(b.dataset.name || '');
        if (v === 'reviews') return num(b, 'reviews') - num(a, 'reviews');
        if (v === 'distance') return distMi(a, u) - distMi(b, u);
        return num(b, 'rating') - num(a, 'rating'); // top rated (default)
      })
      .forEach((c) => grid.appendChild(c));
    grid.dispatchEvent(new Event('recap')); // re-apply the show-more cap to the new order
  });
});

// Likes — heart any spa; persisted in localStorage, shown on /liked/.
const LIKES_KEY = 'gaspas:likes';
const getLikes = () => { try { return JSON.parse(localStorage.getItem(LIKES_KEY) || '[]'); } catch { return []; } };
const setLikes = (a) => { try { localStorage.setItem(LIKES_KEY, JSON.stringify(a)); } catch {} };
const paintLikeCount = () => { const n = getLikes().length; document.querySelectorAll('.like-count').forEach((el) => { el.textContent = n || ''; el.hidden = !n; }); };
const syncLikeButtons = () => { const s = new Set(getLikes()); document.querySelectorAll('.like-btn[data-like]').forEach((b) => b.classList.toggle('liked', s.has(b.dataset.like))); };
document.addEventListener('click', (e) => {
  const b = e.target.closest('.like-btn[data-like]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const likes = getLikes(); const i = likes.indexOf(b.dataset.like);
  if (i >= 0) likes.splice(i, 1); else likes.push(b.dataset.like);
  setLikes(likes);
  b.classList.toggle('liked', i < 0);
  paintLikeCount();
  document.dispatchEvent(new CustomEvent('likeschanged'));
});
syncLikeButtons();
paintLikeCount();

// Demo cards: Call / Request Appointment don't connect (sample data).
document.querySelectorAll('a[data-demo]').forEach((a) => {
  a.addEventListener('click', (e) => e.preventDefault());
});

// Phone ring + flare sweep on each Call button — each on its own timing so no
// two cards animate at the same speed.
document.querySelectorAll('.card-btn.ghost').forEach((btn, idx) => {
  const dur = 2.6 + idx * 0.7 + Math.random() * 0.6;
  const ic = btn.querySelector('.ph-ic');
  if (ic) ic.style.animationDuration = `${dur.toFixed(2)}s`;
  btn.style.setProperty('--flare-dur', `${(dur + 0.5).toFixed(2)}s`);
});

// Twinkling stars: each featured card pops its stars in sequence, on its own
// speed; the first card runs left→right, the others run right→left (opposite).
document.querySelectorAll('.is-premium').forEach((card, i) => {
  const stars = [...card.querySelectorAll('.star')];
  if (!stars.length) return;
  const dur = 2.2 + i * 0.55 + Math.random() * 0.4;   // different speed per card
  const reverse = i > 0;                              // first forward, rest opposite
  const step = 0.18;
  stars.forEach((s, k) => {
    s.style.animationDuration = `${dur.toFixed(2)}s`;
    s.style.animationDelay = `${((reverse ? stars.length - 1 - k : k) * step).toFixed(2)}s`;
  });
});

// Equalize descriptions per row: trim a card only if its neighbour in the same
// row is shorter, then add "Read more" → the full text stays in the DOM (data-full).
const escapeHtml = (s) => { const e = document.createElement('div'); e.textContent = s; return e.innerHTML; };

function equalizeDescriptions() {
  document.querySelectorAll('.feat-grid').forEach((grid) => {
    const descs = [...grid.querySelectorAll('.card-desc')];
    descs.forEach((d) => {
      if (!d.dataset.full) d.dataset.full = d.textContent;
      d.innerHTML = escapeHtml(d.dataset.full);   // reset to full before measuring
    });
    // group by visual row (cards that share a top offset)
    const rows = new Map();
    descs.forEach((d) => {
      const top = d.closest('.card').offsetTop;
      (rows.get(top) || rows.set(top, []).get(top)).push(d);
    });
    rows.forEach((group) => {
      if (group.length < 2) return;
      const lineH = (d) => parseFloat(getComputedStyle(d).lineHeight) || 21;
      const lineCount = (d) => Math.round(d.scrollHeight / lineH(d));
      const target = Math.min(...group.map(lineCount));
      group.forEach((d) => {
        if (lineCount(d) <= target) return;               // already fits — leave it full
        const full = d.dataset.full;
        const href = d.dataset.href || '#';
        const tail = (txt) => `${escapeHtml(txt.replace(/\s+\S*$/, '').trim())}… <a class="read-more" href="${href}">Read more</a>`;
        let lo = 8, hi = full.length, best = full.slice(0, 40);   // longest fit, word-boundary
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          d.innerHTML = tail(full.slice(0, mid));
          if (lineCount(d) <= target) { best = full.slice(0, mid); lo = mid + 1; }
          else hi = mid - 1;
        }
        d.innerHTML = tail(best);
      });
    });
  });
}

equalizeDescriptions();
document.fonts?.ready.then(equalizeDescriptions);   // re-run once the web font loads
let reflow;
window.addEventListener('resize', () => { clearTimeout(reflow); reflow = setTimeout(equalizeDescriptions, 150); });


// 0) Location: capture the user's area (typed or GPS), persist it, and show how
// far each featured/standard/premium spa is — staying on the page (no redirect).
(() => {
  const LOC_KEY = 'gaspas:location';
  const form = document.getElementById('home-search');
  const input = document.getElementById('home-q');
  const note = document.getElementById('home-loc-note');
  let ZIPS = {};
  try { ZIPS = JSON.parse(document.getElementById('zip-centroids')?.textContent || '{}'); } catch {}

  // The note is now ONLY momentary feedback (it self-clears); the persistent
  // "location is on" state lives on the Near-me button itself (see syncLoc).
  let noteTimer;
  const show = (msg) => {
    if (!note) return;
    note.textContent = msg; note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note.hidden = true; }, 4500);
  };
  const loadLoc = () => { try { return JSON.parse(localStorage.getItem(LOC_KEY) || 'null'); } catch { return null; } };

  // Single location control: a fixed FAB pinned to the bottom-right corner (where
  // a back-to-top button usually lives). Outline pin = off; filled green +
  // "Location on" = on. Tapping toggles locate ↔ clear. The PWA install FAB
  // (js/pwa.js) stacks just above it in the same corner.
  const PIN_OUTLINE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>';
  const PIN_FILLED  = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>';
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'loc-fab';
  document.body.appendChild(fab);
  const syncLoc = () => {
    const on = !!userPoint();
    fab.classList.toggle('on', on);
    fab.setAttribute('aria-pressed', on ? 'true' : 'false');
    fab.title = on ? 'Location on — distances shown · tap to clear' : 'Use my location';
    fab.setAttribute('aria-label', on ? 'Location on — tap to clear' : 'Use my location');
    fab.innerHTML = `${on ? PIN_FILLED : PIN_OUTLINE}<span class="loc-fab-label">${on ? 'Location on' : 'Use my location'}</span>`;
  };
  fab.addEventListener('click', () => {
    if (userPoint()) {                 // on → clear
      try { localStorage.removeItem(LOC_KEY); } catch {}
      paintDistances();
      syncLoc();
      show('Location cleared.');
    } else {                           // off → start continuous tracking
      watchGPS(() => show('📍 Tracking you — nearest spas first. Distances update as you move.'));
    }
  });

  const save = (loc) => {
    try { localStorage.setItem(LOC_KEY, JSON.stringify({ ...loc, ts: Date.now() })); } catch {}
    paintDistances();
    syncLoc();
  };

  // resolve the saved location to coordinates (GPS coords or a known ZIP centroid)
  function userPoint() {
    const loc = loadLoc();
    if (!loc) return null;
    if (typeof loc.lat === 'number' && typeof loc.lng === 'number') return loc;
    const zip = loc.query && loc.query.match(/\b\d{5}\b/);
    if (zip && ZIPS[zip[0]]) return { ...ZIPS[zip[0]] };
    return null;
  }

  const miles = (a, b) => {
    const R = 3958.8, rad = (d) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // "opens in new tab" (external-link) icon — signals the Maps link opens a new tab
  const EXT_ICON = '<svg class="ext-ic" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';

  // paint the "Get distance" / "X mi ↗" chip on every card with coords
  function paintDistances() {
    const u = userPoint();
    document.querySelectorAll('.card-dist').forEach((el) => {
      const lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) { el.hidden = true; return; }
      el.hidden = false;
      if (u) {
        const d = miles(u, { lat, lng });
        el.innerHTML = `<span class="pin">📍</span>${d < 10 ? d.toFixed(1) : Math.round(d)} mi ${EXT_ICON}`;
        el.classList.add('has-dist');
        el.title = 'Directions in Google Maps (opens new tab)';
        el.setAttribute('aria-label', `Directions, opens Google Maps in a new tab — ${d < 10 ? d.toFixed(1) : Math.round(d)} miles away`);
      } else {
        el.innerHTML = `<span class="pin">📍</span>Get distance`;
        el.classList.remove('has-dist');
        el.removeAttribute('title');
      }
    });
  }

  // open Google Maps directions to a spa (origin = the user's saved point if known)
  function openDirections(el) {
    const dest = `${el.dataset.lat},${el.dataset.lng}`;
    const u = userPoint();
    const origin = u ? `&origin=${u.lat},${u.lng}` : '';
    window.open(`https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}`, '_blank', 'noopener');
  }

  function requestGPS(onOk) {
    if (!navigator.geolocation) { show('Geolocation isn’t available here — type a city or ZIP instead.'); return; }
    show('📍 Locating you…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { save({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), label: 'your location' }); onOk?.(); },
      () => show('Couldn’t get your location. You can type a city or ZIP instead.'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  }

  // re-order every "all spas" grid nearest-first (reuses the sort control's logic)
  function sortNearest() {
    document.querySelectorAll('[data-all-grid]').forEach((grid) => {
      const sel = grid.closest('.wrap')?.querySelector('[data-sort]');
      if (sel) { sel.value = 'distance'; sel.dispatchEvent(new Event('change')); }
    });
  }

  // CONTINUOUS "near me": keep watching as the user moves — every position update
  // repaints distances (save → paintDistances) and re-sorts the list nearest-first.
  let geoWatch = null;
  function watchGPS(onFirst) {
    if (!navigator.geolocation) { show('Geolocation isn’t available here — type a city or ZIP instead.'); return; }
    show('📍 Locating you…');
    if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch);
    let first = true;
    geoWatch = navigator.geolocation.watchPosition(
      (pos) => {
        save({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), label: 'your location' });
        sortNearest();
        if (first) { first = false; onFirst?.(); }
      },
      () => show('Couldn’t get your location. You can type a city or ZIP instead.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  }

  // restore a previously saved location + paint distances + reflect it on the button
  const saved = loadLoc();
  if (saved && saved.query && input) input.value = saved.query;
  paintDistances();
  syncLoc();

  // typed city / ZIP / neighborhood — save, don't navigate
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (input?.value || '').trim();
    if (!q) { show('Type a city, neighborhood, or ZIP — or use the location button.'); return; }
    save({ query: q, label: q });
    const known = userPoint();
    show(known ? `📍 Showing distances from ${q}.` : `📍 Saved “${q}”. (Tap a card’s “Get distance” or the location button for exact miles.)`);
  });

  // card chip: located → open Google Maps directions; not yet → ask for GPS.
  // each external-link icon nudges on its own random speed.
  document.querySelectorAll('.card-dist').forEach((el) => {
    el.style.setProperty('--ext-dur', `${(2.1 + Math.random() * 2.4).toFixed(2)}s`);
    el.addEventListener('click', () => {
      if (el.classList.contains('has-dist')) openDirections(el);
      else requestGPS();
    });
  });

  // The hero "Near me" button is the single location control — it shows the
  // on/off state (green "Location on") and toggles locate/clear. No floating
  // corner FAB, so there's only one location button on the page.
})();


// 1) Perks carousels rotate, but each at its OWN speed so cards never flip in unison.
document.querySelectorAll('[data-perks]').forEach((box, idx) => {
  const perks = [...box.querySelectorAll('.perk')];
  const dots = [...box.querySelectorAll('.perk-dot')];
  if (perks.length < 2) return;

  const period = 3600 + idx * 1500 + Math.round(Math.random() * 600); // staggered, slightly random
  let i = 0;
  const show = (n) => {
    perks[i].classList.remove('active');
    dots[i]?.classList.remove('on');
    i = n;
    perks[i].classList.add('active');
    dots[i]?.classList.add('on');
  };

  let timer = setInterval(() => show((i + 1) % perks.length), period);
  dots.forEach((d, n) => d.addEventListener('click', () => {
    show(n);
    clearInterval(timer);
    timer = setInterval(() => show((i + 1) % perks.length), period);
  }));
});

// 2) Tag rows that overflow get an animated arrow hinting they can be scrolled.
document.querySelectorAll('.card-tags-wrap').forEach((wrap, idx) => {
  const row = wrap.querySelector('.card-tags');
  const arrow = wrap.querySelector('.tags-arrow');
  // stagger each card's arrow so they don't nudge in unison
  if (arrow) arrow.style.animationDuration = `${1.0 + idx * 0.5 + Math.random() * 0.3}s`;
  const update = () => {
    const scrollable = row.scrollWidth > row.clientWidth + 4;
    const atEnd = row.scrollWidth - row.clientWidth - row.scrollLeft < 6;
    wrap.classList.toggle('scrollable', scrollable);
    wrap.classList.toggle('at-end', atEnd);
  };
  update();
  row.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
});

// ---- "Own this spa?" claim modal --------------------------------------------
// Clicking a card's "Own this spa? Add your prices & deals" opens a form where
// the owner fills in their Standard details (and, further down, Premium extras).
// Pressing "Send" composes everything into a plain-text body and opens their mail
// client pre-filled — exactly like the old mailto, just with the text already in.
(() => {
  const CLAIM_EMAIL = 'artivicolab@gmail.com';
  const AMENITIES = ['Free parking', 'Couples room', 'Walk-ins welcome', 'Gift cards'];
  let modal = null, nameEl = null, currentName = '', currentCity = '';

  const field = (label, html, hint) =>
    `<label class="cm-field"><span class="cm-label">${label}</span>${html}${hint ? `<span class="cm-hint">${hint}</span>` : ''}</label>`;

  function build() {
    modal = document.createElement('div');
    modal.className = 'claim-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="cm-backdrop" data-cm-close></div>
      <div class="cm-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-title">
        <button class="cm-x" type="button" data-cm-close aria-label="Close">✕</button>
        <div class="cm-head">
          <div class="cm-eyebrow">Claim your listing</div>
          <h2 class="cm-title serif" id="cm-title">Add your details</h2>
          <p class="cm-sub">Fill in what you'd like shown. Press <strong>Send</strong> and it lands in your email ready to go — we'll set it live.</p>
        </div>
        <form class="cm-form" id="cm-form">
          <div class="cm-plan">
            <label><input type="radio" name="plan" value="Standard — $49/mo" data-plan="standard" checked> Standard · $49/mo</label>
            <label><input type="radio" name="plan" value="Premium — $149/mo" data-plan="premium"> Premium · $149/mo</label>
          </div>

          <div class="cm-sec-h">Your contact</div>
          ${field('Your name', '<input name="owner" type="text" autocomplete="name">')}
          ${field('Best email or phone', '<input name="contact" type="text" autocomplete="email">')}
          <label class="cm-inline"><input type="checkbox" name="blackowned" value="Yes"> Black-owned business <span class="cm-hint">— badge is free; email us from your business address to verify</span></label>

          <div class="cm-sec-h">Standard details</div>
          ${field('Short description', '<textarea name="desc" rows="2" placeholder="Two sentences about your spa."></textarea>')}
          ${field('Services', '<input name="services" type="text" placeholder="Swedish massage, facials, body wraps…">', 'Up to 5, comma-separated')}
          ${field('Amenities', '<div class="cm-checks">' + AMENITIES.map((a, i) => `<label><input type="checkbox" name="amenity" value="${a}"> ${a}</label>`).join('') + '</div>')}
          <div class="cm-row">
            ${field('Price range', '<select name="price"><option value="">—</option><option>$</option><option>$$</option><option>$$$</option><option>$$$$</option></select>')}
            ${field('Hours', '<input name="hours" type="text" placeholder="Mon–Sat 9–7">')}
          </div>
          ${field('Website', '<input name="website" type="url" placeholder="https://">')}
          ${field('Photo link', '<input name="photo" type="url" placeholder="Link to one photo">', 'We can also take it from your site/socials')}

          <details class="cm-premium">
            <summary>Premium add-ons <span>(optional · $149/mo)</span></summary>
            ${field('Full description', '<textarea name="fulldesc" rows="3" placeholder="4–5 sentences, the full story."></textarea>')}
            ${field('Current offer / promo', '<input name="offer" type="text" placeholder="$30 off first visit">')}
            ${field('Booking / appointment link', '<input name="booking" type="url" placeholder="https://">')}
            ${field('More photos', '<textarea name="photos" rows="2" placeholder="Up to 6 links, one per line"></textarea>')}
          </details>

          <button class="cm-send" type="submit">Send →</button>
          <p class="cm-foot">Opens your email with everything filled in. Nothing is sent until you hit send there.</p>
        </form>
      </div>`;
    document.body.appendChild(modal);
    nameEl = modal.querySelector('#cm-title');
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-cm-close]')) close(); });
    modal.querySelector('#cm-form').addEventListener('submit', submit);
  }

  const open = (name, city, tier) => {
    if (!modal) build();
    currentName = name || ''; currentCity = city || '';
    nameEl.textContent = name ? `List ${name}` : (city ? `Claim a spot in ${city}` : 'Add your details');
    // preselect the plan when claiming a specific (premium/standard) spot
    if (tier) { const r = modal.querySelector(`input[name="plan"][data-plan="${tier}"]`); if (r) r.checked = true; }
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('input[name="owner"]')?.focus();
  };
  const close = () => { if (modal) { modal.hidden = true; document.body.style.overflow = ''; } };

  function submit(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const v = (k) => (f.get(k) || '').toString().trim();
    const amenities = f.getAll('amenity').join(', ');
    const L = [];
    L.push(`Spa: ${currentName || '(owner to provide)'}${currentCity ? ` — claiming a spot in ${currentCity}` : ''}`);
    L.push(`Plan requested: ${v('plan')}`);
    L.push('');
    L.push('— CONTACT —');
    L.push(`Owner: ${v('owner') || '(not given)'}`);
    L.push(`Reach me: ${v('contact') || '(not given)'}`);
    L.push(`Black-owned (free badge): ${v('blackowned') || 'No'}`);
    L.push('');
    L.push('— STANDARD DETAILS —');
    L.push(`Description: ${v('desc')}`);
    L.push(`Services: ${v('services')}`);
    L.push(`Amenities: ${amenities}`);
    L.push(`Price range: ${v('price')}`);
    L.push(`Hours: ${v('hours')}`);
    L.push(`Website: ${v('website')}`);
    L.push(`Photo: ${v('photo')}`);
    if (v('fulldesc') || v('offer') || v('booking') || v('photos')) {
      L.push('');
      L.push('— PREMIUM ADD-ONS —');
      L.push(`Full description: ${v('fulldesc')}`);
      L.push(`Offer: ${v('offer')}`);
      L.push(`Booking link: ${v('booking')}`);
      L.push(`More photos: ${v('photos').replace(/\s*\n\s*/g, ' | ')}`);
    }
    const subject = `GASpas listing: ${currentName}`;
    window.location.href = `mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(L.join('\n'))}`;
    close();
  }

  // intercept claim CTAs (links keep their href as a no-JS fallback):
  //  • [data-claim-spot]  = a "Claim this spot" card → opens marked with the city
  //    and the tier (premium/standard) preselected
  //  • [data-claim]       = a free card's "Own this spa?" → opens with the spa name
  document.addEventListener('click', (e) => {
    const spot = e.target.closest('[data-claim-spot]');
    if (spot) {
      e.preventDefault();
      open('', spot.getAttribute('data-claim-city'), spot.getAttribute('data-claim-tier'));
      return;
    }
    const a = e.target.closest('[data-claim]');
    if (!a) return;
    e.preventDefault();
    open(a.getAttribute('data-claim'), a.getAttribute('data-claim-city'));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();
// PWA install + app-feel now lives in the shared, reusable js/pwa.js (loaded on
// every page via PWA_HEAD).

// ---- protect the listing data from casual copy / scrape ----------------------
// CSS already disables selection on cards; this blocks right-click (context menu
// → "Copy"/"Save image") and the copy/cut events when the selection sits inside
// a listing. Form fields (search box, claim-modal inputs) stay fully usable.
(() => {
  const LIST = '.card, [data-all-grid], .feat-grid, .cities-grid, .city-list';
  const FIELD = 'input, textarea, select, [contenteditable=""], [contenteditable=true]';
  const inList = (el) => el && el.closest && el.closest(LIST);
  const inField = (el) => el && el.closest && el.closest(FIELD);

  document.addEventListener('contextmenu', (e) => {
    if (inField(e.target)) return;
    if (inList(e.target) || e.target.closest('.card-photo, img')) e.preventDefault();
  });

  const blockIfListSelection = (e) => {
    const sel = document.getSelection && document.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node = sel.anchorNode;
    if (node && node.nodeType !== 1) node = node.parentElement;
    if (node && node.closest && node.closest(LIST) && !inField(node)) {
      e.preventDefault();
    }
  };
  document.addEventListener('copy', blockIfListSelection);
  document.addEventListener('cut', blockIfListSelection);
  document.addEventListener('dragstart', (e) => { if (inList(e.target) || e.target.tagName === 'IMG') e.preventDefault(); });
})();
