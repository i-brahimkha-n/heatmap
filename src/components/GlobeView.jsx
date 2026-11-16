import React, { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { countColor } from '../lib/colors.js';
import { PK_CENTER, PK_OUTLINE } from '../lib/geo.js';
import { fmt } from '../lib/data.js';

function targetElement() {
  const el = document.createElement('div');
  el.className = 'target-dot';
  el.innerHTML = '<span class="pulse"></span><span class="core"></span>';
  el.style.pointerEvents = 'none';
  return el;
}

/** 3D globe: harmonized hotspot cells for the focus month, the red target dot and the area outline */
export default function GlobeView({ store, focusKey, available, aoi, onPick, introDone }) {
  const globeEl = useRef(null);
  const box = useRef(null);
  const [size, setSize] = useState({ w: 640, h: 560 });

  useEffect(() => {
    if (!box.current) return undefined;
    const update = () => { const r = box.current.getBoundingClientRect(); setSize({ w: Math.max(280, Math.round(r.width)), h: Math.max(320, Math.round(r.height)) }); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const cells = useMemo(() => {
    const d = available ? store.months[focusKey] : null;
    if (!d) return [];
    const g = store.grid;
    const out = [];
    for (let q = 0; q < d.k.length; q++) {
      const h = d.s[q] + d.f[q];
      if (h <= 0) continue;
      const k = d.k[q];
      out.push({ lat: (store.cellI[k] + 0.5) * g, lng: (store.cellJ[k] + 0.5) * g, h });
    }
    return out;
  }, [store, focusKey, available]);

  const paths = useMemo(() => {
    const list = [{ pts: PK_OUTLINE, color: 'rgba(255,255,255,0.45)', stroke: 0.35 }];
    if (aoi.kind !== 'all') list.push({ pts: aoi.outline, color: '#ff3b3b', stroke: 0.9 });
    return list;
  }, [aoi]);

  const marker = useMemo(() => (aoi.kind === 'all' ? [] : [{ lat: aoi.center.lat, lng: aoi.center.lng }]), [aoi]);

  // camera
  useEffect(() => {
    if (!introDone || !globeEl.current) return;
    const { south, north, west, east } = aoi.bbox;
    const ext = Math.max(north - south, (east - west) * Math.cos((aoi.center.lat * Math.PI) / 180));
    const altitude = aoi.kind === 'all' ? 1.7 : Math.min(2, Math.max(0.35, 0.25 + ext / 18));
    globeEl.current.pointOfView({ lat: aoi.center.lat, lng: aoi.center.lng, altitude }, 1200);
  }, [aoi, introDone]);

  return (
    <div className="view-box" ref={box}>
      <Globe
        ref={globeEl}
        width={size.w}
        height={size.h}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        atmosphereColor="#ff8a3d"
        onGlobeClick={({ lat, lng }) => onPick(+lat.toFixed(4), +lng.toFixed(4))}
        pointsData={cells}
        pointsMerge={cells.length > 2500}
        pointLat="lat"
        pointLng="lng"
        pointColor={(d) => countColor(d.h, store.vmax)}
        pointRadius={0.32}
        pointAltitude={(d) => 0.004 + 0.1 * Math.sqrt(Math.min(d.h / store.vmax, 1))}
        pointLabel={(d) => `<div class="g-tip"><b>${d.lat.toFixed(2)}°N, ${d.lng.toFixed(2)}°E</b><br/>${fmt(d.h)} hotspots (VIIRS-equivalent)</div>`}
        onPointClick={(d) => onPick(d.lat, d.lng)}
        pathsData={paths}
        pathPoints="pts"
        pathPointLat={(p) => p[0]}
        pathPointLng={(p) => p[1]}
        pathColor={(d) => d.color}
        pathStroke={(d) => d.stroke}
        pathPointAlt={0.003}
        htmlElementsData={marker}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={0.01}
        htmlElement={targetElement}
      />
      {!available && <div className="overlay-msg">Data not available for this month. The archive covers January 2012 – December 2025.</div>}
    </div>
  );
}

export { PK_CENTER };
