"""Codex sessions in the experiment container: the launch command, and per-thread usage,
estimated cost, quota and an isolation audit read from the session's rollout files.

Each session gets its own CODEX_HOME (config, rules, a copy of the user's ChatGPT login);
Codex writes one rollout per thread (the session and each sub-agent) under its sessions/.
"""
import json
import os
import platform
import re
import shutil
import tomllib
from datetime import datetime
from pathlib import Path

RUNNER = Path(__file__).resolve().parent
AGENTS = RUNNER.parent / "agents"
# The checkout this runner belongs to; runs copy it.
REPO = RUNNER.parents[1]
# Run copies, CODEX_HOMEs (each with a copy of the Codex login) and agy homes; outside the checkout.
WORK = Path(os.environ.get("EMBEDGYM_WORKFLOW_DIR", Path.home() / "embedgym-workflow"))
IMAGE = "embedgym-agent"
LOGIN = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "auth.json"
# Estimates only: a model without a price here gets no cost.
PRICES = json.load(open(RUNNER / "prices.json"))["usd_per_token"]
# How containers reach the host's loopback services (the helper, the sim's published ports), and
# whose files they write in mounted dirs. Docker Desktop (macOS) forwards host.docker.internal and
# maps file ownership to the host user; on Linux a container shares the host's network and runs
# as the host user, or root-owned files would land in the copies.
if platform.system() == "Linux":
    HOST, HOST_NETWORK, DOCKER_USER = "127.0.0.1", ["--network", "host"], ["--user", f"{os.getuid()}:{os.getgid()}"]
elif platform.system() == "Darwin":
    HOST, HOST_NETWORK, DOCKER_USER = "host.docker.internal", [], []
else:
    raise SystemExit(f"unsupported host {platform.system()}: the runner needs Linux or macOS with Docker")
TOKEN_KEYS = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens",
              "reasoning_output_tokens"]


def agent(name: str) -> dict:
    return tomllib.load(open(AGENTS / f"{name}.toml", "rb"))


def fresh_login() -> Path:
    """The login copy refreshed last: the user's login or an earlier session's copy. A session
    that refreshes its token rotates the refresh token, so every older copy can no longer refresh."""
    copies = [LOGIN, *WORK.glob("*/_codex/*/auth.json")]
    return max(copies, key=lambda p: json.load(open(p))["last_refresh"])


def make_home(home: Path, agents: Path | None = None) -> None:
    """`agents`: a dir of role .toml files, copied to CODEX_HOME/agents. Codex reads a project's
    .codex/agents only when the project is trusted; CODEX_HOME's roles need no trust."""
    home.mkdir(parents=True)
    shutil.copy(RUNNER / "codex_config.toml", home / "config.toml")
    shutil.copytree(RUNNER / "codex_rules", home / "rules")
    shutil.copy(fresh_login(), home / "auth.json")
    (home / "auth.json").chmod(0o600)
    if agents:
        (home / "agents").mkdir()
        for role in agents.glob("*.toml"):
            shutil.copy(role, home / "agents")


def exec_cmd(container: str, home: Path, mounts: list[Path], cwd: Path, model: str, effort: str,
             prompt: str, instructions: str | None = None, web: bool = False,
             extra_mounts: dict[Path, str] | None = None, env: dict[str, str] | None = None,
             keep: bool = False) -> list[str]:
    """`codex exec --json` in a fresh container that mounts only `mounts` (at their host paths)
    and `extra_mounts` (host path: container path). `keep` leaves the exited container for
    `docker inspect` (its exit code) and `docker logs`; the caller removes it. Signals to the
    `docker run` client are not passed on, so a session outlives the process that started it."""
    cmd = ["docker", "run", *([] if keep else ["--rm"]), "--sig-proxy=false", "--name", container,
           *DOCKER_USER, *HOST_NETWORK, "-v", f"{home}:/codex-home", "-e", "CODEX_HOME=/codex-home"]
    for m in mounts:
        cmd += ["-v", f"{m}:{m}"]
    for host, inside in (extra_mounts or {}).items():
        cmd += ["-v", f"{host}:{inside}"]
    for k, v in (env or {}).items():
        cmd += ["-e", f"{k}={v}"]
    cmd += ["-w", str(cwd), IMAGE, "codex", "exec", "--json", "--skip-git-repo-check",
            "-m", model, "-c", f"model_reasoning_effort={effort}"]
    if web:
        cmd += ["-c", 'web_search="live"']
    if instructions:
        # A JSON string is a valid TOML basic string.
        cmd += ["-c", f"developer_instructions={json.dumps(instructions)}"]
    return cmd + [prompt]


