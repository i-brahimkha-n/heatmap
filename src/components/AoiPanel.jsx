import React, { useEffect, useState } from 'react';
import { fmt } from '../lib/data.js';
import { conversionConfidence } from '../lib/geo.js';
import { PinIcon, TrashIcon } from './Icons.jsx';

/** shows the selected area (with latitude / longitude) and lets people type coordinates */
export default function AoiPanel({ aoi, radiusKm, onRadius, onShape, onReset, cellsInside }) {
  const [mode, setMode] = useState('circle');
  const [f, setF] = useState({ lat: '', lng: '', r: '25', s: '', w: '', n: '', e: '' });
  const [err, setErr] = useState('');
  useEffect(() => {
    if (aoi.kind === 'circle') setF((p) => ({ ...p, lat: aoi.center.lat.toFixed(4), lng: aoi.center.lng.toFixed(4), r: String(aoi.shape.radiusKm) }));
    if (aoi.kind === 'bbox') setF((p) => ({ ...p, s: aoi.bbox.south.toFixed(3), w: aoi.bbox.west.toFixed(3), n: aoi.bbox.north.toFixed(3), e: aoi.bbox.east.toFixed(3) }));
  }, [aoi]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const apply = (e) => {
    e.preventDefault();
    const v = (x) => Number(String(x).trim());
    if (mode === 'circle') {
      const [lat, lng, r] = [v(f.lat), v(f.lng), v(f.r)];
      if (![lat, lng, r].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || r <= 0 || r > 500) { setErr('Enter a valid latitude (−90…90), longitude (−180…180) and radius (1–500 km).'); return; }
      setErr(''); onShape({ kind: 'circle', lat, lng, radiusKm: Math.round(r), name: 'Custom point' });
    } else {
      const [s, w, n, ea] = [v(f.s), v(f.w), v(f.n), v(f.e)];
      if (![s, w, n, ea].every(Number.isFinite) || s >= n || w >= ea || Math.abs(s) > 90 || Math.abs(n) > 90) { setErr('South must be below north and west below east.'); return; }
      setErr(''); onShape({ kind: 'bbox', south: s, west: w, north: n, east: ea, name: 'Custom rectangle' });
    }
  };
  const conf = conversionConfidence(aoi.areaKm2);
  return (
    <section className="card aoi">
      <header className="card-h">
        <div><h3>Area of interest</h3><p className="sub">Click the globe, search a place, draw on the map, or type coordinates</p></div>
        {aoi.kind !== 'all' && <button className="btn tiny" onClick={onReset}><TrashIcon /> All Pakistan</button>}
      </header>
      <div className={`aoi-now ${aoi.kind !== 'all' ? 'sel' : ''}`}>
        <PinIcon />
        <div>
          <b>{aoi.name}</b>
          <div className="coords">
            <span>Latitude <em>{aoi.center.lat.toFixed(4)}°N</em></span>
            <span>Longitude <em>{aoi.center.lng.toFixed(4)}°E</em></span>
          </div>
          <div className="muted">{aoi.label} · {fmt(aoi.areaKm2)} km²</div>
        </div>
      </div>
      {aoi.kind === 'circle' && (
        <label className="slider">Radius <b>{radiusKm} km</b>
          <input type="range" min="5" max="150" step="5" value={radiusKm} onChange={(e) => onRadius(+e.target.value)} aria-label="Radius in kilometres" />
        </label>
      )}
      <div className="seg small" role="group" aria-label="Coordinate entry">
        <button className={mode === 'circle' ? 'on' : ''} onClick={() => setMode('circle')}>Point + radius</button>
        <button className={mode === 'bbox' ? 'on' : ''} onClick={() => setMode('bbox')}>Rectangle</button>
      </div>
      <form onSubmit={apply} className="coord-form">
        {mode === 'circle' ? (
          <>
            <label>Latitude<input value={f.lat} onChange={set('lat')} inputMode="decimal" placeholder="31.5204" /></label>
            <label>Longitude<input value={f.lng} onChange={set('lng')} inputMode="decimal" placeholder="74.3587" /></label>
            <label>Radius km<input value={f.r} onChange={set('r')} inputMode="decimal" placeholder="25" /></label>
          </>
        ) : (
          <>
            <label>South<input value={f.s} onChange={set('s')} inputMode="decimal" /></label>
            <label>North<input value={f.n} onChange={set('n')} inputMode="decimal" /></label>
            <label>West<input value={f.w} onChange={set('w')} inputMode="decimal" /></label>
            <label>East<input value={f.e} onChange={set('e')} inputMode="decimal" /></label>
          </>
        )}
        <button className="btn primary" type="submit">Apply</button>
      </form>
      {err && <p className="form-err" role="alert">{err}</p>}
      <div className={`conf ${conf.level}`} title="How reliable MODIS→VIIRS converted values are for an area this size">
        <span>Conversion confidence</span><b>{conf.label}</b>
        <p>{conf.note}{cellsInside != null ? ` Charts use ≈${fmt(cellsInside, 1)} grid cells (0.1° ≈ 11 km).` : ''}</p>
      </div>
    </section>
  );
}
