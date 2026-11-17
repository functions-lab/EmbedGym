# EmbedGym scaling workflow

Adds a component or a task across five stages: references → component → task → blind trial solving and triage → multi-target porting and hardware check.
Paths are relative to the repository root. The run brief names the targets. Adding a target is out of scope.

## Run brief

The reader of this file is the orchestrator for one item. Its brief gives:
- item: a part name (stages 1–2, or stage 5 port stage A) or a task (stages 3–4, or stage 5 port stage B), and the targets
- run id; records go to `workflow/runs/<run>/<item>/` (gitignored)
- blind-solve models, mode and budget; triage iteration cap
- whether steps after stage 1 are offline
- sim instance and its lock file

## Roles

- Orchestrator: launches one fresh sub-agent per step with this file, the item facts and the handoff path; reads the handoff; handles approval points; keeps the records. It edits no item files.
- Step agent: does its step only, appends a section (≤ 25 lines: what it did, results, open points, evidence paths) to `HANDOFF.txt`, and stops. No git, no AskUserQuestion; anything needing a decision goes under "Needs decision" in its section.
- Approval point: the orchestrator asks the user (AskUserQuestion) and records the question, answer and time taken.
- An answered Needs-decision item goes back to the agent that raised it, which continues its step; a step agent is replaced only when its step is done or it was interrupted.
- Fix scope: an item's own files are its part model, its tests and its task files. A defect in an emulator, a host worker, the harness or the frontend simulation that makes correct firmware behave differently than on the real hardware is fixed at its cause by the step whose own tests or reference firmwares it fails, with the smallest change that makes them pass and a test that fails without the fix; never widen a tolerance or loosen a row to get past it. Each such change is recorded with the test failure that required it. Capability no test of the item needs is not added but recorded as a gap; a choice the step cannot settle is recorded as an open item with the option taken, and the step goes on. Other parts' models change only as far as this item's unit tests, rows or controls need. Reviews of a shared-code fix ask only whether it is right and what it breaks.
- Sim use: every `run.sh`, `grade.py`, `run_agent.py --sim-access` and `/run` call runs under `flock <lock file>`, one at a time. `embedgym-solve`, `embedgym-grade` and `embedgym-review` take the lock themselves; never run them under `flock`. Long commands run in the background; wait inside the turn.

Step agents are defined in `workflow/agents/` (Codex roles: model, effort, instructions):

| Step | Agent |
|---|---|
| Stage 1a and its follow-up, and a source added later | `wf-references` |
| Stage 1b | `wf-spec` |
| C1 | `wf-artwork` |
| C2, and part-model fixes | `wf-builder` |
| C3 | `wf-unit-test` |
| C4, T3 | `wf-reviewer` |
| C5 | `wf-docs` |
| T1 proposals | `wf-task-proposer` |
| T2, and task-file fixes | `wf-task-builder` (launches `wf-ref-firmware`) |
| T4 | `wf-blind-solve` |
| T5 | `wf-triage` |
| Port stage A / P1–P2 (component porting) | `wf-port-component` (launches `wf-port-firmware`) |
| Port stage B / P3–P4 (task porting) | `wf-port-task` (launches `wf-ref-firmware`) |

## Records

`workflow/runs/<run>/<item>/` (gitignored):
- `HANDOFF.txt`: step sections, appended in order
- `record.json`: `{"item", "kind": "component"|"task", "targets", "workflow_commit", "steps": [{"step", "start", "end", "result", "files"}], "approvals": [{"step", "question", "answer", "minutes"}], "references_added": [{"step", "source", "reason"}], "blind": [{"iter", "target", "model", "verdict", "failed_row", "class", "reason"}], "status"}`; times from `date -Is`
- `snapshots/<step>/`: a copy of the item's files after each step that changed them
- `controls/`: stage 3 controls with `controls.json` (`id`, variant, verdict, failing row)

## Stage 1 — references

Input: a part name, optionally photos or a link of the physical module. Only this stage uses the web.

