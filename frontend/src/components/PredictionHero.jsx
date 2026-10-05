// src/components/PredictionHero.jsx
// Primary ML prediction card with fish badge, herb card, risk meter, and deviation alerts
import { motion, AnimatePresence } from 'framer-motion';
import { Fish, Leaf, AlertTriangle, CheckCircle, Zap, Star, TrendingUp } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';

const RISK_CONFIG = {
  LOW:      { color: 'var(--emerald-400)', bg: 'hsla(160,80%,50%,0.12)', label: 'Optimal',       icon: CheckCircle,     pillClass: 'pill pill-emerald' },
  MODERATE: { color: 'var(--amber-400)',   bg: 'hsla(42,100%,60%,0.12)', label: 'Moderate Risk', icon: AlertTriangle,   pillClass: 'pill pill-amber' },
  HIGH:     { color: 'var(--coral-400)',   bg: 'hsla(5,90%,60%,0.12)',   label: 'High Risk',     icon: AlertTriangle,   pillClass: 'pill pill-coral' },
  CRITICAL: { color: 'var(--coral-500)',   bg: 'hsla(5,90%,58%,0.15)',   label: 'Critical!',     icon: Zap,             pillClass: 'pill pill-coral' },
};

const FISH_EMOJI = {
  'Tilapia':         '🐟',
  'Catfish':         '🐡',
  'Carp':            '🐠',
  'Salmon':          '🐟',
  'Trout':           '🎣',
  'Bass':            '🐡',
  'Shrimp':          '🦐',
  'Rohu':            '🐟',
  'Pangasius':       '🐠',
  'Milkfish':        '🐡',
  'Snakehead':       '🐍',
};

const HERB_EMOJI = {
  'Sweet Basil':     '🌿',
  'Water Spinach':   '🥬',
  'Peppermint':      '🌱',
  'Coriander':       '🌿',
  'Lettuce / Greens':'🥗',
  'Oregano':         '🌿',
  'Rosemary':        '🌲',
};

