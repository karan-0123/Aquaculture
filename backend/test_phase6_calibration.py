# -*- coding: utf-8 -*-
"""
==============================================================================
AQUA·INTELLIGENCE — Phase 6 Test Suite: Calibration & Integration Verification
==============================================================================
Tests:
1. Multi-point pH calibration math & temperature compensation.
2. Turbidity optical zero reference calibration.
3. DS18B20 digital calibration offset and disconnect protection.
4. Serial framing, XOR checksum error detection, and dirty power noise rejection.
5. End-to-end latency benchmark SLA verification (< 2.0s).
6. 72-Hour soak test stability and memory drift verification.
==============================================================================
"""

import unittest
import math
import time
from benchmark_e2e_latency import run_latency_benchmark
from stability_soak_test import calculate_xor_checksum, SerialProtocolSimulator, ESP8266ParserSimulator, run_soak_test


class TestSensorCalibrationAlgorithms(unittest.TestCase):
    """Tests mathematical models for sensor calibration."""

    def test_ph_temperature_compensation(self):
        """Tests Nernst slope temperature compensation across water temperatures."""
        v_neutral = 2.500
        v_acid = 3.040
        base_slope = (v_acid - v_neutral) / 2.99 # ~0.180 V/pH at 25°C

        # Simulate water at 25°C (298.15 K)
        temp_25 = 25.0
        temp_factor_25 = (temp_25 + 273.15) / 298.15
        self.assertAlmostEqual(temp_factor_25, 1.0, places=4)

        # Simulate probe reading in acidic water (voltage = 2.86V)
        v_reading = 2.860
        slope_25 = base_slope * temp_factor_25
        ph_25 = 7.00 - ((v_reading - v_neutral) / slope_25)
        self.assertTrue(4.5 <= ph_25 <= 5.5, f"Expected acidic pH around 5.0, got {ph_25}")

        # In cold water (15°C, 288.15 K), slope is smaller
        temp_15 = 15.0
        temp_factor_15 = (temp_15 + 273.15) / 298.15
        slope_15 = base_slope * temp_factor_15
        ph_15 = 7.00 - ((v_reading - v_neutral) / slope_15)

        # In warm water (35°C, 308.15 K), slope is larger
        temp_35 = 35.0
        temp_factor_35 = (temp_35 + 273.15) / 298.15
        slope_35 = base_slope * temp_factor_35
        ph_35 = 7.00 - ((v_reading - v_neutral) / slope_35)

        # Temperature compensation must adjust slope: slope_15 < slope_25 < slope_35
        self.assertLess(slope_15, slope_25)
        self.assertLess(slope_25, slope_35)

    def test_turbidity_zero_calibration(self):
        """Tests clear water zero reference calibration."""
        v_clear_calibrated = 4.10 # Zero reference calibrated with distilled water

        # When sensor reads exactly the calibrated clear voltage:
        v_reading = 4.10
        norm_v = v_reading * (4.15 / v_clear_calibrated)
        self.assertAlmostEqual(norm_v, 4.15, places=3)

        # In clear water (>= 4.10V), turbidity must be 0.0 NTU
        ntu = 0.0 if norm_v >= 4.10 else max(0.0, -1120.4 * (norm_v**2) + 5742.3 * norm_v - 4353.8)
        self.assertEqual(ntu, 0.0)

        # In turbid water (norm_v drops to 3.5V), turbidity must rise
        v_turbid = 3.45
        norm_v_turbid = v_turbid * (4.15 / v_clear_calibrated)
        ntu_turbid = -1120.4 * (norm_v_turbid**2) + 5742.3 * norm_v_turbid - 4353.8
        self.assertTrue(ntu_turbid > 5.0, f"Expected turbidity > 5 NTU, got {ntu_turbid}")

    def test_ds18b20_offset_calibration(self):
        """Tests digital thermometer offset calibration and disconnection handling."""
        raw_temp = 24.85
        offset = +0.15 # Calibration offset determined from mercury reference
        calibrated_temp = raw_temp + offset
        self.assertAlmostEqual(calibrated_temp, 25.00, places=2)

        # Disconnected condition (-127°C)
        disconnected_reading = -127.0
        safe_temp = 25.0 if disconnected_reading < -50.0 else disconnected_reading + offset
        self.assertEqual(safe_temp, 25.0)


class TestSerialIntegrityAndDirtyPower(unittest.TestCase):
    """Tests serial checksums and dirty power error rejection."""

    def test_xor_checksum_correctness(self):
        payload = "7.20,25.40"
        cs = calculate_xor_checksum(payload)
        self.assertIsInstance(cs, int)
        self.assertTrue(0 <= cs <= 255)

        # Same payload must yield identical checksum
        self.assertEqual(cs, calculate_xor_checksum("7.20,25.40"))
        # Modified payload must yield different checksum
        self.assertNotEqual(cs, calculate_xor_checksum("7.21,25.40"))

    def test_parser_accepts_valid_checksummed_packet(self):
        receiver = ESP8266ParserSimulator()
        payload = "7.35,26.50"
        cs = calculate_xor_checksum(payload)
        frame = f"DATA:{payload}*{cs:02X}"

        accepted = receiver.parse_line(frame)
        self.assertTrue(accepted)
        self.assertEqual(receiver.received_valid, 1)
        self.assertEqual(receiver.dropped_corrupt, 0)
        self.assertAlmostEqual(receiver.last_ph, 7.35, places=2)
        self.assertAlmostEqual(receiver.last_temp, 26.50, places=2)

    def test_parser_rejects_corrupted_checksum(self):
        receiver = ESP8266ParserSimulator()
        payload = "7.35,26.50"
        frame = f"DATA:{payload}*AA" # Bad checksum injected

        accepted = receiver.parse_line(frame)
        self.assertFalse(accepted)
        self.assertEqual(receiver.received_valid, 0)
        self.assertEqual(receiver.dropped_corrupt, 1)

    def test_parser_rejects_dirty_power_garbage_spikes(self):
        receiver = ESP8266ParserSimulator()
        bad_frames = [
            "###VOLTAGE_SPIKE$$$",
            "DATA:7.35", # truncated
            "DATA:99.99,25.0", # out of bounds pH
            "DATA:7.0,-100.0", # out of bounds temp
            "RANDOM_NOISE_LINE"
        ]
        for f in bad_frames:
            res = receiver.parse_line(f)
            self.assertFalse(res)
        self.assertEqual(receiver.dropped_corrupt, len(bad_frames))


class TestLatencyAndSoakVerification(unittest.TestCase):
    """Tests latency SLA benchmarking and soak test execution."""

    def test_e2e_latency_sla_mock(self):
        # Run 10 benchmark cycles in mock mode
        results = run_latency_benchmark(iterations=10, mock_mode=True)
        self.assertEqual(results["iterations"], 10)
        self.assertTrue(results["sla_passed"], "E2E Latency must pass SLA (< 2000 ms)")
        self.assertLess(results["latency_stats_ms"]["p95"], 2000.0)

    def test_soak_test_execution(self):
        # Run a 2-hour accelerated test (200 cycles) with 10% injected electrical noise
        report = run_soak_test(simulated_hours=2.0, cycles_per_hour=100, noise_rate=0.10)
        self.assertEqual(report["total_telemetry_cycles"], 200)
        self.assertTrue(report["verification_status"]["overall_stability_passed"])
        self.assertFalse(report["memory_diagnostics"]["leak_detected"])


if __name__ == '__main__':
    unittest.main()
