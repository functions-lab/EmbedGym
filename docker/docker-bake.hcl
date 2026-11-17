# Build graph of the published testbench images, used by
# .github/workflows/testbench-images.yml. Run from the repository root, for
# the builder's native architecture:
#
#   ARCH=amd64 ENV_TAG=... docker buildx bake -f docker/docker-bake.hcl env
#
# `sim` needs velxio/third-party/renode checked out and prebuilt/qemu/ filled
# first; the `qemu` target writes the fork's libraries there.

variable "REGISTRY" {
  default = "ghcr.io/functions-lab"
}

variable "ARCH" {
  validation {
    condition     = ARCH == "amd64" || ARCH == "arm64"
    error_message = "ARCH must be amd64 or arm64."
  }
}

variable "ENV_TAG" {}
variable "SIM_TAG" {}
variable "CLOUD_TAG" {}

target "zephyr-builder" {
  context    = "velxio"
  dockerfile = "Dockerfile.standalone"
  target     = "zephyr-builder"
}

target "espidf-builder" {
  context    = "velxio"
  dockerfile = "Dockerfile.standalone"
  target     = "espidf-builder"
}

target "renode-builder" {
  context    = "velxio"
  dockerfile = "Dockerfile.standalone"
  target     = "renode-builder"
}

target "qemu" {
  context    = "third-party/qemu-esp32s3"
  dockerfile = "Dockerfile.build"
  output     = ["type=local,dest=prebuilt/qemu"]
}

# One image per framework; `bake env` builds all three.
target "env" {
  name       = "env-${image}"
  matrix     = { image = ["arduino", "espidf", "zephyr"] }
  dockerfile = "docker/env_image/Dockerfile"
  target     = image
  contexts = {
    velxio-zephyr-builder = "target:zephyr-builder"
    velxio-espidf-builder = "target:espidf-builder"
  }
  labels = {
    "org.opencontainers.image.source" = "https://github.com/functions-lab/EmbedGym"
  }
  tags = ["${REGISTRY}/embedgym-env-${image}:${ENV_TAG}-${ARCH}"]
}

target "sim" {
  dockerfile = "docker/sim_image/Dockerfile"
  contexts = {
    velxio-renode-builder = "target:renode-builder"
    velxio-zephyr-builder = "target:zephyr-builder"
    velxio-espidf-builder = "target:espidf-builder"
  }
  labels = {
    "org.opencontainers.image.source" = "https://github.com/functions-lab/EmbedGym"
  }
  tags = ["${REGISTRY}/embedgym-sim:${SIM_TAG}-${ARCH}"]
}

target "esp-cloud" {
  context = "docker/esp_cloud_image"
  labels = {
    "org.opencontainers.image.source" = "https://github.com/functions-lab/EmbedGym"
  }
  tags = ["${REGISTRY}/embedgym-esp-cloud:${CLOUD_TAG}-${ARCH}"]
}
