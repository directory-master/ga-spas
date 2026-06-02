// Importer: Bing Maps scraper CSV(s) → durable in-project store → listing data.
//
//   node scripts/import-csv.mjs                 # all ~/Downloads/Bing_Maps_Scraper_*.csv
//   node scripts/import-csv.mjs a.csv b.csv     # specific files
//
// DURABLE STORE: each kept row is MERGED into data/cities/*.json (one file per
// city, committed to the repo, deduped by ID then name+address). New CSVs only
// ADD — nothing is ever lost when you clear ~/Downloads. The store holds ONLY
// GA spa rows: nail / hair / barber / lash / etc. are filtered out at ingest
// (see isSpaRow) and never warehoused — this is a spas-only directory.
//
// This script then filters the store to Georgia + spa categories (incl.
// "Beauty & spa"), maps fields to our model, groups by city, sorts by rating,
// and writes js/data/spas-imported.js.
//
// NOTE: the scraper only has a relative "Open Hours" string (not a weekly
// schedule) → imported spas get `hoursText` (display), NOT the weekly `hours`
// the live status needs. No black-owned / price data either.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOWNLOADS = `${process.env.HOME}/Downloads`;
const SRCS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (existsSync(DOWNLOADS) ? readdirSync(DOWNLOADS) : [])
      .filter(f => /^Bing_Maps_Scraper_.*\.csv$/i.test(f)).sort().map(f => join(DOWNLOADS, f));

// durable raw-row store, committed in the project (survives Downloads cleanup):
// one JSON file per city under data/cities/<city-slug>.json
const STORE_DIR = fileURLToPath(new URL('../data/cities/', import.meta.url));

// included spa categories → our type
const TYPE_MAP = {
  'Spas': 'Day Spa',
  'Day spa': 'Day Spa',
  'Beauty & spa': 'Day Spa',
  'Medical spa': 'Med Spa',
  'Massage therapy': 'Massage',
};
// Non-spa businesses that Bing files under the catch-all "Beauty & spa" /
// "Day spa" categories: nail bars, hair salons, barbers, brow/lash/wax/tan
// studios, piercing & tattoo shops, etc. We exclude them from the SPA listing
// by name (they stay in the raw store for a future nail/hair directory).
//
// HARD tokens: never a spa, even if the name also says "spa". Includes glued/
// inflected forms (waxed, lashing, eyelash) and product/retail/distributor
// names (massage-chair sellers, SalonCentric beauty-supply) that Bing miscats.
const NAME_EXCLUDE = /\b(piercing|barber|barbershop|tattoo|threading|sugaring|microblading|braids?|braiding|weaves?|lash(es|ing)?|eyelash(es)?|brows?|blowout|tanning)\b|hair salon|hair design|hair studio|hair gallery|hairdress|nail|blow ?dry|\bwax(ing|ed)?\b|\btan\b|color studio|men'?s grooming|grooming (lounge|parlour|parlor)|teeth whitening|nail supply|\bsoap\b|saloncentric|massage chair|silk press/i;

// SOFT tokens: a bare "hair"/"salon"/"shear" name (hair salon, salon suite,
// barbershop-by-another-name) — drop it UNLESS the name also carries a real
// spa signal, in which case it's a legit hybrid (e.g. "Esthetics & Massage
// Salon", "Hair & Day Spa") and we keep it.
const SOFT_EXCLUDE = /\bhairs?\b|hair\w|\w+hair\b|\bsalons?\b|salon\w|\bshear\b/i;
const SPA_SIGNAL = /\b(spa|massage|wellness|esthetic\w*|aesthetic\w*|skin|facial|sauna|float|cryo|body ?work|bodywork|medspa|med ?spa)\b/i;
// A name that explicitly calls itself a "med spa" is a med spa even when it
// also lists a hard token (Botox/laser med spas mention tattoo removal,
// microblading, PMU, waxing). This rescues HARD matches — but ONLY for "med
// spa", never "day spa" (nail/hair shops routinely append "& Day Spa").
const HARD_RESCUE = /\bmed ?spa\b/i;

