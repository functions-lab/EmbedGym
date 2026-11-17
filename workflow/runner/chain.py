"""Runs a scaling build run's parts one after another in a single chain copy, each stage as a Codex
orchestrator session (launch.py).

Usage: chain.py <run> --refs <refs-run> --instance N [--helper-port 8770] [--step]
With --step the chain exits after each stage that ends; the same command resumes it.
The copy WORK/<run>/chain/ (codex.WORK) is exported once from this checkout (export.sh). Each part
then runs its component stage and its task stage in that copy, in parts.json order, so a
part starts from every earlier part's files. A part waits until the user has reviewed its spec
(listed in workflow/runs/<refs-run>/spec_review.json). Its spec.md, approved/ and approved
driver libraries are added to the copy before its component stage, its task specs (pinout for
the run's target only) before its task stage, and the copy is then snapshotted to
chain/snap/<NN>_<part>-<stage>/. The host helper (helper.py) is started when it is not up.

How a stage ends (codex.stage_end, plus the status the orchestrator wrote in record.json):
- Normal end: `stage 2 done` → task stage; `stage 3 done`, or `blocked: …` in either stage →
  regression (every unit-test dir and task this run added, on the run's target), collect, next
  part, keeping the copy as the stage left it; any other status stops the chain for review.
- Interruption (any other end). The attempt moves to <stage>/failed-N/ and its CODEX_HOME to
  <home>-failed-N, the copy goes back to the stage's snapshot and the stage starts again, after a
  usage limit not before its reset, after a model-capacity error ten minutes later. Three other
  interruptions of one stage stop the chain.
State: workflow/runs/<run>/chain.json. Status page: workflow/runs/<run>/status.md.

A port run (--port-from <build run>, optionally --parts) starts from that run's final copy, brought up
to this checkout's commit (port_chain), and ports
its parts (stage A, the component stage) and tasks (stage B, the task stage) to launch.PORT_TARGETS,
with no spec gate. Its copy adds chain/emulators/ (emulators.py), which snapshots keep too. Its
regression runs every unit-test and task dir the part's stages touched, and the part's own, on
every target dir they have; every unit-test and task dir on the targets of shared code the stages
changed (SHARED); and the velxio frontend, parts and harness suites (SUITES) against their
failures at the start of the run. On each target, the rows of the part's latest `embedgym-regress` job
that found the shared code and emulator builds reaching that target as they are stand for the
dirs that have not changed since, the part's own excepted. After the last part of a full port
run, every unit-test and task dir on every target.
These regressions run on the run's sim instance and REGRESSION_INSTANCES in parallel and report the
failures new since the start of the run (dirs_base.json, measured then).
"""
import argparse
import fnmatch
import hashlib
import json
import os
import queue
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

import codex
import collect
import emulators
import launch
from launch import (ORDER, PARTS, REFERENCES, RUNS, chain_dir, done_statuses, is_port, item_dir, part_info,
                    run_config, run_targets)

RUNNER = Path(__file__).resolve().parent
TREES = ("repo", "ws", "arduino-libraries")
CACHES = ["velxio/frontend/node_modules/.vite", "velxio/frontend/node_modules/.vitest",
          "velxio/frontend/node_modules/.cache", "node_modules/.vite", "node_modules/.cache",
          "parts/test/ts/node_modules"]
MAX_INTERRUPTIONS = 3
# "Selected model is at capacity" ends a session; restarting at once tends to hit it again.
CAPACITY_WAIT_MIN = 10
# A container that `docker run` has not created yet is still starting.
START_GRACE_S = 120
# run.sh's defaults are too short on this host for long tasks (dht11_read on AVR: 140 s;
# bme280's backend raw SPI suites: up to ~350 s).
REGRESSION_TIMEOUT_MS = 600_000
# Test suites a port run's regression runs, by name: cwd in the copy and command ({out}: report file).
SUITES = {
    "velxio-frontend": ("velxio/frontend", ["node_modules/.bin/vitest", "run", "--reporter=json", "--outputFile={out}"]),
    "parts-ts": ("parts/test/ts", ["../../node_modules/.bin/vitest", "run", "--reporter=json", "--outputFile={out}"]),
    "harness": ("harness/test", ["../node_modules/.bin/vitest", "run", "--reporter=json", "--outputFile={out}"]),
    "parts-py": ("parts/test/py", ["python3", "-m", "pytest", ".", "-q", "-p", "no:cacheprovider",
                                   "--junitxml={out}"]),
}
SUITE_TIMEOUT_S = 3600
# Sim instances (docker/instance.sh) a port run's regression runs on beside the run's own, in
# parallel: no stage runs meanwhile.
REGRESSION_INSTANCES = [5, 6, 7]
# run.sh's checks of the sim stack before any test: such a failure is the stack's, not the dir's.
STACK_DOWN = re.compile(r"^error: (velxio backend not reachable|esp_cloud not healthy|cannot read EMBEDGYM_CLOUD_TOKEN)")
ESP = ["esp32s3_arduino", "esp32s3_espidf"]
NRF = ["nrf52840_arduino", "nrf52840_zephyr"]
ALL = ["atmega2560_arduino", *launch.PORT_TARGETS]
# Shared code, by path in the chain copy, first match: the targets it reaches. A part's change to
# a shared file that is not its own (named after it) widens its regression to those targets.
SERVICES = "repo/velxio/backend/app/services/"
SHARED = [("emulators/qemu/", ESP), ("emulators/renode/", NRF),
          (f"{SERVICES}esp32_", ESP), (f"{SERVICES}esp_qemu_manager.py", ESP), (f"{SERVICES}qemu_manager.py", ESP),
          (f"{SERVICES}nrf52_", NRF), (f"{SERVICES}embedgym_ble/", NRF), (SERVICES, ALL),
          ("repo/velxio/frontend/src/", ALL), ("repo/parts/", ALL), ("repo/harness/", ALL),
          ("repo/docker/sim_image/", ALL)]