def stream_result(stream: Path) -> dict:
    """How the session's `exec --json` stream ended: completed, failed (with its error) or no end."""
    result = {"thread_id": None, "end": None, "error": None, "turns": 0}
    for line in stream.open():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event["type"] == "thread.started":
            result["thread_id"] = event["thread_id"]
        elif event["type"] == "turn.completed":
            result["end"], result["turns"] = "completed", result["turns"] + 1
        elif event["type"] == "turn.failed":
            result["end"], result["error"] = "failed", event.get("error")
        elif event["type"] == "error":
            result["error"] = event.get("message")
    return result


TURN_EVENTS = ("turn.started", "turn.completed", "turn.failed")
TASK_EVENTS = ("task_started", "task_complete", "turn_aborted")


def stage_end(home: Path, stream: Path, exit_code: int) -> dict:
    """Whether a session ended normally. Every signal must agree: the container exited 0, the
    main thread's last turn event is `turn.completed`, and every thread's last task event in
    its rollout is `task_complete`, or `turn_aborted` before its parent thread's last
    `task_complete` (the parent interrupted it and went on). A main thread that ends its turn
    while a sub-agent still runs exits 0 with `turn.completed`; only the sub-agent's rollout
    (`turn_aborted`, or `task_started` last) shows it. `rate_limited_until`: the reset time (epoch s) of a usage
    limit the session reached, from the latest rate-limit snapshot. `error`: the stream's last
    error message, which a normal session can also have (a retried request)."""
    turns = []
    for line in stream.open():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event["type"] in TURN_EVENTS:
            turns.append(event["type"])
    rollouts, limits = {}, None
    for f in sorted((home / "sessions").rglob("*.jsonl")):
        thread = {"name": f.name[-42:], "parent": None, "last": None, "at": None}
        for line in f.open():
            r = json.loads(line)
            p = r["payload"]
            if r["type"] == "session_meta":
                thread_id = p["id"]
                if isinstance(p.get("source"), dict) and "subagent" in p["source"]:
                    thread["parent"] = p["source"]["subagent"]["thread_spawn"]["parent_thread_id"]
            elif r["type"] == "event_msg" and p.get("type") in TASK_EVENTS:
                thread["last"], thread["at"] = p["type"], r["timestamp"]
            elif r["type"] == "event_msg" and p.get("type") == "token_count" and p.get("rate_limits"):
                if limits is None or r["timestamp"] > limits[0]:
                    limits = (r["timestamp"], p["rate_limits"])
        rollouts[thread_id] = thread
    cut = []
    for t in rollouts.values():
        parent = rollouts.get(t["parent"])
        if t["last"] == "task_complete" or (t["last"] == "turn_aborted" and parent is not None
                                            and parent["last"] == "task_complete" and parent["at"] > t["at"]):
            continue
        cut.append(f"{t['name']}: {t['last']}")
    reasons = []
    if exit_code != 0:
        reasons.append(f"exit code {exit_code}")
    if not turns or turns[-1] != "turn.completed":
        reasons.append(f"last turn event {turns[-1] if turns else None}")
    if cut:
        reasons.append(f"threads not complete: {cut}")
    until = None
    if limits and (limits[1].get("rate_limit_reached_type") or limits[1]["primary"]["used_percent"] >= 100):
        until = limits[1]["primary"]["resets_at"]
    error = stream_result(stream)["error"]
    if isinstance(error, dict):
        error = error.get("message")
    return {"normal": not reasons, "reasons": reasons, "rate_limited_until": until, "error": error}


def threads(home: Path) -> list[dict]:
    """One entry per rollout: role, model, effort, first/last time, cumulative tokens, quota seen."""
    out = []
    for f in sorted((home / "sessions").rglob("*.jsonl")):
        t = {"rollout": str(f.relative_to(home)), "role": "main", "parent": None, "depth": 0,
             "model": None, "effort": None, "start": None, "end": None, "tokens": dict.fromkeys(TOKEN_KEYS, 0),
             "quota_first": None, "quota_last": None}
        # Agent output can hold U+2028/U+2029, which splitlines() would split on.
        for line in f.open():
            r = json.loads(line)
            p = r["payload"]
            t["start"] = t["start"] or r["timestamp"]
            t["end"] = r["timestamp"]
            if r["type"] == "session_meta":
                t["thread_id"] = p["id"]
                if isinstance(p.get("source"), dict):
                    spawn = p["source"]["subagent"]["thread_spawn"]
                    t.update(role=spawn["agent_role"], parent=spawn["parent_thread_id"], depth=spawn["depth"])
            elif r["type"] == "turn_context":
                t["model"], t["effort"] = p["model"], p["effort"]
            elif r["type"] == "event_msg" and p.get("type") == "token_count" and p.get("info"):
                t["tokens"] = {k: p["info"]["total_token_usage"][k] for k in TOKEN_KEYS}
                quota = p["rate_limits"]["primary"]
                q = {"used_percent": quota["used_percent"], "resets_at": quota["resets_at"]}
                t["quota_first"] = t["quota_first"] or q
                t["quota_last"] = q
        t["cost_usd"] = round(cost(t["model"], t["tokens"]), 4) if t["model"] in PRICES else None
        out.append(t)
    return out


