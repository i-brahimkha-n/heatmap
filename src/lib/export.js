// CSV builders and chart image export.
import { anomalyAt, climatology, inRange, labelOf } from './data.js';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'area';

/** monthly analytics for the chosen area and date range */
export function summaryCsv(series, clim, range) {
  const head = ['month', 'harmonized_hotspots', 'viirs_snpp_observed', 'viirs_gap_fill', 'modis_raw', 'modis_converted_to_viirs', 'viirs_noaa20', 'baseline_mean_same_month', 'anomaly', 'anomaly_pct', 'z_score'];
  const rows = [head.join(',')];
  series.keys.forEach((k, t) => {
    if (!inRange(k, range)) return;
    const a = anomalyAt(series, clim, t);
    const r = (x) => Math.round(x * 10) / 10;
    rows.push([k, r(series.harmonized[t]), r(series.viirs[t]), r(series.fill[t]), r(series.modis[t]), r(series.converted[t]), r(series.noaa20[t]), r(a.mean), r(a.diff), r(a.pct), Math.round(a.z * 100) / 100].join(','));
  });
  return new Blob([rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
}

const SAT = { T: ['Terra', 'MODIS'], A: ['Aqua', 'MODIS'], S: ['Suomi-NPP', 'VIIRS'], N: ['NOAA-20', 'VIIRS'] };
export const POINTS_HEADER = 'date,time_utc,latitude,longitude,satellite,sensor,frp_mw,confidence';

export const quarterOf = (key) => `${key.slice(0, 4)}-Q${Math.ceil(+key.slice(5, 7) / 3)}`;
export const quarterFiles = (keys) => [...new Set(keys.map(quarterOf))];

/** individual hotspots inside the area for every month of the range (fetches the quarterly files it needs) */
export async function buildPointsCsv({ base, keys, aoi, signal, onProgress, fetchImpl = fetch }) {
  const wanted = new Set(keys);
  const files = quarterFiles(keys);
  const perFile = new Map();
  const queue = [...files];
  let done = 0;
  const bb = aoi.bbox;
  async function worker() {
    while (queue.length) {
      const q = queue.shift();
      const r = await fetchImpl(`${base}data/points/${q}.csv`, { signal });
      if (!r.ok) throw new Error(`Could not load hotspots for ${q} (HTTP ${r.status})`);
      const text = await r.text();
      const year = q.slice(0, 4);
      const out = [];
      const lines = text.split('\n');
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const [md, hhmm, lat, lng, sat, frp, conf] = line.split(',');
        if (!wanted.has(`${year}-${md.slice(0, 2)}`)) continue;
        const la = +lat, ln = +lng;
        if (aoi.kind !== 'all') {
          if (la < bb.south || la > bb.north || ln < bb.west || ln > bb.east) continue;
          if (!aoi.contains(la, ln)) continue;
        }
        const [satName, sensor] = SAT[sat] || [sat, ''];
        out.push(`${year}-${md},${hhmm.slice(0, 2)}:${hhmm.slice(2)},${lat},${lng},${satName},${sensor},${frp},${conf}`);
      }
      perFile.set(q, out);
      done++;
      onProgress?.(done, files.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
  const parts = [POINTS_HEADER];
  let count = 0;
  for (const q of files) { const o = perFile.get(q) || []; count += o.length; parts.push(...o); }
  return { blob: new Blob([parts.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }), count, files: files.length };
}

/** serialise an <svg> element to a PNG download (adds a title header, legend and footer) */
export async function svgToPng(svg, filename, { scale = 2, bg = '#0d1220', title, subtitle, legend } = {}) {
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth;
  const h = vb && vb.height ? vb.height : svg.clientHeight;
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('image render failed')); img.src = url; });
    const head = title ? (legend && legend.length ? 76 : 58) : 0;
    const foot = 24;
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = (h + head + foot) * scale;
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.fillStyle = bg; g.fillRect(0, 0, w, h + head + foot);
    const font = 'Inter, system-ui, sans-serif';
    if (title) {
      g.fillStyle = '#e8ecf6'; g.font = `700 16px ${font}`; g.fillText(title, 16, 28);
      if (subtitle) { g.fillStyle = '#8b96b3'; g.font = `12px ${font}`; g.fillText(String(subtitle).slice(0, 120), 16, 48); }
      if (legend && legend.length) {
        let lx = 16;
        g.font = `11px ${font}`;
        for (const l of legend) {
          g.strokeStyle = l.color; g.lineWidth = 3;
          g.setLineDash(l.dash ? [5, 3] : []);
          g.beginPath(); g.moveTo(lx, 64); g.lineTo(lx + 18, 64); g.stroke(); g.setLineDash([]);
          g.fillStyle = '#c7cfe6'; g.fillText(l.name, lx + 24, 68);
          lx += 34 + g.measureText(l.name).width + 10;
        }
      }
    }
    g.drawImage(img, 0, head, w, h);
    g.fillStyle = '#5d6a8f'; g.font = `10px ${font}`;
    g.fillText('HeatMap · harmonized MODIS + VIIRS active-fire hotspots · NASA FIRMS data', 16, h + head + 16);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    downloadBlob(blob, filename);
    return blob.size;
  } finally { URL.revokeObjectURL(url); }
}

export { climatology, labelOf };
