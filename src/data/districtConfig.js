// Groups of districts that share one administrative boundary and are displayed merged
export const DISTRICT_GROUPS = {
  'Nord Stadt': {
    members: ['Alt-Wolfsburg', 'Teichbreite', 'Tiergartenbreite', 'Kreuzheide'],
    color: '#b53e2a',
  },
  'Kästorf-Sandkamp': {
    members: ['Kästorf', 'Sandkamp'],
    color: '#2a3eb5',
    labelPerPart: true,
  },
  'Stadt-Mitte': {
    members: ['Heßlingen', 'Rothenfelde', 'Stadtmitte', 'Schillerteich', 'Hellwinkel', 'Steimker Gärten', 'Steimker Berg', 'Köhlerberg'],
    color: '#4838a8',
  },
  'Mitte-West': {
    members: ['Rabenberg', 'Klieversberg', 'Hohenstein', 'Wohltberg', 'Hageberg', 'Laagberg', 'Eichelkamp'],
    color: '#309130',
  },
  'Fallersleben-Sülfeld': {
    members: ['Fallersleben', 'Sülfeld'],
    color: '#b5b52a',
  },
  'Ehmen-Mörse': {
    members: ['Ehmen', 'Mörse'],
    color: '#a88838',
  },
  'Hattorf-Heiligendorf': {
    members: ['Hattorf', 'Heiligendorf'],
    color: '#68a838',
  },
  'Almke-Neindorf': {
    members: ['Almke', 'Neindorf'],
    color: '#9c2424',
  },
  'Barnstorf-Nordsteimke': {
    members: ['Barnstorf', 'Nordsteimke'],
    color: '#914c30',
  },
  'Neuhaus-Reislingen': {
    members: ['Neuhaus', 'Reislingen'],
    color: '#2a66b5',
  },
  'Brackstedt-Velstove-Warmenau': {
    members: ['Brackstedt', 'Velstove', 'Warmenau'],
    color: '#b5662a',
  },
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