def cost(model: str, tokens: dict) -> float:
    """API list-price estimate. Codex's input count includes the cached part and its output
    count includes reasoning."""
    if tokens["cache_write_input_tokens"]:
        raise SystemExit("cache-write tokens appeared: decide how to price them first")
    p = PRICES[model]
    return ((tokens["input_tokens"] - tokens["cached_input_tokens"]) * p["input"]
            + tokens["cached_input_tokens"] * p["cached_input"] + tokens["output_tokens"] * p["output"])


def summary(home: Path) -> dict:
    """Totals per model and effort, the estimated cost and the weekly quota seen across threads.
    `cost_usd` covers the priced models only; `unpriced` lists the others."""
    ts = threads(home)
    by_model = {}
    for t in ts:
        m = by_model.setdefault(f"{t['model']} {t['effort']}", dict.fromkeys(TOKEN_KEYS + ["threads", "cost_usd"], 0))
        m["threads"] += 1
        m["cost_usd"] = None if t["cost_usd"] is None else round(m["cost_usd"] + t["cost_usd"], 4)
        for k in TOKEN_KEYS:
            m[k] += t["tokens"][k]
    quotas = [q for t in ts for q in (t["quota_first"], t["quota_last"]) if q]
    first, last = (min(quotas, key=lambda q: (q["resets_at"], q["used_percent"])),
                   max(quotas, key=lambda q: (q["resets_at"], q["used_percent"]))) if quotas else (None, None)
    times = [t[k] for t in ts for k in ("start", "end") if t[k]]
    return {"threads": len(ts), "by_model": by_model,
            "cost_usd": round(sum(t["cost_usd"] for t in ts if t["cost_usd"] is not None), 4),
            "unpriced": sorted({t["model"] for t in ts if t["cost_usd"] is None and t["model"]}),
            "quota_weekly_percent": {"first": first, "last": last},
            "first_event": min(times) if times else None, "last_event": max(times) if times else None}


# git at the start of a command: the tool call's cmd string, or after a shell operator.
GIT = re.compile(r"(cmd:\s*\\?\"|[;&|(`]\s*)git(\s|\\?\")")
GIT_REJECTED = "rejected: Experiment agents never run git"
BROAD_SEARCH = re.compile(r"\b(find|grep -r\w*|rg|ls -R\w*|du)\s+(/|~/?|/root/?|/Users/?|/home/?)(\s|[\"';]|$)")


def outside(allowed: Path) -> str:
    """A pattern for absolute paths in the host's home directories (/Users/… or /home/…) that are
    not under `allowed`; the copies are mounted at their host paths."""
    homes = re.escape(str(Path.home().parent))
    if allowed.is_relative_to(Path.home().parent):
        return rf"{homes}/(?!{re.escape(str(allowed.relative_to(Path.home().parent)))})[\w.-]+"
    return rf"{homes}/[\w.-]+"


def audit(home: Path, allowed: Path) -> dict:
    """Tool calls that run git, name an absolute home-directory path outside `allowed` or the
    login copy in /codex-home, and searches from / or a home directory (flagged for review)."""
    outside_paths = re.compile(rf"{outside(allowed)}|/codex-home")
    hits, broad = [], []
    for f in sorted((home / "sessions").rglob("*.jsonl")):
        for line in f.open():
            r = json.loads(line)
            p = r["payload"]
            if r["type"] != "response_item":
                continue
            if p.get("type") in ("custom_tool_call_output", "function_call_output") and GIT_REJECTED in json.dumps(p):
                hits.append({"rollout": f.name[-42:], "input": GIT_REJECTED})
            if p.get("type") not in ("custom_tool_call", "function_call"):
                continue
            text = p.get("input") or p.get("arguments") or ""
            if p.get("name", "").endswith("agent"):
                continue
            where = f.name[-42:]
            if GIT.search(text) or outside_paths.search(text):
                hits.append({"rollout": where, "input": text[:300]})
            if BROAD_SEARCH.search(text):
                broad.append({"rollout": where, "input": text[:300]})
    return {"hits": len(hits), "broad_searches": len(broad), "samples": hits[:50], "broad_samples": broad[:20]}


def minutes(start: str, end: str) -> float:
    a, b = (datetime.fromisoformat(s.replace("Z", "+00:00")) for s in (start, end))
    return round((b - a).total_seconds() / 60, 1)
