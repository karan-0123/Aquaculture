// src/components/SimulationStudio.jsx
// Manual slider sandbox for pH / Temperature / Turbidity with instant prediction
import { motion } from 'framer-motion';
import { Sliders, RefreshCw } from 'lucide-react';

const SLIDER_CONFIGS = [
  {
    key: 'ph',
    label: 'pH Level',
    emoji: '⚗️',
    min: 0, max: 14, step: 0.1,
    unit: '',
    color: '#60a5fa',
    zones: [
      { from: 0,   to: 6.0, label: 'Acidic',   color: '#ef4444' },
      { from: 6.0, to: 8.5, label: 'Optimal',  color: '#10b981' },
      { from: 8.5, to: 14,  label: 'Alkaline', color: '#f59e0b' },
    ],
  },
  {
    key: 'temperature',
    label: 'Temperature',
    emoji: '🌡️',
    min: 0, max: 50, step: 0.5,
    unit: '°C',
    color: '#f59e0b',
    zones: [
      { from: 0,  to: 18, label: 'Cold',    color: '#60a5fa' },
      { from: 18, to: 31, label: 'Optimal', color: '#10b981' },
      { from: 31, to: 50, label: 'Hot',     color: '#ef4444' },
    ],
  },
  {
    key: 'turbidity',
    label: 'Turbidity',
    emoji: '💧',
    min: 0, max: 25, step: 0.1,
    unit: ' NTU',
    color: '#a78bfa',
    zones: [
      { from: 0,  to: 12, label: 'Clear',   color: '#10b981' },
      { from: 12, to: 20, label: 'Murky',   color: '#f59e0b' },
      { from: 20, to: 25, label: 'Opaque',  color: '#ef4444' },
    ],
  },
];

function getZoneInfo(cfg, value) {
  return cfg.zones.find(z => value >= z.from && value < z.to) ?? cfg.zones[cfg.zones.length - 1];
}

function SliderControl({ cfg, value, onChange }) {
  const zone = getZoneInfo(cfg, value);
  const norm = (value - cfg.min) / (cfg.max - cfg.min);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '1rem' }}>{cfg.emoji}</span>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'var(--font-display)' }}>{cfg.label}</span>
          <span style={{
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: zone.color, padding: '1px 6px', borderRadius: '999px',
            background: zone.color + '18', border: `1px solid ${zone.color}44`,
          }}>
            {zone.label}
          </span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: zone.color }}>
          {value.toFixed(cfg.step < 1 ? 1 : 0)}{cfg.unit}
        </span>
      </div>

      {/* Slider */}
      <div style={{ position: 'relative' }}>
        <input
          id={`slider-${cfg.key}`}
          type="range"
          min={cfg.min}
          max={cfg.max}
          step={cfg.step}
          value={value}
          onChange={e => onChange(cfg.key, parseFloat(e.target.value))}
          style={{
            width: '100%',
            accentColor: zone.color,
          }}
        />
        {/* Zone markers */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          {cfg.zones.map((z, i) => (
            <span key={i} style={{ fontSize: '0.6rem', color: z.color, fontWeight: 600 }}>
              {z.from}{cfg.unit && i === 0 ? '' : cfg.unit.trim() ? cfg.unit : ''}
            </span>
          ))}
          <span style={{ fontSize: '0.6rem', color: 'var(--text-faint)' }}>{cfg.max}{cfg.unit}</span>
        </div>
      </div>
    </div>
  );
}

export default function SimulationStudio({ values, onUpdate, onReset }) {
  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        padding: '24px',
        border: '1px solid hsla(265,80%,68%,0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={18} color="var(--violet-400)" />
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem' }}>
            Simulation Studio
          </h3>
          <span className="pill pill-violet">Manual Mode</span>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          onClick={onReset}
          title="Reset to defaults"
          style={{ gap: '4px', fontSize: '0.75rem' }}
        >
          <RefreshCw size={13} /> Reset
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {SLIDER_CONFIGS.map(cfg => (
          <SliderControl
            key={cfg.key}
            cfg={cfg}
            value={values[cfg.key] ?? cfg.min}
            onChange={onUpdate}
          />
        ))}
      </div>

      <div style={{
        marginTop: '16px', padding: '10px 14px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.72rem', color: 'var(--text-muted)',
        lineHeight: 1.5,
        display: 'flex', alignItems: 'flex-start', gap: '8px',
      }}>
        <span style={{ fontSize: '1rem', flexShrink: 0 }}>🧪</span>
        <span>
          <strong style={{ color: 'var(--violet-400)' }}>Simulation mode active.</strong>{' '}
          Adjust sliders to explore water parameter effects on fish species viability. Results update in real-time via the ML model.
        </span>
      </div>
    </motion.div>
  );
}
