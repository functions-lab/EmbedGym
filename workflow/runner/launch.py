"""Starts one stage of a scaling build or port run in the run's chain copy, as a Codex orchestrator session.

Usage: launch.py <run> <part> component|task --instance N [--helper-port 8770]
A build run adds the parts of parts.json, in order, with their tasks, on its one target.
The chain copy WORK/<run>/chain/ (repo, ws, arduino-libraries; WORK is codex.WORK) holds every
earlier part of the run. Restarts sim instance N on it, renders brief_build.md for the stage and
starts `codex exec` in a embedgym-agent container that mounts only the copy and the stage's
CODEX_HOME (WORK/<run>/_codex/<NN>_<part>-<stage>/, with the step agents' roles), streaming to
workflow/runs/<run>/<NN>_<part>/<stage>/stream.jsonl. The container is kept after it
exits, for its exit code; chain.py removes it. A stage always starts in a fresh session: an
interrupted attempt is restored from the stage's starting point and launched again, never resumed.
A port run (runs/<run>/run.json) renders brief_port.md instead: its component stage is port stage A
(wiring and unit tests on the port targets), its task stage port stage B (pinouts, circuits, reference firmwares).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import time
from pathlib import Path

import codex
import emulators

RUNNER = Path(__file__).resolve().parent
RUNS = RUNNER.parent / "runs"
REFERENCES = RUNNER.parent / "references"
PARTS = json.load(open(RUNNER / "parts.json"))
ORDER = [p["part"] for p in PARTS["parts"]]
COMPONENT_DONE = "stage 2 done"
TASK_DONE = "stage 3 done"
# A port run (runs/<run>/run.json) ports a finished build run's parts and tasks to these targets.
PORT_TARGETS = ["atmega328p_arduino", "esp32s3_arduino", "esp32s3_espidf", "nrf52840_arduino", "nrf52840_zephyr"]
PORT_COMPONENT_DONE = "port-component done"
PORT_TASK_DONE = "port-task done"
# A port run's stages and regressions run with the wall-clock budget eval/grade.py grades with.
PORT_TIMEOUT_MS = 600_000
ORCHESTRATOR = ("gpt-6.1-sol", "high")
T4_MODELS = {"openrouter/openai/gpt-6-luna": "gpt-6-luna", "openrouter/x-ai/grok-4.6": "grok-4.6"}
NODE_MODULES = ["--exclude=/velxio/frontend/node_modules", "--exclude=/node_modules"]
# The copy's files that decide how solves are run and graded, and the sim scripts that run on the
# host; chain/frozen.json holds their hashes at export.
FROZEN = ["eval/*.py", "eval/agent.yaml", "eval/models.json", "docker/env_image/*", "run.sh",
          "docker/instance.sh", "docker/sim_image/sim.sh", "docker/esp_cloud_image/cloud.sh"]


def digest(bench: Path) -> dict:
    files = sorted(f for pattern in FROZEN for f in bench.glob(pattern) if f.is_file())
    return {str(f.relative_to(bench)): hashlib.sha256(f.read_bytes()).hexdigest() for f in files}


def check_frozen(chain: Path) -> None:
    if digest(chain / "repo") != json.load(open(chain / "frozen.json")):
        raise RuntimeError("the copy's frozen files (solve and grade scripts, sim scripts) changed since the export")


def part_info(part: str) -> dict:
    return PARTS["parts"][ORDER.index(part)]


def task_specs(part: str) -> list[dict]:
    """The part's task specs: a rebuilt part's originals from this checkout's tasks/, a new part's
    specs the user kept in references/<part>/proposals/."""
    info = part_info(part)
    if info["new"]:
        found = [json.load(open(f)) for f in sorted((REFERENCES / part / "proposals").glob("*.json"))]
    else:
        found = [json.load(open(codex.REPO / "tasks" / name / "task.json")) for name in info["tasks"]]
    names = sorted(spec["name"] for spec in found)
    if names != sorted(info["tasks"]):
        raise SystemExit(f"{part}: task specs found {names}, parts.json lists {info['tasks']}")
    return found


def run_config(run: str) -> dict:
    """A port run's runs/<run>/run.json (`kind` "port", `from`, `parts`); a build run has none."""
    config = RUNS / run / "run.json"
    if config.exists():
        return json.load(open(config))
    return {"kind": "build", "parts": ORDER}


def is_port(run: str) -> bool:
    return run_config(run)["kind"] == "port"