# Emulator builds (emulators.build), by path in the chain copy: the targets they reach.
BUILDS = [("emulators/out/qemu/", ESP), ("emulators/out/renode/", NRF)]


def log(msg: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {msg}", flush=True)


def container_state(running: dict) -> str:
    """`running`, `exited` (exit code readable) or `starting`."""
    proc = subprocess.run(["docker", "inspect", "-f", "{{.State.Status}}", running["container"]],
                          capture_output=True, text=True)
    if proc.returncode == 0:
        return "running" if proc.stdout.strip() in ("created", "running") else "exited"
    started = datetime.strptime(running["start"], "%Y-%m-%dT%H:%M:%S%z").timestamp()
    if time.time() - started < START_GRACE_S:
        return "starting"
    raise SystemExit(f"container {running['container']} is gone: {proc.stderr.strip()}")


def finish_container(name: str, pid: int, out: Path) -> int:
    """The exited container's exit code. Its stream and stderr in `out` are rewritten from the
    container's logs, since a `docker run` client that died first (with an earlier chain.py
    process) stopped writing them; then the container is removed."""
    code = int(subprocess.run(["docker", "inspect", "-f", "{{.State.ExitCode}}", name],
                              capture_output=True, text=True, check=True).stdout.strip())
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        # Started by an earlier chain.py process: give its client, if alive, time to flush.
        time.sleep(5)
    with open(out / "stream.jsonl", "w") as stream, open(out / "stderr.txt", "w") as err:
        subprocess.run(["docker", "logs", name], stdout=stream, stderr=err, check=True)
    subprocess.run(["docker", "rm", name], check=True, capture_output=True)
    return code


def copy_records(run: str, part: str) -> Path:
    return chain_dir(run) / "repo/workflow/runs" / run / part


def record_status(run: str, part: str) -> str | None:
    record = copy_records(run, part) / "record.json"
    return json.load(open(record)).get("status") if record.exists() else None


def status_file(run: str) -> Path:
    return RUNS / run / "status.md"


def trees(run: str) -> tuple[str, ...]:
    """The copy's trees that snapshots keep."""
    return TREES + (("emulators",) if (chain_dir(run) / "emulators").exists() else ())


def agent_run(run: str, cwd: Path, cmd: list[str], env: dict[str, str], timeout: int | None = None,
              mounts: dict[Path, Path] | None = None):
    """`cmd` in a fresh agents' container that mounts the copy as stage sessions do, plus `mounts`
    (host path: container path)."""
    d = chain_dir(run)
    flags = [x for k, v in env.items() for x in ("-e", f"{k}={v}")]
    flags += [x for host, inside in (mounts or {}).items() for x in ("-v", f"{host}:{inside}")]
    return subprocess.run(["docker", "run", "--rm", "--label", f"embedgym-wf-run={run}", *codex.DOCKER_USER, *codex.HOST_NETWORK,
                           "-v", f"{d / 'repo'}:{d / 'repo'}",
                           "-v", f"{d / 'ws'}:{d / 'ws'}", "-v", f"{d / 'arduino-libraries'}:/root/Arduino/libraries",
                           *flags, "-w", str(cwd), codex.IMAGE, *cmd], capture_output=True, text=True, timeout=timeout)


def git(checkout: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(checkout), *args], capture_output=True, text=True, check=True).stdout


def port_chain(run: str, src: str) -> None:
    """A port run's copy: build run `src`'s final copy, brought up to this checkout's commit
    (apply_baseline), with the workflow and step agents of that commit in place of the ones `src`
    ran with. Merge conflicts stop the chain; resolve them in the copy and rerun."""
    d, s = chain_dir(run), chain_dir(src)
    source = json.load(open(s / "export.json"))
    if source["base"].endswith("+dirty"):
        raise SystemExit(f"run {src} was exported from uncommitted files: its base is no commit to merge from")
    workflow = ["workflow/pipeline.md", "workflow/agents"]
    if git(codex.REPO, "status", "--porcelain", "--", *workflow):
        raise SystemExit(f"commit {workflow} in {codex.REPO} first")
    base = git(codex.REPO, "rev-parse", "HEAD").strip()
    d.mkdir(parents=True)
    for tree in ("ws", "arduino-libraries"):
        subprocess.run(["rsync", "-a", f"{s}/{tree}/", f"{d}/{tree}/"], check=True)
    subprocess.run(["rsync", "-a", *launch.NODE_MODULES, f"{s}/repo/", f"{d}/repo/"], check=True)
    for modules in ("node_modules", "velxio/frontend/node_modules"):
        subprocess.run(["cp", "-al", str(s / "repo" / modules), str(d / "repo" / modules)], check=True)
    for cache in CACHES:
        shutil.rmtree(d / "repo" / cache, ignore_errors=True)
    shutil.rmtree(d / "repo/workflow/agents")
    archive = subprocess.run(["git", "-C", str(codex.REPO), "archive", "HEAD", *workflow], capture_output=True,
                             check=True)
    subprocess.run(["tar", "-x", "-C", str(d / "repo")], input=archive.stdout, check=True)
    (d / "ws/sim.lock").unlink(missing_ok=True)
    json.dump({"base": base, "from": src, "from_base": source["base"]}, open(d / "export.json", "w"), indent=1)
    conflicts = apply_baseline(d / "repo", source["base"], base, codex.REPO)
    emulators.add_sources(d)
    json.dump(launch.digest(d / "repo"), open(d / "frozen.json", "w"), indent=1)
    if conflicts:
        raise SystemExit(f"resolve the merge conflicts in {d / 'repo'}: {conflicts}; then run chain.py again")