// The single "is this a row we keep?" gate: a GA address + a spa category +
// passing the spa name rules. Used to filter the durable store at ingest so we
// never warehouse non-spa rows (the publish loop below re-checks as a guard).
function isSpaRow(r) {
  const addr = r['Address'] || '';
  const state = addr.split(',').pop().trim().split(/\s+/)[0];
  if (state !== 'GA' && state !== 'Georgia') return false;
  if (!TYPE_MAP[(r['Category'] || '').trim()]) return false;
  const nm = r['Name'] || '';
  if ((NAME_EXCLUDE.test(nm) && !HARD_RESCUE.test(nm)) ||
      (SOFT_EXCLUDE.test(nm) && !SPA_SIGNAL.test(nm))) return false;
  return true;
}
const JUNK_EMAIL = /(stripe|zoca|chargebee|yelp|vagaro|twilio|microsoft|mixpanel|uxcam|moengage|imagekit|styleseat|clarity|hilton|birdeye|@handandstone|wix\.)/i;
const JUNK_LOCAL = /^(privacy|unsubscribe|webmaster|legal|info@stripe|people|hello@zoca|help|ir|support|dataprotection|quality|clarityms|web)/i;

const kebab = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --- minimal RFC-4180 CSV parser ---
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function rowsOf(path) {
  const raw = parseCSV(readFileSync(path, 'utf8')).filter(r => r.length > 5);
  const header = raw.shift().map(h => h.trim());
  return raw.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

// --- merge new CSV rows into the durable in-project store ---
const rawKey = (r) => ((r['ID'] || '').trim()) ||
  `${(r['Name'] || '').toLowerCase()}|${(r['Address'] || '').toLowerCase()}`;

// city slug from the row's Address ("…, Atlanta, GA 30301" → "atlanta")
const citySlugOf = (r) => {
  const parts = (r['Address'] || '').split(',').map(s => s.trim());
  return (parts.length >= 2 ? kebab(parts[parts.length - 2]) : '') || '_unknown';
};

// load the existing store: every data/cities/*.json merged back into memory
let store = [];
if (existsSync(STORE_DIR)) {
  for (const f of readdirSync(STORE_DIR)) {
    if (!f.endsWith('.json')) continue;
    try { store.push(...JSON.parse(readFileSync(join(STORE_DIR, f), 'utf8'))); } catch { /* skip bad file */ }
  }
}

const storeMap = new Map();
for (const r of store) storeMap.set(rawKey(r), r);
// keys of spa rows already in the store, to count what this run genuinely adds
const priorKeys = new Set(store.filter(isSpaRow).map(rawKey));

const todayISO = new Date().toISOString().slice(0, 10);
const csvRows = SRCS.flatMap(rowsOf);
for (const r of csvRows) {
  // a fresh scrape refreshes the Bing fields but must KEEP our editable
  // monetization fields (paid / tier / paidAt / paidDays) — so re-importing
  // never un-pays a spa or resets its paid clock
  const prev = storeMap.get(rawKey(r));
  r.paid = prev?.paid ?? false;
  r.tier = prev?.tier ?? 'free';
  r.paidAt = prev?.paidAt ?? null;       // ISO date the paid spot started
  r.paidDays = prev?.paidDays ?? 30;     // how long it runs before it expires
  r.addedAt = prev?.addedAt ?? todayISO; // first date this spa entered our store
  storeMap.set(rawKey(r), r);
}
// backfill defaults + auto-stamp the start date the first time a spa is marked
// paid (so just flipping "paid":true in the JSON starts its 30-day clock)
for (const r of storeMap.values()) {
  r.paid ??= false; r.tier ??= 'free'; r.paidDays ??= 30; r.paidAt ??= null;
  r.addedAt ??= todayISO;                // backfill rows that predate this field
  if (r.paid && !r.paidAt) r.paidAt = todayISO;
  if (!r.paid) r.paidAt = null;
}
const merged = [...storeMap.values()];
// spas-only store: drop nail/hair/barber/etc rows so they're never warehoused
const kept = merged.filter(isSpaRow);
const prunedNonSpa = merged.length - kept.length;

// rewrite the per-city store from scratch (one object per line for easy edits)
rmSync(STORE_DIR, { recursive: true, force: true });
mkdirSync(STORE_DIR, { recursive: true });
const byCity = {};
for (const r of kept) (byCity[citySlugOf(r)] ??= []).push(r);
for (const [slug, rows] of Object.entries(byCity)) {
  writeFileSync(join(STORE_DIR, `${slug}.json`), '[\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
}
const addedToStore = kept.filter(r => !priorKeys.has(rawKey(r))).length;

// build listings from the FULL durable store (not just this run's Downloads)
const allRows = kept;

const stats = { files: SRCS.length, total: allRows.length, store: kept.length, added: addedToStore, pruned: prunedNonSpa, nonGA: 0, nonSpa: 0, dupes: 0 };
const seenId = new Set();
const seenKey = new Set();
const out = [];

for (const r of allRows) {
  const id = r['ID'];
  if (id && seenId.has(id)) { stats.dupes++; continue; }
  if (id) seenId.add(id);

  const addr = r['Address'] || '';
  const state = addr.split(',').pop().trim().split(/\s+/)[0];
  if (state !== 'GA' && state !== 'Georgia') { stats.nonGA++; continue; }

  const type = TYPE_MAP[(r['Category'] || '').trim()];
  if (!type) { stats.nonSpa++; continue; }
  const nm = r['Name'] || '';
  // drop the hard non-spa keywords outright, plus soft hair/salon names that
  // carry no spa signal (a hair salon, not a day spa)
  if ((NAME_EXCLUDE.test(nm) && !HARD_RESCUE.test(nm)) || (SOFT_EXCLUDE.test(nm) && !SPA_SIGNAL.test(nm))) {
    stats.nonSpaName = (stats.nonSpaName || 0) + 1; continue;
  }

  const key = `${r['Name']}|${addr}`.toLowerCase();
  if (seenKey.has(key)) { stats.dupes++; continue; }
  seenKey.add(key);

  const parts = addr.split(',').map(s => s.trim());
  const cityName = parts.length >= 2 ? parts[parts.length - 2] : '';
  const zip = (addr.match(/\b(\d{5})\b/) || [])[1] || null;

  const rating = parseFloat(r['Rating']) || null;
  const reviews = parseInt(((r['Rating Info'] || '').match(/\((\d+)\)/) || [])[1], 10) || null;

  let email = null;
  for (const e of (r['Emails'] || '').split(',').map(s => s.trim())) {
    if (!e || e.includes('###') || JUNK_EMAIL.test(e) || JUNK_LOCAL.test(e)) continue;
    email = e; break;
  }

  out.push({
    id: kebab(`${r['Name']}-${cityName}`).slice(0, 60),
    name: r['Name'],
    city: kebab(cityName),
    cityName,
    type,
    tier: r.tier || 'free',
    paid: r.paid || false,
    paidAt: r.paidAt || null,
    paidDays: r.paidDays || 30,
    blackOwned: false,
    rating, reviews, zip,
    lat: parseFloat(r['Latitude']) || null,
    lng: parseFloat(r['Longitude']) || null,
    address: addr,
    phone: r['Phone'] || null,
    website: r['Website'] || null,
    email,
    image: r['Featured image'] || null,
    hoursText: r['Open Hours'] || null,
    facebook: r['Facebook'] || null,
    instagram: r['Instagram'] || null,
  });
}

// guard against id collisions (same name+city in different rows) → suffix
const ids = new Set();
for (const s of out) {
  let id = s.id, n = 2;
  while (ids.has(id)) id = `${s.id}-${n++}`;
  s.id = id; ids.add(id);
}

out.sort((a, b) =>
  a.cityName.localeCompare(b.cityName) ||
  (b.rating ?? -1) - (a.rating ?? -1) ||
  (b.reviews ?? -1) - (a.reviews ?? -1));

writeFileSync(
  new URL('../js/data/spas-imported.js', import.meta.url),
  '// AUTO-GENERATED by scripts/import-csv.mjs — do not edit by hand.\n' +
  'export const IMPORTED = ' + JSON.stringify(out, null, 2) + ';\n'
);

// report
const spaByCity = {}, byType = {};
for (const s of out) { spaByCity[s.cityName] = (spaByCity[s.cityName] || 0) + 1; byType[s.type] = (byType[s.type] || 0) + 1; }
console.log(`Store: ${stats.store} spa rows across ${Object.keys(byCity).length} per-city files in data/cities/ (+${stats.added} new from ${stats.files} CSV(s); pruned ${stats.pruned} non-spa rows).`);
console.log(`Imported ${out.length} GA spas from the store.`);
console.log(`  dropped: ${stats.nonGA} non-GA, ${stats.nonSpa} non-spa category, ${stats.nonSpaName || 0} non-spa name (nail/hair/brow/etc), ${stats.dupes} dupes`);
console.log(`  types:`, byType);
console.log(`  GA spa cities: ${Object.keys(spaByCity).length}`);
for (const [c, n] of Object.entries(spaByCity).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`    ${String(n).padStart(3)}  ${c}`);
console.log(`\nwrote js/data/spas-imported.js`);
