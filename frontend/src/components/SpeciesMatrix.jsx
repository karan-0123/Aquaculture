// src/components/SpeciesMatrix.jsx
// Interactive species ranking grid with search, filter, star ratings and expandable drawers
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, ChevronUp, Star, Grid3x3, Fish, Thermometer, Droplets } from 'lucide-react';

// Canonical species metadata with proper type tags
const SPECIES_META = {
  'Tilapia':    { type: 'Warmwater', emoji: '🐟', optPh: '6.5–8.5', optTemp: '25–30°C', optTurb: '<15 NTU' },
  'Catfish':    { type: 'Warmwater', emoji: '🐡', optPh: '6.5–8.0', optTemp: '24–30°C', optTurb: '<20 NTU' },
  'Carp':       { type: 'Hardy',     emoji: '🐠', optPh: '7.0–8.5', optTemp: '20–28°C', optTurb: '<20 NTU' },
  'Salmon':     { type: 'Coldwater', emoji: '🐟', optPh: '6.5–8.0', optTemp: '10–18°C', optTurb: '<5 NTU'  },
  'Trout':      { type: 'Coldwater', emoji: '🎣', optPh: '6.5–8.5', optTemp: '10–20°C', optTurb: '<5 NTU'  },
  'Bass':       { type: 'High-DO',   emoji: '🐡', optPh: '6.0–8.0', optTemp: '18–28°C', optTurb: '<10 NTU' },
  'Shrimp':     { type: 'High-DO',   emoji: '🦐', optPh: '7.0–8.5', optTemp: '24–30°C', optTurb: '<10 NTU' },
  'Rohu':       { type: 'Warmwater', emoji: '🐟', optPh: '7.0–8.5', optTemp: '25–32°C', optTurb: '<15 NTU' },
  'Pangasius':  { type: 'Hardy',     emoji: '🐠', optPh: '6.5–8.0', optTemp: '26–30°C', optTurb: '<25 NTU' },
  'Milkfish':   { type: 'Warmwater', emoji: '🐡', optPh: '7.0–8.5', optTemp: '26–30°C', optTurb: '<15 NTU' },
  'Snakehead':  { type: 'Hardy',     emoji: '🐍', optPh: '6.0–8.0', optTemp: '25–32°C', optTurb: '<20 NTU' },
  'Magur':      { type: 'Hardy',     emoji: '🐡', optPh: '6.5–8.0', optTemp: '25–32°C', optTurb: '<25 NTU' },
  'Karpio':     { type: 'Hardy',     emoji: '🐠', optPh: '7.0–8.5', optTemp: '20–28°C', optTurb: '<20 NTU' },
  'Labeo':      { type: 'Warmwater', emoji: '🐟', optPh: '7.0–8.5', optTemp: '25–32°C', optTurb: '<15 NTU' },
  'Grass Carp': { type: 'Hardy',     emoji: '🐠', optPh: '6.5–8.5', optTemp: '20–30°C', optTurb: '<20 NTU' },
};

// Case-insensitive alias lookup – handles API names like 'karpio', 'shrimp', 'magur'
const SPECIES_META_LOWER = Object.fromEntries(
  Object.entries(SPECIES_META).map(([k, v]) => [k.toLowerCase(), v])
);

// Additional common API aliases → canonical key mapping
const SPECIES_ALIASES = {
  'karpio':       'Karpio',
  'carp':         'Carp',
  'shrimp':       'Shrimp',
  'tilapia':      'Tilapia',
  'catfish':      'Catfish',
  'salmon':       'Salmon',
  'trout':        'Trout',
  'bass':         'Bass',
  'rohu':         'Rohu',
  'pangasius':    'Pangasius',
  'milkfish':     'Milkfish',
  'snakehead':    'Snakehead',
  'magur':        'Magur',
  'labeo':        'Labeo',
  'grass carp':   'Grass Carp',
};

/** Look up species metadata by name (case-insensitive, alias-aware) */
function lookupMeta(rawName) {
  if (!rawName) return null;
  const lower = rawName.toLowerCase().trim();
  // Try alias map first
  const canonical = SPECIES_ALIASES[lower];
  if (canonical) return SPECIES_META[canonical] ?? null;
  // Fallback: direct case-insensitive lookup
  return SPECIES_META_LOWER[lower] ?? null;
}

const TYPE_FILTERS = ['All', 'Warmwater', 'Coldwater', 'Hardy', 'High-DO'];
const TYPE_COLORS  = {
  'Warmwater': 'var(--amber-400)',
  'Coldwater': 'var(--cyan-400)',
  'Hardy':     'var(--emerald-400)',
  'High-DO':   'var(--violet-400)',
};
const TYPE_BG = {
  'Warmwater': 'hsla(42,100%,60%,0.1)',
  'Coldwater': 'hsla(190,95%,60%,0.1)',
  'Hardy':     'hsla(160,80%,52%,0.1)',
  'High-DO':   'hsla(265,80%,68%,0.1)',
};

function StarRating({ stars }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          fill={i < stars ? 'var(--amber-400)' : 'transparent'}
          color={i < stars ? 'var(--amber-400)' : 'var(--border-subtle)'}
        />
      ))}
    </div>
  );
}

