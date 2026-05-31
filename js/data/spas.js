// Sample data. Append entries; don't reorder (ids are URL keys).
//
// Fields (all listings):  id, name, city, neighborhood, type, tier,
//   rating, reviews, price ('$' | '$$' | '$$$'), blackOwned (bool), image
// Premium also: bookingUrl, phone, address, lat, lng, menu[], offer?

import { IMPORTED } from './spas-imported.js';

export const CITIES = [
  { slug: 'atlanta',  name: 'Atlanta',  blurb: 'Buckhead, Midtown, Decatur, Sandy Springs' },
  { slug: 'savannah', name: 'Savannah', blurb: 'Historic district & midtown' },
  { slug: 'augusta',  name: 'Augusta',  blurb: 'Downtown & West Augusta' },
  { slug: 'athens',   name: 'Athens',   blurb: 'Five Points & downtown' },
  { slug: 'columbus', name: 'Columbus', blurb: 'Uptown & North Columbus' },
  { slug: 'macon',    name: 'Macon',    blurb: 'Downtown & Ingleside' },
];

// Stock photos (Unsplash). Rendering falls back to a gradient if these fail.
const IMG = {
  nails:   'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=800&q=60',
  dayspa:  'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=60',
  medspa:  'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=60',
  massage: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=60',
  brow:    'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=800&q=60',
  hair:    'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=60',
};

// Weekly hours → array[7] (Sun..Sat) of [openMin, closeMin] | null (closed).
const _hm = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const _rng = (s) => (s ? s.split('-').map(_hm) : null);
const wk = (d) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(k => _rng(d[k] || null));
const std = (weekday, sat, sun) => wk({ mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat, sun });

