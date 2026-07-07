// Builds the central board (tabs + five trapezoid lanes) and renders live
// departures. Boxes are keyed by tripId so that when a bus departs it slides
// out along the travel direction and the remaining stack re-flows, snapping the
// new soonest departure onto the shared centre line.

const CENTER_FRAC = 0.50; // shared centre line (fraction of board height)
const BOX_H = 64;
const SLOT = 72; // box height + gap

const chevronSvg = (dir) => {
  // down chevron for W, up chevron for E
  const d = dir === 'W' ? 'M6 4 L20 14 L34 4' : 'M6 14 L20 4 L34 14';
  return `<div class="chev"><svg viewBox="0 0 40 18"><path d="${d}"/></svg></div>`;
};

let cfg = null;
const laneEls = new Map(); // laneId -> { el, boxLayer, etaEl, boxes: Map(tripId->el) }

function badgeStyle(route) {
  const c = (cfg.routeColors && (cfg.routeColors[route] || cfg.routeColors._default)) || { bg: '#39414d', fg: '#fff' };
  return `background:linear-gradient(180deg, ${c.bg} 0%, ${shade(c.bg, -18)} 100%); color:${c.fg};`;
}
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (v * pct) / 100)));
  return `#${((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, '0')}`;
}

export function buildBoard(config) {
  cfg = config;
  const lanesRoot = document.getElementById('lanes');
  const tabsRoot = document.getElementById('tabs');
  lanesRoot.innerHTML = '';
  tabsRoot.innerHTML = '';
  laneEls.clear();

  const laneIndex = new Map(config.lanes.map((l, i) => [l.id, i]));
  const n = config.lanes.length;

  // Lanes
  for (const lane of config.lanes) {
    const el = document.createElement('div');
    el.className = 'lane';
    el.dataset.dir = lane.direction;
    el.dataset.lane = lane.id;
    el.style.setProperty('--center', (CENTER_FRAC * 100) + '%');

    el.innerHTML =
      `<div class="lane-shape"></div>` +
      `<div class="lane-chevrons">${chevronSvg(lane.direction)}${chevronSvg(lane.direction)}${chevronSvg(lane.direction)}</div>` +
      `<div class="lane-eta"></div>`;

    const boxLayer = document.createElement('div');
    boxLayer.className = 'box-layer';
    boxLayer.style.position = 'absolute';
    boxLayer.style.inset = '0';
    el.appendChild(boxLayer);

    lanesRoot.appendChild(el);
    laneEls.set(lane.id, { el, boxLayer, etaEl: el.querySelector('.lane-eta'), boxes: new Map() });
  }

  // Section tabs positioned over their spanned columns.
  for (const section of config.sections) {
    const idxs = section.span.map((id) => laneIndex.get(id)).filter((i) => i != null);
    if (!idxs.length) continue;
    const mid = (Math.min(...idxs) + Math.max(...idxs) + 1) / 2; // centre column boundary
    const pct = (mid / n) * 100;
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.style.left = pct + '%';
    tab.textContent = section.label;
    tabsRoot.appendChild(tab);
  }
}

function boxTop(dir, index, laneHeight) {
  const centerY = laneHeight * CENTER_FRAC;
  const base = centerY - BOX_H / 2;
  return dir === 'W' ? base - index * SLOT : base + index * SLOT;
}

function renderBox(el, dep) {
  el.className = `dep-box state-${dep.state}`;
  el.innerHTML =
    `<div class="dep-badge" style="${badgeStyle(dep.route)}">${dep.route}</div>` +
    `<div class="dep-dir">${dep.direction}</div>` +
    `<div class="dep-times">` +
      `<div class="dep-min">${dep.minutes}<span class="u">MIN</span></div>` +
      `<div class="dep-clock">${dep.time}</div>` +
    `</div>`;
}

export function updateDepartures(data) {
  if (!cfg || !data || !data.lanes) return;
  for (const laneData of data.lanes) {
    const ref = laneEls.get(laneData.laneId);
    if (!ref) continue;
    const dir = ref.el.dataset.dir;
    const laneHeight = ref.el.clientHeight || 768;
    const seen = new Set();

    laneData.departures.forEach((dep, i) => {
      seen.add(dep.tripId);
      let box = ref.boxes.get(dep.tripId);
      if (!box) {
        box = document.createElement('div');
        ref.boxLayer.appendChild(box);
        ref.boxes.set(dep.tripId, box);
        // Start slightly off the wide end so new arrivals slide in.
        box.style.top = boxTop(dir, laneData.departures.length + 1, laneHeight) + 'px';
        // force reflow so the transition to the real slot animates
        void box.offsetWidth;
      }
      renderBox(box, dep);
      box.style.top = boxTop(dir, i, laneHeight) + 'px';
    });

    // Depart: boxes no longer present slide out and fade.
    for (const [tripId, box] of ref.boxes) {
      if (!seen.has(tripId)) {
        box.classList.add('leaving');
        ref.boxes.delete(tripId);
        setTimeout(() => box.remove(), 650);
      }
    }

    // Journey ETA label(s).
    renderEta(ref.etaEl, laneData.journeys);
  }
}

function renderEta(el, journeys) {
  if (!journeys || !journeys.length) { el.innerHTML = ''; return; }
  const lines = journeys
    .map((j) => `<div class="eta-line"><span class="eta-dest">→ ${j.dest}</span> <span class="eta-time">${j.time}</span></div>`)
    .join('');
  el.innerHTML = `<div class="eta-head">Arrives</div>${lines}`;
}

export default { buildBoard, updateDepartures };
