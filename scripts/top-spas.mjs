// Best spa per city → best of the whole state.
//
//   node scripts/top-spas.mjs
//
// Step 1: for every city, pick its champion (highest weighted score).
// Step 2: rank those city champions against each other → Georgia's Top 10.
//
// "By stars and ratings" means BOTH the star rating AND how many ratings back
// it. The weight formula has TWO parts:
//
//   1. QUALITY — a Bayesian-smoothed rating so a 5.0 with 1 review can't beat a
//      4.9 with 400:   q = (R·v + C·m) / (v + m)
//        R = the spa's star rating
//        v = its review count
//        C = the average rating across all spas (the "prior")
//        m = prior weight — how many "average" reviews we assume before we trust
//            the rating (smooths out tiny-sample 5.0s)
//
//   2. CREDIBILITY — a logarithmic reward for review VOLUME, because a place
//      with 500 reviews is more proven than one with 100:  c = log10(v + 10)
//      (log, not linear, so a huge-but-mediocre place can't run away with it.)
//
//   score = q × c
//
// This is what makes 4.0 ★ / 500 reviews outrank 5.0 ★ / 100:
//   5.0/100 → q≈4.89, c=log10(110)=2.04 → 9.97
//   4.0/500 → q≈4.00, c=log10(510)=2.71 → 10.84   ← wins on volume
// Tune VOLUME_WEIGHT (0 = pure quality, higher = volume matters more).

import { IMPORTED } from '../js/data/spas-imported.js';

// Rankings reflect REAL businesses only. The curated demo seeds in SPAS (e.g.
// "Serenity Day Spa", "Tidewater Spa") exist to showcase the premium card
// elsewhere — they are dummy data and must never surface in a stars/reviews
// ranking. IMPORTED = the real scraped listings, so that's our only pool here.
const ACTIVE_TYPES = new Set(['Day Spa', 'Med Spa', 'Massage']);
const rated = IMPORTED
  .filter(s => ACTIVE_TYPES.has(s.type) && s.rating > 0);

const C = rated.reduce((a, s) => a + s.rating, 0) / rated.length;
const M = 15;                 // Bayesian prior weight (quality smoothing)
// Hard quality bar for anything that surfaces in the "top"/"most reviewed"
// section. Volume still wins WITHIN this pool (a 4.0/500 beats a 4.8/40), but a
// sub-4★ business — however many reviews — can never lead a list the visitor
// reads as "Georgia's best". Without it the most-reviewed spot was a 3.5★.
const MIN_RATING = 4.0;
const VOLUME_WEIGHT = 1;      // exponent on the volume term:
                              //   0 = ignore volume (pure quality)
                              //   1 = full log-volume credit (the formula above)
                              //  >1 = volume matters even more

// quality: Bayesian-smoothed rating · credibility: log of review volume
const quality = (s) => (s.rating * (s.reviews || 0) + C * M) / ((s.reviews || 0) + M);
const credibility = (s) => Math.pow(Math.log10((s.reviews || 0) + 10), VOLUME_WEIGHT);
export const score = (s) => quality(s) * credibility(s);

// Step 1 — champion of each city (only spas clearing the quality bar)
const bestByCity = {};
for (const s of rated) {
  if (s.rating < MIN_RATING) continue;
  const c = s.city;
  if (!bestByCity[c] || score(s) > score(bestByCity[c])) bestByCity[c] = s;
}

// exclude can be a single id or an array of ids — caller dedupes so a spa never
// shows up in two places (e.g. both a superlative spot AND the ranked Top 10).
const exSet = (exclude) => new Set([].concat(exclude).filter(Boolean));

// Step 2 — rank the champions → state Top 10
export const topOfState = (n = 10, exclude = []) => {
  const ex = exSet(exclude);
  return Object.values(bestByCity).filter(s => !ex.has(s.id))
    .sort((a, b) => score(b) - score(a)).slice(0, n);
};

// Superlative spots — judged on raw review COUNT (not the Bayesian score). The
// lead "Most reviewed" spot is gated harder (SUPER_MIN = 4.5★) so it can't lead a
// "ranked by stars & reviews" section with a 4.0★ business — most reviewed AND
// genuinely well-rated.
//   mostRated         → most-reviewed spa (rating ≥ SUPER_MIN)
//   mostRatedFiveStar → most-reviewed spa with a perfect 5.0 rating
const SUPER_MIN = 4.5;
const byReviews = (a, b) => (b.reviews || 0) - (a.reviews || 0);
export const mostRated = (exclude = []) => {
  const ex = exSet(exclude);
  return rated.filter(s => s.rating >= SUPER_MIN && !ex.has(s.id)).sort(byReviews)[0];
};
export const mostRatedFiveStar = (exclude = []) => {
  const ex = exSet(exclude);
  return rated.filter(s => s.rating >= 5 && !ex.has(s.id)).sort(byReviews)[0];
};

// Hidden gem — a perfect 5.0 that's still under the radar, ROTATED ONCE A DAY so
// the spotlight feels fresh and spreads exposure across small spas. The pick is
// seeded by the UTC calendar day, so it's stable within a 24h window (every build
// that day shows the same gem) but changes at midnight UTC. NOTE: the site is
// static, so the gem only actually changes when the site is rebuilt — wire up a
// daily rebuild/deploy for the 24h rotation to show up live.
//   GEM_FLOOR keeps it credible (no single-review fluke); GEM_CEIL keeps it
//   "hidden" (skip the already-famous 5.0s). Falls back to all credible 5.0s.
const GEM_FLOOR = 5;
const GEM_CEIL = 60;
const epochDay = () => Math.floor(Date.now() / 864e5); // whole UTC days since epoch
export const hiddenGem = (...excludeIds) => {
  const ex = new Set(excludeIds.filter(Boolean));
  const fives = rated.filter(s => s.rating >= 5 && (s.reviews || 0) >= GEM_FLOOR && !ex.has(s.id));
  if (!fives.length) return undefined;
  let pool = fives.filter(s => (s.reviews || 0) <= GEM_CEIL);
  if (!pool.length) pool = fives;                       // none small enough → use all 5.0s
  // stable order (so the day-seed maps to a deterministic spa), then rotate by day
  pool = pool.sort((a, b) => (a.reviews || 0) - (b.reviews || 0) || String(a.id).localeCompare(String(b.id)));
  return pool[epochDay() % pool.length];
};

// run directly → print the report
if (import.meta.url === `file://${process.argv[1]}`) {
  const cities = Object.values(bestByCity).sort((a, b) => score(b) - score(a));
  console.log(`Rated spas: ${rated.length} · cities with a champion: ${cities.length} · avg rating C=${C.toFixed(2)}\n`);
  console.log('🏆 GEORGIA TOP 10 (best spa from the 10 best cities)');
  topOfState(10).forEach((s, i) =>
    console.log(`${String(i + 1).padStart(2)}. ${s.rating}★ (${s.reviews || 0})  score ${score(s).toFixed(3)}  —  ${s.name}, ${s.cityName || s.city}`));
  console.log('\nNext best city champions:');
  cities.slice(10, 20).forEach((s, i) =>
    console.log(`${String(i + 11).padStart(2)}. ${s.rating}★ (${s.reviews || 0})  ${s.name}, ${s.cityName || s.city}`));
}
