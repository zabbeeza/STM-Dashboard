// Computes per-lane "destination ETA" journeys: the estimated clock time you'd
// reach a destination if you boarded the indicated bus now. Journeys are
// config-driven (origin stop, route filter, destination stop, optional
// transfer/metro leg) and legs are chained.
//
// Two travel-time sources:
//   • live  — derive ride minutes from GTFS static stop_times on the boarded
//             trip (origin stop_time → destination stop_time).
//   • est   — fall back to per-destination estimates (below) or a journey's
//             explicit `estMinutes` / transfer estimates.

// Default ride-time estimates (minutes) used when GTFS timing isn't available.
// Override per journey with `estMinutes` (bus leg) in the config.
const DEFAULT_RIDE_MIN = {
  BIALIK: 21,
  'MO-WEST': 14, // matches mock: soonest 162 ~5 min out → arrives ~19 min later
  CONCORDIA: 9, // bus leg to Villa-Maria; metro leg added via transfer
  DAWSON: 15,
  VENDÔME: 22,
};

// Default transfer/metro estimates (minutes).
const DEFAULT_METRO_MIN = 6; // Villa-Maria → Guy-Concordia, Orange line
const DEFAULT_WALK_MIN = 3;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toClock(epochMs, tz) {
  const d = new Date(epochMs);
  // Use local time formatting via Intl for the configured timezone.
  const parts = new Intl.DateTimeFormat('en-CA', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh}:${mm}`;
}

/**
 * @param {number} boardEpochMs  when you board the origin bus (epoch ms)
 * @param {object} journey       journey config entry
 * @param {object} opts          { tz, rideMinutesResolver? }
 *   rideMinutesResolver(journey) → number|null  (live GTFS ride time)
 */
export function computeJourneyEta(boardEpochMs, journey, opts = {}) {
  const tz = opts.tz || 'America/Toronto';

  let rideMin = null;
  if (typeof opts.rideMinutesResolver === 'function') {
    rideMin = opts.rideMinutesResolver(journey);
  }
  if (rideMin == null) {
    rideMin = journey.estMinutes ?? DEFAULT_RIDE_MIN[journey.dest] ?? 15;
  }

  let totalMin = rideMin;
  if (journey.transfer) {
    const walk = journey.transfer.walkMin ?? DEFAULT_WALK_MIN;
    const metro = journey.transfer.estMinutes ?? DEFAULT_METRO_MIN;
    totalMin += walk + metro;
  }

  const etaEpoch = boardEpochMs + totalMin * 60_000;
  return {
    dest: journey.dest,
    time: toClock(etaEpoch, tz),
    etaEpoch,
    totalMinutes: Math.round(totalMin),
  };
}

/**
 * Build a GTFS-based ride-time resolver for one boarded trip.
 * Returns null when timing can't be derived (caller falls back to estimates).
 */
export function makeGtfsRideResolver(gtfsIndex, tripId, originStopId) {
  if (!gtfsIndex || !tripId) return null;
  return (journey) => {
    const times = gtfsIndex.timesByTrip.get(tripId);
    if (!times) return null;
    const destStopId = journey.toStop?.gtfsStopId;
    if (!destStopId) return null;
    const o = times.find((t) => t.stop_id === originStopId);
    const d = times.find((t) => t.stop_id === destStopId);
    if (!o || !d) return null;
    const toSec = (hms) => {
      const [h, m, s] = hms.split(':').map(Number);
      return h * 3600 + m * 60 + s;
    };
    const diff = (toSec(d.arrival_time || d.departure_time) - toSec(o.departure_time || o.arrival_time)) / 60;
    return diff > 0 ? diff : null;
  };
}

export { toClock };
export default { computeJourneyEta, makeGtfsRideResolver, toClock };
