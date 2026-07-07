// Fetches and decodes STM GTFS-realtime protobuf feeds using the official
// gtfs-realtime-bindings. Exposes helpers for the three feed types the
// dashboard uses: TripUpdates (live countdowns), ServiceAlerts (ticker), and
// VehiclePositions (optional).

import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

async function fetchFeed(url, apiKey) {
  const res = await fetch(url, {
    headers: apiKey ? { apikey: apiKey } : {},
  });
  if (!res.ok) throw new Error(`GTFS-rt fetch failed (${url}): HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return FeedMessage.decode(buf);
}

/**
 * Returns a map: `${stopId}` -> array of { tripId, routeId, stopId, arrival,
 * departure } predicted times (epoch seconds), for the requested stop ids.
 */
export async function tripUpdates(url, apiKey, wantStopIds) {
  const feed = await fetchFeed(url, apiKey);
  const byStop = new Map();
  const want = wantStopIds ? new Set(wantStopIds) : null;
  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu) continue;
    const routeId = tu.trip?.routeId;
    const tripId = tu.trip?.tripId;
    for (const stu of tu.stopTimeUpdate || []) {
      const stopId = stu.stopId;
      if (want && !want.has(stopId)) continue;
      const arrival = stu.arrival?.time ? Number(stu.arrival.time) : null;
      const departure = stu.departure?.time ? Number(stu.departure.time) : null;
      if (!byStop.has(stopId)) byStop.set(stopId, []);
      byStop.get(stopId).push({ tripId, routeId, stopId, arrival, departure });
    }
  }
  return byStop;
}

/** Returns simplified alert strings suitable for the ticker. */
export async function serviceAlerts(url, apiKey, lang = 'en') {
  const feed = await fetchFeed(url, apiKey);
  const out = [];
  for (const entity of feed.entity) {
    const a = entity.alert;
    if (!a) continue;
    const pick = (tr) => {
      if (!tr?.translation?.length) return '';
      const m = tr.translation.find((t) => t.language?.startsWith(lang));
      return (m || tr.translation[0]).text || '';
    };
    const header = pick(a.headerText);
    const desc = pick(a.descriptionText);
    const text = [header, desc].filter(Boolean).join(' — ');
    if (text) out.push(text);
  }
  return out;
}

export default { tripUpdates, serviceAlerts };
