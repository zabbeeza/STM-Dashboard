// Loads and indexes the STM static GTFS feed (a zip of CSV files). Only the
// tables the dashboard needs are parsed: stops, routes, trips, stop_times,
// calendar. The feed is downloaded once, cached on disk, and refreshed daily.
//
// This module is only exercised when the STM adapter runs in live mode
// (STM_API_KEY set and STM_USE_SIMULATOR=false). In simulator mode it is never
// loaded, so the large download is avoided during local/demo use.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';

const CACHE_DIR = process.env.GTFS_CACHE_DIR || path.join(process.cwd(), 'data', 'gtfs');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // refresh daily

let index = null;
let loading = null;

function parseCsv(text) {
  // Minimal RFC-4180-ish CSV parser (handles quoted fields with commas/quotes).
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n') { record.push(field); rows.push(record); field = ''; record = []; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || record.length) { record.push(field); rows.push(record); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

async function downloadFeed(url) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const zipPath = path.join(CACHE_DIR, 'gtfs.zip');
  let fresh = false;
  try {
    const st = fs.statSync(zipPath);
    fresh = Date.now() - st.mtimeMs < MAX_AGE_MS;
  } catch { /* not cached */ }

  if (!fresh) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GTFS static download failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(zipPath, buf);
  }
  return zipPath;
}

function readTable(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) return [];
  return parseCsv(entry.getData().toString('utf8'));
}

/** Build an index of the tables the dashboard queries. */
async function build(url) {
  const zipPath = await downloadFeed(url);
  const zip = new AdmZip(zipPath);

  const stops = readTable(zip, 'stops.txt');
  const routes = readTable(zip, 'routes.txt');
  const trips = readTable(zip, 'trips.txt');
  const stopTimes = readTable(zip, 'stop_times.txt');

  const stopById = new Map();
  const stopByCode = new Map();
  for (const s of stops) {
    stopById.set(s.stop_id, s);
    if (s.stop_code) stopByCode.set(s.stop_code, s);
  }

  const routeByShortName = new Map();
  const routeById = new Map();
  for (const r of routes) {
    routeById.set(r.route_id, r);
    if (r.route_short_name) routeByShortName.set(r.route_short_name, r);
  }

  const tripById = new Map();
  for (const t of trips) tripById.set(t.trip_id, t);

  // stop_times grouped by stop and by trip (for downstream-stop lookups).
  const timesByStop = new Map();
  const timesByTrip = new Map();
  for (const st of stopTimes) {
    if (!timesByStop.has(st.stop_id)) timesByStop.set(st.stop_id, []);
    timesByStop.get(st.stop_id).push(st);
    if (!timesByTrip.has(st.trip_id)) timesByTrip.set(st.trip_id, []);
    timesByTrip.get(st.trip_id).push(st);
  }
  for (const list of timesByTrip.values()) {
    list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  }

  return { stopById, stopByCode, routeByShortName, routeById, tripById, timesByStop, timesByTrip };
}

export async function load(url) {
  if (index) return index;
  if (!loading) loading = build(url).then((idx) => { index = idx; return idx; });
  return loading;
}

export function isLoaded() {
  return !!index;
}

export default { load, isLoaded };
