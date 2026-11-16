import React, { useRef, useState } from 'react';
import { svgToPng } from '../lib/export.js';
import { DownloadIcon } from './Icons.jsx';

const FONT = 'Inter, system-ui, sans-serif';
export const INK = { text: '#e8ecf6', muted: '#8b96b3', grid: '#1c2540', axis: '#33406a' };

export function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
export const short = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(v)));
const num = (v) => Math.round(v).toLocaleString('en-US');

/** card with title, legend and a "PNG" export button; `svgRef` is the chart's <svg> */
export function ChartFrame({ title, subtitle, legend, svgRef, fileName, exportInfo, children, actions, className = '' }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try { await svgToPng(svgRef.current, fileName, { title, subtitle: exportInfo || subtitle, legend }); } finally { setBusy(false); }
  };
  return (
    <section className={`card chart ${className}`}>
      <header className="card-h">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="sub">{subtitle}</p>}
        </div>
        <div className="card-actions">
          {actions}
          <button className="btn tiny" onClick={download} disabled={busy} title="Download this chart as a PNG image" aria-label={`Download ${title} as PNG`}>
            <DownloadIcon /> PNG
          </button>
        </div>
      </header>
      {legend && (
        <ul className="legend">
          {legend.map((l) => (
            <li key={l.name}><i className={l.dash ? 'dash' : ''} style={{ '--c': l.color }} />{l.name}</li>
          ))}
        </ul>
      )}
      <div className="chart-body">{children}</div>
    </section>
  );
}