def gitlink(checkout: Path, rev: str, path: str) -> str | None:
    """The submodule commit `path` records at `rev`, or None when it is no submodule there."""
    entry = git(checkout, "ls-tree", rev, "--", path).split()
    return entry[2] if entry and entry[1] == "commit" else None


def apply_baseline(repo: Path, old: str, new: str, checkout: Path) -> list[str]:
    """Brings the copy's files from commit `old` to `new` of `checkout` by a three-way merge per
    file, keeping the copy's own changes since `old`, and likewise inside submodules. Returns the
    files left conflicting: with conflict markers, or binary, added, or deleted on both sides."""
    paths = git(checkout, "diff", "--name-only", old, new).split()
    conflicts = []
    for path in paths:
        links = [gitlink(checkout, rev, path) for rev in (old, new)]
        if None not in links:
            conflicts += [f"{path}/{c}" for c in apply_baseline(repo / path, *links, checkout / path)]
            continue
        if links != [None, None]:
            conflicts.append(path)
            continue
        blobs = [subprocess.run(["git", "-C", str(checkout), "show", f"{rev}:{path}"], capture_output=True)
                 for rev in (old, new)]
        before, after = (b.stdout if b.returncode == 0 else None for b in blobs)
        f = repo / path
        mine = f.read_bytes() if f.exists() else None
        if mine == after:
            continue
        if mine == before and after is None:
            f.unlink()
        elif mine == before:
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(after)
        elif None in (mine, before, after) or b"\0" in mine + before + after:
            conflicts.append(path)
        else:
            with tempfile.TemporaryDirectory() as tmp:
                base_file, theirs = Path(tmp, "base"), Path(tmp, "theirs")
                base_file.write_bytes(before)
                theirs.write_bytes(after)
                merged = subprocess.run(["git", "merge-file", "-p", "-L", "copy", "-L", old[:8], "-L", new[:8],
                                         str(f), str(base_file), str(theirs)], capture_output=True)
            f.write_bytes(merged.stdout)
            if merged.returncode != 0:
                conflicts.append(path)
    return conflicts


def failed_tests(report: Path, repo: Path) -> list[str]:
    """Failing tests in a vitest JSON or pytest JUnit report; a test file that failed to load counts
    as one failure."""
    if report.suffix == ".json":
        failed = []
        for f in json.load(open(report))["testResults"]:
            name = str(Path(f["name"]).relative_to(repo))
            tests = [f"{name} > {t['fullName']}" for t in f["assertionResults"] if t["status"] == "failed"]
            failed += tests or ([name] if f["status"] == "failed" else [])
        return sorted(failed)
    return sorted(f"{case.get('classname')}::{case.get('name')}" for case in ET.parse(report).iter("testcase")
                  if case.find("failure") is not None or case.find("error") is not None)


def run_suites(run: str) -> dict:
    """Each suite's failing tests, or its error when it wrote no report."""
    d = chain_dir(run)
    out_dir = d / "ws/suites"
    out_dir.mkdir(exist_ok=True)
    result = {}
    for name, (cwd, cmd) in SUITES.items():
        out = out_dir / (f"{name}.xml" if cmd[0] == "python3" else f"{name}.json")
        out.unlink(missing_ok=True)
        proc = agent_run(run, d / "repo" / cwd, [c.format(out=out) for c in cmd], {}, SUITE_TIMEOUT_S)
        result[name] = ({"failed": failed_tests(out, d / "repo")} if out.exists()
                        else {"error": f"exit {proc.returncode}: {(proc.stdout + proc.stderr)[-800:]}"})
    return result


def export_chain(run: str) -> None:
    subprocess.run([str(RUNNER / "export.sh"), run, "chain"], check=True, stdout=subprocess.DEVNULL)
    bench = chain_dir(run) / "repo"
    base = {"selftests/parts": sorted(p.name for p in (bench / "selftests/parts").iterdir()),
            "tasks": sorted(p.name for p in (bench / "tasks").iterdir())}
    json.dump(base, open(chain_dir(run) / "base_dirs.json", "w"), indent=1)
    json.dump(launch.digest(bench), open(chain_dir(run) / "frozen.json", "w"), indent=1)


def library_name(props: Path) -> str:
    for line in props.read_text(errors="replace").splitlines():
        if line.startswith("name="):
            return line.removeprefix("name=").strip()
    raise SystemExit(f"{props} has no name=")


def add_references(run: str, part: str) -> None:
    """spec.md and approved/ into the copy; each approved Arduino library (a dir with
    library.properties, at any depth) into the copy's libraries, replacing a same-name one."""
    src = REFERENCES / part
    archives = [f for f in (src / "approved").rglob("*") if f.name.endswith((".zip", ".tar.gz", ".tgz"))]
    if archives:
        raise SystemExit(f"unpack the archives in {src / 'approved'} first: {archives}")
    dst = chain_dir(run) / "repo/workflow/references" / part
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copy(src / "spec.md", dst)
    shutil.copytree(src / "approved", dst / "approved", dirs_exist_ok=True, ignore=shutil.ignore_patterns(".DS_Store"))
    libraries = chain_dir(run) / "arduino-libraries"
    installed = {library_name(p): p.parent for p in libraries.glob("*/library.properties")}
    for props in (src / "approved").rglob("library.properties"):
        name = library_name(props)
        if name in installed:
            shutil.rmtree(installed[name])
        shutil.copytree(props.parent, libraries / name.replace(" ", "_"), ignore=shutil.ignore_patterns(".DS_Store"))


def add_task_specs(run: str, part: str) -> None:
    """The part's task specs as the user approved them, pinout for the run's target only."""
    target = PARTS["target"]
    for spec in launch.task_specs(part):
        spec["pinout"] = {target: spec["pinout"][target]}
        dst = chain_dir(run) / "repo/tasks" / spec["name"] / "task.json"
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(json.dumps(spec, indent=2) + "\n")


