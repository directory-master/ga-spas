// GA.Spas cookie-consent banner — pairs with Consent Mode v2 in GA_HEAD.
// GA defaults to DENIED in the EEA/UK/CH until the visitor accepts here (GDPR).
// The choice is stored in localStorage and re-applied on every page load by the
// inline snippet in the <head>, so it persists across the site. Self-contained
// (injects its own styles) so it works on every page regardless of which CSS loads.
(() => {
  const KEY = 'ga-consent';
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (_) {}
  if (saved === 'granted' || saved === 'denied') return; // already decided

  const apply = (granted) => {
    const v = granted ? 'granted' : 'denied';
    try { localStorage.setItem(KEY, v); } catch (_) {}
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v,
      });
    }
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  };

  const st = document.createElement('style');
  st.textContent = `
    .cc-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:400;max-width:760px;margin:0 auto;
      display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;
      background:#2E3A2E;color:#F6F1E9;border:1px solid rgba(246,241,233,.18);border-radius:14px;
      padding:14px 18px;box-shadow:0 16px 40px -12px rgba(0,0,0,.5);
      font:400 13.5px/1.5 'Inter',-apple-system,system-ui,sans-serif}
    .cc-bar p{margin:0;flex:1 1 280px}
    .cc-bar a{color:#E6C892;text-decoration:underline}
    .cc-actions{display:flex;gap:8px;flex:0 0 auto}
    .cc-btn{cursor:pointer;border:0;border-radius:100px;padding:9px 16px;font:600 13px 'Inter',sans-serif}
    .cc-accept{background:#A9663F;color:#fff}
    .cc-accept:hover{background:#8f5333}
    .cc-decline{background:transparent;color:#F6F1E9;border:1px solid rgba(246,241,233,.4)}
    .cc-decline:hover{background:rgba(246,241,233,.1)}
    @media (max-width:520px){.cc-actions{flex:1 1 100%}.cc-btn{flex:1}}`;
  document.head.appendChild(st);

  const bar = document.createElement('div');
  bar.className = 'cc-bar';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Cookie consent');
  bar.innerHTML = `
    <p>We use cookies to measure traffic and improve GA.Spas. You can accept or decline analytics cookies. See our <a href="/privacy/">Privacy Policy</a>.</p>
    <div class="cc-actions">
      <button type="button" class="cc-btn cc-decline">Decline</button>
      <button type="button" class="cc-btn cc-accept">Accept</button>
    </div>`;
  bar.querySelector('.cc-accept').addEventListener('click', () => apply(true));
  bar.querySelector('.cc-decline').addEventListener('click', () => apply(false));

  const mount = () => document.body.appendChild(bar);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
