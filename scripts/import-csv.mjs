// Importer: Bing Maps scraper CSV(s) → durable in-project store → listing data.
//
//   node scripts/import-csv.mjs                 # all ~/Downloads/Bing_Maps_Scraper_*.csv
//   node scripts/import-csv.mjs a.csv b.csv     # specific files
//
// DURABLE STORE: every raw scraped row is MERGED into data/bing-sources.json
// (committed to the repo, deduped by ID then name+address). New CSVs only ADD —
// nothing is ever lost when you clear ~/Downloads. The store keeps ALL rows
// (spa / nail / hair / etc.) so we can spin up nail & hair directories later.
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
const NAME_EXCLUDE = /\b(piercing|barber|barbershop|tattoo|threading|sugaring|microblading|braids?|weaves?|lash(es)?|brows?|blowout|tanning)\b|hair salon|hair design|hair studio|hair gallery|hairdress|nail|blow ?dry|\bwax(ing)?\b|\btan\b|color studio|men'?s grooming|grooming (lounge|parlour|parlor)|teeth whitening|nail supply|\bsoap\b/i;
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
const beforeStore = storeMap.size;

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

// rewrite the per-city store from scratch (one object per line for easy edits)
rmSync(STORE_DIR, { recursive: true, force: true });
mkdirSync(STORE_DIR, { recursive: true });
const byCity = {};
for (const r of merged) (byCity[citySlugOf(r)] ??= []).push(r);
for (const [slug, rows] of Object.entries(byCity)) {
  writeFileSync(join(STORE_DIR, `${slug}.json`), '[\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
}
const addedToStore = storeMap.size - beforeStore;

// build listings from the FULL durable store (not just this run's Downloads)
const allRows = merged;

const stats = { files: SRCS.length, total: allRows.length, store: merged.length, added: addedToStore, nonGA: 0, nonSpa: 0, dupes: 0 };
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
  // drop the keyword non-spas, plus bare "… Salon" names that don't also say
  // spa/massage/wellness (a hair salon, not a day spa)
  if (NAME_EXCLUDE.test(nm) || (/\bsalon\b/i.test(nm) && !/\b(spa|massage|wellness)\b/i.test(nm))) {
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
console.log(`Store: ${stats.store} raw rows across ${Object.keys(byCity).length} per-city files in data/cities/ (+${stats.added} new from ${stats.files} CSV(s)).`);
console.log(`Imported ${out.length} GA spas from the store.`);
console.log(`  dropped: ${stats.nonGA} non-GA, ${stats.nonSpa} non-spa category, ${stats.nonSpaName || 0} non-spa name (nail/hair/brow/etc), ${stats.dupes} dupes`);
console.log(`  types:`, byType);
console.log(`  GA spa cities: ${Object.keys(spaByCity).length}`);
for (const [c, n] of Object.entries(spaByCity).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`    ${String(n).padStart(3)}  ${c}`);
console.log(`\nwrote js/data/spas-imported.js`);
