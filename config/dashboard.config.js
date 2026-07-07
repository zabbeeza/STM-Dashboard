// ─────────────────────────────────────────────────────────────────────────────
//  Dashboard configuration
//
//  Everything that describes *what* the display shows lives here: the five
//  lanes (columns), which STM stop/routes feed each one, the per-lane journey
//  destinations (with optional transfer/metro legs), the ticker feed list, and
//  colours / poll intervals. Point `stopId`/`stopCode` at real STM GTFS stops
//  to go live; the values below match the design mock.
//
//  STM stop reference (fill `gtfsStopId` from stops.txt once you download the
//  static feed — the simulator ignores it and keys on `id`):
//    de Monkland / Hingston .......... Monkland lanes (routes 103, 162)
//    Notre-Dame-de-Grâce / Hampton ... NDG lane (route 138)
//    Sherbrooke / Hingston ........... Sherbrooke lanes (route 105, 138)
// ─────────────────────────────────────────────────────────────────────────────

/** Route badge colours (match the design mock). */
export const routeColors = {
  '103': { bg: '#2f7be0', fg: '#ffffff' }, // blue
  '105': { bg: '#2f7be0', fg: '#ffffff' }, // blue
  '163': { bg: '#2f5fb0', fg: '#ffffff' }, // medium blue
  '162': { bg: '#1e3a7a', fg: '#dfe8ff' }, // darker blue
  '138': { bg: '#4a3aa0', fg: '#e6e0ff' }, // indigo / purple
  _default: { bg: '#39414d', fg: '#e8edf5' },
};

/** Urgency thresholds (minutes) → box state. Neutral is the fallback. */
export const urgency = {
  redUnderMin: 5, // < 5 min  → red, must flash
  greenUnderMin: 15, // 5–15 min → green
  // otherwise → neutral grey
};

/**
 * The three street sections and how they span the five lanes.
 * `span` lists the lane ids covered by the hanging blue tab.
 */
export const sections = [
  { id: 'monkland', label: 'MONKLAND', span: ['monkland-west', 'monkland-east'] },
  { id: 'ndg', label: 'NDG', span: ['ndg-east'] },
  { id: 'sherbrooke', label: 'SHERBROOKE', span: ['sherbrooke-west', 'sherbrooke-east'] },
];

/**
 * The five lanes, left → right. Each lane is one STM stop + a direction.
 *   direction: 'W' (westbound, lane points down) | 'E' (eastbound, lane points up)
 *   stop:      { id, gtfsStopId, name } — origin stop for departures
 *   routes:    route short-names to include for this lane
 *   journeys:  computed destination ETAs shown outside the trapezoid
 *
 * A journey leg model (config-driven, chainable):
 *   { dest, label, route|routes, toStop, transfer? }
 *   transfer: { mode:'metro'|'bus', line?, fromStop, toStop, walkMin? }
 */
export const lanes = [
  {
    id: 'monkland-west',
    section: 'monkland',
    direction: 'W',
    stop: { id: 'MONKLAND_HINGSTON', gtfsStopId: '', name: 'de Monkland / Hingston' },
    routes: ['103', '162'],
    journeys: [
      { dest: 'BIALIK', route: '162', toStop: { id: 'KILDARE_KILDARE', gtfsStopId: '', name: 'Kildare / Kildare' } },
      { dest: 'MO-WEST', route: '162', toStop: { id: 'SHERBROOKE_WESTMINSTER', gtfsStopId: '', name: 'Sherbrooke / Westminster' } },
    ],
  },
  {
    id: 'monkland-east',
    section: 'monkland',
    direction: 'E',
    stop: { id: 'MONKLAND_HINGSTON', gtfsStopId: '', name: 'de Monkland / Hingston' },
    routes: ['103', '162'],
    journeys: [
      {
        dest: 'CONCORDIA',
        routes: ['103', '162'],
        toStop: { id: 'VILLA_MARIA_BUS', gtfsStopId: '', name: 'Villa-Maria (bus)' },
        transfer: {
          mode: 'metro',
          line: 'orange',
          walkMin: 3,
          fromStop: { id: 'VILLA_MARIA_METRO', gtfsStopId: '', name: 'Villa-Maria' },
          toStop: { id: 'GUY_CONCORDIA', gtfsStopId: '', name: 'Guy-Concordia' },
        },
      },
    ],
  },
  {
    id: 'ndg-east',
    section: 'ndg',
    direction: 'E',
    stop: { id: 'NDG_HAMPTON', gtfsStopId: '', name: 'Notre-Dame-de-Grâce / Hampton' },
    routes: ['138'],
    journeys: [
      { dest: 'DAWSON', route: '138', toStop: { id: 'COLLEGE_DAWSON', gtfsStopId: '', name: 'Collège Dawson' } },
    ],
  },
  {
    id: 'sherbrooke-west',
    section: 'sherbrooke',
    direction: 'W',
    stop: { id: 'SHERBROOKE_HINGSTON', gtfsStopId: '', name: 'Sherbrooke / Hingston' },
    routes: ['105', '138'],
    // Route 105 westbound terminus = Montréal-Ouest (Sherbrooke / Elmhurst = "Mo-West").
    journeys: [
      { dest: 'MO-WEST', route: '105', toStop: { id: 'SHERBROOKE_ELMHURST', gtfsStopId: '', name: 'Sherbrooke / Elmhurst' }, useLastTrip: true },
    ],
  },
  {
    id: 'sherbrooke-east',
    section: 'sherbrooke',
    direction: 'E',
    stop: { id: 'SHERBROOKE_HINGSTON', gtfsStopId: '', name: 'Sherbrooke / Hingston' },
    routes: ['105'],
    // Route 105 eastbound terminus = Station Vendôme.
    journeys: [
      { dest: 'VENDÔME', route: '105', toStop: { id: 'STATION_VENDOME', gtfsStopId: '', name: 'Station Vendôme' }, useLastTrip: true },
    ],
  },
];

/** Ticker feed sources, cycled in the marquee. */
export const ticker = {
  // (a) STM ServiceAlerts are injected automatically by the stm adapter.
  includeServiceAlerts: true,
  // (b) inspirational quotes
  quotes: [
    'The journey of a thousand miles begins beneath one’s feet.',
    'Wherever you go, go with all your heart.',
    'Life is a journey, not a destination.',
    'Not all those who wander are lost.',
    'A year from now you may wish you had started today.',
  ],
  // (c) breaking-news RSS feeds (Canada + Israel + world). Configurable.
  rssFeeds: [
    { name: 'CBC', url: 'https://www.cbc.ca/webfeed/rss/rss-topstories' },
    { name: 'CTV', url: 'https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009' },
    { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/' },
    { name: 'Reuters World', url: 'https://feeds.reuters.com/Reuters/worldNews' },
  ],
  maxHeadlines: 12, // cap per refresh
};

/** Poll intervals (ms) — how often the browser refreshes each data source. */
export const pollIntervals = {
  departures: 20_000, // GTFS-rt TripUpdates
  weather: 600_000, // 10 min
  crypto: 60_000, // 60 s
  ticker: 300_000, // 5 min
};

/** How many upcoming departures to render per lane. */
export const maxDeparturesPerLane = 4;

export default {
  routeColors,
  urgency,
  sections,
  lanes,
  ticker,
  pollIntervals,
  maxDeparturesPerLane,
};
