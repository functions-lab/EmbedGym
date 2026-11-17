# Names and host ports of one sim stack (sim, esp_cloud, esp_pg and their
# networks), sourced by sim.sh and cloud.sh; instance.py mirrors it.
# EMBEDGYM_INSTANCE unset or empty selects the default stack; EMBEDGYM_INSTANCE=N (1-9)
# an independent one beside it, with "-N" names and host ports offset by 100*N.

EMBEDGYM_INSTANCE="${EMBEDGYM_INSTANCE:-}"
case "$EMBEDGYM_INSTANCE" in
  '') suffix=""; port_offset=0 ;;
  [1-9]) suffix="-$EMBEDGYM_INSTANCE"; port_offset=$((100 * EMBEDGYM_INSTANCE)) ;;
  *) echo "error: EMBEDGYM_INSTANCE must be empty or 1-9, got: $EMBEDGYM_INSTANCE" >&2; exit 1 ;;
esac

SIM_CONTAINER="embedgym-sim$suffix"
SIM_NETWORK="embedgym-bench$suffix"
CLOUD_CONTAINER="esp_cloud$suffix"
PG_CONTAINER="esp_pg$suffix"
CLOUD_NETWORK="esp_cloud_net$suffix"
AGENT_NETWORK="esp_agent_net$suffix"
SIM_HOST_PORT=$((8080 + port_offset))
BACKEND_HOST_PORT=$((8001 + port_offset))
CLOUD_HOST_PORT=$((9001 + port_offset))
