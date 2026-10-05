// src/components/Navbar.jsx
// App navigation bar with logo, status indicator, mode switcher, and theme toggle
import { motion } from 'framer-motion';
import { Moon, Sun, Wifi, WifiOff, Clock, Radio } from 'lucide-react';

const CONNECTION_CONFIG = {
  live:       { color: 'var(--emerald-400)', label: 'Live',       Icon: Radio,   pulse: true  },
  stale:      { color: 'var(--amber-400)',   label: 'Stale',      Icon: Clock,   pulse: false },
  offline:    { color: 'var(--coral-400)',   label: 'Offline',    Icon: WifiOff, pulse: false },
  connecting: { color: 'var(--cyan-400)',    label: 'Connecting', Icon: Wifi,    pulse: true  },
};

export default function Navbar({ mode, onModeSwitch, connectionState, theme, onThemeToggle, lastUpdated }) {
  const connCfg = CONNECTION_CONFIG[connectionState] ?? CONNECTION_CONFIG.connecting;
  const ConnIcon = connCfg.Icon;

  const timeStr = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'var(--bg-glass)',
      backdropFilter: 'blur(20px) saturate(200%)',
      WebkitBackdropFilter: 'blur(20px) saturate(200%)',
      borderBottom: '1px solid var(--border-subtle)',
      padding: '0 clamp(16px, 4vw, 32px)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        maxWidth: 1400, margin: '0 auto',
        display: 'flex', alignItems: 'center', gap: '16px',
        height: '60px',
      }}>
        {/* Logo */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'default', flexShrink: 0 }}
        >
          <div style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, var(--cyan-500), hsl(215,100%,60%))',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem',
            boxShadow: '0 4px 16px hsla(190,100%,55%,0.35)',
          }}>
            🐠
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 800,
              fontSize: 'clamp(0.85rem, 2vw, 1rem)',
              background: 'linear-gradient(90deg, var(--cyan-400), hsl(215,100%,75%))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              lineHeight: 1.1,
            }}>
              AQUA·INTELLIGENCE
            </div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.08em' }}>
              SMART AQUACULTURE DASHBOARD
            </div>
          </div>
        </motion.div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Connection status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '5px 12px',
          background: connCfg.color + '12',
          border: `1px solid ${connCfg.color}33`,
          borderRadius: '999px',
        }}>
          <span
            className={connCfg.pulse ? 'beacon' : ''}
            style={{ color: connCfg.color, display: 'flex' }}
          >
            <ConnIcon size={11} />
          </span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: connCfg.color, letterSpacing: '0.05em' }}>
            {connCfg.label}
          </span>
          {timeStr && (
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {timeStr}
            </span>
          )}
        </div>

        {/* Mode switcher */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-md)',
          padding: '3px',
          border: '1px solid var(--border-subtle)',
        }}>
          {['auto', 'manual'].map(m => (
            <button
              key={m}
              id={`mode-btn-${m}`}
              onClick={() => onModeSwitch(m)}
              style={{
                padding: '5px 14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.05em',
                textTransform: 'capitalize',
                transition: 'all 0.2s',
                background: mode === m
                  ? m === 'auto' ? 'linear-gradient(135deg, var(--cyan-500), var(--cyan-600))' : 'linear-gradient(135deg, var(--violet-400), var(--violet-500))'
                  : 'transparent',
                color: mode === m ? (m === 'auto' ? 'var(--bg-void)' : 'white') : 'var(--text-muted)',
                boxShadow: mode === m && m === 'auto' ? '0 2px 8px hsla(190,100%,50%,0.35)' : 'none',
              }}
            >
              {m === 'auto' ? '🔴 Auto' : '🎛 Manual'}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <button
          id="theme-toggle-btn"
          className="btn btn-ghost btn-icon"
          onClick={onThemeToggle}
          title="Toggle theme"
          style={{ flexShrink: 0 }}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