export const SPAS = [
  // --- Atlanta ---
  {
    id: 'atl-luxe-nail-studio',
    name: 'Luxe Nail Studio',
    city: 'atlanta',
    neighborhood: 'Buckhead',
    type: 'Nail Salon',
    tier: 'premium',
    rating: 4.8, reviews: 212, price: '$$', blackOwned: false, image: IMG.nails,
    bookingUrl: 'https://booksy.com/en-us/example-luxe-nail-studio',
    phone: '(404) 555-0142',
    address: '3500 Peachtree Rd NE, Atlanta, GA 30326',
    lat: 33.8484, lng: -84.3613,
    offer: 'New clients: $10 off your first appointment',
    menu: [
      { service: 'Classic Manicure', price: '$35' },
      { service: 'Gel Manicure',     price: '$55' },
      { service: 'Acrylic Full Set', price: '$75' },
      { service: 'Pedicure',         price: '$45' },
    ],
  },
  {
    id: 'atl-serenity-day-spa',
    name: 'Serenity Day Spa',
    city: 'atlanta',
    neighborhood: 'Midtown',
    type: 'Day Spa',
    tier: 'premium',
    rating: 4.9, reviews: 388, price: '$$$', blackOwned: true, image: IMG.dayspa,
    bookingUrl: 'https://vagaro.com/example-serenity-day-spa',
    phone: '(404) 555-0188',
    email: 'hello@serenitydayspa.example',
    address: '1100 Peachtree St NE, Atlanta, GA 30309',
    lat: 33.7849, lng: -84.3839,
    hours: std('9:00-20:00', '9:00-18:00', '10:00-17:00'),
    offer: 'Couples massage package — $199 (reg. $260)',
    description: 'A Midtown sanctuary for deep relaxation — Swedish and deep-tissue massage, signature facials, and couples rituals in a calm, modern space.',
    amenities: ['🚗 Parking', '🛁 Private rooms', '👫 Couples', '🎁 Gift cards', '💻 Online booking'],
    menu: [
      { service: '60-min Swedish Massage',  price: '$95' },
      { service: '60-min Deep Tissue',      price: '$115' },
      { service: 'Signature Facial',        price: '$120' },
      { service: 'Couples Massage (2x60m)', price: '$199' },
    ],
  },
  {
    id: 'atl-sandy-skin',
    name: 'Sandy Springs Skin Bar',
    city: 'atlanta',
    neighborhood: 'Sandy Springs',
    type: 'Med Spa',
    tier: 'standard',
    rating: 4.7, reviews: 154, price: '$$$', blackOwned: false, image: IMG.medspa,
    lat: 33.9304, lng: -84.3733,
    address: '6300 Powers Ferry Rd, Sandy Springs, GA 30339',
    hours: std('10:00-19:00', '10:00-16:00', null),
    phone: '(404) 555-0210', email: 'hello@sandyspringsskinbar.example',
    bookingUrl: 'https://vagaro.com/example-sandy-springs-skin-bar',
    offer: 'Free skin analysis with any facial',
    description: "Sandy Springs' go-to for HydraFacials, chemical peels, and microneedling — clinical skincare in a calm, welcoming space.",
    menu: [
      { service: 'HydraFacial',   price: '$150' },
      { service: 'Chemical Peel', price: '$110' },
      { service: 'Microneedling', price: '$200' },
    ],
  },
  {
    id: 'atl-crown-glow',
    name: 'Crown & Glow Spa',
    city: 'atlanta',
    neighborhood: 'West End',
    type: 'Day Spa',
    tier: 'standard',
    rating: 4.7, reviews: 118, price: '$$', blackOwned: true, image: IMG.dayspa,
    lat: 33.7400, lng: -84.4220,
    address: '1085 Ralph David Abernathy Blvd SW, Atlanta, GA 30310',
    hours: wk({ tue: '10:00-19:00', wed: '10:00-19:00', thu: '10:00-19:00', fri: '10:00-19:00', sat: '9:00-17:00' }),
    phone: '(404) 555-0233', email: 'hello@crownglowspa.example',
    bookingUrl: 'https://booksy.com/en-us/example-crown-and-glow-spa',
    offer: 'New client: 20% off your first facial',
    description: 'Melanin-forward skincare and restorative body rituals — custom facials, body wraps, and cupping in a warm West End studio.',
    menu: [
      { service: 'Signature Facial', price: '$95' },
      { service: 'Body Wrap',        price: '$120' },
      { service: 'Cupping Therapy',   price: '$70' },
    ],
  },
  {
    id: 'atl-tranquil-massage',
    name: 'Tranquil Hands Massage',
    city: 'atlanta',
    neighborhood: 'Midtown',
    type: 'Massage',
    tier: 'premium',
    rating: 4.8, reviews: 201, price: '$$', blackOwned: false, image: IMG.massage,
    bookingUrl: 'https://vagaro.com/example-tranquil-hands',
    phone: '(404) 555-0173',
    email: 'hello@tranquilhands.example',
    address: '855 Peachtree St NE, Atlanta, GA 30308',
    lat: 33.7820, lng: -84.3835,
    hours: std('8:00-21:00', '9:00-19:00', '10:00-18:00'),
    offer: 'First session: 20% off any 60-min massage',
    description: 'Boutique therapeutic massage in Midtown — Swedish, deep tissue, and hot stone by licensed therapists, with zero upsell pressure.',
    amenities: ['👫 Couples', '🛁 Private rooms', '💻 Online booking'],
    menu: [
      { service: '60-min Swedish Massage', price: '$85' },
      { service: '60-min Deep Tissue',     price: '$105' },
      { service: '90-min Hot Stone',       price: '$140' },
    ],
  },

  // --- Savannah ---
  {
    id: 'sav-tidewater-spa',
    name: 'Tidewater Spa',
    city: 'savannah',
    neighborhood: 'Historic District',
    type: 'Day Spa',
    tier: 'premium',
    rating: 4.8, reviews: 167, price: '$$', blackOwned: false, image: IMG.massage,
    bookingUrl: 'https://vagaro.com/example-tidewater-spa',
    phone: '(912) 555-0119',
    email: 'hello@tidewaterspa.example',
    address: '102 W Bay St, Savannah, GA 31401',
    lat: 32.0809, lng: -81.0912,
    hours: std('9:00-19:00', '9:00-17:00', null),
    offer: 'Locals Tuesday: 15% off all 60-min services',
    description: "Savannah's historic-district spa for massage, salt-glow scrubs, and hydrating facials — a calm escape steps from the river.",
    amenities: ['🚗 Parking', '🎁 Gift cards', '💻 Online booking'],
    menu: [
      { service: '60-min Massage',   price: '$90' },
      { service: 'Salt-Glow Scrub',  price: '$75' },
      { service: 'Hydrating Facial', price: '$110' },
    ],
  },


  // --- Athens ---
  {
    id: 'ath-fivepoints-nails',
    name: 'Five Points Nail Lounge',
    city: 'athens',
    neighborhood: 'Five Points',
    type: 'Nail Salon',
    tier: 'premium',
    rating: 4.7, reviews: 129, price: '$', blackOwned: false, image: IMG.nails,
    bookingUrl: 'https://booksy.com/en-us/example-five-points-nail-lounge',
    phone: '(706) 555-0166',
    address: '1670 S Lumpkin St, Athens, GA 30606',
    lat: 33.9337, lng: -83.3771,
    offer: 'Student discount: 10% off with valid ID',
    menu: [
      { service: 'Classic Manicure', price: '$30' },
      { service: 'Dip Powder',       price: '$50' },
      { service: 'Pedicure',         price: '$40' },
    ],
  },


];