Stage 1a, candidates (`wf-references`):
1. Identify the exact module: vendor and product. Photos, pins, pull-ups and address straps follow the module, not the bare chip. Watch for clones and look-alike chips (e.g. GY-521 boards carrying an MPU6500 instead of an MPU6050).
2. Collect candidates into `workflow/references/<part>/files/` (`workflow/references/` is gitignored), at least one and at most these of each kind (drivers: `none` when no target framework has one). Retry a failed download from another source (distributor, mirror) before listing it without a file:
   - 5 module photos, top view, every pin name readable; for look-alike modules, one of each
   - 3 datasheets: the chip datasheet with its revision, application notes
   - 4 drivers for the run's targets, pinned, most used first (Arduino: Library Manager libraries with their examples)
3. Write `workflow/references/<part>/sources.json`: `[{"file", "kind": "photo"|"datasheet"|"driver", "url", "version", "sha256", "retrieved"}]`.
4. Write `workflow/references/<part>/candidates.md`: per kind, one line per file (path, what it is, why it matters), then the "Needs decision" questions.
5. Approval point: the user moves the sources to use into `workflow/references/<part>/approved/` and writes decisions (module identity, pin names, modeling scope, answers) in `approved/comments.txt`. When the comments name sources or ask for more, `wf-references` follows up: named sources go into `approved/`, other new finds into `files/` and a "Follow-up" section of `candidates.md` for another screening.

Stage 1b, spec (`wf-spec`), from `approved/` and `comments.txt` only:
6. Write `workflow/references/<part>/spec.md`:
   - module: vendor, product, chip, supply range
   - pin table: name as printed on the silkscreen, function
   - capability checklist: one row per register, command, mode, timing behavior or interrupt, with the approved drivers' functions that use it and `model: yes|no` (a reason for no)
7. Approval point: the user reviews `spec.md`, answers its "Needs decision" items in place and corrects it; the agent's version is kept for comparison.

Later steps read `spec.md` and `approved/`; `files/` is not given to them. A later step that needs a missing source reports it under "Needs decision"; the orchestrator has `wf-references` add it and records it in `references_added`. Offline runs record the miss and continue without it.

## Stage 2 — component

Precondition: approved `workflow/references/<part>/`. Tag: `velxio-<part>`.

### C1 — artwork

From the reference photo:
- element body SVG, `parts/elements/svgs/<part>.svg` (served at `/component-svgs/<part>.svg`): top-down flat like a wokwi part; no gradients, shadows, 3D, brand or logo; real proportions from the module's physical size
- `artwork/pins.json` in the run dir: pin tip coordinates in CSS px from the element's top-left, on the drawn pins, names from `spec.md`
- `artwork/thumbnail.svg` in the run dir: 64×64

Render (`rsvg-convert -w 800 -o <png> <svg>`) and compare with the photo until text, label alignment, pin count/order and proportions match.

### C2 — model

