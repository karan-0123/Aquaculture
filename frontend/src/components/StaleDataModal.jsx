// src/components/StaleDataModal.jsx
// Alert modal for stale / offline connection state with reconnect CTA
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';

export default function StaleDataModal({ connectionState, onRetry, mode }) {
  const isVisible = (connectionState === 'stale' || connectionState === 'offline') && mode === 'auto';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'hsla(215,50%,5%,0.7)',
            backdropFilter: 'blur(6px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1,    y: 0  }}
            exit={{   scale: 0.85, y: 20  }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid hsla(42,100%,60%,0.3)',
              borderRadius: 'var(--radius-xl)',
              padding: '40px 36px',
              maxWidth: '420px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 24px 80px hsla(215,50%,5%,0.8)',
            }}
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
              transition={{ duration: 0.6, delay: 0.3 }}
              style={{ fontSize: '3rem', marginBottom: '16px' }}
            >
              {connectionState === 'offline' ? '🔌' : '⏱️'}
            </motion.div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
              {connectionState === 'offline' ? <WifiOff size={18} color="var(--coral-400)" /> : <AlertTriangle size={18} color="var(--amber-400)" />}
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800 }}>
                {connectionState === 'offline' ? 'Connection Lost' : 'Telemetry Stale'}
              </h2>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '24px' }}>
              {connectionState === 'offline'
                ? 'Unable to reach Firebase. Check your network connection or Firebase credentials in the .env configuration.'
                : 'No sensor data received in the last 15 seconds. The hardware may be offline or transmitting at a slower interval.'}
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                id="modal-retry-btn"
                className="btn btn-primary"
                onClick={onRetry}
              >
                <RefreshCw size={14} />
                Retry Connection
              </button>
              <button
                id="modal-dismiss-btn"
                className="btn btn-ghost"
                onClick={() => {}} // dismissed by connectionState change
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
