// ─────────────────────────────────────────────────────────────────────────────
//  STM transit adapter
//
//  Swappable adapter with a clean interface:
//     getDepartures()  → { lanes: [...], alerts: [...], mode, generatedAt }
//
//  Two modes, chosen automatically:
//    • live      — GTFS static (schedule) + GTFS-realtime TripUpdates for live
//                  countdowns, ServiceAlerts for the ticker. Requires STM_API_KEY.
//                  Minutes come from realtime, falling back to static schedule.
//    • simulator — a self-contained schedule generator that produces data
//                  resembling the design mock so the dashboard works with no key.
//
//  Both modes return the same shape and compute journey ETAs via lib/journeys.
// ─────────────────────────────────────────────────────────────────────────────

import { lanes as laneConfig, urgency, maxDeparturesPerLane } from '../../config/dashboard.config.js';
import { computeJourneyEta, makeGtfsRideResolver, toClock } from '../lib/journeys.js';
import * as gtfsStatic from '../lib/gtfsStatic.js';
import * as gtfsRt from '../lib/gtfsRealtime.js';

const TZ = process.env.WEATHER_TIMEZONE || 'America/Toronto';

function useSimulator() {
  const flag = String(process.env.STM_USE_SIMULATOR || '').toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  // default: simulate unless a realtime key is present
  return !process.env.STM_API_KEY;
}

function urgencyState(minutes) {
  if (minutes < urgency.redUnderMin) return 'red';
  if (minutes < urgency.greenUnderMin) return 'green';
  return 'neutral';
}

// ── Simulator ────────────────────────────────────────────────────────────────
// Per-lane headways (minutes) and a route rotation. State persists across polls
// so departures count down smoothly and re-flow as buses leave.
const SIM_HEADWAY = {
  'monkland-west': 5.5,
  'monkland-east': 5,
  'ndg-east': 11,
  'sherbrooke-west': 5,
  'sherbrooke-east': 5,
};

const simState = new Map(); // laneId -> [{ route, arrivalMs, tripId }]
let simSeq = 1000;

function seedLane(lane, now) {
  const headwayMs = (SIM_HEADWAY[lane.id] || 6) * 60_000;
  const routes = lane.routes;
  const list = [];
  // First bus 2–4 min out, then spaced by headway with mild jitter.
  let t = now + (2 + Math.random() * 2) * 60_000;
  for (let i = 0; i < maxDeparturesPerLane; i++) {
    list.push({
      route: routes[i % routes.length],
      arrivalMs: Math.round(t),
      tripId: `SIM-${lane.id}-${simSeq++}`,
    });
    t += headwayMs * (0.85 + Math.random() * 0.3);
  }
  return list;
}

function stepLane(lane, now) {
  let list = simState.get(lane.id);
  if (!list) { list = seedLane(lane, now); simState.set(lane.id, list); return list; }
  // Drop departed buses (arrival in the past).
  list = list.filter((d) => d.arrivalMs > now - 1000);
  // Top up from the far end.
  const headwayMs = (SIM_HEADWAY[lane.id] || 6) * 60_000;
  while (list.length < maxDeparturesPerLane) {
    const last = list[list.length - 1];
    const base = last ? last.arrivalMs : now + 3 * 60_000;
    const nextRouteIdx = list.length % lane.routes.length;
    list.push({
      route: lane.routes[nextRouteIdx],
      arrivalMs: Math.round(base + headwayMs * (0.85 + Math.random() * 0.3)),
      tripId: `SIM-${lane.id}-${simSeq++}`,
    });
  }
  simState.set(lane.id, list);
  return list;
}

function buildLaneOutput(lane, rawDepartures, now, ctx = {}) {
  const departures = rawDepartures
    .slice()
    .sort((a, b) => a.arrivalMs - b.arrivalMs)
    .slice(0, maxDeparturesPerLane)
    .map((d) => {
      const minutes = Math.max(0, Math.round((d.arrivalMs - now) / 60_000));
      return {
        route: d.route,
        direction: lane.direction,
        minutes,
        time: toClock(d.arrivalMs, TZ),
        state: urgencyState(minutes),
        tripId: d.tripId,
      };
    });

  // Journey ETAs — board the soonest departure matching each journey's route filter.
  const journeys = (lane.journeys || []).map((journey) => {
    const allowed = journey.routes || (journey.route ? [journey.route] : lane.routes);
    const pool = rawDepartures.filter((d) => allowed.includes(d.route)).sort((a, b) => a.arrivalMs - b.arrivalMs);
    // `useLastTrip` (route termini) → base on the last listed trip instead of the soonest.
    const boarded = journey.useLastTrip ? pool[pool.length - 1] : pool[0];
    if (!boarded) return { dest: journey.dest, time: '--:--', etaEpoch: null };
    const resolver = ctx.gtfsIndex ? makeGtfsRideResolver(ctx.gtfsIndex, boarded.tripId, lane.stop.gtfsStopId) : null;
    return computeJourneyEta(boarded.arrivalMs, journey, { tz: TZ, rideMinutesResolver: resolver });
  });

  return { laneId: lane.id, direction: lane.direction, departures, journeys };
}

