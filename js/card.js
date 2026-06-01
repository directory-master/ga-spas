// Shared spa card renderer — ONE source of truth for free / standard / premium
// cards. Imported by the static generator at BUILD time (emits static HTML, so
// crawlers get real content) and safe to reuse in the browser if ever needed.
//
// renderCard(spa, opts) where opts = { href, cityName, photoClass, demoStatus }.
// Tier comes from spa.tier ('premium' | 'standard' | 'free').

const esc = (s) => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderCard(spa, opts = {}) {
  const tier = spa.tier === 'premium' ? 'premium' : spa.tier === 'standard' ? 'standard' : 'free';
  const premium = tier === 'premium';
  const standard = tier === 'standard';
  // example/preview card: a curated demo seed showing an owner what they'd get.
  // Looks complete, but must never read as a real, callable business.
  const example = spa.example === true;
  const href = opts.href || '#';
  const cityName = opts.cityName || spa.cityName || spa.city || '';
  const photoClass = opts.photoClass || '';
  const demoStatus = opts.demoStatus;

  // location line: full street address when we have it, else City, State ZIP · price
  const cityState = cityName ? `${cityName}, GA${spa.zip ? ' ' + spa.zip : ''}` : (spa.zip ? `GA ${spa.zip}` : '');
  const loc = spa.address || cityState;
  const nbhd = esc(loc || '');
  // price — "From $X" from the menu, else the $-tier (the paid layer). PAID-only:
  // free is the "ghost listing" — no price shown.
  const minPrice = (spa.menu || []).map(m => parseInt(String(m.price).replace(/[^\d]/g, ''), 10)).filter(Boolean).sort((a, b) => a - b)[0];
  const priceLine = (premium || standard)
    ? (minPrice ? `<span class="card-price">From $${minPrice}</span>` : (spa.price ? `<span class="card-price">${esc(spa.price)}</span>` : ''))
    : '';

  // ---- photo: tier-gated. FREE = none (the ghost listing), STANDARD = 1 image,
  // PREMIUM = up to 6 (gallery). Nothing gets more than its tier earns. ----
  const allImgs = (spa.images && spa.images.length) ? spa.images : (spa.image ? [spa.image] : []);
  const imgs = premium ? allImgs.slice(0, 6) : standard ? allImgs.slice(0, 1) : [];
  const slidesHtml = imgs.map((src, i) =>
    `<div class="ph-slide${i === 0 ? ' on' : ''}" data-src="${esc(src)}" style="background-image:linear-gradient(135deg,rgba(110,126,97,.20),rgba(46,58,46,.32)),url('${esc(src)}')"></div>`).join('');
  const dotsHtml = imgs.length > 1
    ? `<div class="ph-dots">${imgs.map((_, i) => `<span class="ph-dot${i === 0 ? ' on' : ''}"></span>`).join('')}</div>` : '';
  const cardBg = imgs.length ? ` style="--card-img:url('${esc(imgs[0])}')"` : '';

  const boRibbon = spa.blackOwned ? '<div class="bo-ribbon"><span>✦ Black-Owned</span></div>' : '';
  // open/closed status: STANDARD + PREMIUM (free shows no hours)
  const statusBadge = ((premium || standard) && spa.hours)
    ? `<span class="cb cb-status" data-hours='${JSON.stringify(spa.hours)}'${demoStatus ? ` data-demo-status="${demoStatus}"` : ''} hidden></span>` : '';
  // distance-from-you chip: ALL tiers (free shows it inline in the foot since it
  // has no photo to overlay it on)
  const distBtn = (spa.lat && spa.lng)
    ? `<button class="card-dist" type="button" data-lat="${spa.lat}" data-lng="${spa.lng}" hidden></button>` : '';

  const likeKey = spa.id || href;
  const likeBtn = `<button class="like-btn" type="button" data-like="${esc(likeKey)}" aria-label="Save to your liked spas" title="Save to liked"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>`;
  const photo = `<div class="card-photo ${photoClass}">
          <div class="ph-track">${slidesHtml}</div>
          ${boRibbon}
          ${statusBadge}
          ${likeBtn}
          ${distBtn}
          ${dotsHtml}
        </div>`;

  const ratingBit = spa.rating
    ? `<span class="stars">${Array.from({ length: 5 }, (_, k) => `<span class="star${k < Math.round(spa.rating) ? '' : ' off'}">★</span>`).join('')}</span> <span class="rate-num">${spa.rating.toFixed(1)}</span> · ${spa.reviews || 0} reviews`
    : '';
  const ratingMeta = (ratingBit || priceLine)
    ? `<div class="card-meta">${ratingBit}${ratingBit && priceLine ? ' · ' : ''}${priceLine}</div>`
    : '<div class="card-meta card-meta--new">New · no reviews yet</div>';

  // example cards don't link the name out (it's not a real business). The spa name
  // is an <h3> for SEO heading structure (section titles are already <h2>).
  const nameHtml = example ? esc(spa.name)
    : `<a href="${href}" target="_blank" rel="noopener nofollow">${esc(spa.name)}</a>`;
  const head = `<div class="card-cat">${esc(spa.type)}</div>
          <h3 class="card-name">${nameHtml}</h3>
          ${ratingMeta}
          <div class="card-nbhd">${nbhd}</div>`;

  // stable id per store + sortable data (rating / reviews / name / distance).
  // data-spa/-city/-tier feed analytics (js/analytics.js) with clean store identity.
  const dataAttrs = ` data-id="${esc(spa.id || '')}" data-spa="${esc(spa.name || '')}" data-city="${esc(cityName || '')}" data-tier="${tier}" data-rating="${spa.rating || 0}" data-reviews="${spa.reviews || 0}" data-name="${esc((spa.name || '').toLowerCase())}"${spa.lat ? ` data-lat="${spa.lat}"` : ''}${spa.lng ? ` data-lng="${spa.lng}"` : ''}`;

  // Every card is packed: Call is the on-card action. Directions live on the
  // photo's distance chip (.card-dist) once a location is saved — no separate
  // Directions button (it would duplicate that).
  const telHref = spa.phone ? `tel:${String(spa.phone).replace(/[^\d+]/g, '')}` : '';
  const callBtn = telHref ? `<a class="card-btn ${premium ? 'ghost' : 'solid'} card-btn-wide" href="${telHref}"><span class="ph-ic">📞</span> Call</a>` : '';
  const actions = callBtn ? `<div class="card-actions">${callBtn}</div>` : '';
  // website link: STANDARD + PREMIUM only (free is contact-by-phone only)
  const siteBtn = ((premium || standard) && spa.website)
    ? `<a class="card-btn ghost card-site" href="${esc(spa.website)}" target="_blank" rel="noopener nofollow">Website ↗</a>` : '';

  // ---------- FREE: the "ghost listing" — name, category, location, rating, Call.
  // NO photo, NO hours, NO services, NO description, NO distance. Plus the claim
  // upsell (unless noClaim). Like button kept (a user feature, not a tier perk). --
  if (tier === 'free') {
    const claim = `mailto:artivicolab@gmail.com?subject=${encodeURIComponent('GASpas Claiming Listing: ' + spa.name)}`;
    const claimHtml = opts.noClaim ? '' : `\n            <a class="card-claim" href="${claim}" data-claim="${esc(spa.name)}" data-claim-city="${esc(cityName || '')}">💲 Own this spa? Add your prices &amp; deals →</a>`;
    const boPill = spa.blackOwned ? '<span class="bo-pill">✦ Black-Owned</span>' : '';
    return `<article class="card is-free"${dataAttrs}>
        <div class="card-pad">
          ${likeBtn}
          ${boPill}
          ${head}
          <div class="card-foot">
            ${distBtn}
            ${actions}${claimHtml}
          </div>
        </div>
      </article>`;
  }

  // ---------- STANDARD / PREMIUM ----------
  // services: STANDARD up to 5 tags, PREMIUM unlimited
  const menuTags = premium ? (spa.menu || []) : (spa.menu || []).slice(0, 5);
  const amenTags = premium ? (spa.amenities || []) : (spa.amenities || []).slice(0, 4);
  const tags = (spa.blackOwned ? '<span class="tag bo">✦ Black-Owned</span>' : '')
    + menuTags.map(m => `<span class="tag">${esc(m.service)}</span>`).join('')
    + amenTags.map(a => `<span class="tag">${esc(a)}</span>`).join('');

  const descHtml = spa.description
    ? `<div class="card-desc" data-href="${href}">${esc(spa.description)}</div>` : '';

  // perks carousel = PREMIUM only; standard shows a single static offer
  const perks = (spa.perks && spa.perks.length) ? spa.perks : (spa.offer ? [spa.offer] : []);
  const perksHtml = premium && perks.length
    ? `<div class="card-perks" data-perks>${perks.map((p, i) => `<div class="perk${i === 0 ? ' active' : ''}">${esc(p)}</div>`).join('')}${perks.length > 1 ? `<div class="perk-dots">${perks.map((_, i) => `<span class="perk-dot${i === 0 ? ' on' : ''}"></span>`).join('')}</div>` : ''}</div>`
    : '';

  const exAnchor = premium ? '/pricing/#premium' : '/pricing/#standard';
  let buttons;
  if (example) {
    // EXAMPLE: grayed CTAs that route to /pricing/ — a broken tap becomes a pitch.
    const tip = 'This button goes live when you claim your listing — customers tap here and reach you directly.';
    const ra = premium
      ? `<a class="card-btn solid card-btn-wide card-btn--demo" href="${exAnchor}" title="${tip}">Request Appointment →</a>` : '';
    const callD = `<a class="card-btn ${premium ? 'ghost' : 'solid'} card-btn--demo" href="${exAnchor}" title="${tip}"><span class="ph-ic">📞</span> Call</a>`;
    const siteD = spa.website ? `<a class="card-btn ghost card-site card-btn--demo" href="${exAnchor}" title="${tip}">Website ↗</a>` : '';
    buttons = `<div class="card-foot">
            ${ra}
            <div class="card-actions">${callD}${siteD}</div>
          </div>`;
  } else {
    // PREMIUM leads with Request Appointment; STANDARD + PREMIUM show Call + Website
    // side-by-side (Call not full-width when it shares the row with the site link).
    const callNarrow = telHref
      ? `<a class="card-btn ${premium ? 'ghost' : 'solid'}${siteBtn ? '' : ' card-btn-wide'}" href="${telHref}"><span class="ph-ic">📞</span> Call</a>` : '';
    const callSite = (callNarrow || siteBtn)
      ? `<div class="card-actions">${callNarrow}${siteBtn}</div>` : '';
    buttons = `<div class="card-foot">
            ${(premium && spa.bookingUrl) ? `<a class="card-btn solid card-btn-wide" data-demo href="#" title="Sample — your booking link goes here">Request Appointment →</a>` : ''}
            ${callSite}
          </div>`;
  }

  // slim sand banner pinned to the top of an example card — unmistakably a preview
  const exampleBanner = example
    ? `<a class="card-example" href="${exAnchor}">✦ ${premium ? 'Premium' : 'Standard'} listing preview — claim this spot · ${premium ? '$149' : '$49'}/mo →</a>` : '';

  return `<article class="card is-${tier}${example ? ' is-example' : ''}${imgs.length ? ' has-photo' : ''}"${imgs.length > 1 ? ' data-carousel' : ''}${cardBg}${dataAttrs}>
        ${exampleBanner}
        ${photo}
        <div class="card-pad">
          ${head}
          ${descHtml}
          ${perksHtml}
          ${tags ? `<div class="card-tags-wrap"><div class="card-tags">${tags}</div><span class="tags-arrow" aria-hidden="true">»</span></div>` : ''}
          ${buttons}
        </div>
      </article>`;
}
