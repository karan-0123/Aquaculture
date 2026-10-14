# -*- coding: utf-8 -*-
"""
==============================================================================
AQUA·INTELLIGENCE — Firebase Realtime Database History Retention & Rotation
==============================================================================
Manages telemetry archival to `/aquaculture/history` and enforces data
rotation/pruning to prevent uncontrolled database growth.

Features:
- Authenticates with Firebase via REST Identity Toolkit or anonymous token.
- Logs telemetry snapshots to `/aquaculture/history`.
- Rotates/prunes records based on count limit (e.g., keep latest 500) or TTL.
- Background worker for scheduled hands-free maintenance.
- CLI interface for automated cron / Task Scheduler execution.
==============================================================================
"""

import os
import time
import argparse
import logging
import threading
import requests
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] [FirebaseRetention] %(message)s")
logger = logging.getLogger("FirebaseRetention")

# Load environment variables
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

FIREBASE_DATABASE_URL = os.getenv('FIREBASE_DATABASE_URL', 'https://aquaculture-61982-default-rtdb.firebaseio.com/').rstrip('/')
FIREBASE_API_KEY = os.getenv('FIREBASE_API_KEY', '')
FIREBASE_AUTH_EMAIL = os.getenv('FIREBASE_AUTH_EMAIL', '')
FIREBASE_AUTH_PASSWORD = os.getenv('FIREBASE_AUTH_PASSWORD', '')

DEFAULT_MAX_HISTORY_RECORDS = 500
DEFAULT_RETENTION_CHECK_INTERVAL_SEC = 3600  # Check every hour


