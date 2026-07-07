# STM Dashboard — Montreal household transit display

A real-time, wall-mounted Montreal transit dashboard that also runs full-screen
in any browser at the exact same layout. It renders on a fixed **1920×1080
(16:9)** canvas that scales to fit any viewport without reflowing, so a TV, a
tablet, or a laptop all show the identical design.

It shows five departure "lanes" across three streets, a seven-segment clock, a
weather widget, a BTC/USD widget with sparkline, and a scrolling news/alerts
ticker — all fed by swappable, config-driven data adapters.

---

## Quick start

```bash
git clone <this repo>
cd STM-Dashboard
npm install
cp .env.example .env      # optional — runs without any keys
npm start                 # → http://localhost:3000
```

Open **http://localhost:3000** and press F11 for full screen.

Out of the box (no API keys) the transit data comes from a **built-in schedule
simulator** that resembles the design mock, so the display is fully functional
immediately. Weather, BTC, and news headlines use keyless public APIs and go
live right away.

---

## Going live with real STM data

1. **Get a free STM developer key** — register at
   <https://www.stm.info/en/about/developers>, request access to the
   **GTFS-realtime** API, and copy your key.
2. In `.env`, set:
   ```ini
   STM_API_KEY=your_key_here
   STM_USE_SIMULATOR=false
   ```
3. **Map the stops.** Download the static feed once (the server does this
   automatically) and look up the real `stop_id` for each lane in `stops.txt`,
   then fill in `gtfsStopId` for every stop in `config/dashboard.config.js`
   (origin stops **and** journey destination stops). The stops used are:

   | Lane(s)                     | Stop                             | Routes    |
   |-----------------------------|----------------------------------|-----------|
   | Monkland West / East        | de Monkland / Hingston           | 103, 162  |
   | NDG East                    | Notre-Dame-de-Grâce / Hampton    | 138       |
   | Sherbrooke West / East      | Sherbrooke / Hingston            | 105, 138  |

4. Restart. The STM adapter now uses **GTFS-realtime TripUpdates** for live
   countdowns (falling back to the **static schedule** when a stop has no
   realtime prediction), and **ServiceAlerts** feed the ticker.

> The static GTFS feed needs no key. Realtime feeds send the key as the
> `apikey` HTTP header. Endpoint URLs are configurable in `.env` in case STM
> changes them.

---

## Architecture

```
config/dashboard.config.js   ← everything you'd tune: lanes, stops, routes,
                                journeys, ticker feeds, colours, poll intervals
server/
  index.js                   ← Express: holds the key, runs pollers, serves API
  adapters/                  ← one swappable module per data source
    stm.js                     GTFS static + realtime  (+ schedule simulator)
    weather.js                 Open-Meteo
    crypto.js                  CoinGecko BTC/USD + sparkline series
    ticker.js                  STM alerts + quotes + RSS news
  lib/
    gtfsStatic.js              download/parse/index the static GTFS zip
    gtfsRealtime.js            decode protobuf TripUpdates / Alerts / Vehicles
    journeys.js                config-driven journey-ETA computation (chained legs)
    store.js                   stale-tolerant last-known cache
public/                      ← the fixed-canvas frontend (vanilla, no build step)
  index.html  css/styles.css
  js/segclock.js  js/widgets.js  js/lanes.js  js/app.js
```

**Data flow.** The server polls each adapter on its own interval into a
stale-tolerant store; the browser polls small JSON endpoints
(`/api/departures`, `/api/weather`, `/api/crypto`, `/api/ticker`, `/api/config`)
and patches the DOM smoothly — never a full reload. If a source is down the
last-known value keeps rendering with a small amber **stale** dot.

**Swapping a data source** is just editing one adapter module; each exposes a
single clean function (`getDepartures()`, `getWeather()`, `getCrypto()`,
`getTicker()`) returning a documented shape.

---

## The five lanes & journey ETAs

Each lane is a right-trapezoid pointing in its travel direction (eastbound up,
westbound down). The **soonest** departure of every lane lines up on a shared
horizontal centre line; later departures fan toward the wide end. Box colour is
urgency-coded: **< 5 min red (flashing)**, **5–15 min green**, otherwise grey.

Outside each trapezoid sits a **destination ETA** — the clock time you'd reach a
place if you boarded the indicated bus now, computed by chaining legs. These are
fully config-driven (`journeys` in the config), including transfer/metro legs:

| Lane            | Destination | Journey                                                        |
|-----------------|-------------|----------------------------------------------------------------|
| Monkland West   | BIALIK      | 162 → Kildare / Kildare                                        |
| Monkland West   | MO-WEST     | 162 → Sherbrooke / Westminster                                |
| Monkland East   | CONCORDIA   | 103/162 → Villa-Maria, **transfer** Orange line → Guy-Concordia |
| NDG East        | DAWSON      | 138 → Collège Dawson                                          |
| Sherbrooke West | MO-WEST     | 105 → Sherbrooke / Elmhurst (105 west terminus)               |
| Sherbrooke East | VENDÔME     | 105 → Station Vendôme (105 east terminus)                     |

In live mode, bus ride times are derived from the boarded trip's GTFS
`stop_times`; the metro/transfer leg uses a configurable estimate
(`transfer.estMinutes`, `walkMin`). All estimates are overridable per journey.

> Note: the design mock assigns Sherbrooke West→MO-WEST and East→VENDÔME, which
> matches route 105's actual termini (Montréal-Ouest west, Vendôme east). Flip
> the two `journeys` entries in the config if you prefer the other convention.

---

## Configuration reference (`config/dashboard.config.js`)

- **`lanes`** — the five columns: origin stop, direction, route filter, and
  `journeys`. Add/remove lanes or change stops here.
- **`sections`** — the hanging blue tabs and which lanes they span.
- **`routeColors`** — badge colours per route (103/105 blue, 163 medium blue,
  162 dark blue, 138 indigo).
- **`urgency`** — the red/green minute thresholds.
- **`ticker`** — quotes list + RSS feeds (Canada + Israel + world) + whether to
  include STM ServiceAlerts.
- **`pollIntervals`** — refresh cadence (departures ~20s, weather 10min, BTC
  60s, ticker 5min).
- **`maxDeparturesPerLane`** — rows per lane.

Environment variables (API keys, coordinates, endpoint URLs, simulator toggle)
live in `.env` — see [`.env.example`](.env.example).

---

## Live behaviour

- Clock ticks every second with a blinking colon; `< 5 min` boxes flash.
- Lane chevrons drift continuously in the travel direction.
- When a bus departs (countdown hits 0), its box slides out along the lane and
  the stack re-flows so the new soonest snaps to the centre line.
- Every source degrades gracefully to last-known + a stale indicator.

## Tech

Node ≥ 18, Express, `gtfs-realtime-bindings` (protobuf), `adm-zip`, `dotenv`.
Frontend is dependency-free vanilla JS/CSS — no build step.

## License

MIT
