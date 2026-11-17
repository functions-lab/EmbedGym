# EmbedGym Self-Evolving Scaling Workflow

This directory implements the **five-stage multi-agent workflow** for synthesizing peripheral models, cross-platform benchmark tasks, circuits, hidden test vectors, and reference firmware from datasheets and community driver libraries with minimal human checkpoints.

> **Note on file roles:** [`pipeline.md`](pipeline.md) and [`runner/brief_build.md`](runner/brief_build.md) / [`runner/brief_port.md`](runner/brief_port.md) are **operational prompts and SOPs read directly by automated Codex agents** during pipeline runs, not introductory human documentation.

---

## Five-Stage Pipeline Overview

1. **Stage 1 — Reference Collection & Specification** (`wf-references`, `wf-spec`)
   - Collects candidate datasheets, module photos, and open-source driver libraries into `workflow/references/<part>/`.
   - **Human checkpoint 1**: Filter candidate sources into `approved/` and approve the synthesized hardware capability checklist (`spec.md`).
2. **Stage 2 — Context-Isolated Component Modeling & Review** (`wf-artwork`, `wf-builder`, `wf-unit-test`, `wf-reviewer`, `wf-docs`)
   - Draws the component SVG and pin layout (`C1`), builds one unified behavior model across all targets (`C2`), writes register-level & driver-level unit tests without reading model source (`C3`), runs cross-model adversarial review via Gemini (`C4`), and updates [`docs/components.md`](../docs/components.md) and [`harness/part_actions.json`](../harness/part_actions.json) (`C5`).
3. **Stage 3 — Task Synthesis & Review** (`wf-task-proposer`, `wf-task-builder`, `wf-ref-firmware`, `wf-reviewer`)
   - Proposes/validates task specs (`T1`), builds `circuit.ts`, `test.jsonl`, optional `peer.py`, reference firmware (written from the rendered agent prompt alone by an isolated `wf-ref-firmware`), and alternative control solutions (`T2`), then runs cross-model adversarial review (`T3`).
4. **Stage 4 — Blind Trial Solving & Triage** (`wf-blind-solve`, `wf-triage`)
   - Spawns fresh blind solver agents (`T4`) with only the public task prompt and `embedgym-run` CLI, then classifies failures (`test-too-strict`, `prompt-unclear`, `harness-gap`, or `model-bug`) and routes repairs back to Stage 2 or Stage 3 (`T5`).
5. **Stage 5 — Multi-Target Porting & Physical Hardware Check** (`wf-port-component`, `wf-port-firmware`, `wf-port-task`, `harness/hil_sheet.ts`)
   - Holds verified task prompts and assertions fixed while porting circuits, peripheral bindings, and reference firmware across the remaining MCU–framework targets (`P1`–`P4`), running full regressions after shared simulator/emulator fixes.
   - **Human checkpoint 2**: Generates a physical wiring sheet (`node harness/hil_sheet.ts <task> <target>`) to verify reference firmware on real hardware (`T6`).

---

## Agent Definitions (`workflow/agents/`)

| Agent | Stage / Step | Responsibility |
|---|---|---|
| `wf-references` | Stage 1a | Searches and downloads candidate datasheets, module photos, and drivers |
| `wf-spec` | Stage 1b | Cross-references approved sources into a structured `spec.md` checklist |
| `wf-artwork` | Stage 2 (`C1`) | Creates flat component SVG, thumbnail, and pin coordinates |
| `wf-builder` | Stage 2 (`C2`) | Implements unified peripheral model, element, metadata, and protocol tests |
| `wf-unit-test` | Stage 2 (`C3`) | Writes context-isolated register & third-party driver selftests |
| `wf-reviewer` | Stage 2/3 (`C4`, `T3`) | Runs Gemini adversarial review rounds and verifies findings |
| `wf-docs` | Stage 2 (`C5`) | Adds component entry to `docs/components.md` and `harness/part_actions.json` |
| `wf-task-proposer` | Stage 3 (`T1`) | Proposes candidate benchmark task specs from component checklists |
| `wf-task-builder` | Stage 3 (`T2`) | Builds `circuit.ts`, `test.jsonl`, `peer.py`, controls, and orchestrates reference firmware |
| `wf-ref-firmware` | Stage 3/5 | Writes reference firmware strictly from the rendered agent prompt |
| `wf-blind-solve` | Stage 4 (`T4`) | Runs and grades blind OpenRouter trial solves |
| `wf-triage` | Stage 4 (`T5`) | Diagnoses blind-solve failures and fixes test/harness defects |
| `wf-port-component` | Stage 5 (`P1`–`P2`) | Decides cross-target wiring and verifies unit tests across all remaining targets |
| `wf-port-firmware` | Stage 5 (`P2`) | Writes and compiles target-specific unit-test firmware |
| `wf-port-task` | Stage 5 (`P3`–`P4`) | Ports tasks (`pinout`, `circuit.ts`, `app.overlay`, reference firmware) across targets |

---

## Runner Scripts (`workflow/runner/`) & Prerequisites

- **Prerequisites for unattended runner execution**:
  - Build the `embedgym-agent` image from [`runner/agent_image/Dockerfile`](runner/agent_image/Dockerfile) (and pull/start `embedgym-sim` as in [README.md](../README.md)).
  - Codex CLI authentication at `~/.codex/auth.json` (`CODEX_HOME`).
  - `OPENROUTER_API_KEY` set for blind solving (`eval/run_agent.py`).
  - Adversarial reviewer CLI (`agy`) authentication token (`~/.gemini/antigravity-cli/antigravity-oauth-token` or `AGY_TOKEN`).
- [`runner/parts.json`](runner/parts.json): Example peripheral manifest used by the build and port runner scripts (`refs.py`, `chain.py`, `launch.py`).
- [`refs.py`](runner/refs.py): Launches, monitors, and collects Stage 1 reference/spec/proposal runs from [`parts.json`](runner/parts.json).
- [`chain.py`](runner/chain.py) & [`launch.py`](runner/launch.py): Orchestrates Stage 2–4 build runs (using [`brief_build.md`](runner/brief_build.md)) and Stage 5 multi-target port runs (using [`brief_port.md`](runner/brief_port.md)) inside isolated container copies ([`export.sh`](runner/export.sh)).
- [`helper.py`](runner/helper.py): Host HTTP service bridging containerized agents to blind solving (`eval/run_agent.py`), grading (`eval/grade.py`), Gemini review ([`review.py`](runner/review.py)), and emulator rebuilds/regressions ([`emulators.py`](runner/emulators.py)).
- [`collect.py`](runner/collect.py): Archives completed stage patches, transcripts, and token/cost summaries ([`prices.json`](runner/prices.json)).