function ViabilityBar({ score }) {
  const color =
    score >= 60 ? 'var(--emerald-400)' :
    score >= 30 ? 'var(--amber-400)' :
    'var(--coral-400)';

  return (
    <div style={{ flex: 1 }}>
      <div style={{
        height: 5, background: 'var(--bg-elevated)', borderRadius: 999, overflow: 'hidden',
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ height: '100%', background: color, borderRadius: 999 }}
        />
      </div>
    </div>
  );
}

function SpeciesRow({ entry, index, isExpanded, onToggle }) {
  const meta = lookupMeta(entry.species) ?? { type: 'Hardy', emoji: '🐟', optPh: 'N/A', optTemp: 'N/A', optTurb: 'N/A' };
  const typeColor = TYPE_COLORS[meta.type] ?? 'var(--text-muted)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
    >
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 14px',
          background: isExpanded ? 'hsla(215,35%,18%,0.7)' : 'hsla(215,35%,14%,0.4)',
          borderRadius: isExpanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
          cursor: 'pointer',
          transition: 'background 0.2s',
          border: '1px solid var(--border-subtle)',
          borderBottom: isExpanded ? 'none' : '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{meta.emoji}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-display)' }}>
              {entry.species}
            </span>
            <span style={{ fontSize: '0.65rem', color: typeColor, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {meta.type}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StarRating stars={entry.stars} />
            <ViabilityBar score={entry.suitability_score} />
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem',
            color: entry.suitability_score >= 60 ? 'var(--emerald-400)' : entry.suitability_score >= 30 ? 'var(--amber-400)' : 'var(--coral-400)',
          }}>
            {entry.suitability_score.toFixed(1)}%
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '12px 16px',
              background: 'hsla(215,40%,10%,0.6)',
              border: '1px solid var(--border-subtle)',
              borderTop: 'none',
              borderRadius: '0 0 var(--radius-md) var(--radius-md)',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
            }}>
              {[
                ['Optimal pH', meta.optPh],
                ['Optimal Temp', meta.optTemp],
                ['Turbidity', meta.optTurb],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--cyan-400)', fontWeight: 600, marginTop: '2px' }}>{val}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Type distribution stats for the legend
function TypeLegend({ rankings }) {
  const counts = {};
  rankings.forEach(r => {
    const t = lookupMeta(r.species)?.type ?? 'Unknown';
    counts[t] = (counts[t] ?? 0) + 1;
  });
  const entries = Object.entries(counts).filter(([t]) => TYPE_COLORS[t]);
  if (entries.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
      {entries.map(([type, count]) => (
        <div key={type} style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '3px 10px',
          borderRadius: '999px',
          background: TYPE_BG[type],
          border: `1px solid ${TYPE_COLORS[type]}44`,
          fontSize: '0.68rem', fontWeight: 700,
          color: TYPE_COLORS[type],
          letterSpacing: '0.04em',
        }}>
          <span>{type}</span>
          <span style={{
            background: TYPE_COLORS[type] + '30',
            borderRadius: '999px',
            padding: '0 5px',
            fontSize: '0.62rem',
          }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

export default function SpeciesMatrix({ prediction }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [expanded, setExpanded] = useState(null);

  const rankings = prediction?.species_rankings ?? [];

  const filtered = useMemo(() => {
    return rankings.filter(r => {
      const meta = lookupMeta(r.species);
      const matchSearch = r.species.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'All' || meta?.type === filter;
      return matchSearch && matchFilter;
    });
  }, [rankings, search, filter]);

  return (
    <div className="glass-card" style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <Grid3x3 size={18} color="var(--cyan-400)" />
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', flex: 1, minWidth: 0 }}>
          Species Compatibility Matrix
        </h3>
        <span className="pill pill-cyan">{rankings.length} species</span>
      </div>

      {/* Type distribution legend */}
      {filter === 'All' && rankings.length > 0 && <TypeLegend rankings={rankings} />}

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{
          flex: 1, minWidth: '160px',
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
        }}>
          <Search size={13} color="var(--text-muted)" />
          <input
            type="search"
            placeholder="Search species…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
              fontSize: '0.82rem', width: '100%',
            }}
          />
        </div>

        {TYPE_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${filter === f ? (TYPE_COLORS[f] ?? 'var(--cyan-400)') + '66' : 'var(--border-subtle)'}`,
              background: filter === f ? (TYPE_COLORS[f] ?? 'var(--cyan-400)') + '15' : 'transparent',
              color: filter === f ? (TYPE_COLORS[f] ?? 'var(--cyan-400)') : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              transition: 'all 0.2s',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Species rows */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '28px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
        }}>
          <div style={{ fontSize: '2.4rem', opacity: 0.4 }}>🐠</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
            No species match your filter
          </div>
          {filter !== 'All' && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
              Try selecting <strong style={{ color: 'var(--cyan-400)' }}>All</strong> or a different type
            </div>
          )}
          {filter !== 'All' && (
            <button
              onClick={() => setFilter('All')}
              style={{
                marginTop: '4px', padding: '5px 14px',
                borderRadius: '999px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                color: 'var(--cyan-400)', fontSize: '0.72rem',
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              Show all species
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '480px', overflowY: 'auto', paddingRight: '4px' }}>
          {filtered.map((entry, i) => (
            <SpeciesRow
              key={entry.species}
              entry={entry}
              index={i}
              isExpanded={expanded === entry.species}
              onToggle={() => setExpanded(prev => prev === entry.species ? null : entry.species)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
