# The sim container: velxio + a headless browser + the velxio backend, serving
# `embedgym-run` over HTTP and hosting `run.sh --firmware` grading via `docker exec`.
# The backend runs the nRF52840 (Renode) and ESP32-S3 (QEMU) emulators and
# answers /api/compile like the web app's; no arduino-cli, AVR compiles in env
# or on the host.
#
# The image holds toolchains, emulators, dependencies and the BLE phone's
# controller firmware; sim.sh mounts the checkout's tasks and source at run time.
#
# Needs the three stage images built first, from the repo root:
#   docker build -f velxio/Dockerfile.standalone --target renode-builder -t velxio-renode-builder velxio
#   docker build -f velxio/Dockerfile.standalone --target zephyr-builder -t velxio-zephyr-builder velxio
#   docker build -f velxio/Dockerfile.standalone --target espidf-builder -t velxio-espidf-builder velxio
#   docker build -f docker/sim_image/Dockerfile -t embedgym-sim .

FROM node:20

# Debian's chromium is the only Chrome build published for both arm64 and
# amd64; google-chrome-stable is amd64-only. libicu72 is .NET's globalization
# dependency on bookworm, which node:20 tracks.
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    python3-venv \
    libicu72 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV EMBEDGYM_CHROME=/usr/bin/chromium

# Renode (nRF52840 emulation) + the .NET runtime it needs.
COPY --from=mcr.microsoft.com/dotnet/runtime:8.0 /usr/share/dotnet /usr/share/dotnet
COPY --from=velxio-renode-builder /opt/renode /opt/renode
RUN ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet

ENV DOTNET_ROOT=/usr/share/dotnet
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1
ENV EMBEDGYM_RENODE_ROOT=/opt/renode
ENV PYRENODE_PATH=/opt/renode

# Zephyr toolchain for /api/compile. dtc and gperf are Zephyr's host build
# deps; setup.sh writes a CMake package registry into the home dir, which is
# why it re-runs here rather than travelling in the COPY.
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get update && apt-get install -y --no-install-recommends \
    cmake ninja-build device-tree-compiler gperf wget file \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ARG ZEPHYR_SDK_VERSION=0.17.4
COPY --from=velxio-zephyr-builder /opt/zephyr-sdk-${ZEPHYR_SDK_VERSION} /opt/zephyr-sdk-${ZEPHYR_SDK_VERSION}
COPY --from=velxio-zephyr-builder /opt/zephyrproject /opt/zephyrproject
RUN /opt/zephyr-sdk-${ZEPHYR_SDK_VERSION}/setup.sh -c

ENV ZEPHYR_BASE=/opt/zephyrproject/zephyr
ENV ZEPHYR_SDK_INSTALL_DIR=/opt/zephyr-sdk-${ZEPHYR_SDK_VERSION}
ENV ZEPHYR_TOOLCHAIN_VARIANT=zephyr

# ESP32-S3 emulation: the QEMU fork library + the ROMs the worker loads from
# the library's directory (-L). Copied from prebuilt/qemu/ directly, not via
# Dockerfile.standalone's qemu-provider stage: that stage falls back to a
# download of the public library, which predates the fork fixes the testbench
# probes require (targets.md). The bare .so is the operator's build for this
# host's architecture; the load check catches a wrong-arch or missing-dep file
# at build time. libglib/gcrypt/slirp/pixman/fdt are its runtime deps; ccache
# is for the backend's ESP-IDF compiles.
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgcrypt20 libslirp0 libpixman-1-0 libfdt1 ccache \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
COPY prebuilt/qemu/libqemu-xtensa.so \
     prebuilt/qemu/esp32s3_rev0_rom.bin \
     prebuilt/qemu/esp32-v3-rom.bin \
     prebuilt/qemu/esp32-v3-rom-app.bin \
     prebuilt/qemu/esp32c3-rom.bin \
     /app/lib/
RUN python3 -c "import ctypes; ctypes.CDLL('/app/lib/libqemu-xtensa.so')"
ENV QEMU_ESP32_LIB=/app/lib/libqemu-xtensa.so

# ESP-IDF v4.4.7 for /api/compile (ESP32-S3 only). No PATH entry: the backend
# globs the compiler under IDF_TOOLS_PATH itself. Its python requirements go
# into the backend venv below.
COPY --from=velxio-espidf-builder /opt/esp-idf /opt/esp-idf
COPY --from=velxio-espidf-builder /root/.espressif/tools/xtensa-esp32s3-elf /root/.espressif/tools/xtensa-esp32s3-elf
ENV IDF_PATH=/opt/esp-idf
ENV IDF_TOOLS_PATH=/root/.espressif

WORKDIR /embedgym

# Dependency manifests only. sim.sh mounts the checkout read-only (tasks,
# run.sh, harness/, velxio/ and this image's service code), so the image holds
# no gold sketch or test.
COPY velxio/frontend/package.json velxio/frontend/package-lock.json velxio/frontend/
# The frontend's npm postinstall runs it.
COPY velxio/frontend/scripts/copy-monaco.mjs velxio/frontend/scripts/
COPY package.json package-lock.json ./

# Same layout and pins as Dockerfile.standalone. west goes in the venv because
# zephyr_compiler.py resolves it with shutil.which under the backend's own
# interpreter. Bumble is the BLE phone's host (nrf52_ble.py).
COPY velxio/backend/requirements.txt /app/
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
       -r /app/requirements.txt \
       west \
       -r /opt/zephyrproject/zephyr/scripts/requirements-base.txt \
       pythonnet==3.1.0 \
       "pyrenode3 @ git+https://github.com/antmicro/pyrenode3.git@a4a804ddada430bb9a8ce81b00e78668b55486e2" \
       bumble==0.0.235 \
    && grep -v esp-windows-curses /opt/esp-idf/requirements.txt \
       | /opt/venv/bin/pip install --no-cache-dir -r /dev/stdin \
    && /opt/venv/bin/pip check \
    && cd /opt/zephyrproject && /opt/venv/bin/west zephyr-export
# backend/app is a read-only mount. The part models it imports (`embedgym_parts`) are
# the checkout's parts/.
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/embedgym/parts

RUN cd velxio/frontend && npm ci --include=optional

# The mounted harness/ resolves its deps through its committed node_modules
# symlink to velxio/frontend/node_modules, which stays this image's.
RUN npm ci

# The BLE phone's controller (nrf52_ble.py): Zephyr's hci_uart sample plus a
# phone's options, from the committed source. West needs the venv on PATH for
# the Python that CMake finds.
COPY docker/sim_image/ble_controller /opt/ble_controller/src
RUN cd /opt/zephyrproject \
    && PATH=/opt/venv/bin:$PATH west build -p always -b nrf52840dk/nrf52840 /opt/ble_controller/src \
       -d /tmp/ble_controller_build -- -DEXTRA_CONF_FILE=phone.conf \
    && cp /tmp/ble_controller_build/zephyr/zephyr.elf /opt/ble_controller/hci_uart.elf \
    && rm -rf /tmp/ble_controller_build
ENV EMBEDGYM_BLE_CONTROLLER_ELF=/opt/ble_controller/hci_uart.elf
# sim.sh mounts the checkout here; BLE peer paths resolve under it.
ENV EMBEDGYM_ROOT=/embedgym

# 8080 is the agent's run service; 8001 is the emulator backend, which run.sh
# dials for backend-emulated targets.
EXPOSE 8080 8001
CMD ["bash", "/embedgym/docker/sim_image/entrypoint.sh"]
