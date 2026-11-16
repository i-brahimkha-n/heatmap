import React, { useRef, useState } from 'react';
import { MONTHS_SHORT, MONTHS_LONG, keyOf, fmt, fmtSigned, inRange } from '../lib/data.js';
import { countColor, countTick, zColor, divRamp, fireRamp, cssGradient } from '../lib/colors.js';
import { ChartFrame, INK, short } from './Charts.jsx';
import { TableIcon } from './Icons.jsx';

const FONT = 'Inter, system-ui, sans-serif';
const LBL = 46, CW = 54, CH = 26, GAP = 2, TOP = 22;

// pick black or white text for a given fill
function ink(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return l > 0.52 ? '#0b0f1c' : '#ffffff';
}

/** Year x month burning calendar. mode: 'counts' (inferno) or 'anomaly' (cool/warm diverging). */
export default function CalendarGrid({ matrix, mode, onMode, clim, vmax, focusKey, range, onPick, exportInfo }) {
  const svgRef = useRef(null);
  const wrap = useRef(null);
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const W = LBL + 12 * CW + 6, H = TOP + matrix.years.length * (CH + GAP) + 4;
  const colorOf = (v, mi) => {
    if (v == null) return '#161d33';
    if (mode === 'anomaly') { const c = clim[mi]; return zColor(c.std > 0 ? (v - c.mean) / c.std : 0); }
    return countColor(v, vmax);
  };
  const labelOf = (v, mi) => {
    if (v == null) return '';
    if (mode === 'anomaly') { const c = clim[mi]; return c.mean > 0 ? `${fmtSigned(((v - c.mean) / c.mean) * 100)}%` : ''; }
    return short(v);
  };
  const track = (e, yi, mi) => {
    const r = wrap.current.getBoundingClientRect();
    setHover({ yi, mi, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
  };
  const hv = hover ? matrix.data[hover.yi][hover.mi] : null;
  const hc = hover ? clim[hover.mi] : null;

  const toggle = (
    <div className="seg" role="group" aria-label="Calendar colouring">
      <button className={mode === 'counts' ? 'on' : ''} onClick={() => onMode('counts')} aria-pressed={mode === 'counts'}>Hotspots</button>
      <button className={mode === 'anomaly' ? 'on' : ''} onClick={() => onMode('anomaly')} aria-pressed={mode === 'anomaly'}>Anomaly</button>
      <button className={table ? 'on' : ''} onClick={() => setTable(!table)} aria-pressed={table} title="Show as a table"><TableIcon /> Table</button>
    </div>
  );
  return (
    <ChartFrame title="Burning calendar" fileName="heatmap-burning-calendar.png" svgRef={svgRef} exportInfo={exportInfo} actions={toggle}
      subtitle={mode === 'anomaly' ? 'Each month compared with the average of the same month in all years (% above or below average)' : 'Harmonized hotspots per month. Brighter = more burning. Click a month to focus it.'}>
      {table ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Year</th>{MONTHS_SHORT.map((m) => <th key={m}>{m}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {matrix.years.map((y, yi) => (
                <tr key={y}><th>{y}</th>
                  {matrix.data[yi].map((v, mi) => <td key={mi}>{v == null ? '–' : fmt(v)}</td>)}
                  <td><b>{fmt(matrix.data[yi].reduce((a, b) => a + (b || 0), 0))}</b></td></tr>
              ))}
              <tr><th>Avg</th>{clim.map((c, i) => <td key={i}>{fmt(c.mean)}</td>)}<td /></tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="plot" ref={wrap}>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Burning calendar: hotspots per month and year" style={{ width: '100%', height: 'auto', display: 'block' }}>
            <title>Burning calendar</title>
            {MONTHS_SHORT.map((m, mi) => (
              <text key={m} x={LBL + mi * CW + CW / 2} y={14} textAnchor="middle" fontSize="10.5" fontFamily={FONT} fill={INK.muted}>{m}</text>
            ))}
            {matrix.years.map((y, yi) => (
              <g key={y}>
                <text x={LBL - 8} y={TOP + yi * (CH + GAP) + CH / 2 + 3.5} textAnchor="end" fontSize="10.5" fontFamily={FONT} fill={INK.muted}>{y}</text>
                {MONTHS_SHORT.map((m, mi) => {
                  const v = matrix.data[yi][mi];
                  const key = keyOf(y, mi + 1);
                  const fill = colorOf(v, mi);
                  const isFocus = key === focusKey;
                  const dim = range && !inRange(key, range);
                  return (
                    <g key={m} opacity={dim ? 0.3 : 1} style={{ cursor: 'pointer' }} onMouseMove={(e) => track(e, yi, mi)} onMouseLeave={() => setHover(null)} onClick={() => onPick(key)}>
                      <rect x={LBL + mi * CW} y={TOP + yi * (CH + GAP)} width={CW - GAP} height={CH} rx="4" fill={fill} stroke={isFocus ? '#ffffff' : 'none'} strokeWidth={isFocus ? 2 : 0} />
                      <text x={LBL + mi * CW + (CW - GAP) / 2} y={TOP + yi * (CH + GAP) + CH / 2 + 3.5} textAnchor="middle" fontSize="10" fontFamily={FONT} fill={ink(fill)} fontWeight="600" pointerEvents="none">{labelOf(v, mi)}</text>
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
          {hover && (
            <div className="tip" style={{ left: Math.min(hover.x + 12, hover.w - 200), top: hover.y - 10, transform: 'translateY(-100%)' }}>
              <b>{MONTHS_LONG[hover.mi]} {matrix.years[hover.yi]}</b>
              <div>{hv == null ? 'No data' : `${fmt(hv)} hotspots`}</div>
              {hv != null && <div className="muted">Average for {MONTHS_SHORT[hover.mi]}: {fmt(hc.mean)}</div>}
              {hv != null && hc.mean > 0 && <div className="muted">{fmtSigned(((hv - hc.mean) / hc.mean) * 100)}% · {hc.std > 0 ? fmtSigned((hv - hc.mean) / hc.std, 1) : '0'}σ</div>}
            </div>
          )}
        </div>
      )}
      <Legend mode={mode} vmax={vmax} />
    </ChartFrame>
  );
}

export function Legend({ mode, vmax }) {
  if (mode === 'anomaly') {
    return (
      <div className="ramp-legend" aria-label="Colour legend">
        <span>Below average</span>
        <i style={{ background: cssGradient((t) => divRamp(t * 2 - 1), 15) }} />
        <span>Above average</span>
        <em>colour = standard deviations from the same-month average (±3σ)</em>
      </div>
    );
  }
  return (
    <div className="ramp-legend" aria-label="Colour legend">
      <span>0</span>
      <i style={{ background: cssGradient((t) => fireRamp(t), 15) }} />
      <span>{short(vmax)}+</span>
      <em>square-root colour scale · quiet months stay visible</em>
    </div>
  );
}
