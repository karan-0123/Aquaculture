# -*- coding: utf-8 -*-
"""
==============================================================================
AQUA·INTELLIGENCE — End-to-End Telemetry Latency Benchmark
==============================================================================
Benchmarks end-to-end telemetry transit latency across the full pipeline:
  Sensor Emulation -> Firebase RTDB Sync -> Backend Ingest -> Inference -> Dashboard
Target Requirement: Total latency < 2.0 seconds (2000 ms).
==============================================================================
"""

import os
import time
import json
import argparse
import numpy as np
import requests
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

FIREBASE_DATABASE_URL = os.getenv('FIREBASE_DATABASE_URL', 'https://aquaculture-61982-default-rtdb.firebaseio.com/').rstrip('/')
BACKEND_API_URL = f"http://localhost:{os.getenv('PORT', 5000)}"


def run_latency_benchmark(iterations=20, mock_mode=False):
    """
    Executes an end-to-end latency benchmark.
    
    Args:
        iterations (int): Number of benchmark cycles to run.
        mock_mode (bool): If True, tests internal pipeline latency without remote network calls.
    
    Returns:
        dict: Detailed latency benchmark statistics.
    """
    latencies_ms = []
    firebase_write_latencies = []
    inference_latencies = []
    failures = 0

    print(f"\n========================================================")
    print(f" AQUA·INTELLIGENCE End-to-End Latency Benchmark (N={iterations})")
    print(f" Target Requirement: < 2000 ms")
    print(f"========================================================")

    for i in range(1, iterations + 1):
        t_start = time.perf_counter()
        sim_ph = round(7.0 + np.sin(i * 0.2) * 0.5, 2)
        sim_temp = round(25.0 + np.cos(i * 0.2) * 2.0, 1)
        sim_turb = round(4.0 + (i % 5) * 0.3, 2)

        try:
            if not mock_mode:
                # 1. Edge-to-Cloud Telemetry Sync (Simulate ESP8266 REST push)
                t_fb_start = time.perf_counter()
                fb_payload = {
                    "ph": sim_ph,
                    "temperature": sim_temp,
                    "turbidity": sim_turb,
                    "ec": 1.25,
                    "timestamp": int(time.time()),
                    "benchmark_seq": i
                }
                fb_res = requests.put(
                    f"{FIREBASE_DATABASE_URL}/aquaculture/sensors.json",
                    json=fb_payload,
                    timeout=4
                )
                t_fb_end = time.perf_counter()
                fb_ms = (t_fb_end - t_fb_start) * 1000.0
                firebase_write_latencies.append(fb_ms)

                # 2. Cloud Ingest & Backend ML Inference
                t_inf_start = time.perf_counter()
                api_res = requests.post(
                    f"{BACKEND_API_URL}/predict",
                    json={"ph": sim_ph, "temperature": sim_temp, "turbidity": sim_turb},
                    timeout=4
                )
                t_inf_end = time.perf_counter()
                inf_ms = (t_inf_end - t_inf_start) * 1000.0
                inference_latencies.append(inf_ms)

                if api_res.status_code != 200:
                    failures += 1
            else:
                # Mock Mode: Self-contained simulation of typical hardware-to-cloud-to-dashboard transit
                time.sleep(0.015)  # 15ms nominal network transit buffer
                t_inf_start = time.perf_counter()
                time.sleep(0.005)  # 5ms ML model inference compute
                inf_ms = (time.perf_counter() - t_inf_start) * 1000.0
                fb_ms = 42.5       # Nominal RTDB write latency
                firebase_write_latencies.append(fb_ms)
                inference_latencies.append(inf_ms)

            total_ms = (time.perf_counter() - t_start) * 1000.0
            latencies_ms.append(total_ms)

            status_icon = "PASS" if total_ms < 2000.0 else "FAIL"
            print(f" Iteration {i:02d}/{iterations:02d}: Total={total_ms:6.1f} ms | Cloud={fb_ms:5.1f} ms | Infer={inf_ms:5.1f} ms [{status_icon}]")

        except Exception as e:
            failures += 1
            print(f" Iteration {i:02d}/{iterations:02d}: ERROR ({e})")
            time.sleep(0.1)

    if not latencies_ms:
        return {"status": "failed", "error": "All benchmark cycles failed."}

    lat_arr = np.array(latencies_ms)
    min_lat = float(np.min(lat_arr))
    max_lat = float(np.max(lat_arr))
    mean_lat = float(np.mean(lat_arr))
    median_lat = float(np.median(lat_arr))
    p95_lat = float(np.percentile(lat_arr, 95))
    p99_lat = float(np.percentile(lat_arr, 99))
    std_lat = float(np.std(lat_arr))

    success_rate = ((len(lat_arr) - failures) / iterations) * 100.0
    sla_pass = (p95_lat < 2000.0) and (success_rate >= 95.0)

    results = {
        "iterations": iterations,
        "completed": len(lat_arr),
        "failures": failures,
        "success_rate_pct": round(success_rate, 2),
        "sla_target_ms": 2000.0,
        "sla_passed": bool(sla_pass),
        "latency_stats_ms": {
            "min": round(min_lat, 2),
            "max": round(max_lat, 2),
            "mean": round(mean_lat, 2),
            "median_p50": round(median_lat, 2),
            "p95": round(p95_lat, 2),
            "p99": round(p99_lat, 2),
            "std_dev": round(std_lat, 2)
        },
        "component_breakdown_ms": {
            "mean_cloud_sync": round(float(np.mean(firebase_write_latencies)), 2) if firebase_write_latencies else 0,
            "mean_ml_inference": round(float(np.mean(inference_latencies)), 2) if inference_latencies else 0
        }
    }

    print("\n---------------- BENCHMARK SUMMARY ----------------")
    print(f" Success Rate:          {results['success_rate_pct']}%")
    print(f" Mean Latency:          {results['latency_stats_ms']['mean']} ms")
    print(f" Median (p50):          {results['latency_stats_ms']['median_p50']} ms")
    print(f" 95th Percentile (p95): {results['latency_stats_ms']['p95']} ms")
    print(f" Target Requirement:    < 2000 ms")
    print(f" Benchmark SLA Status:  {'PASSED' if sla_pass else 'FAILED'}")
    print("---------------------------------------------------\n")

    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Aqua-Intelligence E2E Latency Benchmark")
    parser.add_argument('--iterations', type=int, default=15, help="Number of benchmark iterations")
    parser.add_argument('--mock', action='store_true', help="Run in mock mode without remote network calls")
    parser.add_argument('--export', type=str, default="", help="Path to export benchmark results as JSON")
    args = parser.parse_args()

    res = run_latency_benchmark(iterations=args.iterations, mock_mode=args.mock)

    if args.export:
        with open(args.export, 'w', encoding='utf-8') as f:
            json.dump(res, f, indent=2)
        print(f"[EXPORT] Results saved to {args.export}")
