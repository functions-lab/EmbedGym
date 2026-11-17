import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import partActions from '../part_actions.json';

const REPO = path.resolve(__dirname, '../..');

/** components.md entry text by metadataId. */
function componentEntries(): Map<string, string> {
  const md = fs.readFileSync(path.join(REPO, 'docs/components.md'), 'utf8');
  const entries = new Map<string, string>();
  for (const entry of md.split(/^### /m).slice(1)) {
    const id = entry.match(/^- metadataId: `([a-z0-9-]+)`/m)?.[1];
    if (id) entries.set(id, entry);
  }
  return entries;
}

describe('part_actions.json', () => {
  const entries = componentEntries();
  const actions = partActions as Record<string, { do?: string[]; set?: Record<string, string>; read?: string[]; send?: string[] }>;

  it('has an entry for every documented component, and only those', () => {
    expect(Object.keys(actions).sort()).toEqual([...entries.keys()].sort());
  });

  // A loose check against the entry's prose: each literal piece of an action
  // name (slot placeholders removed) appears there, not preceded by a letter.
  it('names only actions its components.md entry documents', () => {
    const missing: string[] = [];
    for (const [type, spec] of Object.entries(actions)) {
      const names = [...(spec.do ?? []), ...Object.keys(spec.set ?? {}), ...(spec.read ?? []), ...(spec.send ?? [])];
      for (const name of names) {
        for (const piece of name.split(/<[^>]+>/).filter(Boolean)) {
          const escaped = piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (!new RegExp(`(?<![A-Za-z])${escaped}`).test(entries.get(type)!)) missing.push(`${type}: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
