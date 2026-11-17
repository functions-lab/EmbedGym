// Runs against a real workspace, so it is skipped when EMBEDGYM_BENCH is unset.
//   EMBEDGYM_BENCH=../results/v1-nosim-s45 ../../../frontend/node_modules/.bin/vitest run
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { readWorkspace, type Workspace } from './load_workspace';

const workspace = process.env.EMBEDGYM_BENCH ?? '';
const present = workspace !== '' && fs.existsSync(path.join(workspace, 'results'));

describe.skipIf(!present)('readWorkspace', () => {
  const ws: Workspace = readWorkspace(workspace);

  it('finds one run per trajectory file', () => {
    const trajCount = fs
      .readdirSync(path.join(workspace, 'results'))
      .filter((f) => f.endsWith('.traj.json')).length;
    expect(ws.runs).toHaveLength(trajCount);
    expect(trajCount).toBeGreaterThan(0);
  });

  it('gives every step at least one tool call with its command text', () => {
    for (const run of ws.runs) {
      for (const step of run.steps) {
        expect(step.calls.length, `${run.task} step ${step.index}`).toBeGreaterThan(0);
        for (const call of step.calls) expect(typeof call.command).toBe('string');
      }
    }
  });

  it('records a returncode for every step that got a tool result', () => {
    for (const run of ws.runs) {
      // The final step of a submitted run can be the submission itself, which
      // still gets a tool result; only a run cut off mid-flight lacks one.
      const answered = run.steps.flatMap((s) => s.calls).filter((c) => c.output !== null);
      expect(answered.length, run.task).toBeGreaterThan(0);
      for (const call of answered) expect(typeof call.returncode).toBe('number');
    }
  });

  it('keeps step count consistent with the stats round count', () => {
    // rounds counts API calls, which includes the ones a FormatError retried.
    for (const run of ws.runs.filter((r) => r.complete)) {
      const retries = run.steps.filter((s) => s.formatError).length;
      expect(run.steps.length + retries, run.task).toBe(run.rounds);
    }
  });

  it('marks a run with no stats file as incomplete rather than dropping it', () => {
    for (const run of ws.runs) {
      const hasStats = fs.existsSync(path.join(workspace, 'results', `${run.task}.stats.json`));
      expect(run.complete, run.task).toBe(hasStats);
    }
  });

  it('grades a task from its log before summary.tsv exists', () => {
    for (const run of ws.runs) {
      const logPath = path.join(workspace, 'results', `${run.task}.log`);
      if (!fs.existsSync(logPath)) continue;
      const hasVerdictLine = /^(PASS|FAIL) —/m.test(fs.readFileSync(logPath, 'utf8'));
      if (hasVerdictLine) {
        expect(['pass', 'fail', 'timeout', 'no_sketch', 'error'], run.task).toContain(run.grade);
        // An error's summary is the harness's reason, e.g. "harness error: worker did not boot …".
        if (run.grade !== 'error') expect(run.gradeSummary, run.task).toMatch(/^(PASS|FAIL) —/);
      }
    }
  });

  it('never invents a grade for a task with no verdict anywhere', () => {
    const summaryPath = path.join(workspace, 'results', 'summary.tsv');
    const summaryTasks = fs.existsSync(summaryPath)
      ? new Set(
          fs
            .readFileSync(summaryPath, 'utf8')
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => l.split('\t')[0]),
        )
      : new Set<string>();

    for (const run of ws.runs.filter((r) => r.grade !== null)) {
      const logPath = path.join(workspace, 'results', `${run.task}.log`);
      const fromLog =
        fs.existsSync(logPath) && /^(PASS|FAIL) —/m.test(fs.readFileSync(logPath, 'utf8'));
      const fromJson = fs.existsSync(path.join(workspace, 'results', `${run.task}.grade.json`));
      expect(fromLog || fromJson || summaryTasks.has(run.task), run.task).toBe(true);
    }
    expect(ws.graded).toBe(ws.runs.some((r) => r.grade !== null));
  });
});
