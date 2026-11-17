"""Collects one finished part of a scaling chain run into workflow/runs/<run>/<NN>_<part>/.

Usage: collect.py <run> <part>
Copies the part's workflow records and the rollouts of its stage sessions (interrupted attempts
included) to transcripts/<stage>[-failed-N]/, writes output.patch (the copy's changes since the
part's component stage started), component.patch (the same up to its task stage), a port run's
emulators.patch (its changes to the emulator sources since the component stage started) and audit.json,
and summarizes in collect.json each session's Codex usage (API-price estimate, weekly quota), the
part's Gemini reviews and its OpenRouter blind solves. chain.py calls it when a part ends.
Codex and Gemini costs are estimates for the models prices.json lists; others are left out.
"""
import argparse
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import codex
import launch
from launch import chain_dir, item_dir

DIFF_EXCLUDES = ["node_modules", "third-party", "references", "runs", "results", ".env",
                 "__pycache__", ".vite", ".pytest_cache", "build", "compiled.hex", "compiled.bin", "compiled.elf"]


def patch(before: Path, after: Path, out_file: Path, excludes: list[str] = DIFF_EXCLUDES) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / "a").symlink_to(before)
        (Path(tmp) / "b").symlink_to(after)
        cmd = ["diff", "-ruN"] + [f"-x{x}" for x in excludes] + ["a/", "b/"]
        diff = subprocess.run(cmd, cwd=tmp, capture_output=True, text=True)
        if diff.returncode not in (0, 1):
            raise SystemExit(diff.stderr)
    out_file.write_text(diff.stdout)
    files = re.findall(r"^\+\+\+ b/(\S+)", diff.stdout, re.M)
    added = sum(1 for l in diff.stdout.splitlines() if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff.stdout.splitlines() if l.startswith("-") and not l.startswith("---"))
    return {"files": len(files), "added": added, "removed": removed}


def helper_jobs(run: str, part: str) -> list[dict]:
    """The helper's finished jobs for the part: its reviews and its tasks' solves and grades."""
    log = launch.RUNS / run / "helper.jsonl"
    if not log.exists():
        return []
    tasks = launch.part_info(part)["tasks"]
    jobs = [json.loads(line) for line in log.open()]
    return [j for j in jobs if j["args"].get("part") == part or j["args"].get("task") in tasks]


def sessions(run: str, part: str) -> dict[str, Path]:
    """The part's CODEX_HOMEs by stage attempt: `component`, `component-failed-1`, `task`, …"""
    item = item_dir(run, part)
    return {h.name.removeprefix(f"{item.name}-"): h
            for h in sorted((codex.WORK / run / "_codex").glob(f"{item.name}-*"))}


def collect(run: str, part: str) -> dict:
    d = chain_dir(run)
    out = item_dir(run, part)
    summary = {"codex": {}, "gemini": {"reviews": [], "cost_usd_estimate": 0}, "openrouter": {}}
    audits = {"codex": {}, "gemini": {}}

    for key, home in sessions(run, part).items():
        s = codex.summary(home)
        stage, _, attempt = key.partition("-")
        end = out / stage / (f"{attempt}/end.json" if attempt else "end.json")
        summary["codex"][key] = {
            "end": json.load(open(end)) if end.exists() else None,
            "minutes": codex.minutes(s["first_event"], s["last_event"]) if s["first_event"] else 0,
            **{k: s[k] for k in ("threads", "by_model", "cost_usd", "unpriced", "quota_weekly_percent")}}
        shutil.copytree(home / "sessions", out / "transcripts" / key, dirs_exist_ok=True)
        audits["codex"][key] = codex.audit(home, d)

    for rec in sorted(out.glob("reviews/*/record.json")):
        r = json.load(open(rec))
        summary["gemini"]["reviews"].append({"dir": rec.parent.name, **{k: r[k] for k in (
            "status", "duration_s", "cost_usd_estimate", "quota_used_fraction", "findings")}})
        summary["gemini"]["cost_usd_estimate"] = round(summary["gemini"]["cost_usd_estimate"]
                                                       + (r["cost_usd_estimate"] or 0), 4)
        audits["gemini"][rec.parent.name] = json.load(open(rec.parent / "audit.json"))

    jobs = helper_jobs(run, part)
    solves = [j for j in jobs if j["kind"] == "solve"]
    summary["openrouter"] = {
        "cost_usd": round(sum(j["result"]["cost_usd"] for j in solves if j["state"] == "done"), 4),
        "solves": [{**j["args"], "state": j["state"], **({k: j["result"][k] for k in ("cost_usd", "exit_status")}
                                                           if j["state"] == "done" else {"error": j["error"]})}
                   for j in solves],
        "grades": [{**j["args"], "state": j["state"], **({k: j["result"][k] for k in ("verdict", "summary")}
                                                           if j["state"] == "done" else {"error": j["error"]})}
                   for j in jobs if j["kind"] == "grade"]}

    records = d / "repo/workflow/runs" / run / part
    # Agents' snapshots can hold symlinks to target dirs they did not snapshot.
    shutil.copytree(records, out / "workflow", dirs_exist_ok=True, ignore_dangling_symlinks=True)
    start = launch.snapshot_dir(run, part, "component") / "repo"
    summary["patch"] = patch(start, d / "repo", out / "output.patch")
    if launch.snapshot_dir(run, part, "task").exists():
        summary["component_patch"] = patch(start, launch.snapshot_dir(run, part, "task") / "repo",
                                           out / "component.patch")
    if (d / "emulators").exists():
        # The sources only: out/ and logs/ hold the builds and their logs.
        summary["emulators_patch"] = patch(launch.snapshot_dir(run, part, "component") / "emulators", d / "emulators",
                                           out / "emulators.patch", ["out", "logs"])
    audits["hits"] = (sum(a["hits"] for a in audits["codex"].values())
                      + sum(a["hits"] for a in audits["gemini"].values()))
    audits["broad_searches"] = (sum(a["broad_searches"] for a in audits["codex"].values())
                                + sum(a["broad_searches"] for a in audits["gemini"].values()))
    json.dump(audits, open(out / "audit.json", "w"), indent=1)
    summary["audit"] = {"hits": audits["hits"], "broad_searches": audits["broad_searches"]}
    json.dump(summary, open(out / "collect.json", "w"), indent=1)
    cost = sum(c["cost_usd"] for k, c in summary["codex"].items() if "failed" not in k)
    lost = sum(c["cost_usd"] for k, c in summary["codex"].items() if "failed" in k)
    print(f"{part}: Codex ~${cost:.2f} (+${lost:.2f} interrupted), Gemini ~${summary['gemini']['cost_usd_estimate']:.2f}, "
          f"OpenRouter ${summary['openrouter']['cost_usd']:.3f}, patch {summary['patch']}, "
          f"audit hits {audits['hits']}, broad searches {audits['broad_searches']}")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Collects one finished part of a scaling chain run.")
    parser.add_argument("run")
    parser.add_argument("part")
    args = parser.parse_args()
    collect(args.run, args.part)
