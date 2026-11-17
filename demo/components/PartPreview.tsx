// Live thumbnail of one component: the real element, scaled to fit a tile.

import { useLayoutEffect, useRef, useState } from 'react';

export function PartPreview({
  tagName,
  box = 96,
  properties,
  attrs: extraAttrs,
}: {
  tagName: string;
  box?: number;
  properties?: Record<string, unknown>;
  /** Attributes the element needs to pick its artwork, e.g. an ESP's boardKind. */
  attrs?: Record<string, string>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // The element sizes itself on upgrade; shrink anything larger than the tile.
  useLayoutEffect(() => {
    let frames = 0;
    let raf = 0;
    const fit = () => {
      const el = hostRef.current?.firstElementChild as HTMLElement | null;
      if (el) {
        const { width, height } = el.getBoundingClientRect();
        const largest = Math.max(width, height);
        if (largest > 0) setScale(Math.min(1, box / largest));
      }
      if (++frames < 3) raf = requestAnimationFrame(fit);
    };
    raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
  }, [tagName, box]);

  const Tag = tagName as unknown as React.ElementType;
  const attrs: Record<string, unknown> = { ...(extraAttrs ?? {}) };
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (typeof value === 'string' || typeof value === 'number') attrs[key] = value;
  }

  return (
    <div className="part-preview" style={{ width: box, height: box }}>
      <div ref={hostRef} style={{ transform: `scale(${scale})` }}>
        <Tag {...attrs} />
      </div>
    </div>
  );
}
