// Geometry helpers: Pakistan outline, area-of-interest (AOI) shapes and cell weights.
export const KM_PER_DEG = 111.32;

// Approximate Pakistan outline as [lng, lat] (accurate to roughly 10-20 km).
export const PK_POLY = [
  [61.6, 25.05], [61.8, 26.2], [63.2, 26.7], [63.2, 27.2], [62.8, 28.2], [62.4, 29.4],
  [63.6, 29.5], [64.4, 29.6], [66.2, 29.85], [66.4, 30.9], [67.8, 31.6], [69.3, 31.9],
  [69.3, 33.0], [70.3, 33.9], [71.1, 34.05], [71.4, 35.2], [71.6, 36.0], [72.8, 36.9],
  [74.8, 37.0], [75.9, 36.7], [77.8, 35.5], [76.7, 34.9], [75.0, 34.6], [74.2, 34.0],
  [74.0, 33.2], [74.5, 32.8], [75.3, 32.3], [74.7, 31.9], [74.6, 31.0], [74.1, 30.5],
  [73.8, 29.9], [72.9, 29.0], [71.9, 27.9], [70.9, 27.7], [70.2, 26.9], [70.4, 26.1],
  [70.1, 25.7], [70.4, 25.2], [70.9, 24.75], [71.1, 24.4], [70.6, 24.1], [69.6, 24.0],
  [68.7, 23.8], [68.2, 23.65], [67.45, 24.1], [67.3, 24.75], [66.7, 24.75], [66.5, 25.4],
  [64.6, 25.3], [62.3, 25.0],
];
export const PK_BOUNDS = { south: 23.6, west: 60.8, north: 37.2, east: 77.9 };
export const PK_CENTER = { lat: 30.4, lng: 69.3 };
export const PK_OUTLINE = [...PK_POLY, PK_POLY[0]].map(([lng, lat]) => [lat, lng]); // [lat,lng]

/** ray casting; poly is [[lng,lat],...] */
export function inPoly(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const inPakistan = (lat, lng) => inPoly(lat, lng, PK_POLY);

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** polygon area in km2, pts = [[lat,lng],...] (local equirectangular projection) */
export function polygonAreaKm2(pts) {
  if (pts.length < 3) return 0;
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const kx = KM_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    sum += pts[j][1] * kx * (pts[i][0] * KM_PER_DEG) - pts[i][1] * kx * (pts[j][0] * KM_PER_DEG);
  }
  return Math.abs(sum) / 2;
}

export function circleOutline(lat, lng, radiusKm, n = 64) {
  const out = [];
  const dLat = radiusKm / KM_PER_DEG;
  const dLng = radiusKm / (KM_PER_DEG * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    out.push([lat + dLat * Math.sin(a), lng + dLng * Math.cos(a)]);
  }
  return out;
}

export function bboxOutline(s, w, n, e) {
  return [[s, w], [s, e], [n, e], [n, w], [s, w]];
}

/**
 * shape: {kind:'all'} | {kind:'circle', lat, lng, radiusKm, name}
 *        | {kind:'bbox', south, west, north, east, name} | {kind:'polygon', pts:[[lat,lng],...], name}
 * Returns an AOI object with contains(lat,lng), outline, bbox, center, areaKm2, label.
 */
