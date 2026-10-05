// src/components/WaterAdvisory.jsx
// Actionable diagnostic cards: immediate / preventative / optimal
import { motion, AnimatePresence } from 'framer-motion';
import { AlertOctagon, ShieldAlert, CheckCircle2, Download, ClipboardList } from 'lucide-react';

const ALERT_CATEGORIES = {
  '🔴': { type: 'critical', label: 'Immediate Action', icon: AlertOctagon, color: 'var(--coral-400)', bg: 'hsla(5,90%,60%,0.1)', border: 'hsla(5,90%,60%,0.25)' },
  '🟡': { type: 'moderate', label: 'Preventative Notice', icon: ShieldAlert, color: 'var(--amber-400)', bg: 'hsla(42,100%,60%,0.1)', border: 'hsla(42,100%,60%,0.25)' },
  '✅': { type: 'optimal',  label: 'Optimal Condition',  icon: CheckCircle2, color: 'var(--emerald-400)', bg: 'hsla(160,80%,50%,0.1)', border: 'hsla(160,80%,50%,0.25)' },
};

function categorize(alerts) {
  const categories = { critical: [], moderate: [], optimal: [] };
  for (const alert of (alerts ?? [])) {
    if (alert.startsWith('🔴')) categories.critical.push(alert.replace('🔴 ', ''));
    else if (alert.startsWith('🟡')) categories.moderate.push(alert.replace('🟡 ', ''));
    else if (alert.startsWith('✅')) categories.optimal.push(alert.replace('✅ ', ''));
  }
  return categories;
}

function exportReport(prediction) {
  if (!prediction) return;
  const { query, prediction: pred, diagnostics, aquaponic_synergy } = prediction;
  const date = new Date().toLocaleString('en-IN');
  const lines = [
    '===================================',
    '  AQUA·INTELLIGENCE Diagnostic Report',
    `  Generated: ${date}`,
    '===================================',
    '',
    '[ SENSOR READINGS ]',
    `  pH:          ${query?.ph}`,
    `  Temperature: ${query?.temperature} °C`,
    `  Turbidity:   ${query?.turbidity} NTU`,
    `  EC:          ${query?.ec} mS/cm`,
    `  Est. DO:     ${query?.estimated_DO} mg/L`,
    '',
    '[ ML PREDICTION ]',
    `  Primary Fish:   ${pred?.primary_fish}`,
    `  Confidence:     ${pred?.confidence_percent}%`,
    `  Risk Level:     ${diagnostics?.risk_level}`,
    `  Water Status:   ${diagnostics?.water_status}`,
    '',
    '[ AQUAPONIC COMPANION ]',
    `  Herb/Crop:   ${aquaponic_synergy?.recommended_herb}`,
    `  Match:       ${aquaponic_synergy?.match_confidence}%`,
    '',
    '[ ADVISORY POINTS ]',
    ...(diagnostics?.advice_points ?? []).map(a => `  • ${a}`),
    '',
    '[ REMEDIES ]',
    ...(diagnostics?.actionable_remedies ?? []).map(r => `  → ${r}`),
    '',
    '===================================',
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aqua-report-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(prediction) {
  if (!prediction) return;
  const { query, prediction: pred, diagnostics, aquaponic_synergy } = prediction;
  const headers = ['timestamp','ph','temperature','turbidity','ec','do','primary_fish','confidence','risk_level','companion_herb'];
  const row = [
    new Date().toISOString(),
    query?.ph, query?.temperature, query?.turbidity, query?.ec, query?.estimated_DO,
    pred?.primary_fish, pred?.confidence_percent, diagnostics?.risk_level,
    aquaponic_synergy?.recommended_herb,
  ];
  const csv = [headers.join(','), row.join(',')].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aqua-snapshot-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WaterAdvisory({ prediction }) {
  if (!prediction) return null;

  const { diagnostics } = prediction;
  const categories = categorize(diagnostics?.advice_points);
  const remedies = diagnostics?.actionable_remedies ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardList size={18} color="var(--cyan-400)" />
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem' }}>
            Water Management Advisory
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => exportReport(prediction)} title="Download Report">
            <Download size={14} /> Report
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => exportCSV(prediction)} title="Export CSV">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* Alert categories */}
      {Object.entries(ALERT_CATEGORIES).map(([emoji, cfg]) => {
        const items = categories[cfg.type];
        if (!items?.length) return null;
        const Icon = cfg.icon;
        return (
          <motion.div
            key={cfg.type}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: 'var(--radius-lg)',
              padding: '16px 18px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Icon size={15} color={cfg.color} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: cfg.color }}>
                {cfg.label}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {items.map((item, i) => (
                <div key={i} style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  paddingLeft: '8px',
                  borderLeft: `2px solid ${cfg.color}55`,
                  lineHeight: 1.5,
                }}>
                  {item}
                </div>
              ))}
            </div>
          </motion.div>
        );
      })}

      {/* Actionable remedies */}
      {remedies.length > 0 && (
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Prescriptive Remedies
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {remedies.map((remedy, i) => (
              <div key={i} style={{
                display: 'flex', gap: '10px', alignItems: 'flex-start',
                padding: '8px 10px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}>
                <span style={{ color: 'var(--cyan-400)', fontWeight: 700, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {remedy}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
