// Client-side touch: fills live open/closed status + countdown from each card's
// embedded hours (data-hours), at view time, and keeps it ticking.
import { status, statusLong, fmtCountdown } from './hours.js';

// generic short pill (free / standard cards) — includes the countdown timer
function paintStatus(el) {
  let week; try { week = JSON.parse(el.dataset.hours); } catch { return; }
  const s = status(week);
  el.className = 'status' + (s ? ` status-${s.state}` : '');
  if (!s) { el.textContent = ''; return; }
  let html = `<span class="dot"></span><span class="status-label">${s.label}</span>`;
  if (s.detail) html += `<span class="status-detail"> · ${s.detail}</span>`;
  if (s.mins != null) html += `<span class="timer">${fmtCountdown(s.mins)}</span>`;
  el.innerHTML = html;
}

// premium top pill — short, no timer (keeps the badge row compact)
function paintOpen(el) {
  let week; try { week = JSON.parse(el.dataset.hours); } catch { return; }
  const s = status(week);
  el.classList.remove('status-open', 'status-closing', 'status-opening', 'status-closed');
  if (!s) { el.textContent = ''; return; }
  el.classList.add(`status-${s.state}`);
  el.innerHTML = `<span class="dot"></span><span class="status-label">${s.label}</span>` +
    (s.detail ? `<span class="status-detail"> · ${s.detail}</span>` : '');
}

// premium body line — "Open today · 9 AM – 7 PM · Closes in 4 hrs"
function paintHours(el) {
  let week; try { week = JSON.parse(el.dataset.hours); } catch { return; }
  const s = statusLong(week);
  el.className = 'pc-hours' + (s ? ` status-${s.state}` : '');
  el.innerHTML = s ? `<span class="dot"></span>${s.text}` : '';
}

function paint(root) {
  root.querySelectorAll?.('.status[data-hours]').forEach(paintStatus);
  root.querySelectorAll?.('.pc-open[data-hours]').forEach(paintOpen);
  root.querySelectorAll?.('.pc-hours[data-hours]').forEach(paintHours);
}
export function paintAll() { paint(document); }

paintAll();
setInterval(paintAll, 30000); // tick the countdowns

// paint cards added later (dynamic app search/filter results)
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches?.('.status[data-hours]')) paintStatus(n);
    if (n.matches?.('.pc-open[data-hours]')) paintOpen(n);
    if (n.matches?.('.pc-hours[data-hours]')) paintHours(n);
    paint(n);
  }
}).observe(document.documentElement, { childList: true, subtree: true });

