// Finds run workspaces; viewer/load_workspace.ts does the reading. Unlike the
// viewer, absence here is normal rather than an error.

import fs from 'node:fs';
import path from 'node:path';

import { readWorkspace, type Run } from '../../viewer/load_workspace';

export interface Workspace {
  name: string;
  runs: Run[];
}

/** Every `results/<name>/` with a `results/` dir. An unreadable one reads empty. */
export function readWorkspaces(benchRoot: string): Workspace[] {
  const root = path.join(benchRoot, 'results');
  if (!fs.existsSync(root)) return [];

  const workspaces: Workspace[] = [];
  for (const name of fs.readdirSync(root).sort()) {
    const dir = path.join(root, name);
    if (!fs.existsSync(path.join(dir, 'results'))) continue;
    try {
      workspaces.push({ name, runs: readWorkspace(dir).runs });
    } catch (err) {
      console.warn(`[demo] skipping unreadable workspace ${name}: ${(err as Error).message}`);
      workspaces.push({ name, runs: [] });
    }
  }
  return workspaces;
}
