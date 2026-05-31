// Open/closed status from a weekly schedule.
// `week` = array[7] indexed Sun..Sat; each entry is [openMin, closeMin] in
// minutes from midnight, or null when closed that day.
// Returns { state, label, detail } where state ∈ open|closing|opening|closed.

const SOON = 120; // minutes window for "closing soon" / "opening soon" (2 hours)
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function fmtTime(min) {
  let h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
}

// Minutes → countdown like "1h 23m" or "45m".
export function fmtCountdown(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// "4 hrs", "1 hr 20 min", "45 min"
function fmtUntil(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h >= 2) return `${h} hrs`;
  if (h === 1) return m ? `1 hr ${m} min` : '1 hr';
  return `${m} min`;
}

// Long-form line for the premium card: "Open today · 9 AM – 7 PM · Closes in 4 hrs".
export function statusLong(week, now = new Date()) {
  const s = status(week, now);
  if (!s) return null;
  const today = week[now.getDay()];
  const cur = now.getHours() * 60 + now.getMinutes();
  if ((s.state === 'open' || s.state === 'closing') && today) {
    return { state: s.state, text: `Open today · ${fmtTime(today[0])} – ${fmtTime(today[1])} · Closes in ${fmtUntil(today[1] - cur)}` };
  }
  if (s.state === 'opening' && today) {
    return { state: 'opening', text: `Opens in ${fmtUntil(today[0] - cur)} · at ${fmtTime(today[0])}` };
  }
  return { state: 'closed', text: s.detail ? `Closed · ${s.detail}` : 'Closed' };
}

export function status(week, now = new Date()) {
  if (!Array.isArray(week) || week.length !== 7) return null;
  const day = now.getDay();
  const cur = now.getHours() * 60 + now.getMinutes();
  const today = week[day];

  if (today) {
    const [open, close] = today;
    if (cur >= open && cur < close) {
      // open now — flag if it closes within the next 2 hours, with a timer
      return close - cur <= SOON
        ? { state: 'closing', label: 'Closing soon', detail: `Closes ${fmtTime(close)}`, mins: close - cur }
        : { state: 'open', label: 'Open', detail: `${fmtTime(open)} – ${fmtTime(close)}` };
    }
    if (cur < open && open - cur <= SOON) {
      // opens within the next 2 hours — show a countdown timer
      return { state: 'opening', label: 'Opening soon', detail: `Opens ${fmtTime(open)}`, mins: open - cur };
    }
    if (cur < open) {
      return { state: 'closed', label: 'Closed', detail: `Opens ${fmtTime(open)}` };
    }
  }

  // closed now → find the next day it opens
  for (let i = 1; i <= 7; i++) {
    const d = (day + i) % 7;
    if (week[d]) {
      const when = i === 1 ? 'tomorrow' : DAYS[d];
      return { state: 'closed', label: 'Closed', detail: `Opens ${when} ${fmtTime(week[d][0])}` };
    }
  }
  return { state: 'closed', label: 'Closed', detail: '' };
}
