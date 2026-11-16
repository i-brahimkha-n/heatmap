// Core logic tests against the real generated data. Run: node tests/core.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from '../src/lib/geo.js';
import * as D from '../src/lib/data.js';
import * as E from '../src/lib/export.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- geo
ok(['Karachi:24.86,67.0', 'Lahore:31.52,74.35', 'Gwadar:25.12,62.32', 'Skardu:35.32,75.55', 'Mithi:24.74,69.8', 'Quetta:30.17,66.97'].every((s) => { const [la, ln] = s.split(':')[1].split(',').map(Number); return G.inPakistan(la, ln); }), 'Pakistani cities are inside the outline');
ok(['Delhi:28.6,77.2', 'Kabul:34.5,69.2', 'Tehran:35.7,51.4', 'Amritsar:31.63,74.87'].every((s) => { const [la, ln] = s.split(':')[1].split(',').map(Number); return !G.inPakistan(la, ln); }), 'Delhi, Kabul, Tehran, Amritsar are outside');
const area = G.makeAoi({ kind: 'all' }).areaKm2;
ok(area > 800000 && area < 950000, `Pakistan outline area ${Math.round(area).toLocaleString()} km² is plausible (real ≈ 881,900)`);
const c25 = G.makeAoi({ kind: 'circle', lat: 31.52, lng: 74.35, radiusKm: 25 });
ok(near(c25.areaKm2, Math.PI * 625, 1) && c25.outline.length === 65, 'circle area and outline');
ok(near(G.polygonAreaKm2(G.makeAoi({ kind: 'circle', lat: 30, lng: 70, radiusKm: 50 }).outline), Math.PI * 2500, 80), 'polygon area of a 50 km circle outline ≈ π r²');

// ---- data
const cells = read('cells.json'), calibration = read('calibration.json'), validation = read('validation.json'), meta = read('meta.json');
const store = D.prepareStore(cells, calibration);
ok(store.keys.length === 168 && store.keys[0] === '2012-01' && store.keys.at(-1) === '2025-12', '168 months 2012-01 … 2025-12');
const wAll = G.aoiWeights(G.makeAoi({ kind: 'all' }), store.cellI, store.cellJ);
const sAll = D.aoiSeries(store, wAll);
const sum = (a) => a.reduce((x, y) => x + y, 0);
ok(sum(sAll.viirs) === meta.by_sensor.SNPP && sum(sAll.modis) === meta.by_sensor.MODIS && sum(sAll.noaa20) === meta.by_sensor.N20, 'whole-country series reproduce the sensor totals exactly');
ok(near(sum(sAll.harmonized), meta.by_sensor.SNPP + meta.viirs_gap_fill_hotspots, 60), 'harmonized total = VIIRS + gap fill');
ok(sAll.harmonized.every((v, i) => v >= sAll.viirs[i]), 'harmonized is never below observed VIIRS');

// weighted AOI vs exact points (VIIRS S-NPP only, 100 km around Lahore, 2020-2021)
const lah = G.makeAoi({ kind: 'circle', lat: 31.52, lng: 74.35, radiusKm: 100 });
const w = G.aoiWeights(lah, store.cellI, store.cellJ);
const ser = D.aoiSeries(store, w);
const range = { from: '2020-01', to: '2021-12' };
const keys = D.rangeKeys(store, range);
let weighted = 0; ser.keys.forEach((k, t) => { if (D.inRange(k, range)) weighted += ser.viirs[t]; });
const fetchLocal = async (url) => { const f = path.join(root, url.replace(/^.*?data\//, 'data/')); return fs.existsSync(f) ? { ok: true, status: 200, text: async () => fs.readFileSync(f, 'utf8') } : { ok: false, status: 404 }; };
const { blob, count } = await E.buildPointsCsv({ base: '/', keys, aoi: lah, fetchImpl: fetchLocal });
const text = await blob.text();
const exactS = text.split('\n').filter((l) => l.includes(',Suomi-NPP,')).length;
ok(Math.abs(weighted - exactS) / exactS < 0.03, `cell-weighted VIIRS ${weighted.toFixed(0)} vs exact points ${exactS} (${(100 * Math.abs(weighted - exactS) / exactS).toFixed(1)}% apart)`);
ok(text.startsWith(E.POINTS_HEADER) && count > 5000 && /^2020-01-\d\d,\d\d:\d\d,/.test(text.split('\n')[1]), `points CSV has header, ${count.toLocaleString()} rows, ISO dates and HH:MM times`);
ok(text.split('\n').slice(1, 400).filter(Boolean).every((l) => { const p = l.split(','); return G.haversine(31.52, 74.35, +p[2], +p[3]) <= 100.5; }), 'every CSV row lies inside the 100 km circle');

// tiny AOI still returns data and weight is an area share
const tiny = G.makeAoi({ kind: 'circle', lat: 31.52, lng: 74.35, radiusKm: 2 });
const wt = G.aoiWeights(tiny, store.cellI, store.cellJ); ok(sum(Array.from(wt)) > 0 && sum(Array.from(wt)) <= 1, 'tiny AOI keeps an area-share weight');
const out = G.aoiWeights(G.makeAoi({ kind: 'bbox', south: 28.4, west: 76.9, north: 28.9, east: 77.4 }), store.cellI, store.cellJ);
ok(sum(Array.from(out)) === 0, 'Delhi-area rectangle has zero weight (outside Pakistan)');

// anomalies
const clim = D.climatology(sAll);
ok(clim.length === 12 && clim.every((c) => c.n === 14), 'climatology: 14 years per month-of-year');
const meanZ = sAll.keys.map((k, t) => D.anomalyAt(sAll, clim, t).z).reduce((a, b) => a + b, 0) / sAll.keys.length;
ok(near(meanZ, 0, 1e-6), 'anomaly z-scores average to zero');
const sm = D.summarize(sAll, clim, { from: '2012-01', to: '2025-12' }, '2025-12');
ok(sm.months === 168 && sm.focus.rank >= 1 && sm.focus.rank <= 14 && sm.unusual.length > 0, `summary: focus Dec 2025 ranks ${sm.focus.rank}/14, peak ${D.labelOf(sm.peak.key)}, ${sm.unusual.length} unusual months`);
const csv = await E.summaryCsv(sAll, clim, { from: '2024-01', to: '2024-12' }).text();
ok(csv.split('\n').length === 14 && csv.startsWith('month,harmonized_hotspots'), 'summary CSV: header + 12 months');
ok(validation.loyo.length === 12 && validation.national.months.length === 167, 'validation.json is complete');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