class FirebaseRetentionManager:
    """Manages Firebase telemetry synchronization and retention pruning."""

    def __init__(self, db_url=None, api_key=None, email=None, password=None):
        self.db_url = (db_url or FIREBASE_DATABASE_URL).rstrip('/')
        self.api_key = api_key or FIREBASE_API_KEY
        self.email = email or FIREBASE_AUTH_EMAIL
        self.password = password or FIREBASE_AUTH_PASSWORD
        
        self.id_token = None
        self.token_expiry = 0
        self._lock = threading.Lock()
        self._worker_thread = None
        self._stop_worker = False

    def get_auth_token(self):
        """
        Obtains or refreshes a Firebase ID token using email/password authentication.
        Falls back to None if credentials are not configured or request fails.
        """
        with self._lock:
            # Check if current token is still valid (with 60-second buffer)
            if self.id_token and time.time() < (self.token_expiry - 60):
                return self.id_token

            if not self.api_key or not self.email or not self.password:
                logger.debug("Firebase auth credentials missing; attempting unauthenticated request.")
                return None

            try:
                auth_url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={self.api_key}"
                payload = {
                    "email": self.email,
                    "password": self.password,
                    "returnSecureToken": True
                }
                res = requests.post(auth_url, json=payload, timeout=10)
                if res.status_code == 200:
                    data = res.json()
                    self.id_token = data.get("idToken")
                    expires_in = int(data.get("expiresIn", 3600))
                    self.token_expiry = time.time() + expires_in
                    logger.info("Successfully refreshed Firebase Auth ID token.")
                    return self.id_token
                else:
                    logger.warning(f"Firebase auth failed ({res.status_code}): {res.text}")
                    return None
            except Exception as e:
                logger.error(f"Error during Firebase authentication: {e}")
                return None

    def _get_request_params(self):
        """Constructs request query params, including auth token if available."""
        token = self.get_auth_token()
        params = {}
        if token:
            params['auth'] = token
        return params

    def push_telemetry_to_history(self, ph, temperature, turbidity, ec=None, timestamp=None):
        """
        Pushes a new sensor telemetry data point to `/aquaculture/history`.
        """
        if timestamp is None:
            timestamp = int(time.time())
        if ec is None:
            ec = round(float(0.8 + (turbidity * 0.08) * (1.0 + 0.019 * (temperature - 25.0))), 2)

        payload = {
            "ph": float(ph),
            "temperature": float(temperature),
            "turbidity": float(turbidity),
            "ec": float(ec),
            "timestamp": int(timestamp)
        }

        url = f"{self.db_url}/aquaculture/history.json"
        params = self._get_request_params()

        try:
            res = requests.post(url, json=payload, params=params, timeout=10)
            if res.status_code == 200:
                push_id = res.json().get('name')
                logger.info(f"Pushed telemetry to history: {push_id} -> {payload}")
                return {"success": True, "push_id": push_id, "data": payload}
            else:
                logger.error(f"Failed to push telemetry ({res.status_code}): {res.text}")
                return {"success": False, "status_code": res.status_code, "error": res.text}
        except Exception as e:
            logger.error(f"Exception during push to history: {e}")
            return {"success": False, "error": str(e)}

    def get_history(self, limit_to_last=None):
        """
        Retrieves historical telemetry points from `/aquaculture/history`.
        """
        url = f"{self.db_url}/aquaculture/history.json"
        params = self._get_request_params()
        if limit_to_last:
            params['orderBy'] = '"timestamp"'
            params['limitToLast'] = int(limit_to_last)

        try:
            res = requests.get(url, params=params, timeout=10)
            if res.status_code == 200:
                data = res.json()
                if not data:
                    return {}
                return data
            else:
                logger.error(f"Failed to fetch history ({res.status_code}): {res.text}")
                return {}
        except Exception as e:
            logger.error(f"Exception during get_history: {e}")
            return {}

    def get_history_stats(self):
        """
        Calculates diagnostic statistics for `/aquaculture/history`.
        """
        raw_data = self.get_history()
        if not raw_data or not isinstance(raw_data, dict):
            return {
                "total_records": 0,
                "oldest_timestamp": None,
                "newest_timestamp": None,
                "time_span_hours": 0.0,
                "status": "empty"
            }

        records = []
        for key, val in raw_data.items():
            if isinstance(val, dict):
                records.append((key, val.get('timestamp', 0)))

        records.sort(key=lambda x: x[1])
        total = len(records)
        oldest_ts = records[0][1] if total > 0 else None
        newest_ts = records[-1][1] if total > 0 else None
        span_hours = round((newest_ts - oldest_ts) / 3600.0, 2) if (oldest_ts and newest_ts and newest_ts >= oldest_ts) else 0.0

        return {
            "total_records": total,
            "oldest_timestamp": oldest_ts,
            "newest_timestamp": newest_ts,
            "time_span_hours": span_hours,
            "status": "active"
        }

    def prune_history(self, max_records=DEFAULT_MAX_HISTORY_RECORDS, max_age_hours=None):
        """
        Prunes old records from `/aquaculture/history` to enforce retention constraints.
        
        Args:
            max_records (int): Maximum number of most recent records to keep.
            max_age_hours (float, optional): Maximum age in hours for records.
            
        Returns:
            dict: Summary of pruned and retained counts.
        """
        url = f"{self.db_url}/aquaculture/history.json"
        raw_data = self.get_history()

        if not raw_data or not isinstance(raw_data, dict):
            logger.info("History node is empty or unreachable. No pruning required.")
            return {"pruned_count": 0, "remaining_count": 0, "status": "no_action"}

        # Sort all records chronologically by timestamp
        items = []
        for key, val in raw_data.items():
            if isinstance(val, dict):
                ts = val.get('timestamp', 0)
                items.append((key, ts))

        items.sort(key=lambda x: x[1])
        total_before = len(items)

        keys_to_delete = set()

        # 1. Age-based TTL Pruning
        if max_age_hours is not None and max_age_hours > 0:
            cutoff_ts = int(time.time() - (max_age_hours * 3600))
            for key, ts in items:
                if ts < cutoff_ts:
                    keys_to_delete.add(key)

        # 2. Count-based Pruning (keep only the newest `max_records`)
        if max_records is not None and max_records > 0:
            excess_count = total_before - max_records
            if excess_count > 0:
                # The oldest excess items need deletion
                for i in range(excess_count):
                    keys_to_delete.add(items[i][0])

        if not keys_to_delete:
            logger.info(f"Database size within limits ({total_before}/{max_records}). No records to prune.")
            return {
                "total_before": total_before,
                "pruned_count": 0,
                "remaining_count": total_before,
                "status": "within_limits"
            }

        logger.info(f"Starting pruning of {len(keys_to_delete)} stale records out of {total_before}...")

        # Batch delete via REST multi-path update (setting deleted keys to null)
        # Firebase allows setting { key1: null, key2: null } in a single PATCH request!
        patch_payload = {key: None for key in keys_to_delete}
        params = self._get_request_params()

        try:
            res = requests.patch(url, json=patch_payload, params=params, timeout=20)
            if res.status_code == 200:
                pruned_count = len(keys_to_delete)
                remaining_count = total_before - pruned_count
                logger.info(f"Pruning successful! Pruned: {pruned_count}, Remaining: {remaining_count}")
                return {
                    "total_before": total_before,
                    "pruned_count": pruned_count,
                    "remaining_count": remaining_count,
                    "status": "success"
                }
            else:
                logger.error(f"Multi-path prune failed ({res.status_code}): {res.text}. Attempting sequential deletes.")
                # Fallback to sequential deletion if batch patch is rejected
                sequential_pruned = 0
                for key in keys_to_delete:
                    del_url = f"{self.db_url}/aquaculture/history/{key}.json"
                    del_res = requests.delete(del_url, params=params, timeout=5)
                    if del_res.status_code == 200:
                        sequential_pruned += 1
                return {
                    "total_before": total_before,
                    "pruned_count": sequential_pruned,
                    "remaining_count": total_before - sequential_pruned,
                    "status": "partial" if sequential_pruned < len(keys_to_delete) else "success"
                }
        except Exception as e:
            logger.error(f"Exception during history pruning: {e}")
            return {"error": str(e), "total_before": total_before, "pruned_count": 0}

    def start_background_worker(self, interval_sec=DEFAULT_RETENTION_CHECK_INTERVAL_SEC, max_records=DEFAULT_MAX_HISTORY_RECORDS):
        """Starts a background daemon thread that periodically prunes history."""
        if self._worker_thread and self._worker_thread.is_alive():
            logger.warning("Retention worker thread is already running.")
            return

        self._stop_worker = False

        def _worker_loop():
            logger.info(f"Background retention worker started (Check interval: {interval_sec}s, Max records: {max_records}).")
            while not self._stop_worker:
                try:
                    self.prune_history(max_records=max_records)
                except Exception as ex:
                    logger.error(f"Error in background retention worker: {ex}")
                
                # Sleep in short increments to allow graceful shutdown
                for _ in range(int(interval_sec)):
                    if self._stop_worker:
                        break
                    time.sleep(1)
            logger.info("Background retention worker stopped.")

        self._worker_thread = threading.Thread(target=_worker_loop, daemon=True, name="FirebaseRetentionWorker")
        self._worker_thread.start()

    def stop_background_worker(self):
        """Stops the background retention worker."""
        self._stop_worker = True


