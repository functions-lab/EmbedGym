#!/usr/bin/env bash
# Prints the registry tag for HEAD's env, sim or esp-cloud image: a hash of the committed
# files the image is built from. A checkout finds its published image by it,
# and CI builds only tags the registry lacks.
#
#   bash docker/image_tag.sh env|sim|esp-cloud

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# velxio_inputs are paths inside the velxio submodule, hashed at the commit
# HEAD pins it to.
case "${1:-}" in
  env)
    inputs=(
      .dockerignore
      docker/docker-bake.hcl
      docker/env_image
    )
    velxio_inputs=(
      Dockerfile.standalone
      .dockerignore
      backend/app/services/esp-idf-template/native
      backend/app/services/esp-idf-template/embedgym_appstart
    )
    ;;
  sim)
    inputs=(
      .dockerignore
      docker/docker-bake.hcl
      docker/emulators.env
      docker/sim_image/Dockerfile
      docker/sim_image/ble_controller
      package.json
      package-lock.json
    )
    velxio_inputs=(
      Dockerfile.standalone
      .dockerignore
      frontend/package.json
      frontend/package-lock.json
      frontend/scripts/copy-monaco.mjs
      backend/requirements.txt
    )
    ;;
  esp-cloud)
    inputs=(
      docker/docker-bake.hcl
      docker/esp_cloud_image/Dockerfile
      docker/esp_cloud_image/credentials.json
      docker/esp_cloud_image/mosquitto.conf
      docker/esp_cloud_image/server.py
      docker/esp_cloud_image/embedgym_peer
    )
    velxio_inputs=()
    ;;
  *)
    echo "usage: bash image_tag.sh env|sim|esp-cloud" >&2
    exit 1
    ;;
esac

velxio_commit="$(git -C "$REPO" rev-parse HEAD:velxio)"
for path in "${inputs[@]}"; do
  git -C "$REPO" cat-file -e "HEAD:$path"
done
for path in "${velxio_inputs[@]}"; do
  git -C "$REPO/velxio" cat-file -e "$velxio_commit:$path"
done
{
  git -C "$REPO" ls-tree -r HEAD -- "${inputs[@]}"
  if [ ${#velxio_inputs[@]} -gt 0 ]; then
    git -C "$REPO/velxio" ls-tree -r "$velxio_commit" -- "${velxio_inputs[@]}"
  fi
} | git hash-object --stdin | cut -c1-12
