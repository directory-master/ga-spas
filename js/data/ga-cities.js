// Georgia SEO target cities/places, ranked by market priority.
// Each entry generates one static page: /ga/<slug>-spas.html
//   tier:   1 = launch, 2 = month 2–3, 3 = secondary metro, 4 = long-tail
//   match:  how listings are selected for the page (by spas.js fields).
//           { city: '<citySlug>' }  or  { neighborhood: '<Name>' }
//   parent: shown for neighborhoods that roll up to a metro.
//
// IMPORTANT: a page is only generated when match selects >= 1 listing.
// Empty city pages are doorway pages — bad SEO. The full list is the roadmap;
// pages go live as each place gets real listings.

export const GA_CITIES = [
  // --- Tier 1: launch (metro Atlanta) ---
  { slug: 'atlanta',      name: 'Atlanta',      tier: 1, match: { city: 'atlanta' } },
  { slug: 'buckhead',     name: 'Buckhead',     tier: 1, parent: 'Atlanta', match: { neighborhood: 'Buckhead' } },
  { slug: 'sandy-springs', name: 'Sandy Springs', tier: 1, match: { neighborhood: 'Sandy Springs' } },
  { slug: 'alpharetta',   name: 'Alpharetta',   tier: 1, match: { neighborhood: 'Alpharetta' } },
  { slug: 'marietta',     name: 'Marietta',     tier: 1, match: { neighborhood: 'Marietta' } },
  { slug: 'decatur',      name: 'Decatur',      tier: 1, match: { neighborhood: 'Decatur' } },
  { slug: 'smyrna',       name: 'Smyrna',       tier: 1, match: { neighborhood: 'Smyrna' } },
  { slug: 'roswell',      name: 'Roswell',      tier: 1, match: { neighborhood: 'Roswell' } },
  { slug: 'dunwoody',     name: 'Dunwoody',     tier: 1, match: { neighborhood: 'Dunwoody' } },
  { slug: 'johns-creek',  name: 'Johns Creek',  tier: 1, match: { neighborhood: 'Johns Creek' } },

  // --- Tier 2: month 2–3 ---
  { slug: 'kennesaw',      name: 'Kennesaw',      tier: 2, match: { neighborhood: 'Kennesaw' } },
  { slug: 'peachtree-city', name: 'Peachtree City', tier: 2, match: { neighborhood: 'Peachtree City' } },
  { slug: 'newnan',        name: 'Newnan',        tier: 2, match: { neighborhood: 'Newnan' } },
  { slug: 'duluth',        name: 'Duluth',        tier: 2, match: { neighborhood: 'Duluth' } },
  { slug: 'lawrenceville', name: 'Lawrenceville', tier: 2, match: { neighborhood: 'Lawrenceville' } },
  { slug: 'cumming',       name: 'Cumming',       tier: 2, match: { neighborhood: 'Cumming' } },
  { slug: 'woodstock',     name: 'Woodstock',     tier: 2, match: { neighborhood: 'Woodstock' } },
  { slug: 'canton',        name: 'Canton',        tier: 2, match: { neighborhood: 'Canton' } },
  { slug: 'douglasville',  name: 'Douglasville',  tier: 2, match: { neighborhood: 'Douglasville' } },
  { slug: 'college-park',  name: 'College Park',  tier: 2, match: { neighborhood: 'College Park' } },
  { slug: 'east-point',    name: 'East Point',    tier: 2, match: { neighborhood: 'East Point' } },
  { slug: 'fayetteville',  name: 'Fayetteville',  tier: 2, match: { neighborhood: 'Fayetteville' } },
  { slug: 'mcdonough',     name: 'McDonough',     tier: 2, match: { neighborhood: 'McDonough' } },
  { slug: 'stockbridge',   name: 'Stockbridge',   tier: 2, match: { neighborhood: 'Stockbridge' } },
  { slug: 'conyers',       name: 'Conyers',       tier: 2, match: { neighborhood: 'Conyers' } },

  // --- Tier 3: secondary Georgia metros ---
  { slug: 'savannah',      name: 'Savannah',      tier: 3, match: { city: 'savannah' } },
  { slug: 'augusta',       name: 'Augusta',       tier: 3, match: { city: 'augusta' } },
  { slug: 'columbus',      name: 'Columbus',      tier: 3, match: { city: 'columbus' } },
  { slug: 'macon',         name: 'Macon',         tier: 3, match: { city: 'macon' } },
  { slug: 'athens',        name: 'Athens',        tier: 3, match: { city: 'athens' } },
  { slug: 'warner-robins', name: 'Warner Robins', tier: 3, match: { city: 'warner-robins' } },
  { slug: 'valdosta',      name: 'Valdosta',      tier: 3, match: { city: 'valdosta' } },
  { slug: 'brunswick',     name: 'Brunswick',     tier: 3, match: { city: 'brunswick' } },
  { slug: 'gainesville',   name: 'Gainesville',   tier: 3, match: { city: 'gainesville' } },
  { slug: 'rome',          name: 'Rome',          tier: 3, match: { city: 'rome' } },
  { slug: 'dalton',        name: 'Dalton',        tier: 3, match: { city: 'dalton' } },
  { slug: 'hinesville',    name: 'Hinesville',    tier: 3, match: { city: 'hinesville' } },
  { slug: 'statesboro',    name: 'Statesboro',    tier: 3, match: { city: 'statesboro' } },
  { slug: 'tifton',        name: 'Tifton',        tier: 3, match: { city: 'tifton' } },
  { slug: 'albany',        name: 'Albany',        tier: 3, match: { city: 'albany' } },

  // --- Tier 4: long-tail ---
  { slug: 'carrollton',    name: 'Carrollton',    tier: 4, match: { city: 'carrollton' } },
  { slug: 'griffin',       name: 'Griffin',       tier: 4, match: { city: 'griffin' } },
  { slug: 'lagrange',      name: 'LaGrange',      tier: 4, match: { city: 'lagrange' } },
  { slug: 'milledgeville', name: 'Milledgeville', tier: 4, match: { city: 'milledgeville' } },
  { slug: 'thomasville',   name: 'Thomasville',   tier: 4, match: { city: 'thomasville' } },
  { slug: 'waycross',      name: 'Waycross',      tier: 4, match: { city: 'waycross' } },
  { slug: 'jesup',         name: 'Jesup',         tier: 4, match: { city: 'jesup' } },
  { slug: 'toccoa',        name: 'Toccoa',        tier: 4, match: { city: 'toccoa' } },
  { slug: 'americus',      name: 'Americus',      tier: 4, match: { city: 'americus' } },
  { slug: 'douglas',       name: 'Douglas',       tier: 4, match: { city: 'douglas' } },
  { slug: 'fitzgerald',    name: 'Fitzgerald',    tier: 4, match: { city: 'fitzgerald' } },
  { slug: 'cordele',       name: 'Cordele',       tier: 4, match: { city: 'cordele' } },
  { slug: 'bainbridge',    name: 'Bainbridge',    tier: 4, match: { city: 'bainbridge' } },
  { slug: 'moultrie',      name: 'Moultrie',      tier: 4, match: { city: 'moultrie' } },
  { slug: 'vidalia',       name: 'Vidalia',       tier: 4, match: { city: 'vidalia' } },
];

// Listings that belong on a given city/neighborhood page.
export function listingsForCity(entry, spas) {
  const m = entry.match || {};
  return spas.filter(s =>
    (m.city && s.city === m.city) ||
    (m.neighborhood && s.neighborhood === m.neighborhood)
  );
}
