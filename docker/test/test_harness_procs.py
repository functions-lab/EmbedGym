"""python3 docker/test/test_harness_procs.py (Linux, runs harness_procs.sh on the host)."""

import os
import subprocess
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "docker" / "sim_image" / "harness_procs.sh"


def spawn(harness_id: str) -> subprocess.Popen:
    # 1 MB of variables ahead of the id: an early-exiting reader would miss it.
    env = {f"BIG{i}": "x" * 100_000 for i in range(10)}
    env.update(EMBEDGYM_HARNESS_ID=harness_id, PATH=os.environ["PATH"])
    return subprocess.Popen(["sleep", "60"], env=env)


class StopTest(unittest.TestCase):
    def test_stops_exactly_the_named_harness(self):
        target, other = spawn("run-1"), spawn("run-10")
        try:
            subprocess.run(["bash", str(SCRIPT), "stop", "run-1"], check=True, timeout=30)
            self.assertIsNotNone(target.poll())
            self.assertIsNone(other.poll())
        finally:
            for proc in (target, other):
                proc.kill()
                proc.wait()

    def test_rejects_bad_usage(self):
        self.assertEqual(subprocess.run(["bash", str(SCRIPT), "stop"], capture_output=True).returncode, 2)


if __name__ == "__main__":
    unittest.main()