def snapshot(run: str, part: str, stage: str) -> None:
    d = chain_dir(run)
    dest = launch.snapshot_dir(run, part, stage)
    # The helper's review snapshots hold the repo only.
    earlier = sorted(p for p in (d / "snap").glob("*") if not p.name.endswith("-review")) \
        if (d / "snap").exists() else []
    for tree in trees(run):
        link = [f"--link-dest={earlier[-1] / tree}"] if earlier else []
        extra = launch.NODE_MODULES if tree == "repo" else []
        (dest / tree).mkdir(parents=True)
        subprocess.run(["rsync", "-a", "--delete", *link, *extra, f"{d}/{tree}/", f"{dest}/{tree}/"], check=True)


def restore(run: str, part: str, stage: str) -> None:
    d = chain_dir(run)
    src = launch.snapshot_dir(run, part, stage)
    for tree in trees(run):
        extra = launch.NODE_MODULES if tree == "repo" else []
        subprocess.run(["rsync", "-a", "--delete", *extra, f"{src}/{tree}/", f"{d}/{tree}/"], check=True)
    for cache in CACHES:
        shutil.rmtree(d / "repo" / cache, ignore_errors=True)


def archive_attempt(run: str, part: str, stage: str) -> Path:
    out = item_dir(run, part) / stage
    n = 1 + sum(1 for _ in out.glob("failed-*"))
    dest = out / f"failed-{n}"
    dest.mkdir()
    for name in ["brief.txt", "stream.jsonl", "stderr.txt", "launch.json", "end.json"]:
        if (out / name).exists():
            (out / name).rename(dest / name)
    if copy_records(run, part).exists():
        shutil.copytree(copy_records(run, part), dest / "workflow")
    home = launch.home_dir(run, part, stage)
    moved = home.rename(home.with_name(f"{home.name}-failed-{n}"))
    launched = json.load(open(dest / "launch.json"))
    json.dump({**launched, "home": str(moved)}, open(dest / "launch.json", "w"), indent=1)
    return dest


def run_dir(run: str, rel: str, target: str, instance: int, lock: Path, cloud: dict) -> dict:
    d = chain_dir(run)
    bench = d / "repo"
    # Each instance gets its own vite dependency cache: when one harness re-optimizes a shared
    # cache, the pages of the harnesses running beside it fail to load and time out. The harness's
    # node_modules is a link to velxio/frontend's.
    vite = d / "ws" / f"vite-cache-{instance}"
    vite.mkdir(exist_ok=True)
    proc = agent_run(run, bench, ["flock", str(lock), "bash", "run.sh", "--headless", rel, target],
                     {"EMBEDGYM_TIMEOUT_MS": str(launch.PORT_TIMEOUT_MS), "EMBEDGYM_API_BASE": launch.api_base(instance),
                      **cloud},
                     mounts={vite: bench / "velxio/frontend/node_modules/.vite"})
    # Page console lines ([browser]) can arrive after the run's result lines.
    lines = [line for line in proc.stdout.strip().splitlines() if not line.startswith("[browser] ")]
    last = lines[-1] if lines else proc.stderr[-300:]
    return {"dir": rel, "target": target, "pass": proc.returncode == 0, "summary": last}


def touched_dirs(before: Path, after: Path) -> list[str]:
    """Unit-test and task dirs whose files differ between two copies of the testbench."""
    excludes = [f"-x{x}" for x in collect.DIFF_EXCLUDES]
    dirs = []
    for parent in ("selftests/parts", "tasks"):
        for p in sorted((after / parent).iterdir()):
            old = before / parent / p.name
            if not old.exists() or subprocess.run(["diff", "-rq", *excludes, str(old), str(p)],
                                                  capture_output=True).returncode != 0:
                dirs.append(f"{parent}/{p.name}")
    return dirs


def on_targets(run: str, dirs: list[str], targets: list[str]) -> list[tuple[str, str]]:
    """Each dir with each of `targets` it has a target dir for."""
    bench = chain_dir(run) / "repo"
    return [(rel, t) for rel in dirs for t in targets if (bench / rel / t).is_dir()]


def all_dirs(run: str) -> list[str]:
    bench = chain_dir(run) / "repo"
    return [f"{parent}/{p.name}" for parent in ("selftests/parts", "tasks")
            for p in sorted((bench / parent).iterdir()) if p.is_dir()]


def changed_files(before: Path, after: Path, roots: list[str]) -> list[str]:
    """Files under `roots` (paths in the chain copy) that differ between two copies or exist only
    in `before`; files only in `after` are left out."""
    excludes = [f"-x{x}" for x in collect.DIFF_EXCLUDES]
    files = []
    for root in roots:
        if not (before / root).exists():
            continue
        out = subprocess.run(["diff", "-rq", *excludes, str(before / root), str(after / root)],
                             capture_output=True, text=True).stdout
        for line in out.splitlines():
            if m := re.fullmatch(r"Files (.+) and .+ differ", line):
                files.append(m.group(1))
            elif (m := re.fullmatch(r"Only in (.+): (.+)", line)) and m.group(1).startswith(str(before)):
                files.append(f"{m.group(1)}/{m.group(2)}")
    return [str(Path(f).relative_to(before)) for f in files]


def shared_targets(run: str, part: str, since: str = "component") -> list[str]:
    """The targets of the shared files (SHARED) the part changed or deleted since its `since`
    stage started, other than its own: those whose path names the part."""
    d = chain_dir(run)
    roots = sorted({prefix.rsplit("/", 1)[0] for prefix, _ in SHARED})
    own = re.sub(r"[-_]", "", part.lower())
    targets = set()
    for f in changed_files(launch.snapshot_dir(run, part, since), d, roots):
        if own in re.sub(r"[-_]", "", f.lower()):
            continue
        targets.update(next(t for prefix, t in SHARED if f.startswith(prefix)))
    return [t for t in ALL if t in targets]


