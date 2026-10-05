// src/components/TelemetryGauges.jsx
// Custom SVG circular gauges with animated arcs, color zones, and Framer Motion
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useRef } from 'react';

/* ── Gauge Definitions ── */
const GAUGE_CONFIGS = {
  ph: {
    label: 'pH Level',
    unit: '',
    min: 0, max: 14,
    thresholds: [
      { from: 0,    to: 6.0,  color: '#ef4444' }, // critical acid
      { from: 6.0,  to: 6.5,  color: '#f59e0b' }, // mild acid
      { from: 6.5,  to: 8.5,  color: '#10b981' }, // optimal
      { from: 8.5,  to: 9.0,  color: '#f59e0b' }, // mild alkaline
      { from: 9.0,  to: 14,   color: '#ef4444' }, // critical alkaline
    ],
    idealRange: '6.5 – 8.5',
    icon: '⚗️',
  },
  temperature: {
    label: 'Temperature',
    unit: '°C',
    min: 0, max: 50,
    thresholds: [
      { from: 0,    to: 18,   color: '#60a5fa' }, // cold
      { from: 18,   to: 31,   color: '#10b981' }, // optimal
      { from: 31,   to: 34,   color: '#f59e0b' }, // warm
      { from: 34,   to: 50,   color: '#ef4444' }, // critical hot
    ],
    idealRange: '18 – 31 °C',
    icon: '🌡️',
  },
  turbidity: {
    label: 'Turbidity',
    unit: ' NTU',
    min: 0, max: 20,
    thresholds: [
      { from: 0,    to: 12,   color: '#10b981' }, // clear
      { from: 12,   to: 20,   color: '#f59e0b' }, // murky
      // > 20 treated as max
    ],
    idealRange: '0 – 12 NTU',
    icon: '💧',
  },
  ec: {
    label: 'Conductivity',
    unit: ' mS/cm',
    min: 0, max: 4,
    thresholds: [
      { from: 0,    to: 0.5,  color: '#60a5fa' },
      { from: 0.5,  to: 2.5,  color: '#10b981' },
      { from: 2.5,  to: 4,    color: '#f59e0b' },
    ],
    idealRange: '0.5 – 2.5 mS/cm',
    icon: '⚡',
  },
};

/* ── Arc Math ── */
const SVG_SIZE = 160;
const STROKE_W = 12;
const R = (SVG_SIZE - STROKE_W * 2) / 2;
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;
const START_ANGLE = 135; // degrees from 3 o'clock
const SWEEP = 270;       // total arc degrees

function polarToXY(angleDeg, r) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function arcPath(startAngle, endAngle, r) {
  const s = polarToXY(startAngle, r);
  const e = polarToXY(endAngle, r);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

/* ── Single Gauge ── */
function CircularGauge({ paramKey, value, showTooltip }) {
  const cfg = GAUGE_CONFIGS[paramKey];
  if (!cfg) return null;

  const norm = Math.min(Math.max((value - cfg.min) / (cfg.max - cfg.min), 0), 1);
  const fillAngle = START_ANGLE + norm * SWEEP;

  // Active color from thresholds
  const activeColor = cfg.thresholds.reduce((acc, t) => {
    return value >= t.from && value < t.to ? t.color : acc;
  }, cfg.thresholds[cfg.thresholds.length - 1].color);

  const circumference = 2 * Math.PI * R;
  const HALF = SWEEP / 360;
  const trackLen = circumference * HALF;
  const fillLen = norm * trackLen;

  // Needle position
  const needleAngle = START_ANGLE + norm * SWEEP;
  const needle = polarToXY(needleAngle, R - 6);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '20px 16px 12px',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-glass)',
        borderRadius: 'var(--radius-xl)',
        transition: 'border-color 0.3s, box-shadow 0.3s',
        cursor: 'default',
        minWidth: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = activeColor + '55';
        e.currentTarget.style.boxShadow = `0 0 30px ${activeColor}22`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-glass)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* SVG Gauge */}
      <div style={{ position: 'relative' }}>
        <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
          {/* Background arc segments (color zones) */}
          {cfg.thresholds.map((t, i) => {
            const s = START_ANGLE + ((t.from - cfg.min) / (cfg.max - cfg.min)) * SWEEP;
            const e = START_ANGLE + ((Math.min(t.to, cfg.max) - cfg.min) / (cfg.max - cfg.min)) * SWEEP;
            return (
              <path
                key={i}
                d={arcPath(s, e, R)}
                fill="none"
                stroke={t.color + '22'}
                strokeWidth={STROKE_W}
                strokeLinecap="butt"
              />
            );
          })}

          {/* Active fill arc (animated) */}
          <motion.path
            d={arcPath(START_ANGLE, fillAngle, R)}
            fill="none"
            stroke={activeColor}
            strokeWidth={STROKE_W}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: norm }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${activeColor}88)` }}
          />

          {/* Needle dot */}
          <motion.circle
            cx={needle.x}
            cy={needle.y}
            r={5}
            fill={activeColor}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            style={{ filter: `drop-shadow(0 0 8px ${activeColor})` }}
          />

          {/* Center value */}
          <text
            x={CX}
            y={CY - 4}
            textAnchor="middle"
            fill="var(--text-primary)"
            fontSize="22"
            fontWeight="700"
            fontFamily="'JetBrains Mono', monospace"
          >
            {typeof value === 'number' ? value.toFixed(paramKey === 'ph' ? 2 : 1) : '--'}
          </text>
          <text
            x={CX}
            y={CY + 16}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="11"
            fontFamily="'Outfit', sans-serif"
          >
            {cfg.unit || 'pH'}
          </text>

          {/* Min / Max labels */}
          <text x={CX - R + 4} y={SVG_SIZE - 18} textAnchor="middle" fill="var(--text-faint)" fontSize="9" fontFamily="monospace">{cfg.min}</text>
          <text x={CX + R - 4} y={SVG_SIZE - 18} textAnchor="middle" fill="var(--text-faint)" fontSize="9" fontFamily="monospace">{cfg.max}</text>
        </svg>
      </div>

      {/* Label & ideal range */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
          {cfg.icon} {cfg.label}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Ideal: {cfg.idealRange}
        </div>
      </div>
    </div>
  );
}

/* ── Main Export ── */
export default function TelemetryGauges({ sensors, prediction }) {
  const ecVal = prediction?.query?.ec ?? null;

  return (
    <section>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
        gap: '16px',
      }}>
        {[
          ['ph',          sensors?.ph],
          ['temperature', sensors?.temperature],
          ['turbidity',   sensors?.turbidity],
          ['ec',          ecVal],
        ].map(([key, val]) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: key === 'ph' ? 0 : key === 'temperature' ? 0.1 : key === 'turbidity' ? 0.2 : 0.3 }}
          >
            <CircularGauge paramKey={key} value={val ?? 0} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
