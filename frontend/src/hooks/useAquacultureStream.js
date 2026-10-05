// src/hooks/useAquacultureStream.js
// Real-time Firebase subscription + Manual simulation mode + watchdog timer
import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { db } from '../lib/firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const WATCHDOG_MS = Number(import.meta.env.VITE_TELEMETRY_WATCHDOG_TIMEOUT_MS) || 15000;

const DEFAULT_SENSORS = { ph: 7.2, temperature: 27.5, turbidity: 4.8 };

export function useAquacultureStream() {
  const [mode, setMode] = useState('auto'); // 'auto' | 'manual'
  const [sensors, setSensors] = useState(DEFAULT_SENSORS);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting'); // 'live' | 'stale' | 'offline' | 'connecting'
  const [lastUpdated, setLastUpdated] = useState(null);
  const [manualValues, setManualValues] = useState(DEFAULT_SENSORS);

  const watchdogRef = useRef(null);
  const predictionAbortRef = useRef(null);

  // --- Watchdog Timer ---
  const resetWatchdog = useCallback(() => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    setConnectionState('live');
    watchdogRef.current = setTimeout(() => {
      setConnectionState('stale');
    }, WATCHDOG_MS);
  }, []);

  // --- Call Predict API ---
  const runPrediction = useCallback(async (sensorValues) => {
    if (predictionAbortRef.current) predictionAbortRef.current.abort();
    const controller = new AbortController();
    predictionAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sensorValues),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setPrediction(data);
      setLastUpdated(Date.now());
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        setConnectionState('offline');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Auto Mode: Firebase subscription ---
  useEffect(() => {
    if (mode !== 'auto') return;
    setConnectionState('connecting');

    const sensorRef = ref(db, '/aquaculture/sensors');
    const unsubscribe = onValue(
      sensorRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const newSensors = {
            ph:          parseFloat(data.ph          ?? 7.2),
            temperature: parseFloat(data.temperature ?? 27.5),
            turbidity:   parseFloat(data.turbidity   ?? 4.8),
          };
          setSensors(newSensors);
          resetWatchdog();
          runPrediction(newSensors);
        } else {
          setConnectionState('stale');
        }
      },
      (err) => {
        console.error('[Firebase]', err);
        setConnectionState('offline');
        setError('Firebase connection error. Check network or credentials.');
      }
    );

    return () => {
      off(sensorRef);
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, [mode, resetWatchdog, runPrediction]);

  // --- Manual Mode: run prediction on slider change (debounced) ---
  const debounceRef = useRef(null);
  useEffect(() => {
    if (mode !== 'manual') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSensors(manualValues);
      setConnectionState('live');
      runPrediction(manualValues);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [mode, manualValues, runPrediction]);

  // Run initial prediction on mount in manual mode
  useEffect(() => {
    if (mode === 'manual' && !prediction) {
      runPrediction(manualValues);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateManualValue = useCallback((key, value) => {
    setManualValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const switchMode = useCallback((newMode) => {
    setMode(newMode);
    setError(null);
    setPrediction(null);
  }, []);

  const retry = useCallback(() => {
    if (mode === 'manual') runPrediction(manualValues);
  }, [mode, manualValues, runPrediction]);

  return {
    mode,
    switchMode,
    sensors,
    manualValues,
    updateManualValue,
    prediction,
    loading,
    error,
    connectionState,
    lastUpdated,
    retry,
  };
}
