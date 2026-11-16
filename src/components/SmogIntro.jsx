import React, { useEffect, useRef, useState } from 'react';

// Timeline (ms): thick smog -> disperses -> HEATMAP title appears -> fade out -> onDone
const T_THICK = 2200;
const T_DISPERSE = 4200;
const T_TITLE_AT = 5200;
const T_END = 9000;
const T_FADE = 900;

function makeSprite(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, `rgba(${rgb},0.9)`);
  grad.addColorStop(0.5, `rgba(${rgb},0.35)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return c;
}

export default function SmogIntro({ onDone }) {
  const ref = useRef(null);
  const doneRef = useRef(false);
  const [showTitle, setShowTitle] = useState(false);
  const [fading, setFading] = useState(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    setTimeout(onDone, T_FADE);
  };

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, raf = 0;

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const sprites = [makeSprite('120,105,95'), makeSprite('150,150,160'), makeSprite('170,95,45')];
    const blobs = Array.from({ length: 45 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (0.2 + Math.random() * 0.4) * Math.max(w, h),
      vx: (Math.random() - 0.5) * 0.05,
      vy: (Math.random() - 0.5) * 0.025,
      a: 0.25 + Math.random() * 0.4,
      s: sprites[Math.floor(Math.random() * sprites.length)],
      rot: Math.random() * Math.PI * 2,
      rv: (Math.random() - 0.5) * 0.0003,
    }));

    const start = performance.now();
    let last = start;

    const frame = (now) => {
      const t = now - start;
      const dt = Math.min(now - last, 50);
      last = now;

      const p = Math.min(Math.max((t - T_THICK) / T_DISPERSE, 0), 1);
      const ease = p * p * (3 - 2 * p);
      const cx = w / 2, cy = h / 2;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#07090f';
      ctx.fillRect(0, 0, w, h);

      for (const b of blobs) {
        b.x += b.vx * dt + (b.x - cx) * 0.00015 * dt * ease;
        b.y += b.vy * dt + (b.y - cy) * 0.00015 * dt * ease;
        b.rot += b.rv * dt;
        const flicker = 0.85 + 0.15 * Math.sin(t * 0.0008 + b.rot * 5);
        ctx.globalAlpha = b.a * flicker * (1 - ease);
        if (ctx.globalAlpha <= 0.002) continue;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.drawImage(b.s, -b.r, -b.r, b.r * 2, b.r * 2);
        ctx.restore();
      }

      // warm glow appears as the smog clears
      if (ease > 0) {
        ctx.globalAlpha = 0.22 * ease;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.5);
        g.addColorStop(0, 'rgba(249,115,22,0.8)');
        g.addColorStop(1, 'rgba(249,115,22,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const t1 = setTimeout(() => setShowTitle(true), T_TITLE_AT);
    const t2 = setTimeout(finish, T_END);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#07090f',
        opacity: fading ? 0 : 1,
        transition: `opacity ${T_FADE}ms ease`,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <canvas ref={ref} style={{ position: 'absolute', inset: 0 }} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: showTitle ? 1 : 0,
          transform: showTitle ? 'scale(1)' : 'scale(0.92)',
          transition: 'opacity 1.6s ease, transform 1.6s ease',
          textAlign: 'center',
          padding: '0 16px',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(3rem, 12vw, 7rem)',
            fontWeight: 900,
            letterSpacing: '0.25em',
            margin: 0,
            paddingLeft: '0.25em',
            background: 'linear-gradient(90deg,#fb923c,#fde68a,#ef4444)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 0 24px rgba(249,115,22,0.55))',
          }}
        >
          HEATMAP
        </h1>
        <p style={{ marginTop: 12, color: '#fdba74', fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.3em' }}>
          MODIS × VIIRS · HARMONIZED FIRE INTELLIGENCE
        </p>
      </div>

      <button
        onClick={finish}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          background: 'transparent',
          color: '#94a3b8',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '6px 12px',
          fontFamily: 'monospace',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        Skip
      </button>
    </div>
  );
}
