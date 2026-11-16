import React from 'react';
import { fmt } from '../lib/data.js';
import { XIcon } from './Icons.jsx';

/** plain-language explanation of the harmonization and its measured accuracy */
export default function MethodPage({ data, onClose }) {
  const { calibration: c, validation: v, meta } = data;
  const row = (list, name) => list.find((r) => r.grid_deg === 0.1 && r.method === name) || {};
  const loyoConst = row(v.loyo, 'constant ratio'), loyoSeas = row(v.loyo, 'seasonal regional (chosen)');
  const bc = row(v.backcast_2018_2025_to_2012_2017, 'seasonal regional (chosen)');
  const byGrid = (g) => v.loyo.find((r) => r.grid_deg === g && r.method === 'seasonal regional (chosen)');
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Method">
      <div className="modal-card">
        <button className="btn tiny close" onClick={onClose} aria-label="Close"><XIcon /> Close</button>
        <h2>How HeatMap harmonizes MODIS and VIIRS</h2>
        <p className="lead">MODIS (1 km, since 2000) and VIIRS (375 m, since 2012) both detect active fires, but VIIRS sees about {c.overall_ratio.toFixed(1)}× more hotspots in Pakistan because its pixels are smaller. Counting them side by side would make fire look like it jumped in 2012. HeatMap puts both sensors on one VIIRS-equivalent scale.</p>
        <h3>1 · Clean</h3>
        <p>NASA FIRMS hotspots, {meta.first_date} to {meta.last_date}: vegetation fires only (type 0), nominal/high confidence (MODIS ≥ 30, VIIRS n/h), centre inside Pakistan. {fmt(meta.detections)} detections kept ({fmt(meta.by_sensor.MODIS)} MODIS, {fmt(meta.by_sensor.SNPP)} S-NPP, {fmt(meta.by_sensor.N20)} NOAA-20).</p>
        <h3>2 · Calibrate by season and region</h3>
        <p>The VIIRS/MODIS ratio is not constant: about {Math.min(...c.national_by_month).toFixed(1)} in winter and up to {Math.max(...c.national_by_month).toFixed(1)} in June, and it differs by region. For each 2° region and calendar month we measure the ratio over the {calibration_label(c)} overlap, using VIIRS S-NPP as the reference and shrinking sparse regions toward the national ratio.</p>
        <h3>3 · Harmonize</h3>
        <p>Harmonized count = VIIRS hotspots + gap fill. On days when VIIRS was missing (before 20 Jan 2012 and {fmt(meta.viirs_gap_days.length)} outage days in total) MODIS × ratio fills the gap ({fmt(meta.viirs_gap_fill_hotspots)} hotspots added). NOAA-20 is shown separately because it duplicates S-NPP (correlation {v.n20_vs_snpp.monthly_correlation}, ratio {v.n20_vs_snpp.ratio_n20_over_snpp}).</p>
        <h3>How accurate is it?</h3>
        <p>We hide one year, calibrate on the rest, and predict that year's MODIS-converted counts, then compare to VIIRS.</p>
        <table className="data-table">
          <thead><tr><th>Test (national, monthly)</th><th>Constant ratio</th><th>HeatMap method</th></tr></thead>
          <tbody>
            <tr><td>Leave-one-year-out error</td><td>{loyoConst.national_month_mape_pct}%</td><td><b>{loyoSeas.national_month_mape_pct}%</b></td></tr>
            <tr><td>Annual total error</td><td>{loyoConst.annual_mape_pct}%</td><td><b>{loyoSeas.annual_mape_pct}%</b></td></tr>
            <tr><td>Back-cast: fit 2018–25, predict 2012–17</td><td>–</td><td><b>{bc.national_month_mape_pct}% monthly, {bc.annual_mape_pct}% annual</b></td></tr>
          </tbody>
        </table>
        <p>Agreement with VIIRS depends on the size of the area (cell R²): {[0.1, 0.25, 0.5, 1].map((g) => byGrid(g) && `${g}° → ${byGrid(g).cell_r2.toFixed(2)}`).filter(Boolean).join(' · ')}.</p>
        <h3>Limits you should know</h3>
        <ul>
          <li>For areas smaller than about 2,500 km² the converted MODIS values are noisy; the app shows a confidence label for your area.</li>
          <li>This archive covers 2012–2025, when VIIRS exists for the whole period, so the conversion matters mainly for gap days. It becomes essential once MODIS-only years (2000–2011) are added.</li>
          <li>Hotspots are satellite detections of active fire, not burned area, and clouds or satellite overpass timing can hide fires.</li>
          <li>The early-warning feature compares your location with archived hotspots, it is not a live fire feed.</li>
        </ul>
        <p className="muted">Data: NASA FIRMS (MODIS Collection 6.1, VIIRS S-NPP and NOAA-20 375 m). Basemap © OpenStreetMap contributors © CARTO.</p>
      </div>
    </div>
  );
}
function calibration_label(c) { return c.calibration_months.replace(' to ', ' – '); }