def regression_locks(run: str) -> dict[int, Path]:
    """REGRESSION_INSTANCES with their lock files."""
    return {i: chain_dir(run) / "ws" / f"regression-{i}.lock" for i in REGRESSION_INSTANCES}


def run_pairs(run: str, pairs: list[tuple[str, str]], locks: dict[int, Path],
              known_failing: set[tuple[str, str]]) -> list[dict]:
    """Each dir on its target, on the sim instances `locks` names (each under its lock file) in
    parallel, all restarted with the copy's current backend and emulator builds. A pair that fails,
    unless it is in `known_failing`, runs once more alone on the first instance, since running
    beside others can time it out; its row keeps the first summary. A pair whose sim stack was
    down (STACK_DOWN) always runs again, on a restarted first instance."""
    if not pairs:
        return []
    d = chain_dir(run)
    first = next(iter(locks))
    try:
        for i in locks:
            launch.sim_up(i, d / "repo")
        clouds = {i: launch.cloud_env(i) for i in locks}
        free: queue.Queue = queue.Queue()
        for i in locks:
            free.put(i)

        def one(pair: tuple[str, str]) -> dict:
            i = free.get()
            try:
                return run_dir(run, *pair, i, locks[i], clouds[i])
            finally:
                free.put(i)

        with ThreadPoolExecutor(len(locks)) as pool:
            rows = list(pool.map(one, pairs))
        retry = [k for k, row in enumerate(rows) if not row["pass"] and
                 ((row["dir"], row["target"]) not in known_failing or STACK_DOWN.match(row["summary"]))]
        if any(STACK_DOWN.match(rows[k]["summary"]) for k in retry):
            launch.sim_up(first, d / "repo")
            clouds[first] = launch.cloud_env(first)
        for k in retry:
            again = run_dir(run, rows[k]["dir"], rows[k]["target"], first, locks[first], clouds[first])
            rows[k] = {**again, "first": rows[k]["summary"]}
    finally:
        for i in REGRESSION_INSTANCES:
            launch.sim_down(i, d / "repo")
    return rows


def walk_files(base: Path, roots: list[str]):
    """The files under `roots` (paths in `base`) in a fixed order, leaving out
    collect.DIFF_EXCLUDES names as touched_dirs does."""
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(base / root):
            dirnames[:] = sorted(n for n in dirnames if not any(fnmatch.fnmatch(n, x) for x in collect.DIFF_EXCLUDES))
            for name in sorted(filenames):
                if not any(fnmatch.fnmatch(name, x) for x in collect.DIFF_EXCLUDES):
                    yield Path(dirpath) / name


def hash_file(h, f: Path, base: Path) -> None:
    h.update(str(f.relative_to(base)).encode() + b"\0")
    h.update(os.readlink(f).encode() if f.is_symlink() else f.read_bytes())


def tree_digest(base: Path, roots: list[str]) -> str:
    """sha256 of the files under `roots` (walk_files), by path and content."""
    h = hashlib.sha256()
    for f in walk_files(base, roots):
        hash_file(h, f, base)
    return h.hexdigest()


def target_digests(run: str) -> dict[str, str]:
    """For each target, sha256 of the shared files (SHARED, first match) and emulator builds
    (BUILDS) that reach it, by path and content."""
    d = chain_dir(run)
    reach = BUILDS + SHARED
    prefixes = {prefix.rsplit("/", 1)[0] for prefix, _ in reach}
    roots = sorted(r for r in prefixes if not any(r.startswith(p + "/") for p in prefixes))
    hashes = {t: hashlib.sha256() for t in ALL}
    for f in walk_files(d, roots):
        rel = str(f.relative_to(d))
        for t in next((targets for prefix, targets in reach if rel.startswith(prefix)), []):
            hash_file(hashes[t], f, d)
    return {t: h.hexdigest() for t, h in hashes.items()}


def regress_state(run: str) -> dict:
    """What a dir × target row depends on: the shared code and emulator builds that reach the
    target (target_digests), and the dir itself."""
    return {"targets": target_digests(run),
            "dirs": {rel: tree_digest(chain_dir(run) / "repo", [rel]) for rel in all_dirs(run)}}


def reusable_rows(run: str, part: str, own: list[str]) -> tuple[list[str], list[dict]]:
    """The rows of the part's `embedgym-regress` jobs (helper.py) since its component stage started
    that still hold, and the jobs they come from: on each target, those of the latest job that ran
    it with the shared code and emulator builds reaching it as they are now, for the dirs other
    than `own` that have not changed since."""
    start = json.load(open(item_dir(run, part) / "component/launch.json"))["start"]
    log = RUNS / run / "helper.jsonl"
    jobs = [j["id"] for j in map(json.loads, log.open()) if j["kind"] == "regress" and j["state"] == "done"
            and j["submitted"] >= start] if log.exists() else []
    saved = {job: json.load(open(RUNS / run / "regress" / f"{job}.json")) for job in jobs}
    now = regress_state(run)
    used, rows = [], []
    for target in ALL:
        job = next((j for j in reversed(jobs) if target in saved[j]["targets"]
                    and saved[j]["state"]["targets"][target] == now["targets"][target]), None)
        if job is None:
            continue
        rows += [r for r in json.load(open(saved[job]["report"])) if r["target"] == target and r["dir"] not in own
                 and now["dirs"].get(r["dir"]) == saved[job]["state"]["dirs"].get(r["dir"])]
        if job not in used:
            used.append(job)
    return used, rows


