import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { capacity, summarize, type Bench, type Host } from './bench_stats';
import { readBench } from './load_bench';

const WS = 'results/bench/nrf52840_zephyr/sim/x-ai__grok-4.7';

function write(root: string, rel: string, data: unknown) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data));
}

function writeModels(root: string) {
  write(root, 'eval/models.json', { 'openrouter/x-ai/grok-4.7': { name: 'grok 4.7' } });
}

function stats(cost: number, wall: number, mem: number) {
  return { cost, wall_clock_s: wall, rounds: 5, host: 'h1', env_mem_peak_bytes: mem, agent_max_rss_bytes: 0 };
}

function host(updatedAt: string, active: Host['active']): Host {
  return {
    host: 'h1', updated_at: updatedAt, scheduler_pid: 1, plan: 'p.jsonl', cores: 8,
    mem_total_bytes: 16e9, mem_available_bytes: 10e9, load_avg: [1, 1, 1], results_disk_free_bytes: 1e12,
    pools: { nosim_jobs: 1, sim_jobs: 1, agent_sims: ['1'], sims_per_instance: 1, grade_sims: ['2'] },
    active, queued_runs: 0, queued_grades: 0, sim_instances: {}, quarantined_sims: [],
    rows: { total: 0, done: 0, crashed: 0, error: 0 },
  };
}

describe('readBench', () => {
  let bench: Bench;
  const state = (task: string) => bench.rows.find((r) => r.task === task)?.state;

  beforeAll(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'embedgym-bench-'));
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 600_000).toISOString();
    writeModels(root);
    write(root, `${WS}/results/passed.stats.json`, stats(0.2, 100, 2e9));
    write(root, `${WS}/results/passed.grade.json`, { verdict: 'pass', summary: 'PASS — 6 passed, 0 failed' });
    write(root, `${WS}/results/failed.stats.json`, stats(0.4, 300, 1e9));
    write(root, `${WS}/results/failed.grade.json`, { verdict: 'fail', summary: 'FAIL — 2 passed, 3 failed' });
    write(root, `${WS}/results/ungraded.stats.json`, stats(0.3, 200, 1e9));
    write(root, `${WS}/results/regrading.stats.json`, stats(0.3, 200, 1e9));
    write(root, `${WS}/results/regrading.grade.json`, { verdict: 'error', summary: null });
    write(root, `${WS}/results/live.status.json`, { state: 'running', heartbeat_at: now, step: 7, cost: 0.1 });
    write(root, `${WS}/results/dead.status.json`, { state: 'running', heartbeat_at: old, step: 3, cost: 0.05 });
    write(root, 'results/plans/p.jsonl', [
      { task: 'passed', target: 'nrf52840_zephyr', mode: 'sim', model: 'openrouter/x-ai/grok-4.7', workspace: WS },
      { task: 'queued', target: 'nrf52840_zephyr', mode: 'sim', model: 'openrouter/x-ai/grok-4.7', workspace: WS },
      { task: 'elsewhere', target: 'nrf52840_zephyr', mode: 'sim', model: 'openrouter/x-ai/grok-4.7', workspace: 'results/old' },
    ].map((r) => JSON.stringify(r)).join('\n') + '\n');
    write(root, 'results/hosts/h1.json', host(now, [
      { kind: 'grade', task: 'regrading', workspace: WS, sim_instance: '2', started_at: now },
    ]));
    bench = readBench(root);
  });

  it('derives each row state from its files', () => {
    expect(state('passed')).toBe('pass');
    expect(state('failed')).toBe('fail');
    expect(state('ungraded')).toBe('ungraded');
    expect(state('regrading')).toBe('grading');
    expect(state('live')).toBe('running');
    expect(state('dead')).toBe('crashed');
  });

  it('adds plan rows not on disk, only under results/bench', () => {
    expect(state('queued')).toBe('pending');
    expect(state('elsewhere')).toBeUndefined();
    expect(bench.rows.filter((r) => r.task === 'passed')).toHaveLength(1);
  });

  it('reads check counts and the workspace model slug', () => {
    const failed = bench.rows.find((r) => r.task === 'failed')!;
    expect([failed.passed, failed.failed]).toEqual([2, 3]);
    expect(failed.model).toBe('x-ai__grok-4.7');
    expect(bench.modelNames['x-ai__grok-4.7']).toBe('grok 4.7');
  });

  it('summarizes cost and remaining runs', () => {
    const s = summarize(bench.rows);
    expect(s.counts.pass).toBe(1);
    expect(s.remaining).toBe(3); // live, dead, queued
    expect(s.spent).toBeCloseTo(0.2 + 0.4 + 0.3 + 0.3 + 0.1 + 0.05);
  });

  it('fits more runs by the p95 run memory', () => {
    const cap = capacity(bench.hosts[0], bench.rows);
    expect(cap.runP95Bytes).toBe(2e9);
    expect(cap.moreRuns).toBe(5);
  });
});

describe('readBench modes', () => {
  it('reads sim_s workspaces and rejects unknown mode directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'embedgym-bench-'));
    writeModels(root);
    write(root, 'results/bench/nrf52840_zephyr/sim_s/x-ai__grok-4.7/results/old.stats.json', stats(0.2, 100, 1e9));
    expect(readBench(root).rows.map((r) => r.mode)).toEqual(['sim_s']);
    fs.mkdirSync(path.join(root, 'results/bench/nrf52840_zephyr/simx'));
    expect(() => readBench(root)).toThrow('unknown mode directory: bench/nrf52840_zephyr/simx');
  });

  it('rejects a model missing from eval/models.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'embedgym-bench-'));
    writeModels(root);
    write(root, 'results/bench/nrf52840_zephyr/sim/x__unlisted/results/a.stats.json', stats(0.2, 100, 1e9));
    expect(() => readBench(root)).toThrow('model not in eval/models.json');
  });
});
