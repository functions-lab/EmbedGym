// The browser's view of the catalog. Circuits are real TS modules, so they are
// imported on demand rather than inlined into the data.

import type { Catalog, Task, Component, Target } from './load_catalog';
import type { Workspace } from './load_runs';
import type { CircuitDecl } from '@harness/jsonl_runner';

// @ts-expect-error - virtual module injected by vite.config.ts
import data from 'virtual:embedgym-demo-data';
// @ts-expect-error - virtual module injected by vite.config.ts
import circuitModules from 'virtual:embedgym-circuits';

export type { Task, Component, Target, Workspace };

export const catalog: Catalog & { workspaces: Workspace[] } = data;

declare const __EMBEDGYM_DEMO_TARGET__: string;
export const TARGET = __EMBEDGYM_DEMO_TARGET__;

const circuits: Record<string, () => Promise<CircuitDecl>> = circuitModules;

export async function loadCircuit(taskName: string): Promise<CircuitDecl> {
  const load = circuits[taskName];
  if (!load) throw new Error(`no circuit.ts for task '${taskName}'`);
  return await load();
}

export function taskByName(name: string): Task | undefined {
  return catalog.tasks.find((t) => t.name === name);
}

/** Re-read from disk, for a task edited mid-demo. */
export async function reload(): Promise<void> {
  const fresh = await fetch('/__reload').then((r) => r.json());
  Object.assign(catalog, fresh);
}