def run_targets(run: str) -> list[str]:
    return [PARTS["target"], *PORT_TARGETS] if is_port(run) else [PARTS["target"]]


def done_statuses(run: str) -> tuple[str, str]:
    return (PORT_COMPONENT_DONE, PORT_TASK_DONE) if is_port(run) else (COMPONENT_DONE, TASK_DONE)


def api_base(instance: int) -> str:
    """The sim backend's API as a container reaches it; run.sh and backend_compile.py read it
    from EMBEDGYM_API_BASE for every target but the AVR ones."""
    return f"http://{codex.HOST}:{8001 + 100 * instance}/api"


def item_dir(run: str, part: str) -> Path:
    return RUNS / run / f"{ORDER.index(part) + 1:02d}_{part}"


def chain_dir(run: str) -> Path:
    return codex.WORK / run / "chain"


def snapshot_dir(run: str, part: str, stage: str) -> Path:
    return chain_dir(run) / "snap" / f"{item_dir(run, part).name}-{stage}"


def home_dir(run: str, part: str, stage: str) -> Path:
    return codex.WORK / run / "_codex" / f"{item_dir(run, part).name}-{stage}"


def container(run: str, part: str, stage: str) -> str:
    return f"embedgym-wf-{run}-{item_dir(run, part).name}-{stage}"


def container_running(name: str) -> bool:
    return bool(subprocess.run(["docker", "ps", "-q", "--filter", f"name=^{name}$"],
                               capture_output=True, text=True, check=True).stdout.strip())


def stage_text(stage: str, run: str, part: str, tasks: str) -> tuple[str, str]:
    """The brief's scope and finish sentences for a stage."""
    if stage == "component":
        return (f"This session does stage 2 (C1–C5) only. Stage 3 for {tasks} runs later in a separate "
                "session that starts from this session's files.",
                f"When stage 2 is done, set `status` in `record.json` to `{COMPONENT_DONE}` and reply "
                "in at most 15 lines; if nothing more can be done, set it to `blocked: <reason>`.")
    if stage == "task":
        return (f"This session does stage 3 (T0–T5) for {tasks}. Stage 2 was done in this copy by an "
                f"earlier session: start from `workflow/runs/{run}/{part}/` (`HANDOFF.txt`, "
                "`record.json`) and keep appending to that `record.json`.",
                f"When stage 3 is done for every task, set `status` in `record.json` to `{TASK_DONE}` and "
                "reply in at most 15 lines; if nothing more can be done, set it to `blocked: <reason>`.")
    raise SystemExit(f"unknown stage {stage!r}")


PORT_STAGE_A = """Stage A (this session), parts:
- Items: part `{part}`, then every other part, resistors excepted, that its tasks ({tasks}) use and that has no passing unit-test dir on some target. Do them in that order.
- For each item, start `wf-port-component`. It decides the wiring (P1), then stops and reports whether the model runs unchanged on every target.
- If it does, send it on to the unit tests (P2) with `followup_task`.
- If it does not and the item is one of the run's parts, rewrite the model by steps C2–C5 of `workflow/pipeline.md`, covering the targets and `atmega2560_arduino`; the item is then done:
  - C2, `wf-builder`: the unified model, replacing the old one, which is deleted. The interface (`metadataId`, pins, `set`, `do` and readable properties), the element and its artwork stay as they are.
  - C3, `wf-unit-test`: unit tests on every target, wired as P1's `wiring:` line in `docs/components.md` says. The existing `atmega2560_arduino` unit tests must still pass. At the end it reruns the `atmega2560_arduino` reference firmware of every task that uses the part.
  - C4, `embedgym-review` rounds as in `workflow/pipeline.md`.
  - C5, `wf-docs`.
Stage B for {tasks} runs later in a separate session that starts from this session's files."""

PORT_STAGE_B = """Stage B (this session), tasks: start one `wf-port-task` per task, one after another: {tasks}. Stage A was done in this copy by an earlier session: start from `workflow/runs/{run}/{part}/` (`HANDOFF.txt`, `record.json`) and keep appending to that `record.json`."""