function Tip({ x, y, flip, children }) {
  return <div className="tip" style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${flip ? '-100%' : '0'}, -105%)` }}>{children}</div>;
}

/* ---------------------------------------------------------------- line chart */
export function LineChart({ title, subtitle, exportInfo, fileName = 'chart.png', labels, series, band, height = 260, xTicks, focusIndex, onPick, yTitle = 'Hotspots / month' }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 760, H = height, m = { l: 50, r: 14, t: 12, b: 26 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b, n = labels.length;
  const maxV = niceMax(Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null)), ...(band ? band.hi : [])) * 1.04);
  const x = (i) => m.l + (n > 1 ? i / (n - 1) : 0.5) * pw;
  const y = (v) => m.t + ph - (v / maxV) * ph;
  const path = (vals) => vals.map((v, i) => (v == null ? null : `${i && vals[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const gridVals = [0, 1, 2, 3, 4].map((i) => (maxV * i) / 4);
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) * W) / r.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / pw) * (n - 1)))));
  };
  const legend = [...series.map((s) => ({ name: s.name, color: s.color, dash: !!s.dash })), ...(band ? [{ name: band.name, color: band.color }] : [])];
  return (
    <ChartFrame title={title} subtitle={subtitle} legend={legend} svgRef={svgRef} fileName={fileName} exportInfo={exportInfo}>
      <div className="plot">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <title>{title}</title>
          {gridVals.map((g) => (
            <g key={g}>
              <line x1={m.l} x2={W - m.r} y1={y(g)} y2={y(g)} stroke={INK.grid} strokeWidth="1" />
              <text x={m.l - 8} y={y(g) + 3.5} textAnchor="end" fontSize="10" fontFamily={FONT} fill={INK.muted}>{short(g)}</text>
            </g>
          ))}
          <text transform={`translate(11 ${m.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="10" fontFamily={FONT} fill={INK.muted}>{yTitle}</text>
          {(xTicks || []).map((t) => (
            <text key={t.i} x={x(t.i)} y={H - 8} textAnchor="middle" fontSize="10" fontFamily={FONT} fill={INK.muted}>{t.label}</text>
          ))}
          {band && (
            <path d={`${band.hi.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} ${band.lo.map((v, i) => `L${x(n - 1 - i)},${y(band.lo[n - 1 - i])}`).join(' ')} Z`} fill={band.color} fillOpacity="0.16" stroke="none" />
          )}
          {focusIndex != null && focusIndex >= 0 && (
            <line x1={x(focusIndex)} x2={x(focusIndex)} y1={m.t} y2={m.t + ph} stroke="#ffffff" strokeOpacity="0.55" strokeDasharray="3 3" />
          )}
          {series.map((s) => (
            <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width || 2} strokeDasharray={s.dash ? '5 3' : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ph} stroke={INK.muted} strokeOpacity="0.6" />
              {series.map((s) => s.values[hover] != null && <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r="4" fill={s.color} stroke="#0d1220" strokeWidth="2" />)}
            </g>
          )}
          <rect x={m.l} y={m.t} width={pw} height={ph} fill="transparent" style={{ cursor: onPick ? 'pointer' : 'default' }}
            onMouseMove={move} onMouseLeave={() => setHover(null)} onClick={() => hover != null && onPick && onPick(hover)} />
        </svg>
        {hover != null && (
          <Tip x={(x(hover) / W) * 100} y={(m.t / H) * 100 + 4} flip={hover > n * 0.6}>
            <b>{labels[hover]}</b>
            {series.map((s) => s.values[hover] != null && (
              <div key={s.name}><i style={{ background: s.color }} />{s.name}: <b>{num(s.values[hover])}</b></div>
            ))}
            {band && <div className="muted">Range {num(band.lo[hover])}–{num(band.hi[hover])}</div>}
          </Tip>
        )}
      </div>
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- bar chart */
export function BarChart({ title, subtitle, exportInfo, fileName = 'bars.png', items, highlightKey, onPick, refLine, height = 230, yTitle = 'Hotspots', color = '#ee7a2a', highlightColor = '#ffd166' }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 760, H = height, m = { l: 50, r: 14, t: 16, b: 28 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b, n = items.length;
  const maxV = niceMax(Math.max(1, ...items.map((i) => i.value), refLine ? refLine.value : 0) * 1.05);
  const y = (v) => m.t + ph - (v / maxV) * ph;
  const bw = pw / n;
  const gridVals = [0, 1, 2, 3, 4].map((i) => (maxV * i) / 4);
  const legend = refLine ? [{ name: refLine.label, color: '#ffffff', dash: true }] : null;
  return (
    <ChartFrame title={title} subtitle={subtitle} legend={legend} svgRef={svgRef} fileName={fileName} exportInfo={exportInfo}>
      <div className="plot">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <title>{title}</title>
          {gridVals.map((g) => (
            <g key={g}>
              <line x1={m.l} x2={W - m.r} y1={y(g)} y2={y(g)} stroke={INK.grid} strokeWidth="1" />
              <text x={m.l - 8} y={y(g) + 3.5} textAnchor="end" fontSize="10" fontFamily={FONT} fill={INK.muted}>{short(g)}</text>
            </g>
          ))}
          <text transform={`translate(11 ${m.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="10" fontFamily={FONT} fill={INK.muted}>{yTitle}</text>
          {items.map((it, i) => {
            const bx = m.l + i * bw + bw * 0.16, w = bw * 0.68, h = Math.max((it.value / maxV) * ph, it.value > 0 ? 2 : 0);
            const sel = it.key === highlightKey;
            return (
              <g key={it.key}>
                <rect x={bx} y={y(0) - h} width={w} height={h} rx="3" fill={sel ? highlightColor : it.color || color} opacity={hover != null && hover !== i ? 0.7 : 1} />
                <text x={bx + w / 2} y={H - 10} textAnchor="middle" fontSize="10" fontFamily={FONT} fill={sel ? '#ffffff' : INK.muted} fontWeight={sel ? 700 : 400}>{it.label}</text>
                <rect x={m.l + i * bw} y={m.t} width={bw} height={ph} fill="transparent" style={{ cursor: onPick ? 'pointer' : 'default' }}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick && onPick(it)} />
              </g>
            );
          })}
          {refLine && (
            <line x1={m.l} x2={W - m.r} y1={y(refLine.value)} y2={y(refLine.value)} stroke="#ffffff" strokeOpacity="0.75" strokeDasharray="4 3" />
          )}
        </svg>
        {hover != null && (
          <Tip x={((m.l + hover * bw + bw / 2) / W) * 100} y={(y(items[hover].value) / H) * 100} flip={hover > n * 0.6}>
            <b>{items[hover].tip || items[hover].label}</b>
            <div>{num(items[hover].value)} hotspots</div>
          </Tip>
        )}
      </div>
    </ChartFrame>
  );
}