async function getDeparturesSimulated() {
  const now = Date.now();
  const lanes = laneConfig.map((lane) => buildLaneOutput(lane, stepLane(lane, now), now));
  return {
    mode: 'simulator',
    generatedAt: now,
    lanes,
    alerts: [], // service alerts come from the ticker adapter in sim mode
  };
}

// Best-effort static-schedule fallback: next departures for a stop straight
// from stop_times.txt (today, ignoring calendar exceptions — good enough as a
// stopgap when realtime is unavailable). Returns the same raw shape as live.
function staticDepartures(gtfsIndex, lane, now, stopId) {
  const times = gtfsIndex.timesByStop.get(stopId);
  if (!times) return [];
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const base = midnight.getTime();
  const out = [];
  for (const st of times) {
    const hms = st.departure_time || st.arrival_time;
    if (!hms) continue;
    const [h, m, s] = hms.split(':').map(Number); // GTFS hours can exceed 24
    const arrivalMs = base + ((h * 3600 + m * 60 + (s || 0)) * 1000);
    if (arrivalMs <= now - 1000) continue;
    const trip = gtfsIndex.tripById.get(st.trip_id);
    const route = gtfsIndex.routeById.get(trip?.route_id)?.route_short_name;
    if (!route || !lane.routes.includes(route)) continue;
    out.push({ route, arrivalMs, tripId: st.trip_id });
  }
  return out.sort((a, b) => a.arrivalMs - b.arrivalMs).slice(0, maxDeparturesPerLane);
}

// ── Live mode ─────────────────────────────────────────────────────────────────
// Uses realtime TripUpdates keyed by GTFS stop_id, falling back to static
// schedule when a stop has no realtime predictions.
async function getDeparturesLive() {
  const now = Date.now();
  const staticUrl = process.env.STM_GTFS_STATIC_URL;
  const rtUrl = process.env.STM_GTFS_RT_TRIPUPDATES_URL;
  const apiKey = process.env.STM_API_KEY;

  const gtfsIndex = await gtfsStatic.load(staticUrl);

  // Accept EITHER a GTFS stop_id or the public 5-digit stop number (stop_code):
  // whatever you put in `gtfsStopId`, resolve it to the real stop_id used by the
  // realtime feed. So the number printed on the bus-stop sign works directly.
  const resolveStopId = (cfgId) => {
    if (!cfgId) return null;
    if (gtfsIndex.stopById.has(cfgId)) return cfgId;
    const byCode = gtfsIndex.stopByCode.get(cfgId);
    return byCode ? byCode.stop_id : cfgId;
  };

  const wantStopIds = new Set();
  for (const lane of laneConfig) {
    const id = resolveStopId(lane.stop.gtfsStopId);
    if (id) wantStopIds.add(id);
  }

  let rtByStop = new Map();
  try {
    rtByStop = await gtfsRt.tripUpdates(rtUrl, apiKey, wantStopIds);
  } catch (e) {
    // realtime down → static-only; surfaced as stale by the store.
    rtByStop = new Map();
  }

  const routeShortById = gtfsIndex.routeById;

  const lanes = laneConfig.map((lane) => {
    const stopId = resolveStopId(lane.stop.gtfsStopId);
    let preds = (rtByStop.get(stopId) || [])
      .map((p) => {
        const route = routeShortById.get(p.routeId)?.route_short_name || p.routeId;
        const at = (p.arrival || p.departure) * 1000;
        return { route, arrivalMs: at, tripId: p.tripId };
      })
      .filter((p) => lane.routes.includes(p.route) && p.arrivalMs > now - 1000);
    // Fall back to the static schedule when realtime has nothing for this stop.
    if (!preds.length) preds = staticDepartures(gtfsIndex, lane, now, stopId);
    return buildLaneOutput(lane, preds, now, { gtfsIndex });
  });

  let alerts = [];
  try {
    alerts = await gtfsRt.serviceAlerts(process.env.STM_GTFS_RT_ALERTS_URL, apiKey);
  } catch { /* alerts optional */ }

  return { mode: 'live', generatedAt: now, lanes, alerts };
}

export async function getDepartures() {
  return useSimulator() ? getDeparturesSimulated() : getDeparturesLive();
}

export default { getDepartures };
