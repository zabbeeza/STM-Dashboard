// Seven-segment clock renderer. Builds four amber digits + a blinking colon on
// a dark inset panel, 12-hour with AM/PM. Ghost ("off") segments stay faintly
// lit for the authentic LCD look (handled in CSS via .seg opacity).

const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

// Which segments are lit for each digit 0–9.
const DIGIT_MAP = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'c', 'd', 'e'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  ' ': [],
};

function makeDigit() {
  const el = document.createElement('div');
  el.className = 'seg-digit';
  for (const s of SEGMENTS) {
    const seg = document.createElement('div');
    seg.className = `seg ${s}`;
    seg.dataset.seg = s;
    el.appendChild(seg);
  }
  return el;
}

function setDigit(digitEl, char) {
  const on = new Set(DIGIT_MAP[char] || []);
  for (const seg of digitEl.children) {
    seg.classList.toggle('on', on.has(seg.dataset.seg));
  }
}

export function createSegClock(container) {
  container.innerHTML = '';
  const d1 = makeDigit();
  const d2 = makeDigit();
  const colon = document.createElement('div');
  colon.className = 'seg-colon';
  const d3 = makeDigit();
  const d4 = makeDigit();
  container.append(d1, d2, colon, d3, d4);

  return {
    update(date, blinkOn) {
      let h = date.getHours();
      const m = date.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      const hh = String(h).padStart(2, ' '); // leading space, not zero
      const mm = String(m).padStart(2, '0');
      setDigit(d1, hh[0]);
      setDigit(d2, hh[1]);
      setDigit(d3, mm[0]);
      setDigit(d4, mm[1]);
      colon.classList.toggle('blink-off', !blinkOn);
      return ampm;
    },
  };
}

export default { createSegClock };