// ZIP centroids for "search by ZIP". Static lookup — no geocoding backend.
// Expand this table as coverage grows (this powers the SEO per-ZIP plan too).
// Curated demo + scraped listings. ACTIVE = spas only (salons come later),
// so the dynamic app matches the static site and the brand positioning.
export const ALL = [...SPAS, ...IMPORTED];
const SPA_TYPES = new Set(['Day Spa', 'Med Spa', 'Massage']);
export const ACTIVE = ALL.filter(s => SPA_TYPES.has(s.type));

export const ZIP_CENTROIDS = {
  '30305': { lat: 33.8390, lng: -84.3880, label: 'Buckhead' },
  '30326': { lat: 33.8484, lng: -84.3613, label: 'Buckhead' },
  '30309': { lat: 33.7980, lng: -84.3870, label: 'Midtown' },
  '30308': { lat: 33.7710, lng: -84.3780, label: 'Midtown' },
  '30030': { lat: 33.7748, lng: -84.2963, label: 'Decatur' },
  '30328': { lat: 33.9304, lng: -84.3733, label: 'Sandy Springs' },
  '30342': { lat: 33.8870, lng: -84.3780, label: 'Sandy Springs' },
  '31401': { lat: 32.0809, lng: -81.0912, label: 'Savannah' },
  '30901': { lat: 33.4735, lng: -81.9624, label: 'Augusta' },
  '30606': { lat: 33.9337, lng: -83.3771, label: 'Athens' },
  '31901': { lat: 32.4610, lng: -84.9877, label: 'Columbus' },
  '31201': { lat: 32.8633, lng: -83.6610, label: 'Macon' },
};

// Great-circle distance in miles between two {lat,lng} points.
export function milesBetween(a, b) {
  const R = 3958.8, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Spas sorted by distance from an {lat,lng} origin, nearest first.
export function spasNear(origin, limit = 6) {
  return ACTIVE
    .filter(s => typeof s.lat === 'number' && typeof s.lng === 'number')
    .map(s => ({ spa: s, miles: milesBetween(origin, s) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, limit);
}

export function spasByCity(citySlug) {
  return ACTIVE.filter(s => s.city === citySlug);
}

export function findCity(slug) {
  return CITIES.find(c => c.slug === slug);
}

export function findSpa(id) {
  return ACTIVE.find(s => s.id === id);
}

export function spaCountByCity(citySlug) {
  return ACTIVE.filter(s => s.city === citySlug).length;
}

// Display name for any city slug (curated or imported).
export function cityDisplayName(slug) {
  const c = findCity(slug);
  if (c) return c.name;
  const s = ACTIVE.find(x => x.city === slug);
  return (s && s.cityName) || slug;
}

// All cities present in the data, with counts, busiest first.
export function allCitySlugs() {
  const m = new Map();
  for (const s of ACTIVE) if (s.city) m.set(s.city, cityDisplayName(s.city));
  return [...m]
    .filter(([, name]) => !/^private address/i.test(name))
    .map(([slug, name]) => ({ slug, name, count: spaCountByCity(slug) }))
    .sort((a, b) => b.count - a.count);
}

// Tier order premium → standard → free, then by rating.
const TIER_ORDER = { premium: 0, standard: 1, free: 2 };
export function sortListings(list) {
  return [...list].sort((a, b) =>
    (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || b.rating - a.rating
  );
}

export function featuredSpas(limit = 3) {
  return sortListings(ACTIVE.filter(s => s.tier === 'premium')).slice(0, limit);
}
