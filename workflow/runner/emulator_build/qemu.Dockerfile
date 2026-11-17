# Builds the QEMU fork's xtensa library for agents' emulator fixes (emulators.py), with the
# packages of the fork's Dockerfile.build (third-party/qemu-esp32s3), which builds the sim image's
# library; rsync syncs the agents' sources in.
FROM debian:bookworm
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential ca-certificates git ninja-build pkg-config python3 python3-venv perl \
    flex bison libglib2.0-dev libgcrypt20-dev libslirp-dev libpixman-1-dev libfdt-dev zlib1g-dev rsync \
 && rm -rf /var/lib/apt/lists/*
