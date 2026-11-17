"""The models under parts/embedgym_parts/ import each other as top-level `embedgym_parts.…`
modules, the way the workers load them, so parts/ goes on sys.path; so does
velxio's services directory, for the I2C protocol constants some tests take
from esp32_i2c_slaves."""
import sys
from pathlib import Path

PARTS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PARTS))
sys.path.insert(0, str(PARTS.parent / 'velxio' / 'backend' / 'app' / 'services'))
