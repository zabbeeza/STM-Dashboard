// A tiny in-memory cache that remembers the last good value for each key and
// tracks how stale it is. Adapters write on every successful poll; when a
// source is down we keep serving the last-known value with a `stale` flag so
// the UI can show a small indicator instead of crashing.

const entries = new Map();

export function put(key, value) {
  entries.set(key, { value, updatedAt: Date.now(), error: null });
  return value;
}

export function fail(key, error) {
  const prev = entries.get(key);
  if (prev) {
    prev.error = String(error && error.message ? error.message : error);
    prev.erroredAt = Date.now();
  } else {
    entries.set(key, { value: null, updatedAt: 0, error: String(error), erroredAt: Date.now() });
  }
}

export function get(key) {
  return entries.get(key) || null;
}

/**
 * Return the cached value wrapped with freshness metadata.
 * `maxAgeMs` decides when a value is considered stale.
 */
export function snapshot(key, maxAgeMs = 60_000) {
  const e = entries.get(key);
  if (!e || e.value == null) {
    return { data: null, stale: true, updatedAt: null, error: e ? e.error : 'no data yet' };
  }
  const age = Date.now() - e.updatedAt;
  return {
    data: e.value,
    stale: age > maxAgeMs,
    ageMs: age,
    updatedAt: e.updatedAt,
    error: e.error || null,
  };
}

export default { put, fail, get, snapshot };