export function makeAoi(shape) {
  const kind = shape?.kind || 'all';
  if (kind === 'circle') {
    const { lat, lng, radiusKm } = shape;
    const dLat = radiusKm / KM_PER_DEG;
    const dLng = radiusKm / (KM_PER_DEG * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
    return {
      kind, shape, name: shape.name || 'Selected point', center: { lat, lng },
      bbox: { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng },
      contains: (la, ln) => haversine(lat, lng, la, ln) <= radiusKm,
      outline: circleOutline(lat, lng, radiusKm), areaKm2: Math.PI * radiusKm * radiusKm,
      label: `${radiusKm} km around ${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`,
    };
  }
  if (kind === 'bbox') {
    const { south, west, north, east } = shape;
    const outline = bboxOutline(south, west, north, east);
    return {
      kind, shape, name: shape.name || 'Drawn rectangle',
      center: { lat: (south + north) / 2, lng: (west + east) / 2 },
      bbox: { south, west, north, east },
      contains: (la, ln) => la >= south && la <= north && ln >= west && ln <= east,
      outline, areaKm2: polygonAreaKm2(outline),
      label: `${south.toFixed(2)}–${north.toFixed(2)}°N, ${west.toFixed(2)}–${east.toFixed(2)}°E`,
    };
  }
  if (kind === 'polygon') {
    const pts = shape.pts;
    const poly = pts.map(([la, ln]) => [ln, la]);
    const lats = pts.map((p) => p[0]);
    const lngs = pts.map((p) => p[1]);
    return {
      kind, shape, name: shape.name || 'Drawn polygon',
      center: { lat: lats.reduce((a, b) => a + b, 0) / lats.length, lng: lngs.reduce((a, b) => a + b, 0) / lngs.length },
      bbox: { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lngs), east: Math.max(...lngs) },
      contains: (la, ln) => inPoly(la, ln, poly),
      outline: [...pts, pts[0]], areaKm2: polygonAreaKm2(pts),
      label: `polygon with ${pts.length} corners`,
    };
  }
  return {
    kind: 'all', shape: { kind: 'all' }, name: 'All Pakistan', center: { ...PK_CENTER },
    bbox: { ...PK_BOUNDS }, contains: inPakistan, outline: PK_OUTLINE,
    areaKm2: polygonAreaKm2(PK_OUTLINE), label: 'whole country',
  };
}

/**
 * Fraction (0..1) of every 0.1-degree cell that lies inside the AOI, sampled on a 5x5 grid.
 * cellI/cellJ are the floor(lat*10)/floor(lng*10) indices of each cell.
 */
export function aoiWeights(aoi, cellI, cellJ, grid = 0.1) {
  const n = cellI.length;
  const w = new Float32Array(n);
  if (aoi.kind === 'all') { w.fill(1); return w; }
  const { south, north, west, east } = aoi.bbox;
  const S = 5;
  for (let k = 0; k < n; k++) {
    const la0 = cellI[k] * grid, ln0 = cellJ[k] * grid;
    if (la0 > north || la0 + grid < south || ln0 > east || ln0 + grid < west) continue;
    let hit = 0;
    for (let a = 0; a < S; a++) {
      for (let b = 0; b < S; b++) {
        if (aoi.contains(la0 + ((a + 0.5) / S) * grid, ln0 + ((b + 0.5) / S) * grid)) hit++;
      }
    }
    w[k] = hit / (S * S);
  }
  // very small AOI that fell between sample points: give the centre cell its area share
  let sum = 0;
  for (let k = 0; k < n; k++) sum += w[k];
  if (sum === 0 && inPakistan(aoi.center.lat, aoi.center.lng)) {
    const ci = Math.floor(aoi.center.lat / grid), cj = Math.floor(aoi.center.lng / grid);
    const cellKm2 = grid * KM_PER_DEG * grid * KM_PER_DEG * Math.cos((aoi.center.lat * Math.PI) / 180);
    for (let k = 0; k < n; k++) {
      if (cellI[k] === ci && cellJ[k] === cj) { w[k] = Math.min(1, aoi.areaKm2 / cellKm2); break; }
    }
  }
  return w;
}

/** reliability of MODIS->VIIRS conversion for an area of this size (see Method page) */
export function conversionConfidence(areaKm2) {
  if (areaKm2 >= 12000) return { level: 'good', label: 'Good', note: 'Large area: converted MODIS values track VIIRS closely (R² ≈ 0.8–0.9).' };
  if (areaKm2 >= 2500) return { level: 'fair', label: 'Fair', note: 'Medium area: converted values are reasonable (R² ≈ 0.65–0.8).' };
  return { level: 'low', label: 'Low', note: 'Small area: converted MODIS values are noisy. Treat pre-VIIRS estimates as indicative only.' };
}
