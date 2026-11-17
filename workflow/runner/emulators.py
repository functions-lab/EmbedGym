"""Emulator sources in a port run's chain copy, their builds and their install into the run's sim.

chain/emulators/qemu and chain/emulators/renode hold the sources the sim image's emulators were
built from (the commits in the copy's docker/emulators.env), taken from the checkouts the sim image
is built from: third-party/qemu-esp32s3 (git, any commit; QEMU_COMMIT is archived from it) and
velxio/third-party/renode (at RENODE_COMMIT, lib/resources at RENODE_RESOURCES_COMMIT, unmodified).
Agents may edit them. A build (the
helper's `build` job, which agents start with embedgym-build) syncs one of them into a per-run docker
volume and builds it there without network, incrementally after the first build, into
chain/emulators/out/<emulator>/, logging to chain/emulators/logs/. launch.sim_up installs what
out/ holds over the sim image's files.

Build images, from workflow/runner/ (renode.Dockerfile builds on the velxio-renode-builder image,
docker build -f velxio/Dockerfile.standalone --target renode-builder -t velxio-renode-builder velxio):
  docker build -t embedgym-qemu-build -f emulator_build/qemu.Dockerfile emulator_build
  docker build -t embedgym-renode-build -f emulator_build/renode.Dockerfile emulator_build
Renode restores its NuGet packages from the embedgym-renode-nuget volume. Fill it once with
`emulators.py prime <run>`, a Renode build with network.
"""
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

import codex

QEMU_REPO = codex.REPO / "third-party/qemu-esp32s3"
RENODE_SRC = codex.REPO / "velxio/third-party/renode"
NUGET_VOLUME = "embedgym-renode-nuget"
EMULATORS = ("qemu", "renode")

# Syncs by content without times: a synced file gets the current time, so the build redoes what
# depends on it even when it went back to older contents (a restored snapshot). P protects the
# build's own files from --delete.
SYNC = "rsync -rlpD --checksum --delete"

# The sim's library: built at /src (its debug info holds the source path) as the fork's
# Dockerfile.build builds it. After the first build, ninja rebuilds only what changed.
QEMU_BUILD = "set -e\n" + SYNC + r""" --filter='P /build/' /in/ /src/
sh /src/build_libqemu-xtensa.sh /src/build
mkdir /out
cp /src/build/libqemu-xtensa.so /out/
"""

# Laid out as Dockerfile.standalone's renode-builder stage installs it at /opt/renode.
RENODE_BUILD = "set -e\n" + SYNC + r""" --filter='P /output/' --filter='P obj/' --filter='P bin/' \
  --filter='P /Directory.Build.targets' --filter='P /lib/termsharp/xwt/Xwt.WPF/Directory.Build.props' /in/ /src/
cd /src
./build.sh --skip-fetch -- p:RemoveWPF=true
mkdir /out
cp -r .renode-root platforms scripts /out/
cp -r output/bin/Release /out/bin
rm -f /out/bin/RenodeWPF.dll /out/bin/RenodeWPF.runtimeconfig.json
"""


def pins(bench: Path) -> dict:
    lines = (bench / "docker/emulators.env").read_text().splitlines()
    return dict(line.split("=", 1) for line in lines if line and not line.startswith("#"))


def git_head(repo: Path) -> str:
    return subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True,
                          check=True).stdout.strip()


def add_sources(chain: Path) -> None:
    """The QEMU fork at QEMU_COMMIT, and the Renode fork at RENODE_COMMIT with its resources, build
    script cut to the Cortex-M core as Dockerfile.standalone cuts it."""
    p = pins(chain / "repo")
    dst = chain / "emulators"
    qemu = dst / "qemu"
    qemu.mkdir(parents=True)
    archive = subprocess.run(["git", "-C", str(QEMU_REPO), "archive", p["QEMU_COMMIT"]], capture_output=True, check=True)
    subprocess.run(["tar", "-x", "-C", str(qemu)], input=archive.stdout, check=True)
    # The meson subprojects configure would fetch, since builds run without network; meson is the
    # one the fork bundles.
    fetch = ("mkdir -p /src && cd /src && tar -x && python3 -m venv /tmp/meson && /tmp/meson/bin/pip install -q "
             "python/wheels/meson-*.whl >&2 && /tmp/meson/bin/meson subprojects download berkeley-softfloat-3 "
             "berkeley-testfloat-3 keycodemapdb >&2 && tar -c --exclude=.git subprojects")
    vendored = subprocess.run(["docker", "run", "--rm", "-i", "embedgym-qemu-build", "bash", "-c", fetch],
                              input=archive.stdout, capture_output=True, check=True)
    subprocess.run(["tar", "-x", "-C", str(qemu)], input=vendored.stdout, check=True)

    for repo, key in ((RENODE_SRC, "RENODE_COMMIT"), (RENODE_SRC / "lib/resources", "RENODE_RESOURCES_COMMIT")):
        if git_head(repo) != p[key]:
            raise SystemExit(f"{repo} is not at {key} {p[key]}")
    dirty = subprocess.run(["git", "-C", str(RENODE_SRC), "status", "--porcelain", "--ignore-submodules=none"],
                           capture_output=True, text=True, check=True).stdout
    if dirty:
        raise SystemExit(f"{RENODE_SRC} has local changes:\n{dirty}")
    subprocess.run(["rsync", "-a", "--exclude=.git", f"{RENODE_SRC}/", f"{dst / 'renode'}/"], check=True)
    cores = (dst / "renode/build.sh").read_text().split("\nCORES=(", 1)[1].split(")", 1)[0]
    edit(dst / "renode/build.sh", [(f"\nCORES=({cores})", "\nCORES=(arm-m.le)")])
    (dst / "out").mkdir()
    (dst / "logs").mkdir()


