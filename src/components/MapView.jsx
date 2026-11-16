import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { countColor } from '../lib/colors.js';
import { PK_BOUNDS, PK_OUTLINE } from '../lib/geo.js';
import { fmt } from '../lib/data.js';
import { HandIcon, PinIcon, RectIcon, PolyIcon, CircleIcon, TrashIcon, CheckIcon, XIcon } from './Icons.jsx';

const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const RED = '#ff3b3b';

/** Flat map for drawing an area of interest (rectangle, polygon, circle or point) over the hotspot grid */
export default function MapView({ store, focusKey, available, aoi, radiusKm, onShape, onPoint }) {
  const el = useRef(null);
  const st = useRef({}); // map + layers + live callbacks
  const [tool, setTool] = useState('pan');
  const [draft, setDraft] = useState(0); // polygon vertices placed

  // keep latest callbacks / tool in a ref so Leaflet handlers never go stale
  st.current.onShape = onShape; st.current.onPoint = onPoint; st.current.tool = tool; st.current.radiusKm = radiusKm;

  useEffect(() => {
    const map = L.map(el.current, { center: [30.4, 69.3], zoom: 5, minZoom: 4, maxZoom: 14, preferCanvas: true, worldCopyJump: false });
    L.tileLayer(TILES, { attribution: ATTR, subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    map.fitBounds([[PK_BOUNDS.south, PK_BOUNDS.west], [PK_BOUNDS.north, PK_BOUNDS.east]]);
    const s = st.current;
    s.map = map;
    s.canvas = L.canvas({ padding: 0.5 });
    s.hot = L.layerGroup().addTo(map);
    s.aoi = L.layerGroup().addTo(map);
    s.draft = L.layerGroup().addTo(map);
    s.pts = [];
    L.polyline(PK_OUTLINE, { color: '#ffffff', weight: 1, opacity: 0.35, interactive: false }).addTo(map);

    const done = () => { setTool('pan'); setDraft(0); s.draft.clearLayers(); s.pts = []; map.dragging.enable(); map.doubleClickZoom.enable(); map.getContainer().style.cursor = ''; };
    s.done = done;

    let start = null, tmp = null;
    map.on('mousedown', (e) => {
      if (s.tool !== 'rect' && s.tool !== 'circle') return;
      start = e.latlng; map.dragging.disable();
      tmp = s.tool === 'rect' ? L.rectangle([start, start], { color: RED, weight: 2, fillOpacity: 0.1, interactive: false }) : L.circle(start, { radius: 1, color: RED, weight: 2, fillOpacity: 0.1, interactive: false });
      tmp.addTo(s.draft);
    });
    map.on('mousemove', (e) => {
      if (!start || !tmp) return;
      if (s.tool === 'rect') tmp.setBounds([start, e.latlng]); else tmp.setRadius(start.distanceTo(e.latlng));
    });
    map.on('mouseup', (e) => {
      if (!start) return;
      const a = start; start = null; map.dragging.enable();
      s.draft.clearLayers(); tmp = null;
      if (s.tool === 'rect') {
        const south = Math.min(a.lat, e.latlng.lat), north = Math.max(a.lat, e.latlng.lat), west = Math.min(a.lng, e.latlng.lng), east = Math.max(a.lng, e.latlng.lng);
        if (north - south > 0.01 && east - west > 0.01) { s.onShape({ kind: 'bbox', south, west, north, east, name: 'Drawn rectangle' }); done(); }
      } else {
        const km = a.distanceTo(e.latlng) / 1000;
        if (km >= 1) { s.onShape({ kind: 'circle', lat: a.lat, lng: a.lng, radiusKm: Math.round(km), name: 'Drawn circle' }); done(); }
      }
    });
    map.on('click', (e) => {
      if (s.tool === 'point') { s.onPoint(+e.latlng.lat.toFixed(4), +e.latlng.lng.toFixed(4)); done(); return; }
      if (s.tool === 'polygon') {
        s.pts.push([e.latlng.lat, e.latlng.lng]);
        s.draft.clearLayers();
        L.polyline(s.pts, { color: RED, weight: 2, dashArray: '4 4', interactive: false }).addTo(s.draft);
        s.pts.forEach((p) => L.circleMarker(p, { radius: 4, color: RED, fillColor: RED, fillOpacity: 1, interactive: false }).addTo(s.draft));
        setDraft(s.pts.length);
      }
    });
    map.on('dblclick', () => {
      if (s.tool === 'polygon' && s.pts.length >= 3) { s.onShape({ kind: 'polygon', pts: s.pts.slice(), name: 'Drawn polygon' }); done(); }
    });
    return () => { map.remove(); st.current = {}; };
  }, []);

  // cursor / interaction mode per tool
  useEffect(() => {
    const s = st.current; if (!s.map) return;
    s.map.getContainer().style.cursor = tool === 'pan' ? '' : 'crosshair';
    if (tool === 'polygon') s.map.doubleClickZoom.disable(); else s.map.doubleClickZoom.enable();
  }, [tool]);

  // hotspot cells of the focus month
  useEffect(() => {
    const s = st.current; if (!s.hot) return;
    s.hot.clearLayers();
    const d = available ? store.months[focusKey] : null;
    if (!d) return;
    const g = store.grid;
    for (let q = 0; q < d.k.length; q++) {
      const h = d.s[q] + d.f[q];
      if (h <= 0) continue;
      const k = d.k[q], la = store.cellI[k] * g, ln = store.cellJ[k] * g;
      L.rectangle([[la, ln], [la + g, ln + g]], { renderer: s.canvas, stroke: false, fillColor: countColor(h, store.vmax), fillOpacity: 0.82, interactive: false }).addTo(s.hot);
    }
  }, [store, focusKey, available]);

  // area of interest
  useEffect(() => {
    const s = st.current; if (!s.aoi) return;
    s.aoi.clearLayers();
    if (aoi.kind === 'all') { s.map.fitBounds([[PK_BOUNDS.south, PK_BOUNDS.west], [PK_BOUNDS.north, PK_BOUNDS.east]]); return; }
    const style = { color: RED, weight: 2.5, fillColor: RED, fillOpacity: 0.08, interactive: false };
    const shape = aoi.kind === 'circle' ? L.circle([aoi.center.lat, aoi.center.lng], { ...style, radius: aoi.shape.radiusKm * 1000 })
      : aoi.kind === 'bbox' ? L.rectangle([[aoi.bbox.south, aoi.bbox.west], [aoi.bbox.north, aoi.bbox.east]], style)
        : L.polygon(aoi.shape.pts, style);
    shape.addTo(s.aoi);
    L.circleMarker([aoi.center.lat, aoi.center.lng], { radius: 7, color: '#ffffff', weight: 2, fillColor: RED, fillOpacity: 1, interactive: false }).addTo(s.aoi);
    s.map.fitBounds(shape.getBounds(), { maxZoom: 9, padding: [40, 40] });
  }, [aoi]);

  const tools = [['pan', 'Move', HandIcon], ['point', 'Pick point', PinIcon], ['rect', 'Rectangle', RectIcon], ['polygon', 'Polygon', PolyIcon], ['circle', 'Circle', CircleIcon]];
  const finish = () => { const s = st.current; if (s.pts.length >= 3) { s.onShape({ kind: 'polygon', pts: s.pts.slice(), name: 'Drawn polygon' }); s.done(); } };
  return (
    <div className="view-box">
      <div ref={el} className="leaflet-host" />
      <div className="draw-bar" role="toolbar" aria-label="Draw an area of interest">
        {tools.map(([id, label, Icon]) => (
          <button key={id} className={tool === id ? 'on' : ''} onClick={() => { st.current.done?.(); setTool(id); }} aria-pressed={tool === id} title={label}>
            <Icon /> <span>{label}</span>
          </button>
        ))}
        {tool === 'polygon' && (
          <>
            <button onClick={finish} disabled={draft < 3} title="Finish polygon (or double-click)"><CheckIcon /> <span>Finish</span></button>
            <button onClick={() => st.current.done?.()} title="Cancel drawing"><XIcon /> <span>Cancel</span></button>
          </>
        )}
        <button onClick={() => onShape({ kind: 'all' })} title="Back to all of Pakistan"><TrashIcon /> <span>Clear</span></button>
      </div>
      <div className="draw-hint" aria-live="polite">
        {tool === 'pan' && 'Choose a tool to draw your area of interest, or drag the map.'}
        {tool === 'point' && `Click the map to pick a point (${radiusKm} km radius).`}
        {tool === 'rect' && 'Press, drag and release to draw a rectangle.'}
        {tool === 'circle' && 'Press at the centre, drag to set the radius, release.'}
        {tool === 'polygon' && `Click to add corners (${draft} placed). Double-click or press Finish.`}
      </div>
      {!available && <div className="overlay-msg">Data not available for this month. The archive covers January 2012 – December 2025.</div>}
    </div>
  );
}
