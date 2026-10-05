// src/components/AnalyticsCharts.jsx
// Live rolling multi-metric chart with Recharts + custom tooltip + parameter toggles
import { useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Waves } from 'lucide-react';

const PARAM_CONFIG = {
  ph:          { label: 'pH',          color: '#60a5fa', unit: '',      dot: '⚗️' },
  temperature: { label: 'Temp (°C)',   color: '#f59e0b', unit: '°C',   dot: '🌡️' },
  turbidity:   { label: 'Turbidity',   color: '#a78bfa', unit: ' NTU', dot: '💧' },
};

const TIME_WINDOWS = [
  { label: '15m', points: 15 },
  { label: '1h',  points: 60 },
  { label: '3h',  points: 180 },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'hsla(215,35%,14%,0.95)',
      backdropFilter: 'blur(16px)',
      border: '1px solid var(--border-glass)',
      borderRadius: '10px',
      padding: '10px 14px',
      fontSize: '0.78rem',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>{label}</div>
      {payload.map(entry => (
        <div key={entry.dataKey} style={{ color: entry.color, display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
          <span>{PARAM_CONFIG[entry.dataKey]?.label ?? entry.dataKey}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
            {PARAM_CONFIG[entry.dataKey]?.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsCharts({ sensors, active }) {
  const [history, setHistory] = useState([]);
  const [window_, setWindow_] = useState(TIME_WINDOWS[0]);
  const [activeParams, setActiveParams] = useState({ ph: true, temperature: true, turbidity: true });
  const tickRef = useRef(0);

  // Append incoming sensor data to rolling history
  useEffect(() => {
    if (!sensors) return;
    tickRef.current += 1;
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setHistory(prev => {
      const next = [...prev, {
        time:        timeLabel,
        ph:          sensors.ph,
        temperature: sensors.temperature,
        turbidity:   sensors.turbidity,
        tick:        tickRef.current,
      }];
      // Keep max 3h of data (180 points)
      return next.slice(-180);
    });
  }, [sensors]);

  const displayData = history.slice(-window_.points);

  const toggleParam = (key) => {
    setActiveParams(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // Keep at least one active
      if (Object.values(next).every(v => !v)) return prev;
      return next;
    });
  };

  return (
    <div className="glass-card" style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Waves size={18} color="var(--cyan-400)" />
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
            Live Telemetry Trends
          </h3>
          {history.length > 0 && (
            <span className="pill pill-cyan" style={{ animation: 'beacon-pulse 2s ease-in-out infinite' }}>
              {history.length} pts
            </span>
          )}
        </div>

        {/* Time window & param toggles */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Time windows */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '3px' }}>
            {TIME_WINDOWS.map(w => (
              <button
                key={w.label}
                onClick={() => setWindow_(w)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  fontFamily: 'var(--font-display)',
                  transition: 'all 0.2s',
                  background: window_.label === w.label ? 'var(--cyan-600)' : 'transparent',
                  color: window_.label === w.label ? 'white' : 'var(--text-muted)',
                }}
              >
                {w.label}
              </button>
            ))}
          </div>

          {/* Parameter toggles */}
          {Object.entries(PARAM_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => toggleParam(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${activeParams[key] ? cfg.color + '55' : 'var(--border-subtle)'}`,
                background: activeParams[key] ? cfg.color + '18' : 'transparent',
                color: activeParams[key] ? cfg.color : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 600,
                fontFamily: 'var(--font-display)',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '0.8rem' }}>{cfg.dot}</span>
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {displayData.length < 2 ? (
        <div style={{
          height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', fontSize: '0.85rem', flexDirection: 'column', gap: '8px'
        }}>
          <Clock size={28} style={{ opacity: 0.4 }} />
          <span>Collecting telemetry data…</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>Chart appears after 2+ data points</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              {Object.entries(PARAM_CONFIG).map(([key, cfg]) => (
                <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={cfg.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="hsla(210,30%,40%,0.15)" strokeDasharray="4 4" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <Tooltip content={<CustomTooltip />} />
            {Object.entries(PARAM_CONFIG).map(([key, cfg]) =>
              activeParams[key] ? (
                <Area
                  key={key}
                  type="monotoneX"
                  dataKey={key}
                  stroke={cfg.color}
                  strokeWidth={2}
                  fill={`url(#grad-${key})`}
                  dot={false}
                  activeDot={{ r: 5, stroke: cfg.color, strokeWidth: 2, fill: 'var(--bg-deep)' }}
                  isAnimationActive={false}
                />
              ) : null
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
