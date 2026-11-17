/**
 * Every component in parts/components.json must be in velxio's committed
 * components-metadata.json. If this fails, run `npm run generate:metadata` in
 * velxio/frontend.
 */
import { describe, it, expect } from 'vitest';
import metadata from '../../../velxio/frontend/public/components-metadata.json';
import components from '../../components.json';

interface ComponentEntry {
  id: string;
  tagName: string;
  category: string;
  pinCount: number;
}

describe('parts/components.json → components-metadata.json drift', () => {
  const metadataById = new Map(
    (metadata as { components: ComponentEntry[] }).components.map((c) => [c.id, c]),
  );

  it.each(components as ComponentEntry[])('$id is in the metadata as declared', (c) => {
    const meta = metadataById.get(c.id);
    expect(meta, `${c.id} missing; run 'npm run generate:metadata'`).toBeDefined();
    expect(meta!.tagName).toBe(c.tagName);
    expect(meta!.category).toBe(c.category);
    expect(meta!.pinCount).toBe(c.pinCount);
  });
});
