// GA.Spas analytics — loaded on EVERY page (from GA_HEAD in the generator).
// Page views are tracked automatically by the GA4 gtag config. This module adds
// event tracking for:
//   • every spa "store" interaction — call, website, directions, save, claim, open
//   • every button & link click anywhere on the page (CTAs, nav, footer, pager…)
//   • outbound links (to a spa's own site / Google-Bing maps / booking)
// All events flow to the same GA4 property (G-Y842GGLJVN). One delegated listener,
// so it covers content rendered now and anything added later.
(() => {
  const send = (name, params) => {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (_) {}
  };
  // expose for any inline callers (e.g. the claim modal can log a submit)
  window.gaTrack = send;

  const clean = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim().slice(0, 100));
  const here = () => location.pathname + location.search;

  // Pull clean store identity off the enclosing spa card, if any.
  const storeOf = (el) => {
    const c = el.closest && el.closest('.card');
    if (!c) return null;
    const tier = c.dataset.tier ||
      (c.classList.contains('is-premium') ? 'premium'
        : c.classList.contains('is-standard') ? 'standard'
        : c.classList.contains('is-free') ? 'free'
        : c.classList.contains('claim') ? 'claim' : '');
    const nameEl = c.querySelector('.card-name');
    return {
      spa_id: c.dataset.id || '',
      spa_name: c.dataset.spa || (nameEl ? clean(nameEl.textContent) : ''),
      spa_city: c.dataset.city || '',
      spa_tier: tier,
    };
  };

  // What kind of action did this element represent?
  const actionOf = (a, href) => {
    if (a.matches('[data-claim-spot]')) return 'claim_spot';
    if (a.matches('[data-claim]') || a.classList.contains('card-claim')) return 'claim_listing';
    if (a.classList.contains('like-btn')) return a.classList.contains('on') ? 'unsave_spa' : 'save_spa';
    if (a.classList.contains('card-dist')) return 'directions';
    if (a.classList.contains('card-site') || a.classList.contains('card-btn--demo') && /website/i.test(a.textContent)) return 'visit_website';
    if (href.startsWith('tel:')) return 'call';
    if (href.startsWith('mailto:')) return 'email';
    if (a.classList.contains('btn-near') || a.classList.contains('loc-fab')) return 'near_me';
    if (a.id === 'pwa-install' || a.classList.contains('pwa-fab') || a.classList.contains('nav-install')) return 'install_app';
    if (a.matches('[data-showmore], .show-more, .load-more')) return 'show_more';
    if (a.closest && a.closest('.card-name')) return 'open_listing';
    if (a.classList.contains('card-btn')) return /appointment|book/i.test(a.textContent) ? 'request_appointment' : 'cta';
    if (a.classList.contains('card-example')) return 'example_to_pricing';
    return 'click';
  };

  const isOutbound = (a, href) => {
    if (!/^https?:\/\//i.test(href)) return false;
    try { return new URL(href, location.href).host !== location.host; } catch (_) { return false; }
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a, button');
    if (!a) return;

    const href = a.getAttribute('href') || '';
    const action = actionOf(a, href);
    const store = storeOf(a);
    const label = clean(a.getAttribute('aria-label') || a.textContent || a.title || action);

    const params = {
      action,
      link_text: label,
      link_url: href || undefined,
      outbound: isOutbound(a, href),
      page_path: here(),
    };
    if (store) Object.assign(params, store);

    // A click inside a spa card → a "store" interaction; otherwise a generic UI click.
    send(store ? 'spa_interaction' : 'ui_click', params);
  }, true); // capture phase: fire before navigation/handlers that might stop propagation
})();
