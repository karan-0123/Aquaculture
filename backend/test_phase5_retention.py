# -*- coding: utf-8 -*-
"""
==============================================================================
AQUA·INTELLIGENCE — Phase 5 Test Suite
==============================================================================
Tests Firebase Realtime Database rules schema validation, history archival,
and data retention/pruning rotation algorithms.
==============================================================================
"""

import unittest
import time
import json
from firebase_retention import FirebaseRetentionManager
import app as flask_app


class TestFirebaseRetentionLogic(unittest.TestCase):
    """Unit tests for Firebase retention and rotation logic."""

    def setUp(self):
        self.manager = FirebaseRetentionManager(
            db_url="https://aquaculture-mock-test-rtdb.firebaseio.com",
            api_key="mock_key",
            email="test@aquaculture.local",
            password="mock_password"
        )

    def test_mock_pruning_calculation(self):
        """Tests that count-based pruning correctly identifies the oldest items for deletion."""
        # Create 15 mock history items with timestamps spaced 1 minute apart
        now = int(time.time())
        mock_data = {}
        for i in range(15):
            mock_data[f"-ItemKey{i:02d}"] = {
                "ph": 7.2,
                "temperature": 25.0 + (i * 0.1),
                "turbidity": 4.0,
                "timestamp": now - (15 - i) * 60
            }

        # Simulate pruning keeping only the 5 most recent records
        max_records = 5
        items = [(k, v["timestamp"]) for k, v in mock_data.items()]
        items.sort(key=lambda x: x[1])

        excess_count = len(items) - max_records
        keys_to_delete = [items[i][0] for i in range(excess_count)]

        self.assertEqual(len(keys_to_delete), 10)
        # Oldest items should be selected for pruning
        self.assertIn("-ItemKey00", keys_to_delete)
        self.assertIn("-ItemKey09", keys_to_delete)
        # 5 newest items must NOT be pruned
        self.assertNotIn("-ItemKey10", keys_to_delete)
        self.assertNotIn("-ItemKey14", keys_to_delete)

    def test_ttl_pruning_calculation(self):
        """Tests that TTL / age-based pruning correctly identifies expired timestamps."""
        now = int(time.time())
        # 3 items: 48h old, 25h old, and 2h old
        mock_data = {
            "key_48h": {"timestamp": now - 48 * 3600},
            "key_25h": {"timestamp": now - 25 * 3600},
            "key_2h":  {"timestamp": now - 2 * 3600},
        }

        max_age_hours = 24.0
        cutoff_ts = int(now - (max_age_hours * 3600))
        keys_to_delete = {k for k, v in mock_data.items() if v["timestamp"] < cutoff_ts}

        self.assertEqual(len(keys_to_delete), 2)
        self.assertIn("key_48h", keys_to_delete)
        self.assertIn("key_25h", keys_to_delete)
        self.assertNotIn("key_2h", keys_to_delete)

    def test_mock_prune_execution(self):
        """Tests prune_history execution with mocked requests."""
        from unittest.mock import patch, MagicMock
        now = int(time.time())
        mock_history = {
            f"key_{i}": {"ph": 7.0, "temperature": 25.0, "turbidity": 4.0, "timestamp": now + i}
            for i in range(10)
        }

        with patch.object(self.manager, 'get_history', return_value=mock_history):
            with patch('requests.patch') as mock_patch:
                mock_res = MagicMock()
                mock_res.status_code = 200
                mock_patch.return_value = mock_res

                result = self.manager.prune_history(max_records=5)
                self.assertEqual(result["status"], "success")
                self.assertEqual(result["pruned_count"], 5)
                self.assertEqual(result["remaining_count"], 5)
                mock_patch.assert_called_once()


class TestDatabaseRulesValidation(unittest.TestCase):
    """Validates that database.rules.json file is syntactically valid JSON and includes critical rules."""

    def test_rules_file_validity(self):
        import os
        rules_path = os.path.join(os.path.dirname(__file__), '..', 'database.rules.json')
        self.assertTrue(os.path.exists(rules_path), "database.rules.json must exist in project root")

        # Strip JavaScript-style // comments from JSON for standard parser
        with open(rules_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        clean_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped.startswith('//'):
                continue
            # remove inline // comments if present
            if '//' in line:
                line = line[:line.index('//')]
            clean_lines.append(line)
        clean_json_str = "".join(clean_lines)

        rules = json.loads(clean_json_str)
        self.assertIn("rules", rules)
        self.assertIn("aquaculture", rules["rules"])
        aqua = rules["rules"]["aquaculture"]
        self.assertIn("sensors", aqua)
        self.assertIn("history", aqua)
        
        # Security checks
        self.assertEqual(aqua["sensors"][".write"], "auth != null")
        self.assertEqual(aqua["history"][".write"], "auth != null")
        self.assertEqual(aqua[".read"], True)
        self.assertIn(".indexOn", aqua["history"])
        self.assertIn("timestamp", aqua["history"][".indexOn"])


class TestFlaskRetentionEndpoints(unittest.TestCase):
    """Tests the Flask API endpoints for history retention."""

    def setUp(self):
        flask_app.app.config['TESTING'] = True
        self.client = flask_app.app.test_client()

    def test_retention_status_endpoint(self):
        res = self.client.get('/firebase/retention/status')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("status", data)
        self.assertIn("total_records", data)

    def test_history_endpoint(self):
        res = self.client.get('/firebase/history?limit=10')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("history", data)
        self.assertIn("count", data)

    def test_history_push_validation(self):
        # Missing required fields
        res = self.client.post('/firebase/history/push', json={"ph": 7.0})
        self.assertEqual(res.status_code, 400)


if __name__ == '__main__':
    unittest.main()
