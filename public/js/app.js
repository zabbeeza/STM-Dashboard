// Orchestrator: scales the fixed canvas to the viewport, ticks the clock live,
// polls each data source on its own interval, and pushes updates into the DOM
// without full reloads. Every source degrades gracefully — a failed fetch keeps
// the last-known render and flips a small stale indicator.

import { createSegClock } from './segclock.js';
import { renderWeatherIcon, renderSparkline, formatUsd } from './widgets.js';
import { buildBoard, updateDepartures } from './lanes.js';

// ── Fit the 1920×1080 stage into the viewport ────────────────────────────────
function fitStage() {
  const stage = document.getElementById('stage');
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${s})`;
}
window.addEventListener('resize', fitStage);
fitStage();

// ── Live clock ───────────────────────────────────────────────────────────────
const clock = createSegClock(document.getElementById('seg-clock'));
const ampmEl = document.getElementById('clock-ampm');
function tickClock() {
  const now = new Date();
  const ampm = clock.update(now, now.getSeconds() % 2 === 0);
  ampmEl.textContent = ampm;
}
setInterval(tickClock, 500);
tickClock();

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function setStale(id, stale) {
  const el = document.getElementById(id);
  if (el) el.hidden = !stale;
}

// ── Data updaters ─────────────────────────────────────────────────────────────
async function refreshDepartures() {
  try {
    const snap = await getJson('/api/departures');
    if (snap.data) updateDepartures(snap.data);
    setStale('departures-stale', snap.stale || !snap.data);
  } catch { setStale('departures-stale', true); }
}

async function refreshWeather() {
  try {
    const snap = await getJson('/api/weather');
    const w = snap.data;
    if (w) {
      document.getElementById('weather-temp').textContent = `${w.temp}°`;
      document.getElementById('weather-sub').textContent = `HIGH ${w.high}° · ${w.phrase}`;
      renderWeatherIcon(document.getElementById('weather-icon'), w.icon);
    }
    setStale('weather-stale', snap.stale || !w);
  } catch { setStale('weather-stale', true); }
}

async function refreshCrypto() {
  try {
    const snap = await getJson('/api/crypto');
    const c = snap.data;
    if (c) {
      document.getElementById('btc-label').textContent = c.pair;
      document.getElementById('btc-price').textContent = formatUsd(c.price);
      renderSparkline(document.getElementById('btc-spark'), c.series);
    }
    setStale('btc-stale', snap.stale || !c);
  } catch { setStale('btc-stale', true); }
}

let lastTickerKey = '';
async function refreshTicker() {
  try {
    const snap = await getJson('/api/ticker');
    const items = snap.data || [];
    const key = items.map((i) => i.text).join('|');
    if (items.length && key !== lastTickerKey) {
      lastTickerKey = key;
      renderTicker(items);
    }
  } catch { /* keep current marquee */ }
}

function renderTicker(items) {
  const track = document.getElementById('ticker-track');
  const one = items.map((i) => `<span class="tk-item">${escapeHtml(i.text)}</span>`).join('<span class="tk-sep">◆</span>');
  // Duplicate the content so the -50% marquee loop is seamless.
  const block = `${one}<span class="tk-sep">◆</span>`;
  track.innerHTML = block + block;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async function boot() {
  let config;
  try {
    config = await getJson('/api/config');
  } catch (e) {
    console.error('Failed to load config', e);
    return;
  }
  buildBoard(config);

  const iv = config.pollIntervals || {};
  await Promise.allSettled([refreshDepartures(), refreshWeather(), refreshCrypto(), refreshTicker()]);

  setInterval(refreshDepartures, iv.departures || 20000);
  setInterval(refreshWeather, iv.weather || 600000);
  setInterval(refreshCrypto, iv.crypto || 60000);
  setInterval(refreshTicker, iv.ticker || 300000);
})();