def known_failing(run: str) -> set[tuple[str, str]]:
    """The pairs whose latest row in the run's regressions so far failed with the sim stack up:
    dirs_base.json, the parts' regression.json and the embedgym-regress reports, in the order written."""
    d = chain_dir(run)
    reports = [(f, json.load(open(f))["dirs"]) for f in (RUNS / run).glob("*/regression.json")]
    reports += [(f, json.load(open(f))) for f in [d / "dirs_base.json", *(d / "ws").glob("regress-*.json")]]
    last = {}
    for _, rows in sorted(reports, key=lambda report: report[0].stat().st_mtime):
        for r in rows:
            if not STACK_DOWN.match(r["summary"]):
                last[(r["dir"], r["target"])] = r["pass"]
    return {pair for pair, passed in last.items() if not passed}


def new_failures(run: str, rows: list[dict]) -> list[dict]:
    """The failing rows that passed at the start of the run (dirs_base.json) or did not exist then,
    other than those whose sim stack was down."""
    base = {(r["dir"], r["target"]): r["pass"] for r in json.load(open(chain_dir(run) / "dirs_base.json"))}
    return [r for r in rows if not r["pass"] and not STACK_DOWN.match(r["summary"])
            and base.get((r["dir"], r["target"]), True)]


def run_regression(run: str, pairs: list[tuple[str, str]], instance: int, out: Path,
                   reused: tuple[list[str], list[dict]] = ([], [])) -> str:
    """The pairs (run_pairs on the run's instance and REGRESSION_INSTANCES), except those `reused`
    gives rows for from embedgym-regress jobs, then the suites, compared with their failures at the
    start of the run."""
    d = chain_dir(run)
    jobs, kept = reused
    kept = [r for r in kept if (r["dir"], r["target"]) in pairs]
    done = {(r["dir"], r["target"]) for r in kept}
    rows = run_pairs(run, [p for p in pairs if p not in done], {instance: d / "ws/sim.lock", **regression_locks(run)},
                     known_failing(run)) + kept
    new = new_failures(run, rows)
    base = json.load(open(d / "suites_base.json"))
    suites = {}
    for name, now in run_suites(run).items():
        if "error" in now or "error" in base[name]:
            suites[name] = now
        else:
            suites[name] = {"new_failures": sorted(set(now["failed"]) - set(base[name]["failed"])),
                            "fixed": sorted(set(base[name]["failed"]) - set(now["failed"])), "failed": now["failed"]}
    down = [r for r in rows if STACK_DOWN.match(r["summary"])]
    json.dump({"dirs": rows, "new_failures": new, "stack_down": down,
               "suites": suites, "reused_from": jobs, "reused": len(kept)},
              open(out, "w"), indent=1)
    bad = [n for n, v in suites.items() if "error" in v or v["new_failures"]]
    return (f"{sum(r['pass'] for r in rows)}/{len(rows)}, {len(new)} new failures"
            + (f", {len(kept)} rows from regress jobs {', '.join(jobs)}" if jobs else "")
            + (f", {len(down)} with the sim stack down" if down else "")
            + (f", suites failing: {', '.join(bad)}" if bad else ""))


def port_regression(run: str, part: str, instance: int) -> str:
    d = chain_dir(run)
    before = launch.snapshot_dir(run, part, "component") / "repo"
    bench = d / "repo"
    own = [f"selftests/parts/{p.name}" for p in sorted((bench / "selftests/parts").glob(f"velxio-{part}*"))]
    own += [f"tasks/{t}" for t in part_info(part)["tasks"]]
    dirs = sorted(set(own) | set(touched_dirs(before, bench)))
    pairs = on_targets(run, dirs, run_targets(run))
    pairs += [p for p in on_targets(run, all_dirs(run), shared_targets(run, part)) if p not in pairs]
    return run_regression(run, pairs, instance, item_dir(run, part) / "regression.json", reusable_rows(run, part, own))


def full_regression(run: str, instance: int) -> str:
    return run_regression(run, on_targets(run, all_dirs(run), run_targets(run)), instance,
                          RUNS / run / "full_regression.json")


def regression(run: str, part: str) -> str:
    """Runs every unit-test dir and task the run added so far on the run's target, in the agents'
    container, under the sim lock."""
    d = chain_dir(run)
    bench = d / "repo"
    target = PARTS["target"]
    base = json.load(open(d / "base_dirs.json"))
    rows = []
    for parent in ("selftests/parts", "tasks"):
        for p in sorted((bench / parent).iterdir()):
            if p.name in base[parent] or not (p / target).is_dir():
                continue
            proc = subprocess.run(["docker", "run", "--rm", *codex.DOCKER_USER, *codex.HOST_NETWORK,
                                   "-e", f"EMBEDGYM_TIMEOUT_MS={REGRESSION_TIMEOUT_MS}",
                                   "-v", f"{d / 'repo'}:{d / 'repo'}",
                                   "-v", f"{d / 'ws'}:{d / 'ws'}",
                                   "-v", f"{d / 'arduino-libraries'}:/root/Arduino/libraries", "-w", str(bench),
                                   codex.IMAGE, "flock", str(d / "ws/sim.lock"),
                                   "bash", "run.sh", "--headless", f"{parent}/{p.name}", target],
                                  capture_output=True, text=True)
            last = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else proc.stderr[-300:]
            rows.append({"dir": f"{parent}/{p.name}", "pass": proc.returncode == 0, "summary": last})
    json.dump(rows, open(item_dir(run, part) / "regression.json", "w"), indent=1)
    return f"{sum(r['pass'] for r in rows)}/{len(rows)}"