def port_brief(run: str, part: str, stage: str, instance: int, export: dict) -> str:
    d = chain_dir(run)
    tasks = ", ".join(f"`{t}`" for t in part_info(part)["tasks"])
    if stage == "component":
        name, text, done, what = "stage A (parts)", PORT_STAGE_A.format(part=part, tasks=tasks), PORT_COMPONENT_DONE, "item"
    elif stage == "task":
        name, text, done, what = ("stage B (tasks)", PORT_STAGE_B.format(run=run, part=part, tasks=tasks),
                                  PORT_TASK_DONE, "task")
    else:
        raise SystemExit(f"unknown stage {stage!r}")
    finish = (f"When every {what} is done, set `status` in `record.json` to `{done}` and reply in at most 15 lines; "
              f"if no {what} can be done, set it to `blocked: <reason>`. Skipped dirs and targets do not make a stage blocked.")
    return (RUNNER / "brief_port.md").read_text().format(
        run=run, part=part, stage_name=name, repo=d / "repo", targets=", ".join(f"`{t}`" for t in PORT_TARGETS),
        run_parts=", ".join(f"`{p}`" for p in ORDER),
        stage_text=text, sim_url=f"http://{codex.HOST}:{8080 + 100 * instance}", lock=d / "ws/sim.lock",
        ws=d / "ws", dir=d, commit=export["base"], finish=finish,
        frozen=", ".join(f"`{f}`" for f in FROZEN), timeout=PORT_TIMEOUT_MS)


def part_interface(part: str) -> str:
    """The part's components.md heading and its naming bullets (pins, set/drive/observe
    properties, limits); behavior notes and test/target lines are left out."""
    text = (codex.REPO / "docs/components.md").read_text()
    for entry in re.split(r"\n(?=### )", text):
        if f"- metadataId: `{part}`" not in entry:
            continue
        lines, keep = [], True
        for line in entry.strip().splitlines():
            if line.startswith("- "):
                keep = re.match(r"- (metadataId|pins|supply|observe|drive[a-z ]*|limits):", line)
            if line.startswith("### ") or keep:
                lines.append("  " + line)
        return "\n".join(lines)
    raise SystemExit(f"no docs/components.md entry for {part}")


def interface_text(info: dict) -> str:
    if info["new"]:
        return ("Part interface: none is fixed. C2 proposes it (`metadataId` `{0}`, pin names from the "
                "approved photos, `set`, `do` and readable properties with units and ranges) as an approval "
                "point before writing code.").format(info["part"])
    return ("Part interface, fixed by the user; where `spec.md` disagrees, this wins. C2 implements exactly "
            "this; C5's `docs/components.md` entry is this plus its unit test and implemented lines:\n"
            + part_interface(info["part"]))


def example_text(run: str, info: dict) -> str:
    """The workflow's reference part for the part's category, plus the run's latest finished part of
    that category, which the copy now holds."""
    earlier = [p for p in PARTS["parts"][:ORDER.index(info["part"])] if p["category"] == info["category"]
               and (item_dir(run, p["part"]) / "collect.json").exists()]
    text = f"the reference part C2 names for {info['category']} parts"
    if earlier:
        text += f", and `{earlier[-1]['part']}`, a {info['category']} part added earlier in this run"
    return text


def ensure_networks(instance: int) -> None:
    """The instance's networks with explicit subnets, created before sim.sh would take them from
    Docker's default address pools, which a host running many stacks can use up."""
    for net, prefix in ((f"embedgym-bench-{instance}", "10.231"), (f"esp_cloud_net-{instance}", "10.232"),
                        (f"esp_agent_net-{instance}", "10.233")):
        if subprocess.run(["docker", "network", "inspect", net], capture_output=True).returncode != 0:
            subprocess.run(["docker", "network", "create", "--subnet", f"{prefix}.{instance}.0/24", net],
                           check=True, capture_output=True)


def sim_down(instance: int, repo: Path) -> None:
    env = dict(os.environ, EMBEDGYM_INSTANCE=str(instance))
    subprocess.run(["bash", str(repo / "docker/sim_image/sim.sh"), "down"], env=env, check=True,
                   capture_output=True)


def sim_up(instance: int, repo: Path) -> list[str]:
    """Restarts the instance's whole stack (sim, esp_cloud, esp_pg) on this copy, with the copy's
    emulator builds in place of the image's (emulators.install); returns the emulators installed."""
    check_frozen(repo.parent)
    env = dict(os.environ, EMBEDGYM_INSTANCE=str(instance))
    sim_down(instance, repo)
    ensure_networks(instance)
    subprocess.run(["bash", str(repo / "docker/sim_image/sim.sh"), "up"], env=env, check=True,
                   capture_output=True)
    return sim_reload(instance, repo)