Read `docs/development.md`, then the example part it names for this part's category (or the one the brief names) end to end: element, model, `docs/components.md` entry, unit test.
- Metadata: an entry in `parts/components.json` (thumbnail from C1; reference: the reference part's entry), then `cd velxio/frontend && NODE_PATH=$PWD/node_modules npm run generate:metadata` (its script resolves `typescript` from `velxio/scripts/`), which needs `velxio/third-party/wokwi-elements/src` and writes `velxio/frontend/public/components-metadata.json` (never edit that file). Pick the category that fits the part.
- Element: `parts/elements/<Name>Element.ts`, an HTMLElement subclass whose shadow DOM shows `/component-svgs/<part>.svg`, with `pinInfo` `[{name, x, y, number, signals}]` from `pins.json` and a guarded `customElements.define`; side-effect import in `parts/elements/index.ts`.
- Behavior: one model for every target, located and registered per `docs/development.md`.
- Model every `model: yes` row of the checklist, including signals in both directions (interrupt, data-ready, enable pins). Pin changes run on the CPU clock, never wall-clock timers. Unsupported operations raise (backend `ValueError`, frontend `Error`); never silently ACK.
- Protocol tests per checklist row: vitest under `parts/test/ts/`, pytest under `parts/test/py/`.
- Interactive parts (`do` verbs): add the element-tag case to `invokeDoVerb` in `harness/do_verbs.ts`.
- End the handoff with the part's interface: `metadataId`, pins, `set` properties with units and ranges, `do` verbs, readable properties.

### C3 — unit tests

A fresh agent writes these from `spec.md`, `workflow/references/<part>/approved/` and the C2 interface, without reading the model code.
- `selftests/parts/<tag>/`: one shared `test.jsonl` and one dir per target (contents per the target's section of `docs/targets.md`), covering every `model: yes` row. Reference firmwares are register-level.
- One extra dir per approved driver, `<tag>-<driver>/` (e.g. `velxio-<part>-library`), whose reference firmwares call that driver unmodified on its framework's targets.
- Pass: `bash run.sh --headless selftests/parts/<dir> <target>` for every dir and target; on backend targets run twice with byte-identical `[PASS]/[FAIL] @…ms` lines.
- Rendering: `cd parts/test/ts && ../../node_modules/.bin/vitest run velxio-elements-registered.test.ts`.
- Layout and wiring: `cd harness/test && ../node_modules/.bin/vitest run circuit-layout.test.ts circuit-wiring.test.ts`.

A failure is a model bug (back to C2) or a test bug (fix here); record which.

### C4 — cross-model adversarial review

Gemini review through the host helper: `embedgym-review <round> <part>` (`<round>`: `C4`, `C4-r2`; T3 rounds `T3`, `T3-r2` add the task) reviews, in a throwaway copy of this repository where it may run commands, the change since the stage started (round 1) or since round 1 (round 2), and prints the path of its findings. The helper writes the prompt for each round:
1. Round 1: the prompt gives `spec.md`, the model, the protocol tests and the unit tests, and asks for checklist rows that are missing, wrong or untested, silent ACKs and wall-clock timing.
2. A fresh agent fixes real findings, then reruns C3 on every target.
3. Round 2, only after a fix: the prompt gives the round 1 findings and the diff of each changed file against its previous snapshot, and asks whether each fix is right and complete and what it breaks. Real findings get one more fix as in 2; there is no third round.

### C5 — documentation

- `docs/components.md` entry, strictly per its template; `implemented:` lists every target whose unit tests pass.
- `harness/part_actions.json`: the `do`, `set` and `read` actions a user could do to or observe on the real part, or `{}`; no fault stimuli, jumpers, pots or grading-only reads. Check: `cd harness/test && ../node_modules/.bin/vitest run partActions.test.ts`.

Done: unit tests pass on every target. A target moves from `implemented:` to `verified:` when a task using the part passes T4 there.

## Stage 3 — task

### T0 — precondition

Every part in the task's pinout is `implemented` on each target of the run; otherwise stages 1–2 for it first.

### T1 — task spec

The user supplies the task, or an agent proposes candidates from the parts' `spec.md` capability checklists, which needs only stage 1, and the user picks and edits one. The existing specs, `tasks/*/task.json`, show the style.
Tests drive and observe only parts a role resolves to (`docs/tasks-and-tests.md`, Circuit). A source or load that would connect only to another part stays out of the circuit and the pinout: the description names it, and the task sets or reads it through that part's properties. Each drive has a physical counterpart for T6, qualitative where no exact setting exists.
Spec file: `tasks/<name>/task.json` with `name`, `level` (1–3), `description`, `serial` (if the firmware prints), `pinout.<target>` per target (conventions in `docs/targets.md`), `network` (if any: keys of `NETWORK_SERVICES` in `eval/task_prompt.py`, or `ble`).
- The description says what the device does, as its user would ask for it. Wiring, supplies and level shifting belong to the pinout and `circuit.ts`; how the firmware talks to a part (driver, bus mode, data format) is its own choice unless the task is about it.
- `pinout.<target>` maps each part's signal pins to board pins; supplies, resistors and level shifters are not listed.
- `serial` lines use `%d`, `%s`, `%.Nf` or literal text, no literal `%`. The description names every token a `%s` can take and required zero-padding, and does not restate the line format.
- LCD: no `display` key; the description states each row's format printf-style.

Approval point: description, serial lines and pinouts. Later description changes go through this approval point again.

### T2 — build

For the first target, then each further target:
- `tasks/<name>/<target>/circuit.ts`: mechanically from the pinout; board naming per `docs/targets.md`, part naming per `docs/components.md`; button pull resistors per `docs/tasks-and-tests.md`. Layout and wiring vitest as in C3.
- `tasks/<name>/test.jsonl`: circuit rows per target, assertions shared. Check only what the description states: values, cadence, mid-run changes, reconnection when stated. No boundary or equality cases, startup deadlines or latency. Formats the description names (BLE SIG characteristics, BTHome, …) are checked as their specs define them.
- Drive values survive every correct firmware choice: an analog temperature of 28.3 / 40.5 °C (°F display: 28.3 / 31.2 °C); MPU6050 ≤ 1.9 g; a bar graph of N buckets at `(k + 0.25) × full_scale / N`; analog drives inside the target's ADC range (ESP32 3.3 V; nRF 3.6 V full scale on a 3.3 V rail). Shared `at` values clear every edge by the target's margin. Never assert boot text or boot timestamps.
- Network tasks: `peer.py` per `docs/tasks-and-tests.md` (Network Peers (`peer.py`)). `start()` runs the normal session by itself (scan or wait for the board, connect, discover, then what a phone or server does for this task); `do` actions are test-time perturbations.
- Reference firmware: a sub-agent writes it from the rendered prompt only (`python3 eval/task_prompt.py <name> <target>`) plus the target's fixed files. Make tests and reference firmware agree without dropping anything the description states. Reference firmware passes `bash run.sh --headless tasks/<name> <target>`, twice byte-identical on backend targets.
- Controls, in `controls/`: at most two copies of the reference firmware that must PASS: one using the part or peripheral another valid way (another driver, direct register access or another setting), one with another poll period where the description leaves the cadence open. No controls that must fail.
- embedgym-run path: POST the reference firmware artifact to the sim's `/run` as `docker/env_image/embedgym-run` does and confirm serial (and the peer, for network tasks) comes back.
- A target whose rows must diverge gets a standalone `test.jsonl` in its target dir.
- After a shared-row change, rerun every ported target's reference firmware.

### T3 — cross-model adversarial review

As C4, scoped to the task spec, `test.jsonl`, `circuit.ts`, `peer.py`, reference firmware and controls. Ask for rows a wrong firmware passes, rows a correct firmware fails, untested stated requirements, and peer races. After a fix: reference firmware ×2 and the controls.

## Stage 4 — blind trial solving and triage

### T4 — blind solve

Per target, for each model in the brief, through the host helper, which runs `eval/run_agent.py --sim-access` with the run's cost cap and then `eval/grade.py`:
```bash
embedgym-solve <name> <target> <model id> <k>
embedgym-grade <name> <target> <model id> <k>
```
Each prints a JSON job; its `result` has the workspace (`results/wf-<run>/<name>-<target>-<model>-it<k>`), the cost, and the verdict with its failing rows.

Record each verdict in `record.json`.

### T5 — triage

A fresh agent classifies every failure with evidence (grade log, serial, peer state):
- `test-too-strict`: a row encodes a choice the description leaves open → fix the row
- `prompt-unclear`: the description reads two ways → propose the sentence (T1 approval point)
- `harness-gap`: a part model, peer or emulator changes a correct firmware's observable → fix it; a part model fix goes back to C2–C3
- `model-bug`: the firmware missed a stated requirement or a characteristic of the part or platform → no change

After a fix: reference firmware ×2, the controls, `grade.py` on every T4 workspace again, one T3-style review of the fix diff. Repeat T4–T5 until every failure of the last iteration is `model-bug` or the iteration cap is reached.

## Stage 5 — multi-target porting and hardware check

### Multi-target porting (`P1`–`P4`)
Once tasks stabilize on the initial target, hold task descriptions and shared assertions fixed while porting peripheral bindings (`P1`–`P2`) and task circuits/firmware (`P3`–`P4`) across the remaining MCU–framework targets. Any failure of valid reference firmware exposes missing target bindings or low-level emulator bugs, which are patched and regression-checked across all affected targets.

### T6 — hardware check

`node harness/hil_sheet.ts <name> <target> > tasks/<name>/<target>/hil.md` writes the sheet: the task description and serial lines, the circuit's parts and every wire, and a result field.

Approval point: the user builds the circuit from the sheet, flashes the reference firmware, judges it against the task and fills the result. A mismatch is triaged as in T5.

Done: T4–T5 finished on every target of the run and T6 recorded or explicitly deferred by the user.