def on_exit(run: str, part: str, s: dict, running: dict, helper_port: int) -> None:
    code = finish_container(running["container"], running["pid"], item_dir(run, part) / running["stage"])
    stop_helper(run, helper_port)
    settle(run, part, s, running, code)


def settle(run: str, part: str, s: dict, running: dict, code: int) -> None:
    """What follows a stage's end, given its container's exit code."""
    stage = s["stage"]
    out = item_dir(run, part) / stage
    component_done, task_done = done_statuses(run)
    end = codex.stage_end(Path(running["home"]), out / "stream.jsonl", code)
    end["status"] = status = record_status(run, part)
    json.dump(end, open(out / "end.json", "w"), indent=1)
    if end["normal"]:
        blocked = bool(status) and status.startswith("blocked")
        if stage == "component" and status == component_done:
            s["stage"] = "task"
        elif blocked or stage == "task" and status == task_done:
            s["regression"] = (port_regression(run, part, running["instance"]) if is_port(run)
                               else regression(run, part))
            collect.collect(run, part)
            s["stage"], s["note"] = "done", status if blocked else ""
        else:
            s["stage"], s["note"] = "review", f"{stage} stage ended with status {status!r}"
        log(f"{part}: {stage} ended normally ({status}) -> {s['stage']}")
        return
    dest = archive_attempt(run, part, stage)
    restore(run, part, stage)
    if end["rate_limited_until"]:
        s["not_before"] = datetime.fromtimestamp(end["rate_limited_until"]).isoformat(timespec="minutes")
        log(f"{part}: {stage} hit the usage limit; archived to {dest.name}, restarts after {s['not_before']}")
        return
    # The provider's capacity errors say nothing about the stage, so like the usage limit they don't count.
    if end["error"] and "at capacity" in end["error"]:
        s["not_before"] = (datetime.now() + timedelta(minutes=CAPACITY_WAIT_MIN)).isoformat(timespec="minutes")
        log(f"{part}: {stage} interrupted by model capacity ({'; '.join(end['reasons'])}); "
            f"archived to {dest.name}, restarts after {s['not_before']}")
        return
    s["interruptions"][stage] = s["interruptions"].get(stage, 0) + 1
    if s["interruptions"][stage] >= MAX_INTERRUPTIONS:
        s["stage"], s["note"] = "review", f"{stage} stage interrupted {MAX_INTERRUPTIONS} times"
    log(f"{part}: {stage} interrupted ({'; '.join(end['reasons'])}; error {end['error']!r}); archived to {dest.name}")


def start(run: str, part: str, s: dict, instance: int, helper_port: int) -> dict:
    if not launch.snapshot_dir(run, part, s["stage"]).exists():
        # A port run's copy already holds every part's references and task specs.
        if not is_port(run) and s["stage"] == "component":
            add_references(run, part)
        elif not is_port(run):
            add_task_specs(run, part)
        snapshot(run, part, s["stage"])
    s.update(not_before=None, started=time.strftime("%Y-%m-%dT%H:%M"))
    launched = launch.launch(run, part, s["stage"], instance, helper_port)
    log(f"{part}: {s['stage']} started in {launched['container']}")
    return {"part": part, "stage": s["stage"], **launched}


def helper_info(port: int) -> dict | None:
    """The helper's /info, or None when no helper answers; one that is stopping resets the connection."""
    try:
        return json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/info", timeout=5))
    except (urllib.error.URLError, ConnectionResetError):
        return None


def stop_helper(run: str, port: int) -> None:
    """Stops the run's helper and the containers its jobs started (label embedgym-wf-run=<run>), so no job
    of an ended stage attempt runs on into the next attempt; the next stage starts a fresh one."""
    pid = RUNS / run / "helper.pid"
    info = helper_info(port)
    if info is not None:
        if info["run"] != run:
            raise SystemExit(f"port {port} serves another run's helper: {info}")
        os.kill(int(pid.read_text()), signal.SIGTERM)
    pid.unlink(missing_ok=True)
    for _ in range(20):
        if helper_info(port) is None:
            break
        time.sleep(1)
    else:
        raise SystemExit(f"the helper on port {port} did not stop")
    ids = subprocess.run(["docker", "ps", "-aq", "--filter", f"label=embedgym-wf-run={run}"], capture_output=True, text=True,
                         check=True).stdout.split()
    if ids:
        subprocess.run(["docker", "rm", "-f", *ids], check=True, capture_output=True)
    for i in REGRESSION_INSTANCES:
        launch.sim_down(i, chain_dir(run) / "repo")


