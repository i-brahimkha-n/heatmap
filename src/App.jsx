import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SmogIntro from './components/SmogIntro.jsx';
import GlobeView from './components/GlobeView.jsx';
import MapView from './components/MapView.jsx';
import AoiPanel from './components/AoiPanel.jsx';
import PyroRing from './components/PyroRing.jsx';
import CalendarGrid, { Legend } from './components/CalendarGrid.jsx';
import MethodPage from './components/MethodPage.jsx';
import { LineChart, BarChart } from './components/Charts.jsx';
import { FlameIcon, SearchIcon, BellIcon, DownloadIcon, GlobeIcon, MapIcon, AlertIcon, InfoIcon, RefreshIcon, XIcon, ShieldIcon } from './components/Icons.jsx';
import {
  CAL_START_YEAR, DATA_START_YEAR, DATA_END_YEAR, NOW_KEY, MONTHS_LONG, keyOf, yearOf, moyOf, labelOf, longLabelOf,
  fmt, fmtSigned, loadAll, aoiSeries, climatology, toMatrix, summarize, yearlyTotals, rangeKeys, inRange,
} from './lib/data.js';
import { makeAoi, aoiWeights, inPakistan, haversine } from './lib/geo.js';
import { findZone } from './lib/places.js';
import { SERIES } from './lib/colors.js';
import { downloadBlob, slug, summaryCsv, buildPointsCsv } from './lib/export.js';