def edit(path: Path, replacements: list[tuple[str, str]]) -> None:
    text = path.read_text()
    for old, new in replacements:
        if text.count(old) != 1:
            raise SystemExit(f"{path}: expected one {old!r}")
        text = text.replace(old, new)
    path.write_text(text)


def build(chain: Path, run: str, emulator: str, clean: bool, log: Path, network: bool = False) -> dict:
    """Builds chain/emulators/<emulator> into out/<emulator>, which keeps its last good build when
    this one fails. `clean` drops the build volume first."""
    if emulator not in EMULATORS:
        raise ValueError(f"emulator must be one of {EMULATORS}")
    out = chain / "emulators/out" / emulator
    staged = out.with_name(f"{emulator}.new")
    shutil.rmtree(staged, ignore_errors=True)
    volume = f"embedgym-wf-{run}-{emulator}-build"
    if clean:
        subprocess.run(["docker", "volume", "rm", "-f", volume], check=True, capture_output=True)
    image, script, mounts = (("embedgym-qemu-build", QEMU_BUILD, []) if emulator == "qemu"
                             else ("embedgym-renode-build", RENODE_BUILD, ["-v", f"{NUGET_VOLUME}:/root/.nuget/packages"]))
    # The build leaves its output in the container, for `docker cp`: Docker Desktop can resolve a
    # bind mount of a directory renamed and recreated moments before to the old directory.
    name = f"embedgym-wf-{run}-build-{emulator}"
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    cmd = ["docker", "run", "--name", name, "--label", f"embedgym-wf-run={run}", *([] if network else ["--network", "none"]),
           "-v", f"{chain / 'emulators' / emulator}:/in:ro", "-v", f"{volume}:/src", *mounts, image, "bash", "-c", script]
    log.parent.mkdir(exist_ok=True)
    try:
        with open(log, "w") as f:
            code = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL).returncode
        if code != 0:
            raise RuntimeError(f"the {emulator} build failed (exit {code}); log: {log}")
        subprocess.run(["docker", "cp", f"{name}:/out", str(staged)], check=True, capture_output=True)
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    shutil.rmtree(out, ignore_errors=True)
    staged.rename(out)
    result = {"log": str(log), "out": str(out)}
    if emulator == "qemu":
        result["sha256"] = hashlib.sha256((out / "libqemu-xtensa.so").read_bytes()).hexdigest()
    return result


def install(chain: Path, container: str) -> list[str]:
    """Copies the builds in chain/emulators/out over the sim image's files in the running sim
    container; returns the emulators installed. The caller restarts the container."""
    out = chain / "emulators/out"
    installed = []
    if (out / "qemu").exists():
        subprocess.run(["docker", "cp", str(out / "qemu/libqemu-xtensa.so"), f"{container}:/app/lib/libqemu-xtensa.so"],
                       check=True, capture_output=True)
        installed.append("qemu")
    if (out / "renode").exists():
        subprocess.run(["docker", "exec", container, "rm", "-rf", "/opt/renode"], check=True, capture_output=True)
        subprocess.run(["docker", "cp", str(out / "renode"), f"{container}:/opt/renode"], check=True, capture_output=True)
        installed.append("renode")
    return installed


if __name__ == "__main__":
    if sys.argv[1:2] != ["prime"] or len(sys.argv) != 3:
        raise SystemExit("usage: emulators.py prime <run>")
    import launch
    run = sys.argv[2]
    chain = launch.chain_dir(run)
    print(build(chain, run, "renode", False, chain / "emulators/logs/renode-prime.log", network=True))