def ensure_helper(run: str, instance: int, port: int) -> None:
    info = helper_info(port)
    if info is None:
        subprocess.Popen([sys.executable, str(RUNNER / "helper.py"), run, "--instance", str(instance),
                          "--port", str(port)], cwd=RUNNER, stdout=open(RUNS / run / "helper.out", "a"),
                         stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
        for _ in range(20):
            time.sleep(1)
            info = helper_info(port)
            if info:
                break
        log(f"helper started on port {port}")
    if info != {"run": run, "instance": instance}:
        raise SystemExit(f"port {port} serves another helper: {info}")


def part_costs(run: str, part: str) -> dict:
    """Codex API-price estimate (all attempts), Gemini estimate and OpenRouter cost so far."""
    item = item_dir(run, part)
    codex_usd = sum(codex.summary(h)["cost_usd"] for h in (codex.WORK / run / "_codex").glob(f"{item.name}-*"))
    gemini = sum(json.load(open(f))["cost_usd_estimate"] or 0 for f in item.glob("reviews/*/record.json"))
    openrouter = sum(j["result"]["cost_usd"] for j in collect.helper_jobs(run, part)
                     if j["kind"] == "solve" and j["state"] == "done")
    return {"codex": codex_usd, "gemini": gemini, "openrouter": openrouter}


def write_status(run: str, state: dict) -> None:
    running = state["running"]
    lines = [f"# Scaling {'port ' if is_port(run) else 'build '}run `{run}` — {time.strftime('%Y-%m-%d %H:%M')}", "",
             "Codex and Gemini dollars are API-price estimates (subscriptions) for the models prices.json lists; "
             "OpenRouter dollars are billed.", "",
             "| # | part | category | stage | state | last step | Codex ~$ | Gemini ~$ | OpenRouter $ "
             "| interrupted | regression | note |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for part in run_config(run)["parts"]:
        i = ORDER.index(part) + 1
        s = state["parts"][part]
        step = ""
        record = copy_records(run, part) / "record.json"
        if record.exists() and s["stage"] in ("component", "task"):
            try:
                steps = json.load(open(record)).get("steps") or []
                step = f"{steps[-1].get('step')} {'done' if steps[-1].get('end') else 'running'}" if steps else ""
            except ValueError:
                step = "(record being written)"
        cost = part_costs(run, part)
        state_text = ("running" if running and running["part"] == part
                      else f"waiting until {s['not_before']}" if s.get("not_before") else "")
        lines.append(f"| {i} | {part} | {part_info(part)['category']} | {s['stage']} | {state_text} | {step} | "
                     f"{cost['codex']:.2f} | {cost['gemini']:.2f} | {cost['openrouter']:.3f} | "
                     f"{s['interruptions'] or ''} | {s.get('regression', '')} | {s['note']} |")
    homes = sorted((codex.WORK / run / "_codex").glob("*"), key=lambda h: h.stat().st_mtime)
    quota = codex.summary(homes[-1])["quota_weekly_percent"]["last"] if homes else None
    if quota:
        reset = datetime.fromtimestamp(quota["resets_at"]).strftime("%Y-%m-%d %H:%M")
        lines += ["", f"Codex weekly quota: {quota['used_percent']}% used, resets {reset}."]
    if state.get("full_regression"):
        lines += ["", f"Full regression: {state['full_regression']}."]
    status_file(run).write_text("\n".join(lines) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--refs", help="the refs run whose spec review gates each part (build runs)")
    ap.add_argument("--port-from", help="start a port run from this build run's final copy")
    ap.add_argument("--parts", help="a port run's parts, comma-separated (default: all, in order)")
    ap.add_argument("--instance", type=int, required=True)
    ap.add_argument("--helper-port", type=int, default=8770)
    ap.add_argument("--step", action="store_true")
    args = ap.parse_args()
    run, instance = args.run, args.instance
    state_file = RUNS / run / "chain.json"
    if args.port_from and not (RUNS / run / "run.json").exists():
        parts = args.parts.split(",") if args.parts else ORDER
        unknown = [p for p in parts if p not in ORDER]
        if unknown:
            raise SystemExit(f"unknown parts {unknown}")
        (RUNS / run).mkdir(parents=True, exist_ok=True)
        json.dump({"kind": "port", "from": args.port_from, "parts": parts}, open(RUNS / run / "run.json", "w"), indent=1)
    if not is_port(run) and not args.refs:
        raise SystemExit("a build run needs --refs")
    parts = run_config(run)["parts"]
    if not chain_dir(run).exists() and is_port(run):
        port_chain(run, run_config(run)["from"])
    elif not chain_dir(run).exists():
        export_chain(run)
    if is_port(run) and not (chain_dir(run) / "suites_base.json").exists():
        log("measuring the suites' failures at the start of the run")
        json.dump(run_suites(run), open(chain_dir(run) / "suites_base.json", "w"), indent=1)
    if is_port(run) and not (chain_dir(run) / "dirs_base.json").exists():
        log("running every unit-test and task dir on every target at the start of the run")
        rows = run_pairs(run, on_targets(run, all_dirs(run), run_targets(run)),
                         {instance: chain_dir(run) / "ws/sim.lock", **regression_locks(run)}, set())
        json.dump(rows, open(chain_dir(run) / "dirs_base.json", "w"), indent=1)
    if state_file.exists():
        state = json.load(open(state_file))
    else:
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state = {"running": None, "parts": {p: {"stage": "component", "interruptions": {}, "not_before": None,
                                                "note": ""} for p in parts}}
    ensure_helper(run, instance, args.helper_port)
    stop = False
    while True:
        json.dump(state, open(state_file, "w"), indent=1)
        write_status(run, state)
        if stop:
            log("stopped after one stage (--step)")
            return
        running = state["running"]
        if running and container_state(running) in ("running", "starting"):
            time.sleep(30)
            continue
        if running:
            state["running"] = None
            s = state["parts"][running["part"]]
            on_exit(run, running["part"], s, running, args.helper_port)
            stop = args.step and s["stage"] != running["stage"]
            continue
        part = next((p for p in parts if state["parts"][p]["stage"] not in ("done", "blocked")), None)
        if part is None:
            if is_port(run) and parts == ORDER and not state.get("full_regression"):
                log("full regression")
                state["full_regression"] = full_regression(run, instance)
                log(f"full regression: {state['full_regression']}")
                continue
            log("every part is done or blocked")
            return
        s = state["parts"][part]
        if s["stage"] == "review":
            log(f"{part}: stopped for review: {s['note']}")
            return
        if s["not_before"] and datetime.now() < datetime.fromisoformat(s["not_before"]):
            time.sleep(60)
            continue
        reviewed = RUNS / str(args.refs) / "spec_review.json"
        if not is_port(run) and (not reviewed.exists() or part not in json.load(open(reviewed))["parts"]):
            s["note"] = "waiting for the spec review"
            time.sleep(60)
            continue
        s["note"] = ""
        ensure_helper(run, instance, args.helper_port)
        state["running"] = start(run, part, s, instance, args.helper_port)


if __name__ == "__main__":
    main()
