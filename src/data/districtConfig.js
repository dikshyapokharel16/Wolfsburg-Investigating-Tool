// Groups of districts that share one administrative boundary and are displayed merged
// population2020: aggregated from Q1 2020 quarterly overview (31.03.2020), Stadt Wolfsburg
// population2023: from Wikipedia / Stadt Wolfsburg Bevölkerungsbericht (31.12.2023)
// avgAge: population-weighted average age — source: mein.wolfsburg.de (30.09.2025)
// rentPerSqm: avg rent €/m² — source: Wolfsburg Mietspiegel 2026 (official rent index)
export const DISTRICT_GROUPS = {
  'Nord Stadt': {
    members: ['Alt-Wolfsburg', 'Teichbreite', 'Tiergartenbreite', 'Kreuzheide'],
    color: '#b53e2a',
    population2020: 9705,
    population2023: 9678,
    avgAge: 45.6,
    rentPerSqm: 9.13,
  },
  'Kästorf-Sandkamp': {
    members: ['Kästorf', 'Sandkamp'],
    color: '#2a3eb5',
    labelPerPart: true,
    population2020: 1948,
    population2023: 1949,
    avgAge: 43.4,
    rentPerSqm: 9.39,
  },
  'Stadt-Mitte': {
    members: ['Heßlingen', 'Rothenfelde', 'Stadtmitte', 'Schillerteich', 'Hellwinkel', 'Steimker Gärten', 'Steimker Berg', 'Köhlerberg'],
    color: '#4838a8',
    population2020: 16068,
    population2023: 17667,
    avgAge: 42.2,
    rentPerSqm: 9.76,
  },
  'Mitte-West': {
    members: ['Rabenberg', 'Klieversberg', 'Hohenstein', 'Wohltberg', 'Hageberg', 'Laagberg', 'Eichelkamp'],
    color: '#309130',
    population2020: 18407,
    population2023: 18425,
    avgAge: 43.0,
    rentPerSqm: 8.72,
  },
  'Fallersleben-Sülfeld': {
    members: ['Fallersleben', 'Sülfeld'],
    color: '#b5b52a',
    population2020: 13834,
    population2023: 14375,
    avgAge: 46.0,
    rentPerSqm: 9.82,
  },
  'Ehmen-Mörse': {
    members: ['Ehmen', 'Mörse'],
    color: '#a88838',
    population2020: 9527,
    population2023: 9398,
    avgAge: 44.6,
    rentPerSqm: 11.40,
  },
  'Hattorf-Heiligendorf': {
    members: ['Hattorf', 'Heiligendorf'],
    color: '#68a838',
    population2020: 4415,
    population2023: 4510,
    avgAge: 42.7,
    rentPerSqm: 8.54,
  },
  'Almke-Neindorf': {
    members: ['Almke', 'Neindorf'],
    color: '#9c2424',
    population2020: 2059,
    population2023: 2087,
    avgAge: 43.3,
    rentPerSqm: 8.93,
  },
  'Barnstorf-Nordsteimke': {
    members: ['Barnstorf', 'Nordsteimke'],
    color: '#914c30',
    population2020: 3968,
    population2023: 3503,
    avgAge: 44.8,
    rentPerSqm: 9.35,
  },
  'Neuhaus-Reislingen': {
    members: ['Neuhaus', 'Reislingen'],
    color: '#2a66b5',
    population2020: 7612,
    population2023: 7581,
    avgAge: 45.8,
    rentPerSqm: 9.95,
  },
  'Brackstedt-Velstove-Warmenau': {
    members: ['Brackstedt', 'Velstove', 'Warmenau'],
    color: '#b5662a',
    population2020: 3551,
    population2023: 3817,
    avgAge: 40.1,
    rentPerSqm: 8.88,
  },
}

// Standalone Ortschaften (not merged with others)
// avgAge source: mein.wolfsburg.de (30.09.2025)
// rentPerSqm source: Wolfsburg Mietspiegel 2026
export const STANDALONE_POPULATIONS = {
  Detmerode:  { population2020: 7311, population2023: 7902, avgAge: 45.6, rentPerSqm: 8.27 },
  Hehlingen:  { population2020: 1798, population2023: 1772, avgAge: 45.9, rentPerSqm: null },
  Vorsfelde:  { population2020: 12587, population2023: 12389, avgAge: 44.9, rentPerSqm: 8.77 },
  Westhagen:  { population2020: 9071, population2023: 9141, avgAge: 39.4, rentPerSqm: 7.78 },
  Wendschott: { population2020: 3730, population2023: 4037, avgAge: 41.5, rentPerSqm: 11.67 },
}

// Reverse lookup: district name → group name
export const DISTRICT_TO_GROUP = Object.fromEntries(
  Object.entries(DISTRICT_GROUPS).flatMap(([group, { members }]) =>
    members.map(m => [m, group])
  )
)

export const DISTRICTS = [
  { name: 'Almke',             color: '#9c2424' },
  { name: 'Alt-Wolfsburg',     color: '#b53e2a' },
  { name: 'Barnstorf',         color: '#914c30' },
  { name: 'Brackstedt',        color: '#b5662a' },
  { name: 'Detmerode',         color: '#9c6924' },
  { name: 'Ehmen',             color: '#a88838' },
  { name: 'Eichelkamp',        color: '#9c8b24' },
  { name: 'Fallersleben',      color: '#b5b52a' },
  { name: 'Hageberg',          color: '#839130' },
  { name: 'Hattorf',           color: '#8eb52a' },
  { name: 'Hehlingen',         color: '#699c24' },
  { name: 'Heiligendorf',      color: '#68a838' },
  { name: 'Hellwinkel',        color: '#479c24' },
  { name: 'Heßlingen',         color: '#3eb52a' },
  { name: 'Hohenstein',        color: '#309130' },
  { name: 'Klieversberg',      color: '#2ab53e' },
  { name: 'Kreuzheide',        color: '#249c47' },
  { name: 'Kästorf',           color: '#38a868' },
  { name: 'Köhlerberg',        color: '#249c69' },
  { name: 'Laagberg',          color: '#2ab58e' },
  { name: 'Mörse',             color: '#309183' },
  { name: 'Neindorf',          color: '#2ab5b5' },
  { name: 'Neuhaus',           color: '#248b9c' },
  { name: 'Nordsteimke',       color: '#3888a8' },
  { name: 'Rabenberg',         color: '#24699c' },
  { name: 'Reislingen',        color: '#2a66b5' },
  { name: 'Rothenfelde',       color: '#304c91' },
  { name: 'Sandkamp',          color: '#2a3eb5' },
  { name: 'Schillerteich',     color: '#24249c' },
  { name: 'Stadtmitte',        color: '#4838a8' },
  { name: 'Steimker Berg',     color: '#47249c' },
  { name: 'Steimker Gärten',   color: '#662ab5' },
  { name: 'Sülfeld',           color: '#673091' },
  { name: 'Teichbreite',       color: '#8e2ab5' },
  { name: 'Tiergartenbreite',  color: '#8b249c' },
  { name: 'Velstove',          color: '#a838a8' },
  { name: 'Volkswagenwerk',    color: '#9c248b' },
  { name: 'Vorsfelde',         color: '#b52a8e' },
  { name: 'Warmenau',          color: '#913067' },
  { name: 'Wendschott',        color: '#b52a66' },
  { name: 'Westhagen',         color: '#9c2447' },
  { name: 'Wohltberg',         color: '#a83848' },
]

export const DISTRICT_COLORS = Object.fromEntries(DISTRICTS.map(d => [d.name, d.color]))
