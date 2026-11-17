// Static picture of a task's circuit. Pin coordinates come from each element's
// `pinInfo`, which only exists once mounted — so measure, then draw the wires.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ComponentRegistry } from '@velxio/services/ComponentRegistry';
import { BOARD_SIZE } from '@velxio/components/simulator/BoardOnCanvas';
import type { CircuitDecl } from '@harness/jsonl_runner';

import { boardElement } from './boardTags';

const PADDING = 28;

interface PinInfo {
  name: string;
  x: number;
  y: number;
}

interface Placed {
  id: string;
  /** Element origin in circuit coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  pins: PinInfo[];
}

// Boards number their rails (GND.1…GND.5); circuits wire to bare `GND`.
function findPin(pins: PinInfo[], pinName: string): PinInfo | undefined {
  const exact = pins.find((p) => p.name === pinName);
  if (exact) return exact;
  return pins.find((p) => p.name.startsWith(`${pinName}.`));
}

function pinAt(placed: Placed | undefined, pinName: string): { x: number; y: number } | null {
  if (!placed) return null;
  const pin = findPin(placed.pins, pinName);
  if (!pin) return null;
  return { x: placed.x + pin.x, y: placed.y + pin.y };
}

export function CircuitPreview({ circuit, height = 300 }: { circuit: CircuitDecl; height?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [registryReady, setRegistryReady] = useState(false);

  useEffect(() => {
    ComponentRegistry.getInstance().loadPromise.then(() => setRegistryReady(true));
  }, []);

  // Measure once the custom elements upgrade; a few frames covers a slow define.
  useLayoutEffect(() => {
    if (!registryReady) return;
    let frames = 0;
    let raf = 0;

    const measure = () => {
      const host = hostRef.current;
      if (!host) return;

      const next: Placed[] = [];
      for (const el of host.querySelectorAll<HTMLElement>('[data-preview-id]')) {
        const id = el.dataset.previewId!;
        const inner = (el.firstElementChild as HTMLElement & { pinInfo?: PinInfo[] }) ?? null;
        const rect = inner?.getBoundingClientRect();
        next.push({
          id,
          x: Number(el.dataset.x),
          y: Number(el.dataset.y),
          w: rect?.width ?? 0,
          h: rect?.height ?? 0,
          pins: inner?.pinInfo ?? [],
        });
      }
      setPlaced(next);
      if (++frames < 3) raf = requestAnimationFrame(measure);
    };

    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [circuit, registryReady]);

  const byId = new Map(placed.map((p) => [p.id, p]));

  // Fit everything, boards included, into the available box.
  const boxes = [
    ...circuit.boards.map((b) => {
      const size = BOARD_SIZE[b.boardKind] ?? { w: 300, h: 200 };
      return { x: b.x, y: b.y, w: size.w, h: size.h };
    }),
    ...placed.map((p) => ({ x: p.x, y: p.y, w: p.w || 60, h: p.h || 40 })),
  ];
  const minX = Math.min(...boxes.map((b) => b.x), 0);
  const minY = Math.min(...boxes.map((b) => b.y), 0);
  const maxX = Math.max(...boxes.map((b) => b.x + b.w), 1);
  const maxY = Math.max(...boxes.map((b) => b.y + b.h), 1);
  const width = maxX - minX + PADDING * 2;
  const contentHeight = maxY - minY + PADDING * 2;
  const scale = Math.min(1, height / contentHeight);

  const registry = ComponentRegistry.getInstance();

  return (
    <div className="circuit-preview" style={{ height }}>
      <div
        ref={hostRef}
        className="circuit-stage"
        style={{
          width,
          height: contentHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <svg className="circuit-wires" width={width} height={contentHeight}>
          {circuit.wires.map((wire) => {
            const from = pinAt(byId.get(wire.start.componentId), wire.start.pinName);
            const to = pinAt(byId.get(wire.end.componentId), wire.end.pinName);
            if (!from || !to) return null;
            return (
              <line
                key={wire.id}
                x1={from.x - minX + PADDING}
                y1={from.y - minY + PADDING}
                x2={to.x - minX + PADDING}
                y2={to.y - minY + PADDING}
                stroke={wire.color}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {circuit.boards.map((board) => (
          <div
            key={board.id}
            data-preview-id={board.id}
            data-x={board.x}
            data-y={board.y}
            className="circuit-part"
            style={{ left: board.x - minX + PADDING, top: board.y - minY + PADDING }}
          >
            {renderElement(boardElement(board.boardKind), board.id)}
          </div>
        ))}

        {circuit.components.map((component) => {
          const meta = registry.getById(component.metadataId);
          if (!meta) return null;
          return (
            <div
              key={component.id}
              data-preview-id={component.id}
              data-x={component.x}
              data-y={component.y}
              className="circuit-part"
              style={{ left: component.x - minX + PADDING, top: component.y - minY + PADDING }}
            >
              {renderElement({ tag: meta.tagName }, component.id, component.properties)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderElement(
  element: { tag: string; attrs?: Record<string, string> },
  id: string,
  properties?: Record<string, unknown>,
) {
  const attrs: Record<string, unknown> = { id, ...(element.attrs ?? {}) };
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (typeof value === 'string' || typeof value === 'number') attrs[key] = value;
    else if (value === true) attrs[key] = '';
  }
  return <Element tag={element.tag} attrs={attrs} />;
}

/** Custom elements take attributes, which React 19 sets fine — but the tag is dynamic. */
function Element({ tag, attrs }: { tag: string; attrs: Record<string, unknown> }) {
  const Tag = tag as unknown as React.ElementType;
  return <Tag {...attrs} />;
}
