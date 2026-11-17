// @vitest-environment jsdom
/**
 * Guard: every `velxio-*` component in components-metadata.json must actually be
 * `customElements.define`d on the render path.
 *
 * A tagName present in metadata but never defined still renders — as an inert
 * unknown element. Metadata drives the label and pin coordinates, and part
 * simulation is keyed on metadataId, so the component's behavior and wiring keep
 * working while its body is invisible. That failure mode is silent: every run.sh
 * check can pass while the element is missing. This test is the only thing that
 * catches it, so it belongs with the metadata, not in a manual "did you look at
 * it" step.
 *
 * This imports exactly what the renderer (DynamicComponent, the sole caller of
 * createElement(tagName)) imports, so it verifies the real registration path.
 * If you add a velxio-* component to metadata, register it where DynamicComponent
 * already pulls elements from (velxio-components/registerAll.ts or
 * velxio-elements/) — this test fails until you do.
 */
import { describe, it, expect } from 'vitest';
import metadata from '../../../velxio/frontend/public/components-metadata.json';
import '@velxio/velxio-elements';
import '@velxio/components/velxio-components/registerAll';

interface ComponentMetadataEntry {
  id: string;
  tagName: string;
  [key: string]: unknown;
}

describe('velxio custom elements', () => {
  const components = (metadata as { components: ComponentMetadataEntry[] }).components;
  const velxioTags = [...new Set(components.filter((c) => c.tagName.startsWith('velxio-')).map((c) => c.tagName))];

  it('has velxio-* entries to check', () => {
    expect(velxioTags.length).toBeGreaterThan(0);
  });

  it.each(velxioTags)('registerAll.ts defines <%s>', (tagName) => {
    expect(
      customElements.get(tagName),
      `<${tagName}> is in components-metadata.json but not defined by registerAll.ts — ` +
        `add its side-effect import there. Without it the component renders as an ` +
        `invisible unknown element while pins, label, and simulation still work.`,
    ).toBeDefined();
  });
});
