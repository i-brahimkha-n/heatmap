// Colour ramps. Both are monotonic in lightness (colour-blind safe, readable in grayscale).
const INFERNO = ['#07051a', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));

function stops(list, t) {
  const x = Math.min(Math.max(t, 0), 1) * (list.length - 1);
  const i = Math.min(Math.floor(x), list.length - 2);
  return mix(list[i], list[i + 1], x - i);
}

/** magnitude ramp, t in 0..1 */
export const fireRamp = (t) => stops(INFERNO, 0.12 + 0.88 * t);
/** value -> colour, square-root scaled against vmax so quiet months stay readable */
export const countColor = (v, vmax) => fireRamp(Math.sqrt(Math.min(Math.max(v / (vmax || 1), 0), 1)));
export const countTick = (t, vmax) => vmax * t * t; // value that sits at position t of the ramp

const DIV_NEG = ['#232a3d', '#25507f', '#2f7bd0', '#6fb4ff'];
const DIV_POS = ['#232a3d', '#7a3a1f', '#e0661f', '#ffb35c'];
/** diverging ramp, t in -1..1 (cool = below average, warm = above average) */
export const divRamp = (t) => (t < 0 ? stops(DIV_NEG, -t) : stops(DIV_POS, t));
export const zColor = (z, zmax = 3) => divRamp(Math.max(-1, Math.min(1, z / zmax)));

export const cssGradient = (fn, n = 12, dir = 'to right') =>
  `linear-gradient(${dir}, ${Array.from({ length: n }, (_, i) => fn(i / (n - 1))).join(',')})`;

// series colours for line charts (validated colour-blind-safe set)
export const SERIES = { harmonized: '#ffb347', viirs: '#4aa3ff', modis: '#eb6834', converted: '#1fc98a', noaa20: '#b79cff' };