def sim_reload(instance: int, repo: Path) -> list[str]:
    """Restarts the instance's running sim container with the copy's emulator builds and current
    backend code; esp_cloud and its token (cloud_env) stay. Returns the emulators installed."""
    check_frozen(repo.parent)
    container = f"embedgym-sim-{instance}"
    installed = emulators.install(repo.parent, container)
    subprocess.run(["docker", "restart", container], check=True, capture_output=True)
    # Waits for /healthz again.
    subprocess.run(["bash", str(repo / "docker/sim_image/sim.sh"), "up"],
                   env=dict(os.environ, EMBEDGYM_INSTANCE=str(instance)), check=True, capture_output=True)
    return installed


def cloud_env(instance: int) -> dict:
    """The instance's esp_cloud base and control token as a container reaches them; run.sh reads
    them for a task with a peer. cloud.sh makes a new token at each `up`."""
    env = subprocess.run(["docker", "inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}",
                          f"embedgym-sim-{instance}"], capture_output=True, text=True, check=True).stdout
    token = next(line.removeprefix("EMBEDGYM_CLOUD_TOKEN=") for line in env.splitlines()
                 if line.startswith("EMBEDGYM_CLOUD_TOKEN="))
    return {"EMBEDGYM_CLOUD_BASE": f"http://{codex.HOST}:{9001 + 100 * instance}", "EMBEDGYM_CLOUD_TOKEN": token}


def launch(run: str, part: str, stage: str, instance: int, helper_port: int) -> dict:
    info = part_info(part)
    d = chain_dir(run)
    repo = d / "repo"
    export = json.load(open(d / "export.json"))
    out = item_dir(run, part) / stage
    if (out / "stream.jsonl").exists():
        raise SystemExit(f"{out} holds an earlier attempt; move it aside first")
    home = home_dir(run, part, stage)
    if home.exists():
        raise SystemExit(f"{home} holds an earlier attempt; move it aside first")
    out.mkdir(parents=True, exist_ok=True)

    if is_port(run):
        brief = port_brief(run, part, stage, instance, export)
    else:
        tasks = ", ".join(f"`{t}`" for t in info["tasks"])
        scope, finish = stage_text(stage, run, part, tasks)
        brief = (RUNNER / "brief_build.md").read_text().format(
            run=run, part=part, repo=repo, scope=scope, finish=finish, category=info["category"],
            target=PARTS["target"], example=example_text(run, info), interface=interface_text(info),
            models=", ".join(f"`{m}`" for m in T4_MODELS), sim_url=f"http://{codex.HOST}:{8080 + 100 * instance}",
            lock=d / "ws/sim.lock", ws=d / "ws", dir=d, commit=export["base"])
    (out / "brief.txt").write_text(brief)

    sim_up(instance, repo)
    codex.make_home(home, repo / "workflow/agents")
    name = container(run, part, stage)
    model, effort = ORCHESTRATOR
    # A port run's emulator sources (emulators.py); a build run has none.
    mounts = [repo, d / "ws", *([d / "emulators"] if (d / "emulators").exists() else [])]
    cmd = codex.exec_cmd(name, home, mounts, repo, model, effort, brief,
                         extra_mounts={d / "arduino-libraries": "/root/Arduino/libraries"},
                         env={"EMBEDGYM_HELPER_URL": f"http://{codex.HOST}:{helper_port}",
                              "EMBEDGYM_API_BASE": api_base(instance), **cloud_env(instance),
                              **({"EMBEDGYM_TIMEOUT_MS": str(PORT_TIMEOUT_MS)} if is_port(run) else {})}, keep=True)
    proc = subprocess.Popen(cmd, stdout=open(out / "stream.jsonl", "w"), stderr=open(out / "stderr.txt", "w"),
                            stdin=subprocess.DEVNULL, start_new_session=True)
    launched = {"pid": proc.pid, "container": name, "home": str(home), "instance": instance,
                "start": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    json.dump(launched, open(out / "launch.json", "w"), indent=1)
    return launched


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("part")
    ap.add_argument("stage", choices=["component", "task"])
    ap.add_argument("--instance", type=int, required=True)
    ap.add_argument("--helper-port", type=int, default=8770)
    args = ap.parse_args()
    launched = launch(args.run, args.part, args.stage, args.instance, args.helper_port)
    print(f"{args.part} {args.stage}: container {launched['container']}, instance {args.instance}")


if __name__ == "__main__":
    main()
