import React, { useRef, useState } from 'react';
import { MONTHS_SHORT, MONTHS_LONG, DATA_START_YEAR, fmt, fmtSigned, keyOf, inRange as inRangeKey } from '../lib/data.js';
import { countColor, zColor } from '../lib/colors.js';
import { ChartFrame, INK } from './Charts.jsx';
import { PlayIcon, PauseIcon } from './Icons.jsx';

const FONT = 'Inter, system-ui, sans-serif';
const S = 470, C = S / 2, R_IN = 86, R_OUT = 198;
const pt = (r, deg) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];
const arc = (r0, r1, a0, a1) => {
  const [x1, y1] = pt(r1, a0), [x2, y2] = pt(r1, a1), [x3, y3] = pt(r0, a1), [x4, y4] = pt(r0, a0);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r1},${r1} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${r0},${r0} 0 0 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`;
};

/**
 * Pyro-Ring: the burning calendar as concentric rings.
 * one ring per year (2012 inner -> 2025 outer), twelve months clockwise from the top (January).
 */
export default function PyroRing({ matrix, mode, clim, vmax, focusKey, range, onPick, playing, onToggle, focus, subtitle }) {
  const svgRef = useRef(null);
  const wrap = useRef(null);
  const [hover, setHover] = useState(null);
  const nY = matrix.years.length;
  const th = (R_OUT - R_IN) / nY;
  const colorOf = (v, mi) => {
    if (v == null) return '#161d33';
    if (mode === 'anomaly') {
      const c = clim[mi];
      return zColor(c.std > 0 ? (v - c.mean) / c.std : 0);
    }
    return countColor(v, vmax);
  };
  const track = (e, yi, mi) => {
    const r = wrap.current.getBoundingClientRect();
    setHover({ yi, mi, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
  };
  const fy = focusKey ? +focusKey.slice(0, 4) : null, fm = focusKey ? +focusKey.slice(5, 7) - 1 : null;
  const hv = hover ? matrix.data[hover.yi][hover.mi] : null;
  const hc = hover ? clim[hover.mi] : null;
  return (
    <ChartFrame className="pyro-card" title="Pyro-Ring" subtitle={subtitle || 'Click a segment to focus that month'} svgRef={svgRef} fileName="heatmap-pyro-ring.png" exportInfo="Pyro-Ring burning calendar · one ring per year, inner = 2012, outer = 2025, clockwise from January"
      legend={[{ name: mode === 'anomaly' ? 'Cool = below average, warm = above' : 'Dark = quiet, bright = many hotspots', color: '#ee7a2a' }]}>
      <div className="plot ring-wrap" ref={wrap}>
        <div className="halo" aria-hidden="true" />
        <svg ref={svgRef} viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Pyro-Ring burning calendar" style={{ width: '100%', height: 'auto', display: 'block', position: 'relative' }}>
          <title>Pyro-Ring burning calendar</title>
          <circle cx={C} cy={C} r={R_OUT + 3} fill="none" stroke="#2a3558" strokeDasharray="2 5" />
          {matrix.years.map((y, yi) => {
            const r0 = R_IN + yi * th, r1 = r0 + th - 1.3;
            return MONTHS_SHORT.map((mn, mi) => {
              const a0 = -90 + mi * 30 + 0.7, a1 = a0 + 30 - 1.4;
              const v = matrix.data[yi][mi];
              const key = keyOf(y, mi + 1);
              const inR = range ? inRangeKey(key, range) : true;
              const isFocus = y === fy && mi === fm;
              return (
                <path key={key} d={arc(r0, r1, a0, a1)} fill={colorOf(v, mi)} opacity={inR ? 1 : 0.28}
                  stroke={isFocus ? '#ffffff' : 'none'} strokeWidth={isFocus ? 2 : 0} style={{ cursor: 'pointer' }}
                  onMouseMove={(e) => track(e, yi, mi)} onMouseLeave={() => setHover(null)} onClick={() => onPick(key)}>
                  <title>{`${MONTHS_LONG[mi]} ${y}: ${v == null ? 'no data' : fmt(v)} hotspots`}</title>
                </path>
              );
            });
          })}
          {MONTHS_SHORT.map((mn, mi) => {
            const [tx, ty] = pt(R_OUT + 15, -90 + mi * 30 + 15);
            return <text key={mn} x={tx} y={ty + 3.5} textAnchor="middle" fontSize="10.5" fontFamily={FONT} fill={mi === fm ? '#ffffff' : INK.muted} fontWeight={mi === fm ? 700 : 500}>{mn}</text>;
          })}
          <text x={C} y={C - R_IN + 12} textAnchor="middle" fontSize="8.5" fontFamily={FONT} fill={INK.muted}>{DATA_START_YEAR} ▸ inner</text>
          {/* centre read-out */}
          <text x={C} y={C - 34} textAnchor="middle" fontSize="11" fontFamily={FONT} fill={INK.muted} letterSpacing="1.5">FOCUS</text>
          <text x={C} y={C - 8} textAnchor="middle" fontSize="22" fontWeight="800" fontFamily={FONT} fill="#ffffff">{focus ? `${MONTHS_SHORT[fm]} ${fy}` : '—'}</text>
          <text x={C} y={C + 14} textAnchor="middle" fontSize="15" fontWeight="700" fontFamily={FONT} fill="#ffb347">{focus ? fmt(focus.value) : ''}</text>
          <text x={C} y={C + 28} textAnchor="middle" fontSize="9" fontFamily={FONT} fill={INK.muted}>hotspots · VIIRS-equivalent</text>
          {focus && <text x={C} y={C + 44} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily={FONT} fill={focus.pct >= 0 ? '#ffb347' : '#6fb4ff'}>{fmtSigned(focus.pct)}% vs avg</text>}
        </svg>
        <button className="ring-play" onClick={onToggle} aria-label={playing ? 'Pause timeline' : 'Play timeline'} title={playing ? 'Pause' : 'Play through the months'}>
          {playing ? <PauseIcon width={18} height={18} /> : <PlayIcon width={18} height={18} />}
        </button>
        {hover && (
          <div className="tip" style={{ left: Math.min(hover.x + 12, hover.w - 190), top: hover.y - 10, transform: 'translateY(-100%)' }}>
            <b>{MONTHS_LONG[hover.mi]} {matrix.years[hover.yi]}</b>
            <div>{hv == null ? 'No data' : `${fmt(hv)} hotspots`}</div>
            {hv != null && <div className="muted">avg {fmt(hc.mean)} · {fmtSigned(hc.mean > 0 ? ((hv - hc.mean) / hc.mean) * 100 : 0)}%</div>}
          </div>
        )}
      </div>
      <p className="foot">Rings: {matrix.years[0]} (inner) → {matrix.years[nY - 1]} (outer). Months run clockwise from January at the top.</p>
    </ChartFrame>
  );
}
