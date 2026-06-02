#!/usr/bin/env node
// GA.Spas revenue model — a back-of-envelope projection, NOT a forecast.
//
// Revenue in this product comes from ONE place: free → paid conversions
// (Standard $49/mo, Premium $149/mo). Traffic matters only because it drives
// referral leads, which is what makes a spa upgrade. So the model is:
//
//     MRR = (listings × paidPct) × blendedPrice
//
// `blendedPrice` falls out of the Standard/Premium split. Lead-gen, sponsored
// placement, and affiliate income are a SEPARATE line not modeled here — at
// maturity they can roughly double the subscription figure below.
//
// Run:  node scripts/revenue-model.mjs
// The current listing count is read live from data/cities/*.json so the
// "today" row reflects the real catalog as it grows with each import.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRICE = { standard: 49, premium: 149 };
const CHURN = 0.04; // ~4%/mo SMB local-directory churn (steady-state drag)

// ── live listing count from the PUBLISHED listings ─────────────────────────
// Count the filtered, published spas (js/data/spas-imported.js), NOT the raw
// data/cities/*.json store — the raw store holds every scraped row including
// the nail/hair/salon rows the importer drops, so it badly overcounts.
function currentListings() {
  try {
    const src = readFileSync(join(ROOT, 'js', 'data', 'spas-imported.js'), 'utf8');
    // each published listing is one `"id":` key
    const m = src.match(/"id":/g);
    return m ? m.length : 0;
  } catch {
    return 0;
  }
}

// blended monthly price given the share of paying spas that pick Premium
const blended = (premiumShare) =>
  PRICE.standard * (1 - premiumShare) + PRICE.premium * premiumShare;

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');

// ── scenarios ──────────────────────────────────────────────────────────────
// [label, listings, paidPct, premiumShare]
const today = currentListings();
const scenarios = [
  ['Conservative',            Math.max(today, 2000), 0.015, 0.10],
  ['Realistic (matured)',     2500,                  0.030, 0.20],
  ['Strong',                  3500,                  0.050, 0.25],
  ['Best case (GA leader)',   5000,                  0.070, 0.35],
];

console.log(`\nGA.Spas — subscription revenue model`);
console.log(`Live catalog today: ${today.toLocaleString('en-US')} listings (all free tier)\n`);

const rows = scenarios.map(([label, listings, paidPct, premShare]) => {
  const paying = listings * paidPct;
  const price = blended(premShare);
  const gross = paying * price;
  const net = gross * (1 - CHURN); // crude steady-state after churn drag
  return { label, listings, paidPct, premShare, paying, price, gross, net };
});

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(
  pad('Scenario', 24) + padL('Listings', 9) + padL('Paid%', 7) +
  padL('Prem%', 7) + padL('Paying', 8) + padL('Blend', 8) +
  padL('MRR', 11) + padL('ARR', 12),
);
console.log('-'.repeat(86));
for (const r of rows) {
  console.log(
    pad(r.label, 24) +
    padL(r.listings.toLocaleString('en-US'), 9) +
    padL((r.paidPct * 100).toFixed(1) + '%', 7) +
    padL((r.premShare * 100).toFixed(0) + '%', 7) +
    padL(Math.round(r.paying), 8) +
    padL(usd(r.price), 8) +
    padL(usd(r.gross) + '/mo', 11) +
    padL(usd(r.gross * 12), 12),
  );
}
console.log('-'.repeat(86));
console.log(
  '\nNotes:\n' +
  '  • MRR = listings × Paid% × blended price. ARR = MRR × 12.\n' +
  `  • Blended price = Standard $${PRICE.standard} / Premium $${PRICE.premium}, split by Prem%.\n` +
  `  • Churn (~${(CHURN * 100).toFixed(0)}%/mo) is the steady-state retention drag, not modeled in MRR above.\n` +
  '  • Subscriptions ONLY. Lead-gen / sponsored / affiliate can ~double this at maturity.\n' +
  '  • Asset sale value for a profitable directory ≈ 3–5× ARR.\n' +
  '  • Conversion is driven by provable referral leads — see spa_interaction\n' +
  '    events (visit_website, call, directions, request_appointment) in js/analytics.js.\n',
);
