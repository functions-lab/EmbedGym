/**
 * Locate every testbench circuit.ts. Shared by the layout and wiring guards so
 * a new task or component dir is picked up by both without touching either.
 */
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

export const TESTBENCH = path.resolve(__dirname, '../..');

// A task dir holds one circuit.ts per ported target, in <task>/<target>/.
// Every target's circuit is checked: they are separate layouts on different
// boards, so a guard passing on one proves nothing about the other.
export function circuitFiles(): { name: string; file: string }[] {
  const found: { name: string; file: string }[] = [];
  for (const group of ['tasks', 'selftests/parts', 'selftests/harness', 'selftests/wifi', 'selftests/ble']) {
    const dir = path.join(TESTBENCH, group);
    if (!existsSync(dir)) continue;
    for (const task of readdirSync(dir, { withFileTypes: true })) {
      if (!task.isDirectory()) continue;
      const taskDir = path.join(dir, task.name);
      for (const target of readdirSync(taskDir, { withFileTypes: true })) {
        if (!target.isDirectory()) continue;
        const file = path.join(taskDir, target.name, 'circuit.ts');
        if (existsSync(file)) {
          found.push({ name: `${group}/${task.name}/${target.name}`, file });
        }
      }
    }
  }
  return found;
}
