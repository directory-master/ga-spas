// GA.Spas PWA — reusable on EVERY page. Loaded from the shared <head> (PWA_HEAD
// in scripts/generate-pages.mjs), so home, city, category, pricing, blog and
// roadmap pages all get it. It:
//   1. registers the service worker (makes the site installable + offline-tolerant)
//   2. adds a floating "Install app" button fixed to the bottom-right corner
//      (stacked just above the location FAB on pages that have one)
//   3. gives the site a native-app feel on mobile (safe-area insets for the
//      notch, sticky chrome + no rubber-band overscroll when installed, no tap
//      highlight). The point: forget the URL? The icon's on your home screen.
(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // self-contained styles so this works regardless of which CSS the page loads
  const st = document.createElement('style');
  st.textContent = `
    body{-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%}
    /* thin terracotta frame across the very top of every page */
    body::before{content:"";position:fixed;top:0;left:0;right:0;height:3px;background:#A9663F;z-index:300}
    @media (display-mode:standalone){body::before{display:none}}
    /* floating "Install app" button — fixed bottom-right, like a back-to-top FAB */
    .pwa-fab{position:fixed;right:18px;bottom:18px;z-index:60;display:inline-flex;align-items:center;gap:8px;
      font:600 13px/1 'Inter',-apple-system,sans-serif;color:#fff;background:#A9663F;border:0;border-radius:100px;
      padding:12px 18px;cursor:pointer;box-shadow:0 10px 26px -8px rgba(0,0,0,.45);transition:transform .2s ease,background .2s}
    .pwa-fab:hover{transform:translateY(-2px);background:#8f5333}
    .pwa-fab svg{width:16px;height:16px;flex-shrink:0}
    .pwa-fab.stacked{bottom:72px}  /* sits above the location FAB when one is present */
    .pwa-tip{position:fixed;right:18px;bottom:122px;z-index:60;max-width:280px;margin:0;cursor:pointer;
      font:400 13px/1.45 'Inter',-apple-system,sans-serif;color:#4A573F;
      background:rgba(255,253,249,.96);border:1px solid rgba(46,58,46,.12);border-radius:12px;padding:10px 14px;
      box-shadow:0 12px 30px -10px rgba(0,0,0,.35)}
    @media (max-width:600px){
      .pwa-fab{right:12px;padding:12px}
      .pwa-fab.stacked{bottom:64px}
      .pwa-fab-label{display:none}
      .pwa-tip{right:12px;left:12px;max-width:none;bottom:112px}
    }
    @media (display-mode:standalone){
      nav,.site-header{position:sticky;top:0;z-index:50;
        padding-top:max(14px,env(safe-area-inset-top))}
      footer,.site-footer{padding-bottom:max(22px,env(safe-area-inset-bottom))}
      body{overscroll-behavior-y:none}
      a,button{ -webkit-touch-callout:none }
    }`;
  document.head.appendChild(st);

  if (standalone) return; // already installed → no install button needed

  // Floating "Install app" button in the bottom-right corner (it carries
  // id="pwa-install" so anything else can find it). Created here — not in the
  // page markup — so it works on every page and is wired regardless of script
  // order. It stacks just above the location FAB if the page has one.
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'pwa-install';
  btn.className = 'pwa-fab';
  btn.setAttribute('aria-label', 'Install the GA.Spas app');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg><span class="pwa-fab-label">Install app</span>';
  document.body.appendChild(btn);

  // raise it above the location FAB once that one exists (created by js/home.js)
  const stackAboveLoc = () => { if (document.querySelector('.loc-fab')) btn.classList.add('stacked'); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stackAboveLoc);
  else stackAboveLoc();
  window.addEventListener('load', stackAboveLoc);

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { btn.style.display = 'none'; });

  const tip = (msg) => {
    let n = document.getElementById('pwa-tip');
    if (!n) {
      n = document.createElement('p');
      n.id = 'pwa-tip'; n.className = 'pwa-tip';
      n.addEventListener('click', () => { n.hidden = true; }); // tap to clear
      document.body.appendChild(n);
    }
    n.textContent = '📲 ' + msg + '  ·  (tap to dismiss)'; n.hidden = false;
  };

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch {}
      deferred = null;
      return;
    }
    tip(isIOS
      ? 'Tap the Share button, then “Add to Home Screen” to keep GA.Spas one tap away.'
      : 'Open your browser menu, then choose “Install app” / “Add to Home Screen”.');
  });
})();
