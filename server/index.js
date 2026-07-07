// STM Dashboard server.
//
// Holds the STM API key, runs each data adapter on its own poll interval into a
// stale-tolerant store, and serves both the static frontend and a small JSON
// API. If a source is down we keep serving the last-known value with a `stale`
// flag so the always-on display never blanks out.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import store from './lib/store.js';
import stm from './adapters/stm.js';
import weather from './adapters/weather.js';
import crypto from './adapters/crypto.js';
import ticker from './adapters/ticker.js';
import {
  sections, lanes, routeColors, urgency, pollIntervals, maxDeparturesPerLane,
} from '../config/dashboard.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);

const app = express();
// Never cache the frontend assets: this is an always-on display, and stale
// cached CSS/JS is the usual reason a pulled change "doesn't take effect".
app.use(express.static(PUBLIC_DIR, {
  etag: false,
  lastModified: false,
  cacheControl: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  },
}));

// ── Config for the frontend (no secrets) ─────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    sections,
    lanes: lanes.map((l) => ({
      id: l.id,
      section: l.section,
      direction: l.direction,
      stopName: l.stop.name,
      routes: l.routes,
      journeys: (l.journeys || []).map((j) => ({ dest: j.dest })),
    })),
    routeColors,
    urgency,
    pollIntervals,
    maxDeparturesPerLane,
  });
});

// ── Data endpoints (served from the stale-tolerant store) ────────────────────
app.get('/api/departures', (_req, res) => res.json(store.snapshot('departures', pollIntervals.departures * 3)));
app.get('/api/weather', (_req, res) => res.json(store.snapshot('weather', pollIntervals.weather * 2)));
app.get('/api/crypto', (_req, res) => res.json(store.snapshot('crypto', pollIntervals.crypto * 3)));
app.get('/api/ticker', (_req, res) => res.json(store.snapshot('ticker', pollIntervals.ticker * 2)));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    stmMode: store.get('departures')?.value?.mode || 'unknown',
    sources: {
      departures: !!store.get('departures')?.value,
      weather: !!store.get('weather')?.value,
      crypto: !!store.get('crypto')?.value,
      ticker: !!store.get('ticker')?.value,
    },
  });
});

// ── Background pollers ────────────────────────────────────────────────────────
function poller(key, fn, intervalMs, immediate = true) {
  const run = async () => {
    try { store.put(key, await fn()); }
    catch (e) { store.fail(key, e); console.error(`[poll:${key}]`, e.message); }
  };
  if (immediate) run();
  return setInterval(run, intervalMs);
}

function startPollers() {
  poller('departures', () => stm.getDepartures(), pollIntervals.departures);
  poller('weather', () => weather.getWeather(), pollIntervals.weather);
  poller('crypto', () => crypto.getCrypto(), pollIntervals.crypto);
  // Ticker depends on the latest STM alerts already in the store.
  poller('ticker', () => {
    const alerts = store.get('departures')?.value?.alerts || [];
    return ticker.getTicker(alerts);
  }, pollIntervals.ticker);
}

app.listen(PORT, () => {
  console.log(`STM Dashboard → http://localhost:${PORT}`);
  console.log(`STM mode: ${stm && (process.env.STM_USE_SIMULATOR !== 'false' && !process.env.STM_API_KEY ? 'simulator (no key)' : 'configured')}`);
  startPollers();
});
