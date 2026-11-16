// Data loading, area series, climatology/anomalies and summary numbers.
export const DATA_START_YEAR = 2012;
export const DATA_END_YEAR = 2025;
export const CAL_START_YEAR = 2000;     // calendar picker starts here ...
export const NOW_KEY = '2025-12';       // ... but our archive ends here (2025 is "now")
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const keyOf = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export const yearOf = (k) => +k.slice(0, 4);
export const moyOf = (k) => +k.slice(5, 7); // 1..12
export const labelOf = (k) => `${MONTHS_SHORT[moyOf(k) - 1]} ${yearOf(k)}`;
export const longLabelOf = (k) => `${MONTHS_LONG[moyOf(k) - 1]} ${yearOf(k)}`;
export const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtSigned = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);

export async function loadAll(base = '/') {
  const get = async (f) => {
    const url = `${base}data/${f}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} while loading ${url}`);
    try { return await r.json(); } catch { throw new Error(`${url} is missing or is not JSON (check the public/data folder).`); }
  };
  const [cells, calibration, validation, meta] = await Promise.all([
    get('cells.json'), get('calibration.json'), get('validation.json'), get('meta.json'),
  ]);
  return { store: prepareStore(cells, calibration), calibration, validation, meta };
}

export function prepareStore(cells, calibration) {
  const n = cells.cell_i.length;
  const R = new Float32Array(n * 12);
  for (let k = 0; k < n; k++) {
    const reg = calibration.regions[cells.cell_region[k]];
    for (let m = 0; m < 12; m++) R[k * 12 + m] = reg ? reg.R[m] : calibration.national_by_month[m];
  }
  const keys = Object.keys(cells.months).sort();
  const vals = [];
  for (const key of keys) {
    const d = cells.months[key];
    for (let q = 0; q < d.k.length; q++) vals.push(d.s[q] + d.f[q]);
  }
  vals.sort((a, b) => a - b);
  return {
    n, keys, months: cells.months, R,
    cellI: Int16Array.from(cells.cell_i), cellJ: Int16Array.from(cells.cell_j),
    grid: cells.grid_deg, vmax: Math.max(vals[Math.floor(vals.length * 0.995)] || 1, 1),
  };
}

/** monthly series for an area (w = per-cell weights from aoiWeights) */
export function aoiSeries(store, w) {
  const L = store.keys.length;
  const o = { keys: store.keys, modis: Array(L).fill(0), converted: Array(L).fill(0), viirs: Array(L).fill(0), noaa20: Array(L).fill(0), fill: Array(L).fill(0), harmonized: Array(L).fill(0) };
  for (let t = 0; t < L; t++) {
    const d = store.months[store.keys[t]];
    const moy = moyOf(store.keys[t]) - 1;
    let m = 0, c = 0, s = 0, n = 0, f = 0;
    for (let q = 0; q < d.k.length; q++) {
      const k = d.k[q];
      const wk = w[k];
      if (!wk) continue;
      m += d.m[q] * wk; s += d.s[q] * wk; n += d.n[q] * wk; f += d.f[q] * wk;
      c += d.m[q] * wk * store.R[k * 12 + moy];
    }
    o.modis[t] = m; o.converted[t] = c; o.viirs[t] = s; o.noaa20[t] = n; o.fill[t] = f; o.harmonized[t] = s + f;
  }
  return o;
}

/** per month-of-year statistics of the harmonized series (the multi-year baseline) */
export function climatology(series) {
  const by = Array.from({ length: 12 }, () => []);
  series.keys.forEach((k, t) => by[moyOf(k) - 1].push({ y: yearOf(k), v: series.harmonized[t] }));
  return by.map((arr) => {
    const vs = arr.map((a) => a.v);
    const n = vs.length;
    const mean = vs.reduce((a, b) => a + b, 0) / (n || 1);
    const std = n > 1 ? Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
    return { mean, std, min: Math.min(...vs), max: Math.max(...vs), n, byYear: arr };
  });
}

export function anomalyAt(series, clim, t) {
  const v = series.harmonized[t];
  const c = clim[moyOf(series.keys[t]) - 1];
  const diff = v - c.mean;
  return { value: v, mean: c.mean, diff, pct: c.mean > 0 ? (diff / c.mean) * 100 : 0, z: c.std > 0 ? diff / c.std : 0 };
}

export function toMatrix(series, values = series.harmonized) {
  const years = [];
  for (let y = DATA_START_YEAR; y <= DATA_END_YEAR; y++) years.push(y);
  const m = years.map(() => Array(12).fill(null));
  series.keys.forEach((k, t) => { const r = yearOf(k) - DATA_START_YEAR; if (r >= 0 && r < years.length) m[r][moyOf(k) - 1] = values[t]; });
  return { years, data: m };
}

export const inRange = (key, range) => key >= range.from && key <= range.to;
export const rangeKeys = (store, range) => store.keys.filter((k) => inRange(k, range));

export function summarize(series, clim, range, focusKey) {
  const idx = [];
  series.keys.forEach((k, t) => { if (inRange(k, range)) idx.push(t); });
  const total = idx.reduce((a, t) => a + series.harmonized[t], 0);
  let peak = { key: null, value: -1 };
  const moyTotals = Array(12).fill(0);
  for (const t of idx) {
    const v = series.harmonized[t];
    if (v > peak.value) peak = { key: series.keys[t], value: v };
    moyTotals[moyOf(series.keys[t]) - 1] += v;
  }
  const topMoy = moyTotals.indexOf(Math.max(...moyTotals));
  const ft = series.keys.indexOf(focusKey);
  let focus = null;
  if (ft >= 0) {
    const a = anomalyAt(series, clim, ft);
    const same = clim[moyOf(focusKey) - 1].byYear.slice().sort((x, y) => y.v - x.v);
    const rank = same.findIndex((s) => s.y === yearOf(focusKey)) + 1;
    focus = { key: focusKey, ...a, rank, of: same.length, sameMonth: clim[moyOf(focusKey) - 1].byYear };
  }
  const unusual = idx.map((t) => ({ key: series.keys[t], ...anomalyAt(series, clim, t) }))
    .filter((a) => a.z >= 1.5).sort((a, b) => b.z - a.z).slice(0, 6);
  return { total, months: idx.length, avg: idx.length ? total / idx.length : 0, peak, topMoy: moyTotals.some((v) => v > 0) ? topMoy : null, focus, unusual };
}

export function yearlyTotals(series, range) {
  const out = {};
  series.keys.forEach((k, t) => { if (inRange(k, range)) out[yearOf(k)] = (out[yearOf(k)] || 0) + series.harmonized[t]; });
  return Object.entries(out).map(([y, v]) => ({ year: +y, value: v }));
}
