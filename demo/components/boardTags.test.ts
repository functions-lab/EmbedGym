// BOARD_ELEMENT is the one hardcoded table in the demo — everything else is
// parsed. These catch it drifting from the boards the testbench targets and
// from the elements the frontend actually defines.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { BOARD_ELEMENT, boardElement } from './boardTags';
import { readCatalog } from '../data/load_catalog';

const REPO = path.resolve(__dirname, '../..');
const BENCH = REPO;
const catalog = readCatalog(BENCH);

/** Every tag passed to customElements.define() anywhere in the frontend. */
function definedTags(): Set<string> {
  const tags = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        for (const m of fs.readFileSync(full, 'utf8').matchAll(
          /customElements\.define\(\s*['"]([^'"]+)['"]/g,
        )) {
          tags.add(m[1]);
        }
      }
    }
  };
  walk(path.join(REPO, 'velxio/frontend/src'));
  return tags;
}

describe('BOARD_ELEMENT', () => {
  it('covers every board the testbench targets', () => {
    for (const target of catalog.targets) {
      expect(
        BOARD_ELEMENT,
        `target ${target.name} needs an entry for '${target.boardKind}'`,
      ).toHaveProperty(target.boardKind);
    }
  });

  it('covers every board the circuits place', () => {
    for (const task of catalog.tasks) {
      const circuit = fs.readFileSync(
        path.join(BENCH, 'tasks', task.name, catalog.target, 'circuit.ts'),
        'utf8',
      );
      for (const m of circuit.matchAll(/boardKind:\s*'([^']+)'/g)) {
        expect(BOARD_ELEMENT, `${task.name} uses board '${m[1]}'`).toHaveProperty(m[1]);
      }
    }
  });

  // A tag nothing defines renders as an empty inline element: no error, no art.
  it('names elements the frontend actually defines', () => {
    const defined = definedTags();
    for (const [boardKind, element] of Object.entries(BOARD_ELEMENT)) {
      // @wokwi/elements ships its own defines from node_modules.
      if (element.tag.startsWith('wokwi-')) continue;
      expect(defined, `${boardKind} → <${element.tag}> is never defined`).toContain(element.tag);
    }
  });

  it('raises for an unknown board rather than rendering nothing', () => {
    expect(() => boardElement('no-such-board')).toThrow(/no preview element/);
  });
});