function ConfidenceRing({ confidence, color }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const fill = (confidence / 100) * circ;

  return (
    <svg width={110} height={110} viewBox="0 0 110 110" style={{ position: 'absolute', inset: 0 }}>
      <circle cx={55} cy={55} r={r} fill="none" stroke="hsla(215,35%,20%,0.5)" strokeWidth={6} />
      <motion.circle
        cx={55} cy={55} r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${circ}`}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - fill }}
        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
        transform="rotate(-90 55 55)"
        style={{ filter: `drop-shadow(0 0 8px ${color}99)` }}
      />
    </svg>
  );
}

export default function PredictionHero({ prediction, loading }) {
  const prevFishRef = useRef(null);

  useEffect(() => {
    if (!prediction) return;
    const fish = prediction.prediction?.primary_fish;
    const risk = prediction.diagnostics?.risk_level;
    if (fish && fish !== prevFishRef.current && risk === 'LOW') {
      confetti({
        particleCount: 60,
        spread: 80,
        origin: { y: 0.4 },
        colors: ['#00e5ff', '#10b981', '#60a5fa', '#a78bfa'],
        gravity: 0.8,
        scalar: 0.8,
      });
    }
    prevFishRef.current = fish;
  }, [prediction]);

  if (loading && !prediction) {
    return (
      <div className="glass-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: i === 1 ? '64px' : '40px', borderRadius: '12px' }} />
        ))}
      </div>
    );
  }

  if (!prediction) return null;

  const { prediction: pred, diagnostics, aquaponic_synergy, dataset_comparison_alerts, query } = prediction;
  const riskCfg = RISK_CONFIG[diagnostics?.risk_level] || RISK_CONFIG.LOW;
  const RiskIcon = riskCfg.icon;
  const fishEmoji = FISH_EMOJI[pred?.primary_fish] || '🐟';
  const herbEmoji = HERB_EMOJI[aquaponic_synergy?.recommended_herb] || '🌿';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pred?.primary_fish}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        {/* ── Fish Prediction Hero ── */}
        <div
          className="glass-card"
          style={{
            padding: '28px',
            background: `linear-gradient(135deg, ${riskCfg.bg}, var(--bg-glass))`,
            border: `1px solid ${riskCfg.color}33`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative background blob */}
          <div style={{
            position: 'absolute', top: -40, right: -40,
            width: 180, height: 180,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${riskCfg.color}15, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            {/* Confidence ring + emoji */}
            <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
              <ConfidenceRing confidence={pred?.confidence_percent ?? 0} color={riskCfg.color} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2.8rem',
              }}>
                {fishEmoji}
              </div>
            </div>

            {/* Fish info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px',
              }}>
                Predicted Species
              </div>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 800,
                fontSize: 'clamp(1.3rem, 3vw, 1.8rem)',
                color: 'var(--text-primary)', lineHeight: 1.1,
                marginBottom: '6px',
              }}>
                {pred?.primary_fish}
              </h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <span className={riskCfg.pillClass} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <RiskIcon size={10} />
                  {riskCfg.label}
                </span>
                <span className="pill pill-cyan">
                  <TrendingUp size={10} />
                  {pred?.confidence_percent?.toFixed(1)}% confidence
                </span>
              </div>

              {/* Top 3 */}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span style={{ marginRight: '6px', fontWeight: 600 }}>Top alternatives:</span>
                {pred?.top_three?.slice(1).join(' · ')}
              </div>
            </div>
          </div>

          {/* Water params quick strip */}
          <div style={{
            display: 'flex', gap: '16px', marginTop: '20px',
            padding: '12px 16px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            flexWrap: 'wrap',
          }}>
            {[
              ['pH', query?.ph?.toFixed(2)],
              ['Temp', `${query?.temperature?.toFixed(1)}°C`],
              ['Turb', `${query?.turbidity?.toFixed(1)} NTU`],
              ['DO',   `~${query?.estimated_DO?.toFixed(2)} mg/L`],
              ['EC',   `${query?.ec?.toFixed(2)} mS/cm`],
            ].map(([label, val]) => (
              <div key={label} style={{ textAlign: 'center', flex: '1 1 60px' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em' }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--cyan-400)', fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Herb Companion Card ── */}
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          style={{ padding: '20px 24px', borderColor: 'hsla(160,80%,50%,0.2)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '2.2rem' }}>{herbEmoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--emerald-400)', marginBottom: '2px' }}>
                Aquaponic Companion
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '4px' }}>
                {aquaponic_synergy?.recommended_herb}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {aquaponic_synergy?.fao_notes}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--emerald-400)' }}>
                {aquaponic_synergy?.match_confidence?.toFixed(0)}%
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>match</div>
              <span className="pill pill-emerald" style={{ marginTop: '4px', display: 'inline-flex' }}>
                {aquaponic_synergy?.nutrient_demand} demand
              </span>
            </div>
          </div>
          <div style={{ marginTop: '12px', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Leaf size={12} color="var(--emerald-400)" />
            {aquaponic_synergy?.nutrient_density} · EC: {aquaponic_synergy?.ec_reading} mS/cm
          </div>
        </motion.div>

        {/* ── Dataset Deviation Alerts ── */}
        {dataset_comparison_alerts?.length > 0 && (
          <motion.div
            className="glass-card"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.25 }}
            style={{ padding: '16px 20px' }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Fish size={12} /> Baseline Deviation Analysis
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {dataset_comparison_alerts.map((alert, i) => (
                <div key={i} style={{
                  fontSize: '0.76rem',
                  color: alert.startsWith('✅') ? 'var(--emerald-400)' : 'var(--amber-400)',
                  padding: '6px 10px',
                  background: alert.startsWith('✅') ? 'hsla(160,80%,50%,0.07)' : 'hsla(42,100%,60%,0.07)',
                  borderRadius: 'var(--radius-sm)',
                  lineHeight: 1.4,
                }}>
                  {alert}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
