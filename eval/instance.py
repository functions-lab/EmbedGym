"""Names and host ports of one sim stack; mirrors instance.sh, which sim.sh uses to start it.

INSTANCE labels the stack EMBEDGYM_INSTANCE selects: "default" when it is unset or
empty, else "1"-"9".
"""

import os


def instance_label(raw: str) -> str:
    if raw == "":
        return "default"
    if len(raw) == 1 and raw in "123456789":
        return raw
    raise SystemExit(f"EMBEDGYM_INSTANCE must be empty or 1-9, got: {raw!r}")


def env_value(label: str) -> str:
    """The EMBEDGYM_INSTANCE value that selects a labelled stack."""
    return "" if label == "default" else label


def name_suffix(label: str) -> str:
    return "" if label == "default" else f"-{label}"


def port_offset(label: str) -> int:
    return 0 if label == "default" else 100 * int(label)


INSTANCE = instance_label(os.environ.get("EMBEDGYM_INSTANCE", ""))

SIM_CONTAINER = f"embedgym-sim{name_suffix(INSTANCE)}"
SIM_NETWORK = f"embedgym-bench{name_suffix(INSTANCE)}"
CLOUD_CONTAINER = f"esp_cloud{name_suffix(INSTANCE)}"
AGENT_NETWORK = f"esp_agent_net{name_suffix(INSTANCE)}"
CLOUD_HOST_PORT = 9001 + port_offset(INSTANCE)
