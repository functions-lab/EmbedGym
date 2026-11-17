// @vitest-environment jsdom
/**
 * Guard: no component in a testbench circuit.ts may overlap the board or
 * another component on the canvas.
 *
 * Overlap is invisible to `run.sh`: role resolution walks the wire graph and
 * the part simulation is keyed on metadataId, so a component sitting on top of
 * the board passes every check while rendering as an unreadable pile. The only
 * thing that catches it today is a human looking at the canvas, which is
 * exactly the kind of step that gets skipped.
 *
 * Footprints are measured from the real elements: the canvas applies no
 * scaling (DynamicComponent positions the element absolutely, and pinInfo is
 * already in CSS pixels), so an element's SVG width/height IS its on-canvas
 * size once `mm` is converted at 96 dpi. That conversion reproduces the
 * hand-maintained BOARD_SIZE table exactly (mega 102.66mm -> 388px), which is
 * what makes measuring trustworthy rather than a second guess at the truth.
 *
 * Circuits are parsed, not imported: they carry type-only imports pointing at
 * frontend paths relative to their own directory, and parsing keeps this test
 * from executing arbitrary module code just to read three numbers.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import metadata from '../../velxio/frontend/public/components-metadata.json';
import '@wokwi/elements';
import '@velxio/velxio-elements';
import '@velxio/components/velxio-components/registerAll';
import { BOARD_SIZE } from '@velxio/components/simulator/BoardOnCanvas';
import { circuitFiles } from './circuits';

const PX_PER_MM = 96 / 25.4;

/** Gap below which two parts are close enough to read as touching. */
const MIN_CLEARANCE = 8;

interface Placement {
  id: string;
  metadataId: string;
  x: number;
  y: number;
}

interface Box {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function parseBoard(src: string, name: string): { boardKind: string; x: number; y: number } {
  const boards = [...src.matchAll(/boardKind:\s*'([^']+)'[^}]*?\bx:\s*(-?[\d.]+)[^}]*?\by:\s*(-?[\d.]+)/g)];
  if (boards.length !== 1) {
    throw new Error(`${name}: expected exactly 1 board, found ${boards.length}`);
  }
  return { boardKind: boards[0][1], x: parseFloat(boards[0][2]), y: parseFloat(boards[0][3]) };
}

function parseComponents(src: string, name: string): Placement[] {
  const block = /export const components\s*=\s*\[([\s\S]*?)\n\];/.exec(src);
  if (!block) throw new Error(`${name}: no 'export const components' array`);
  if (/\brotation\b/.test(block[1])) {
    // Rotation swaps the footprint's axes and shifts its origin. No circuit
    // uses it today; raise rather than measure the wrong rectangle.
    throw new Error(`${name}: rotation is not handled by this layout guard`);
  }
  return [...block[1].matchAll(/id:\s*'([^']+)',\s*metadataId:\s*'([^']+)',\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+)/g)].map(
    (m) => ({ id: m[1], metadataId: m[2], x: parseFloat(m[3]), y: parseFloat(m[4]) }),
  );
}

function toPx(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^([\d.]+)\s*(mm|px)?$/.exec(value.trim());
  if (!m) return null;
  return m[2] === 'mm' ? parseFloat(m[1]) * PX_PER_MM : parseFloat(m[1]);
}

const tagByMetadataId = new Map(
  (metadata as { components: { id: string; tagName: string }[] }).components.map((c) => [c.id, c.tagName]),
);

const sizeCache = new Map<string, { w: number; h: number }>();

async function componentSize(metadataId: string): Promise<{ w: number; h: number }> {
  const cached = sizeCache.get(metadataId);
  if (cached) return cached;

  const tagName = tagByMetadataId.get(metadataId);
  if (!tagName) throw new Error(`metadataId '${metadataId}' is not in components-metadata.json`);

  const el = document.createElement(tagName) as HTMLElement & { updateComplete?: Promise<unknown> };
  document.body.appendChild(el);
  await el.updateComplete; // lit-based wokwi elements render on the microtask queue
  // An element's shadow root can hold several svgs, and not necessarily
  // nested: wokwi-buzzer renders its 8x8 music-note overlay as a *sibling* of
  // the 17x20mm body, so neither document order nor tree depth picks the right
  // one. The footprint is the largest by area.
  const measured = [...(el.shadowRoot?.querySelectorAll('svg') ?? [])]
    .map((n) => ({ w: toPx(n.getAttribute('width')), h: toPx(n.getAttribute('height')) }))
    .filter((s): s is { w: number; h: number } => s.w !== null && s.h !== null)
    .sort((a, b) => b.w * b.h - a.w * a.h);
  el.remove();

  if (measured.length === 0) {
    throw new Error(`<${tagName}> did not render a measurable svg (metadataId '${metadataId}')`);
  }
  const size = measured[0];
  sizeCache.set(metadataId, size);
  return size;
}

/** Overlap depth on both axes; positive on both means the boxes intersect. */
function gap(a: Box, b: Box): { dx: number; dy: number } {
  return {
    dx: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    dy: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  };
}

const circuits = circuitFiles();
const boxesByCircuit = new Map<string, Box[]>();

beforeAll(async () => {
  for (const { name, file } of circuits) {
    const src = readFileSync(file, 'utf8');
    const board = parseBoard(src, name);
    const boardSize = BOARD_SIZE[board.boardKind];
    if (!boardSize) throw new Error(`${name}: no BOARD_SIZE entry for '${board.boardKind}'`);

    const boxes: Box[] = [
      { label: board.boardKind, x: board.x, y: board.y, w: boardSize.w, h: boardSize.h },
    ];
    for (const c of parseComponents(src, name)) {
      const { w, h } = await componentSize(c.metadataId);
      boxes.push({ label: `${c.id} (${c.metadataId})`, x: c.x, y: c.y, w, h });
    }
    boxesByCircuit.set(name, boxes);
  }
});

describe('testbench circuit layout', () => {
  it('found circuits to check', () => {
    expect(circuits.length).toBeGreaterThan(0);
  });

  it.each(circuits.map((c) => c.name))('%s places every part clear of the others', (name) => {
    const boxes = boxesByCircuit.get(name)!;
    const collisions: string[] = [];

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const { dx, dy } = gap(a, b);
        if (dx > 0 && dy > 0) {
          collisions.push(
            `${a.label} overlaps ${b.label} by ${dx.toFixed(0)}x${dy.toFixed(0)}px ` +
              `[${a.label}: ${a.x},${a.y} ${a.w.toFixed(0)}x${a.h.toFixed(0)}] ` +
              `[${b.label}: ${b.x},${b.y} ${b.w.toFixed(0)}x${b.h.toFixed(0)}]`,
          );
        } else if (Math.max(-dx, -dy) < MIN_CLEARANCE) {
          collisions.push(
            `${a.label} sits ${Math.max(-dx, -dy).toFixed(0)}px from ${b.label} (want >= ${MIN_CLEARANCE}px)`,
          );
        }
      }
    }

    expect(collisions).toEqual([]);
  });
});
