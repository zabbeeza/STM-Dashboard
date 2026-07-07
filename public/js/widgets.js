// Weather + BTC widget rendering. Weather icons are inline SVG keyed by the
// adapter's icon name; the BTC sparkline is an SVG polyline over the recent
// price series.

const NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  sun: `<circle cx="46" cy="34" r="18" fill="#f4b63a"/>` +
       sunRays(),
  partly: sunRays(0.8) + `<circle cx="34" cy="28" r="14" fill="#f4b63a"/>` + cloud('#c3ccd8', 52, 40),
  cloud: cloud('#c3ccd8', 46, 38),
  rain: cloud('#aeb7c4', 46, 32) + rainDrops(),
  snow: cloud('#c3ccd8', 46, 32) + snowFlakes(),
  fog: cloud('#c3ccd8', 46, 34) + fogLines(),
  storm: cloud('#9aa3b0', 46, 32) + `<path d="M44 52 l-8 14 h8 l-6 12" stroke="#f4b63a" stroke-width="4" fill="none" stroke-linejoin="round"/>`,
};

function sunRays(op = 1) {
  let p = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = 46 + Math.cos(a) * 24, y1 = 34 + Math.sin(a) * 24;
    const x2 = 46 + Math.cos(a) * 32, y2 = 34 + Math.sin(a) * 32;
    p += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f4b63a" stroke-width="3" stroke-linecap="round" opacity="${op}"/>`;
  }
  return p;
}
function cloud(fill, cx, cy) {
  return `<g fill="${fill}">` +
    `<ellipse cx="${cx - 16}" cy="${cy + 6}" rx="16" ry="13"/>` +
    `<ellipse cx="${cx + 2}" cy="${cy}" rx="20" ry="17"/>` +
    `<ellipse cx="${cx + 20}" cy="${cy + 7}" rx="15" ry="12"/>` +
    `<rect x="${cx - 30}" y="${cy + 8}" width="66" height="12" rx="6"/>` +
    `</g>`;
}
function rainDrops() {
  let p = '';
  for (const x of [30, 46, 62]) p += `<line x1="${x}" y1="56" x2="${x - 4}" y2="70" stroke="#5aa0e0" stroke-width="3.5" stroke-linecap="round"/>`;
  return p;
}
function snowFlakes() {
  let p = '';
  for (const x of [30, 46, 62]) p += `<circle cx="${x}" cy="62" r="3" fill="#e6eef8"/>`;
  return p;
}
function fogLines() {
  let p = '';
  for (const y of [56, 64]) p += `<line x1="24" y1="${y}" x2="68" y2="${y}" stroke="#aeb7c4" stroke-width="3.5" stroke-linecap="round"/>`;
  return p;
}

export function renderWeatherIcon(container, iconKey) {
  const svg = ICONS[iconKey] || ICONS.cloud;
  container.innerHTML = `<svg viewBox="0 0 92 80" width="92" height="80">${svg}</svg>`;
}

export function renderSparkline(svg, series) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!series || series.length < 2) return;
  const w = 160, h = 44, pad = 4;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min || 1;
  const step = (w - pad * 2) / (series.length - 1);
  const pts = series.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const poly = document.createElementNS(NS, 'polyline');
  poly.setAttribute('points', pts);
  svg.appendChild(poly);
}

export function formatUsd(n) {
  if (n == null) return '$--';
  return '$' + Math.round(n).toLocaleString('en-US');
}

export default { renderWeatherIcon, renderSparkline, formatUsd };
