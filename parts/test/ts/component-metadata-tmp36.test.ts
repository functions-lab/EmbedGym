import { describe, it, expect } from 'vitest';
import metadata from '../../../velxio/frontend/public/components-metadata.json';

interface ComponentMetadataEntry {
  id: string;
  tagName: string;
  category: string;
  pinCount: number;
  [key: string]: unknown;
}

describe('component metadata — TMP36 entry', () => {
  it('is registered with id "tmp36" and tagName "velxio-tmp36"', () => {
    const components = (metadata as { components: ComponentMetadataEntry[] }).components;
    const entry = components.find((c) => c.id === 'tmp36');
    expect(entry, 'TMP36 missing from components-metadata.json').toBeDefined();
    expect(entry!.tagName).toBe('velxio-tmp36');
    expect(entry!.category).toBe('sensors');
    expect(entry!.pinCount).toBe(3);
  });
});
