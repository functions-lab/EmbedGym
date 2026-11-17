/**
 * Guard: no board signal pin in a testbench circuit.ts may be wired to more
 * than one part, except distinct parts sharing an I2C bus.
 *
 * A shared pin is invisible to `run.sh` on the part that still behaves: the
 * benchmark's safebox_display put a relay input and a keypad column on one
 * GPIO, and every relay assertion passed while a quarter of the keypad
 * silently mis-scanned. The rule lives in the harness (checkSharedPins) so a
 * graded run raises on it; this sweep applies the same rule to every circuit
 * in the tree at once, so a bad circuit is caught when it is authored rather
 * than when someone runs that one task.
 *
 * Circuits are parsed, not imported, for the reason the layout guard gives:
 * they carry type-only imports pointing at frontend paths relative to their
 * own directory.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkSharedPins, UNWIRED_PARTS, type CircuitLike } from '../resolve_role';
import { circuitFiles } from './circuits';

function parseBoard(src: string, name: string): { id: string; kind: string } {
  const boards = [...src.matchAll(/\bid:\s*'([^']+)',\s*boardKind:\s*'([^']+)'/g)];
  if (boards.length !== 1) {
    throw new Error(`${name}: expected exactly 1 board, found ${boards.length}`);
  }
  return { id: boards[0][1], kind: boards[0][2] };
}

// Worker-driven outputs that swing to the part's supply. SPICE never solves
// these pins, so nothing else catches a 5 V swing on a 3.3 V GPIO.
const SUPPLY_LEVEL_OUTPUTS: Record<string, { supply: string; outputs: string[] }> = {
  'hc-sr04': { supply: 'VCC', outputs: ['ECHO'] },
  ds1307: { supply: '5V', outputs: ['SDA', 'SCL'] },
  'shock-sensor': { supply: 'VCC', outputs: ['signal'] },
};
const BOARD_5V_PIN: Record<string, string> = { 'esp32-s3': '5V', 'nrf52840-dk': '5V' };

// The component pins on one net: wires plus resistors, but not level-shifter
// channels, which translate the level rather than pass it.
function netOf(circuit: CircuitLike, componentId: string, pinName: string): Set<string> {
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  };
  for (const w of circuit.wires) link(`${w.start.componentId}:${w.start.pinName}`, `${w.end.componentId}:${w.end.pinName}`);
  for (const c of circuit.components) {
    if (c.metadataId === 'resistor' || c.metadataId === 'resistor-10k') link(`${c.id}:1`, `${c.id}:2`);
  }
  const net = new Set([`${componentId}:${pinName}`]);
  for (const node of net) {
    for (const n of adj.get(node) ?? []) net.add(n);
  }
  return net;
}

function supplyLevelProblems(circuit: CircuitLike, board: { id: string; kind: string }): string[] {
  const board5V = BOARD_5V_PIN[board.kind];
  if (!board5V) return [];
  const problems: string[] = [];
  for (const c of circuit.components) {
    const rule = SUPPLY_LEVEL_OUTPUTS[c.metadataId];
    if (!rule || !netOf(circuit, c.id, rule.supply).has(`${board.id}:${board5V}`)) continue;
    for (const output of rule.outputs) {
      const boardPins = [...netOf(circuit, c.id, output)].filter((n) => n.startsWith(`${board.id}:`));
      if (boardPins.length) problems.push(`${c.id} ${output} swings to 5 V on ${boardPins.join(', ')}`);
    }
  }
  return problems;
}

function parseCircuit(src: string, name: string): CircuitLike {
  const block = /export const components\s*=\s*\[([\s\S]*?)\n\];/.exec(src);
  if (!block) throw new Error(`${name}: no 'export const components' array`);
  const components = [...block[1].matchAll(/id:\s*'([^']+)',\s*metadataId:\s*'([^']+)'/g)].map(
    (m) => ({ id: m[1], metadataId: m[2] }),
  );

  const wireBlock = /export const wires[^=]*=\s*\[([\s\S]*?)\s*\];/.exec(src);
  if (!wireBlock) throw new Error(`${name}: no 'export const wires' array`);
  const endpoint = /componentId:\s*'([^']+)',\s*pinName:\s*'([^']*)'/g;
  const wires = [];
  // Split on wire-entry boundaries, not newlines: some circuits wrap one wire
  // across three lines to keep the endpoints readable.
  for (const entry of wireBlock[1].split(/\{\s*id:/)) {
    const eps = [...entry.matchAll(endpoint)];
    if (eps.length === 0) continue;
    if (eps.length !== 2) throw new Error(`${name}: expected 2 endpoints per wire, found ${eps.length}`);
    wires.push({
      start: { componentId: eps[0][1], pinName: eps[0][2] },
      end: { componentId: eps[1][1], pinName: eps[1][2] },
    });
  }
  // Only a circuit of unwired parts (`wifi`) may have no wires; anything else
  // parsing as empty means the wire regex missed the entries.
  const allUnwired = components.length > 0 && components.every((c) => UNWIRED_PARTS.has(c.metadataId));
  if (wires.length === 0 && !allUnwired) throw new Error(`${name}: 'wires' array parsed as empty`);

  return { components, wires };
}

const circuits = circuitFiles();

describe('testbench circuit wiring', () => {
  it('found circuits to check', () => {
    expect(circuits.length).toBeGreaterThan(0);
  });

  it.each(circuits.map((c) => c.name))('%s wires each signal pin to one part or one I2C bus', (name) => {
    const { file } = circuits.find((c) => c.name === name)!;
    const src = readFileSync(file, 'utf8');
    const circuit = parseCircuit(src, name);
    checkSharedPins(circuit, parseBoard(src, name).id);
  });

  it.each(circuits.map((c) => c.name))('%s puts a level shifter between each 5 V-swinging output and a GPIO', (name) => {
    const { file } = circuits.find((c) => c.name === name)!;
    const src = readFileSync(file, 'utf8');
    expect(supplyLevelProblems(parseCircuit(src, name), parseBoard(src, name))).toEqual([]);
  });
});
