// src/App.jsx
// AQUA·INTELLIGENCE — Main Dashboard Application
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import Navbar           from './components/Navbar.jsx';
import TelemetryGauges  from './components/TelemetryGauges.jsx';
import PredictionHero   from './components/PredictionHero.jsx';
import AnalyticsCharts  from './components/AnalyticsCharts.jsx';
import WaterAdvisory    from './components/WaterAdvisory.jsx';
import SpeciesMatrix    from './components/SpeciesMatrix.jsx';
import SimulationStudio from './components/SimulationStudio.jsx';
import StaleDataModal   from './components/StaleDataModal.jsx';

import { useAquacultureStream } from './hooks/useAquacultureStream.js';

const DEFAULT_MANUAL = { ph: 7.2, temperature: 27.5, turbidity: 4.8 };

/* ── Tab definitions ── */
const TABS = [
  { id: 'overview',   label: '🌊 Overview'   },
  { id: 'analytics',  label: '📈 Analytics'  },
  { id: 'advisory',   label: '🩺 Advisory'   },
  { id: 'species',    label: '🐠 Species'    },
];

/* ── Toast Notification ── */
function Toast({ message, type = 'info', onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const colors = {
    info:    { bg: 'hsla(190,100%,55%,0.15)', border: 'hsla(190,100%,55%,0.3)', text: 'var(--cyan-400)' },
    success: { bg: 'hsla(160,80%,50%,0.15)',  border: 'hsla(160,80%,50%,0.3)', text: 'var(--emerald-400)' },
    warning: { bg: 'hsla(42,100%,60%,0.15)',  border: 'hsla(42,100%,60%,0.3)', text: 'var(--amber-400)' },
    error:   { bg: 'hsla(5,90%,60%,0.15)',    border: 'hsla(5,90%,60%,0.3)',   text: 'var(--coral-400)' },
  };
  const c = colors[type];
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0  }}
      exit={{   opacity: 0, x: 40  }}
      onClick={onDismiss}
      style={{
        cursor: 'pointer',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        fontSize: '0.8rem',
        color: c.text,
        fontWeight: 600,
        maxWidth: '300px',
        backdropFilter: 'blur(12px)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {message}
    </motion.div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('aq-theme') ?? 'dark');
  const [activeTab, setActiveTab] = useState('overview');
  const [toasts, setToasts] = useState([]);

  const {
    mode, switchMode,
    sensors, manualValues, updateManualValue,
    prediction, loading, error, connectionState, lastUpdated, retry,
  } = useAquacultureStream();

  /* Theme persistence */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aq-theme', theme);
  }, [theme]);

  /* Toast on error */
  useEffect(() => {
    if (error) {
      addToast('⚠️ ' + error, 'error');
    }
  }, [error]);

  /* Toast on connection state changes */
  const prevStateRef = useState(null);
  useEffect(() => {
    if (prevStateRef[0] === 'connecting' && connectionState === 'live') {
      addToast('✅ Firebase connected — live telemetry active', 'success');
    }
    prevStateRef[0] = connectionState;
  }, [connectionState]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleModeSwitch = (newMode) => {
    switchMode(newMode);
    addToast(
      newMode === 'auto' ? '🔴 Switched to Live Firebase mode' : '🎛 Switched to Simulation Studio',
      'info'
    );
  };

  const handleResetSliders = () => {
    Object.entries(DEFAULT_MANUAL).forEach(([k, v]) => updateManualValue(k, v));
  };

  return (
    <>
      {/* Navbar */}
      <Navbar
        mode={mode}
        onModeSwitch={handleModeSwitch}
        connectionState={connectionState}
        theme={theme}
        onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        lastUpdated={lastUpdated}
      />

      {/* Main content */}
      <main style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: 'clamp(16px, 3vw, 32px) clamp(12px, 3vw, 32px)',
      }}>
        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y:   0 }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: '24px' }}
        >
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)',
            background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--cyan-400) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            lineHeight: 1.15, marginBottom: '4px',
          }}>
            Aquaculture Intelligence Dashboard
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Real-time water quality monitoring, ML-powered species prediction &amp; aquaponic companion analytics
          </p>
        </motion.div>

        {/* ── Tab bar ── */}
        <div
          className="tab-bar"
          style={{
            display: 'flex', gap: '4px', marginBottom: '24px',
            background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
            padding: '4px', border: '1px solid var(--border-subtle)',
            width: 'fit-content', flexWrap: 'wrap',
          }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`tab-btn-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 18px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
                transition: 'all 0.25s',
                background: activeTab === tab.id
                  ? 'linear-gradient(135deg, var(--cyan-500), var(--cyan-600))'
                  : 'transparent',
                color: activeTab === tab.id ? 'var(--bg-void)' : 'var(--text-muted)',
                boxShadow: activeTab === tab.id ? '0 2px 10px hsla(190,100%,50%,0.3)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab Panels ── */}
        <AnimatePresence mode="wait">
          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y:  0 }}
              exit={{   opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
            >
              {/* Main 2-column layout */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
                gap: '20px',
                alignItems: 'start',
              }}
              className="overview-grid"
              >
                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Gauges */}
                  <section>
                    <SectionLabel>📡 Live Sensor Telemetry</SectionLabel>
                    <TelemetryGauges sensors={sensors} prediction={prediction} />
                  </section>

                  {/* Prediction Hero */}
                  <section>
                    <SectionLabel>🤖 ML Prediction &amp; Analysis</SectionLabel>
                    <PredictionHero prediction={prediction} loading={loading} />
                  </section>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {mode === 'manual' && (
                    <SimulationStudio
                      values={manualValues}
                      onUpdate={updateManualValue}
                      onReset={handleResetSliders}
                    />
                  )}

                  {mode === 'auto' && (
                    <div className="glass-card" style={{ padding: '20px' }}>
                      <div style={{
                        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--text-muted)',
                        marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px',
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral-400)', display: 'inline-block', animation: 'beacon-pulse 1.8s ease-in-out infinite' }} />
                        Live Firebase Stream
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {[
                          { label: 'pH Level',     value: sensors?.ph?.toFixed(2),              unit: '',       color: 'var(--cyan-400)',    icon: '⚗️' },
                          { label: 'Temperature',  value: sensors?.temperature?.toFixed(1),      unit: ' °C',    color: 'var(--amber-400)',   icon: '🌡️' },
                          { label: 'Turbidity',    value: sensors?.turbidity?.toFixed(1),        unit: ' NTU',   color: 'var(--violet-400)',  icon: '💧' },
                          { label: 'Est. DO',      value: prediction?.query?.estimated_DO?.toFixed(2), unit: ' mg/L', color: 'var(--emerald-400)', icon: '🧑‍🔬' },
                        ].map(({ label, value, unit, color, icon }) => (
                          <div key={label} style={{
                            padding: '12px',
                            background: 'var(--bg-elevated)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-subtle)',
                          }}>
                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', gap: '4px' }}>
                              <span>{icon}</span> {label}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.15rem', color }}>
                              {value ?? '—'}<span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>{unit}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '12px', fontSize: '0.68rem', color: 'var(--text-faint)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        <span>Subscribed to</span>
                        <code style={{ color: 'var(--cyan-400)', fontSize: '0.63rem', background: 'var(--bg-deep)', padding: '1px 6px', borderRadius: '4px' }}>/aquaculture/sensors</code>
                      </div>
                    </div>
                  )}

                  {/* Species Matrix preview */}
                  <SpeciesMatrix prediction={prediction} />
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ANALYTICS TAB ── */}
          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y:  0 }}
              exit={{   opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
            >
              <AnalyticsCharts sensors={sensors} />

              {/* Quick stats from prediction */}
              {prediction && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                  {[
                    { label: 'Primary Species',    value: prediction.prediction?.primary_fish, unit: '', color: 'var(--cyan-400)' },
                    { label: 'Confidence',          value: prediction.prediction?.confidence_percent?.toFixed(1), unit: '%', color: 'var(--emerald-400)' },
                    { label: 'Risk Level',          value: prediction.diagnostics?.risk_level, unit: '', color: prediction.diagnostics?.risk_level === 'LOW' ? 'var(--emerald-400)' : prediction.diagnostics?.risk_level === 'MODERATE' ? 'var(--amber-400)' : 'var(--coral-400)' },
                    { label: 'Est. Dissolved O₂',  value: prediction.query?.estimated_DO?.toFixed(2), unit: ' mg/L', color: 'var(--violet-400)' },
                    { label: 'Est. BOD',            value: prediction.query?.estimated_BOD?.toFixed(2), unit: ' mg/L', color: 'var(--amber-400)' },
                    { label: 'Companion Herb',      value: prediction.aquaponic_synergy?.recommended_herb?.split('/')[0].trim(), unit: '', color: 'var(--emerald-400)' },
                  ].map(item => (
                    <div key={item.label} className="glass-card" style={{ padding: '18px 16px' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>{item.label}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', color: item.color }}>
                        {item.value}{item.unit}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── ADVISORY TAB ── */}
          {activeTab === 'advisory' && (
            <motion.div
              key="advisory"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y:  0 }}
              exit={{   opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '20px', alignItems: 'start' }}
              className="advisory-grid"
            >
              <WaterAdvisory prediction={prediction} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <PredictionHero prediction={prediction} loading={loading} />
                {mode === 'manual' && (
                  <SimulationStudio
                    values={manualValues}
                    onUpdate={updateManualValue}
                    onReset={handleResetSliders}
                  />
                )}
              </div>
            </motion.div>
          )}

          {/* ── SPECIES TAB ── */}
          {activeTab === 'species' && (
            <motion.div
              key="species"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y:  0 }}
              exit={{   opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: '20px', alignItems: 'start' }}
              className="species-grid"
            >
              <SpeciesMatrix prediction={prediction} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <TelemetryGauges sensors={sensors} prediction={prediction} />
                {mode === 'manual' && (
                  <SimulationStudio
                    values={manualValues}
                    onUpdate={updateManualValue}
                    onReset={handleResetSliders}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Stale data modal */}
      <StaleDataModal connectionState={connectionState} onRetry={retry} mode={mode} />

      {/* Toast container */}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px',
        display: 'flex', flexDirection: 'column', gap: '8px',
        zIndex: 300,
      }}>
        <AnimatePresence>
          {toasts.map(t => (
            <Toast key={t.id} message={t.message} type={t.type} onDismiss={() => removeToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* Responsive grid breakpoints — see index.css section 15 */}
    </>
  );
}

/* Utility: section heading */
function SectionLabel({ children, style }) {
  return (
    <div style={{
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: '10px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      ...style,
    }}>
      {children}
    </div>
  );
}