const BASE = import.meta.env.BASE_URL || '/';
const FIRST_KEY = keyOf(DATA_START_YEAR, 1);
const YEARS_ALL = Array.from({ length: DATA_END_YEAR - CAL_START_YEAR + 1 }, (_, i) => CAL_START_YEAR + i);
const WARN_KM = 30;

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [introDone, setIntroDone] = useState(false);
  const [view, setView] = useState('globe');
  const [shape, setShape] = useState({ kind: 'all' });
  const [radiusKm, setRadiusKm] = useState(25);
  const [focusKey, setFocusKey] = useState(NOW_KEY);
  const [range, setRange] = useState({ from: FIRST_KEY, to: NOW_KEY });
  const [calMode, setCalMode] = useState('counts');
  const [ringMode, setRingMode] = useState('counts');
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState(null);
  const [method, setMethod] = useState(false);
  const [warn, setWarn] = useState({ state: 'idle' });
  const [dl, setDl] = useState(null);
  const noticeTimer = useRef(null);

  const flash = useCallback((text, kind = 'info') => {
    setNotice({ text, kind });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 5200);
  }, []);

  useEffect(() => { loadAll(BASE).then(setData).catch((e) => setError(e.message)); }, []);

  const store = data?.store;
  const aoi = useMemo(() => makeAoi(shape), [shape]);
  const series = useMemo(() => (store ? aoiSeries(store, aoiWeights(aoi, store.cellI, store.cellJ, store.grid)) : null), [store, aoi]);
  const clim = useMemo(() => (series ? climatology(series) : null), [series]);
  const matrix = useMemo(() => (series ? toMatrix(series) : null), [series]);
  const available = !!store && focusKey >= FIRST_KEY && focusKey <= NOW_KEY && !!store.months[focusKey];
  const summary = useMemo(() => (series ? summarize(series, clim, range, available ? focusKey : null) : null), [series, clim, range, focusKey, available]);
  const cellsInside = useMemo(() => (store && aoi.kind !== 'all' ? aoiWeights(aoi, store.cellI, store.cellJ, store.grid).reduce((a, b) => a + b, 0) : null), [store, aoi]);

  // ---- picking places
  const pick = useCallback((lat, lng) => {
    if (!inPakistan(lat, lng)) { flash(`Data not available for ${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E. HeatMap covers Pakistan only.`, 'warn'); return; }
    setShape({ kind: 'circle', lat, lng, radiusKm, name: `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E` });
  }, [radiusKm, flash]);
  const setRadius = (r) => { setRadiusKm(r); if (shape.kind === 'circle') setShape({ ...shape, radiusKm: r }); };
  const applyShape = (s) => {
    if (s.kind === 'all') { setShape(s); return; }
    const probe = makeAoi(s);
    if (!inPakistan(probe.center.lat, probe.center.lng)) { flash('Data not available: that area is outside Pakistan.', 'warn'); return; }
    setShape(s);
  };

  const search = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) { pick(+m[1], +m[2]); return; }
    const z = findZone(q);
    if (z) { setShape({ kind: 'circle', lat: z.lat, lng: z.lng, radiusKm, name: z.name }); return; }
    flash(`"${q}" was not found. Try a Pakistani city (Lahore, Quetta…) or type "lat, lng".`, 'warn');
  };

  // ---- time
  const pickKey = (k) => {
    setFocusKey(k);
    if (k < FIRST_KEY) flash('Data not available before January 2012. Pick 2012–2025.', 'warn');
  };
  const setYM = (y, m) => pickKey(keyOf(y, m));
  const now = () => { setFocusKey(NOW_KEY); setRange({ from: FIRST_KEY, to: NOW_KEY }); };

  useEffect(() => {
    if (!playing || !store) return undefined;
    const keys = rangeKeys(store, range);
    const id = setInterval(() => {
      setFocusKey((k) => { const i = keys.indexOf(k); return keys[(i + 1) % keys.length] || keys[0]; });
    }, 650);
    return () => clearInterval(id);
  }, [playing, store, range]);

  // ---- early warning (compares the user's location with the most recent month of hotspots in the archive)
  const enableWarning = () => {
    if (!navigator.geolocation) { setWarn({ state: 'error', text: 'This browser cannot share location.' }); return; }
    setWarn({ state: 'asking' });
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: la, longitude: ln } = pos.coords;
      if (!inPakistan(la, ln)) { setWarn({ state: 'outside', la, ln }); return; }
      const d = store.months[NOW_KEY];
      let best = null;
      if (d) for (let q = 0; q < d.k.length; q++) {
        const k = d.k[q];
        if (d.s[q] + d.f[q] <= 0) continue;
        const dist = haversine(la, ln, (store.cellI[k] + 0.5) * store.grid, (store.cellJ[k] + 0.5) * store.grid);
        if (!best || dist < best.dist) best = { dist, count: d.s[q] + d.f[q] };
      }
      const near = best && best.dist <= WARN_KM;
      setWarn({ state: near ? 'near' : 'safe', la, ln, best });
      setShape({ kind: 'circle', lat: la, lng: ln, radiusKm: 30, name: 'Your location' });
      if (near && 'Notification' in window) {
        const send = () => new Notification('HeatMap early warning', { body: `Fire activity detected about ${Math.round(best.dist)} km from you (${labelOf(NOW_KEY)} archive).` });
        if (Notification.permission === 'granted') send();
        else if (Notification.permission !== 'denied') Notification.requestPermission().then((p) => p === 'granted' && send());
      }
    }, (err) => setWarn({ state: 'error', text: err.code === 1 ? 'Location permission was denied. You can allow it in your browser settings.' : 'Could not get your location.' }), { timeout: 12000 });
  };

  // ---- downloads
  const exportInfo = `${aoi.name} (${aoi.label}) · ${labelOf(range.from)} – ${labelOf(range.to)} · harmonized MODIS+VIIRS hotspots`;
  const dlSummary = () => downloadBlob(summaryCsv(series, clim, range), `heatmap-${slug(aoi.name)}-monthly.csv`);
  const dlPoints = async () => {
    const keys = rangeKeys(store, range);
    setDl({ done: 0, total: 1 });
    try {
      const r = await buildPointsCsv({ base: BASE, keys, aoi, onProgress: (done, total) => setDl({ done, total }) });
      downloadBlob(r.blob, `heatmap-${slug(aoi.name)}-hotspots.csv`);
      flash(`Downloaded ${fmt(r.count)} hotspots from ${r.files} files.`, 'ok');
    } catch (e) { flash(e.message, 'warn'); }
    setDl(null);
  };

  // ---- render
  if (error) return <div className="boot"><AlertIcon width={28} height={28} /><h2>HeatMap could not load its data</h2><p>{error}</p><button className="btn primary" onClick={() => location.reload()}><RefreshIcon /> Try again</button></div>;
  const ready = !!data;
  const rk = ready ? rangeKeys(store, range) : [];
  const idxs = ready ? rk.map((k) => series.keys.indexOf(k)) : [];
  const labels = rk.map(labelOf);
  const xTicks = rk.map((k, i) => ({ k, i })).filter(({ k }) => moyOf(k) === 1 && (rk.length < 40 || yearOf(k) % 2 === 0)).map(({ k, i }) => ({ i, label: String(yearOf(k)) }));
  const pickIdx = (i) => rk[i] && pickKey(rk[i]);
  const f = summary?.focus;
  const years = ready ? yearlyTotals(series, range) : [];
  const avgYear = years.length ? years.reduce((a, b) => a + b.value, 0) / years.length : 0;
  const sameMonth = f ? f.sameMonth.slice().sort((a, b) => a.y - b.y) : [];

  return (
    <div className="app">
      {!introDone && <SmogIntro onDone={() => setIntroDone(true)} />}
      <header className="top">
        <div className="brand"><span className="logo"><FlameIcon width={20} height={20} /></span><div><h1>HeatMap</h1><span>Pakistan burning calendar · MODIS + VIIRS · 2012–2025</span></div></div>
        <form className="search" onSubmit={search} role="search">
          <SearchIcon />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a city, area, or “31.52, 74.36”" aria-label="Search a place or latitude and longitude" />
          <button className="btn tiny" type="submit">Go</button>
        </form>
        <div className="when" role="group" aria-label="Choose month">
          <select value={yearOf(focusKey)} onChange={(e) => setYM(+e.target.value, moyOf(focusKey))} aria-label="Year">
            {YEARS_ALL.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={moyOf(focusKey)} onChange={(e) => setYM(yearOf(focusKey), +e.target.value)} aria-label="Month">
            {MONTHS_LONG.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <button className="btn now" onClick={now} title="Jump to the latest data (2025)"><span className="live" /> NOW</button>
        </div>
        <button className="btn ghost" onClick={() => setMethod(true)}><InfoIcon /> Method</button>
      </header>

      {notice && <div className={`toast ${notice.kind}`} role="status"><AlertIcon /> <span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Dismiss"><XIcon /></button></div>}

      {!ready ? <div className="boot"><div className="spinner" /><p>Loading 14 years of fire data…</p></div> : (
        <main className="grid">
          <section className="stage card">
            <div className="stage-h">
              <div className="seg" role="group" aria-label="View">
                <button className={view === 'globe' ? 'on' : ''} onClick={() => setView('globe')} aria-pressed={view === 'globe'}><GlobeIcon /> Globe</button>
                <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')} aria-pressed={view === 'map'}><MapIcon /> Draw on map</button>
              </div>
              <div className="stage-title"><b>{longLabelOf(focusKey)}</b>{available ? <span> · {fmt(f ? f.value : 0)} hotspots in {aoi.name}</span> : <span className="bad"> · Data not available</span>}</div>
            </div>
            {view === 'globe'
              ? <GlobeView store={store} focusKey={focusKey} available={available} aoi={aoi} onPick={pick} introDone={introDone} />
              : <MapView store={store} focusKey={focusKey} available={available} aoi={aoi} radiusKm={radiusKm} onShape={applyShape} onPoint={pick} />}
            <Legend vmax={store.vmax} />
            <div className={`warn ${warn.state}`}>
              {warn.state === 'idle' && <><BellIcon /><span>Get an early warning if fire is detected near you</span><button className="btn tiny primary" onClick={enableWarning}>Enable location</button></>}
              {warn.state === 'asking' && <><BellIcon /><span>Waiting for your permission…</span></>}
              {warn.state === 'near' && <><AlertIcon /><span><b>Fire activity about {Math.round(warn.best.dist)} km from you</b> in the latest month of the archive ({labelOf(NOW_KEY)}). Stay alert and follow local authorities.</span></>}
              {warn.state === 'safe' && <><ShieldIcon /><span>No fire activity within {WARN_KM} km of you in {labelOf(NOW_KEY)}.</span></>}
              {warn.state === 'outside' && <><AlertIcon /><span>Data not available: your location is outside Pakistan.</span></>}
              {warn.state === 'error' && <><AlertIcon /><span>{warn.text}</span><button className="btn tiny" onClick={enableWarning}>Retry</button></>}
            </div>
          </section>

          <aside className="side">
            <AoiPanel aoi={aoi} radiusKm={radiusKm} onRadius={setRadius} onShape={applyShape} onReset={() => setShape({ kind: 'all' })} cellsInside={cellsInside} />
            <section className="card range">
              <header className="card-h"><div><h3>Date range</h3><p className="sub">Analytics and downloads use this range</p></div></header>
              <div className="range-row">
                <label>From<select value={range.from} onChange={(e) => setRange({ from: e.target.value, to: e.target.value > range.to ? e.target.value : range.to })}>{store.keys.map((k) => <option key={k} value={k}>{labelOf(k)}</option>)}</select></label>
                <label>To<select value={range.to} onChange={(e) => setRange({ from: e.target.value < range.from ? e.target.value : range.from, to: e.target.value })}>{store.keys.map((k) => <option key={k} value={k}>{labelOf(k)}</option>)}</select></label>
              </div>
              <div className="dl-row">
                <button className="btn" onClick={dlSummary}><DownloadIcon /> Monthly CSV</button>
                <button className="btn primary" onClick={dlPoints} disabled={!!dl}><DownloadIcon /> {dl ? `Hotspots ${dl.done}/${dl.total}…` : 'Hotspots CSV'}</button>
              </div>
            </section>
          </aside>

          <section className="stats">
            <div className="stat"><span>Hotspots in range</span><b>{fmt(summary.total)}</b><small>{summary.months} months · avg {fmt(summary.avg)}/mo</small></div>
            <div className="stat"><span>Peak month</span><b>{summary.peak.key ? labelOf(summary.peak.key) : '–'}</b><small>{fmt(summary.peak.value)} hotspots</small></div>
            <div className="stat"><span>Burning season</span><b>{summary.topMoy != null ? MONTHS_LONG[summary.topMoy] : '–'}</b><small>busiest month overall</small></div>
            <div className="stat hot"><span>{longLabelOf(focusKey)}</span><b>{f ? `${fmtSigned(f.pct)}%` : '–'}</b><small>{f ? `vs ${fmt(f.mean)} average · rank ${f.rank} of ${f.of}` : 'no data for this month'}</small></div>
          </section>

          <section className="ring">
            <div className="seg floating" role="group" aria-label="Ring colouring">
              <button className={ringMode === 'counts' ? 'on' : ''} onClick={() => setRingMode('counts')}>Hotspots</button>
              <button className={ringMode === 'anomaly' ? 'on' : ''} onClick={() => setRingMode('anomaly')}>Anomaly</button>
            </div>
            <PyroRing matrix={matrix} mode={ringMode} clim={clim} vmax={ringVmax(matrix)} focusKey={available ? focusKey : null} range={range} onPick={pickKey}
              playing={playing} onToggle={() => setPlaying(!playing)} focus={f} subtitle={`${aoi.name} · click a segment or press play`} />
          </section>
          <section className="cal">
            <CalendarGrid matrix={matrix} mode={calMode} onMode={setCalMode} clim={clim} vmax={ringVmax(matrix)} focusKey={available ? focusKey : null} range={range} onPick={pickKey} exportInfo={exportInfo} />
          </section>

          <section className="wide">
            <LineChart title="Monthly hotspots" subtitle="Harmonized series with its inputs. Dashed = average of the same month across years"
              exportInfo={exportInfo} fileName="heatmap-timeseries.png" labels={labels} xTicks={xTicks} focusIndex={rk.indexOf(focusKey)} onPick={pickIdx}
              series={[
                { name: 'Harmonized', color: SERIES.harmonized, values: idxs.map((t) => series.harmonized[t]), width: 2.6 },
                { name: 'MODIS converted', color: SERIES.converted, values: idxs.map((t) => series.converted[t]), width: 1.5 },
                { name: 'Baseline (same-month mean)', color: '#c9d1e8', dash: true, values: rk.map((k) => clim[moyOf(k) - 1].mean), width: 1.3 },
              ]} />
          </section>
          <section className="half">
            <BarChart title="Annual totals" subtitle="Harmonized hotspots per year in the selected range" exportInfo={exportInfo} fileName="heatmap-annual.png"
              items={years.map((y) => ({ key: String(y.year), label: String(y.year).slice(2), tip: String(y.year), value: y.value }))}
              highlightKey={String(yearOf(focusKey))} refLine={{ value: avgYear, label: 'Average year' }} onPick={(it) => pickKey(keyOf(+it.key, moyOf(focusKey)))} />
          </section>
          <section className="half">
            <BarChart title={`${MONTHS_LONG[moyOf(focusKey) - 1]} in every year`} subtitle="Compare the focused month with the same month in past years (current vs history)"
              exportInfo={exportInfo} fileName="heatmap-same-month.png"
              items={sameMonth.map((s) => ({ key: String(s.y), label: String(s.y).slice(2), tip: `${MONTHS_LONG[moyOf(focusKey) - 1]} ${s.y}`, value: s.v }))}
              highlightKey={String(yearOf(focusKey))} refLine={f ? { value: f.mean, label: 'Multi-year average' } : null} onPick={(it) => pickKey(keyOf(+it.key, moyOf(focusKey)))} />
          </section>

          <section className="card wide unusual">
            <header className="card-h"><div><h3>Unusual months</h3><p className="sub">Months well above their multi-year average (z-score ≥ 1.5) in this area and range</p></div></header>
            {summary.unusual.length === 0 ? <p className="muted pad">No months stand out in this selection.</p> : (
              <ul className="chips">
                {summary.unusual.map((u) => <li key={u.key}><button onClick={() => pickKey(u.key)}><b>{labelOf(u.key)}</b><span>{fmtSigned(u.pct)}% · z {u.z.toFixed(1)}</span></button></li>)}
              </ul>
            )}
          </section>
        </main>
      )}
      <footer className="foot-bar">Data: NASA FIRMS · MODIS + VIIRS harmonized by seasonal regional calibration · Built for NASA Space Apps Challenge · <button className="link" onClick={() => setMethod(true)}>How it works</button></footer>
      {method && data && <MethodPage data={data} onClose={() => setMethod(false)} />}
    </div>
  );
}

function ringVmax(m) {
  const v = m.data.flat().filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length * 0.97)] || v[v.length - 1] : 1;
}