# Global default instance
retention_manager = FirebaseRetentionManager()


# ------------------------------------------------------------------------------
# CLI Entrypoint
# ------------------------------------------------------------------------------
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Aqua-Intelligence Firebase History Retention Utility")
    parser.add_argument('--status', action='store_true', help="Check telemetry history stats")
    parser.add_argument('--prune', action='store_true', help="Execute retention pruning immediately")
    parser.add_argument('--max-records', type=int, default=DEFAULT_MAX_HISTORY_RECORDS, help="Max history records to retain")
    parser.add_argument('--max-age-hours', type=float, default=None, help="Max record age in hours")
    parser.add_argument('--push-sample', action='store_true', help="Push a test telemetry point")
    args = parser.parse_args()

    mgr = FirebaseRetentionManager()

    if args.push_sample:
        print("[TEST] Pushing test telemetry snapshot to Firebase /aquaculture/history...")
        res = mgr.push_telemetry_to_history(ph=7.35, temperature=26.4, turbidity=4.2)
        print("Result:", res)

    if args.status or (not args.prune and not args.push_sample):
        stats = mgr.get_history_stats()
        print("\n--- Telemetry History Summary ---")
        print(f"Database URL:      {mgr.db_url}")
        print(f"Total Records:     {stats.get('total_records')}")
        print(f"Oldest Timestamp:  {stats.get('oldest_timestamp')}")
        print(f"Newest Timestamp:  {stats.get('newest_timestamp')}")
        print(f"Time Span:         {stats.get('time_span_hours')} hours")
        print(f"Status:            {stats.get('status')}\n")

    if args.prune:
        print(f"[PRUNE] Executing pruning (max_records={args.max_records}, max_age_hours={args.max_age_hours})...")
        result = mgr.prune_history(max_records=args.max_records, max_age_hours=args.max_age_hours)
        print("Pruning Result:", result)
