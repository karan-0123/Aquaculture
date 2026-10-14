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

  const lastPredictedRef = useRef(null);

  // --- Call Predict API (smart debounce & change detection) ---
  const runPrediction = useCallback(async (sensorValues) => {
    // Only query ML model if sensors have meaningfully changed or first run
    const prev = lastPredictedRef.current;
    if (
      prev &&
      Math.abs(prev.ph - sensorValues.ph) < 0.02 &&
      Math.abs(prev.temperature - sensorValues.temperature) < 0.05 &&
      Math.abs(prev.turbidity - sensorValues.turbidity) < 0.2
    ) {
      return;
    }
    lastPredictedRef.current = sensorValues;

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

  // --- Auto Mode: Real-time Firebase RTDB subscription ---
  useEffect(() => {
    if (mode !== 'auto') return;
    setConnectionState('connecting');

    let isFirebaseActive = false;

    // Firebase cloud real-time subscription (WebSocket push, sub-100ms)
    const sensorRef = ref(db, '/aquaculture/sensors');
    const unsubscribe = onValue(
      sensorRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          isFirebaseActive = true;
          const newSensors = {
            ph:          parseFloat(data.ph          ?? 7.2),
            temperature: parseFloat(data.temperature ?? 27.5),
            turbidity:   parseFloat(data.turbidity   ?? 4.8),
          };
          // Immediately update dashboard gauges with zero lag
          setSensors(newSensors);
          resetWatchdog();
          runPrediction(newSensors);
          setError(null);
        }
      },
      (err) => {
        console.warn('[Firebase RTDB]', err.message, '— using local hardware gateway stream.');
      }
    );

    // Initial fallback sync with local hardware gateway
    const fetchLocalSensors = async () => {
      if (isFirebaseActive) return; // Don't overwrite live Firebase telemetry
      try {
        const res = await fetch(`${API_BASE}/api/sensors/current`);
        if (res.ok) {
          const json = await res.json();
          if (json.sensors && !isFirebaseActive) {
            const newSensors = {
              ph:          parseFloat(json.sensors.ph          ?? 7.2),
              temperature: parseFloat(json.sensors.temperature ?? 27.5),
              turbidity:   parseFloat(json.sensors.turbidity   ?? 4.8),
            };
            setSensors(newSensors);
            resetWatchdog();
            runPrediction(newSensors);
            setError(null);
          }
        }
      } catch (e) {
        // Backend not ready
      }
    };

    fetchLocalSensors();
    const fallbackPollInterval = setInterval(fetchLocalSensors, 5000);

    return () => {
      off(sensorRef);
      clearInterval(fallbackPollInterval);
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
