// Wire-graph checks over a circuit.ts: resolve a `{part, name, pin?}` row to a
// component id, reject a board signal pin wired to more than one part (except
// distinct parts sharing an I2C bus), and reject parts wired to each other.
// Split out of jsonl_spec.ts because it is self-contained graph logic with no
// bearing on the test.jsonl grammar.

import { LEVEL_SHIFTER_CHANNELS } from '../velxio/frontend/src/simulation/levelShifter.ts';

export interface WireEndpoint { componentId: string; pinName: string; }
export interface WireLike { start: WireEndpoint; end: WireEndpoint; }
export interface ComponentLike { id: string; metadataId: string; }
export interface CircuitLike { components: ComponentLike[]; wires: WireLike[]; }

// The parts a trace walks through, as groups of pins that each act as one
// node: a level shifter passes a signal only between HVn and LVn of one
// channel. Every other metadataId terminates a trace.
export const PASS_THROUGH: ReadonlyMap<string, ReadonlyArray<readonly string[]>> = new Map([
  ['resistor', [['1', '2']]],
  ['resistor-10k', [['1', '2']]],
  ['level-shifter', LEVEL_SHIFTER_CHANNELS],
]);

function passThroughGroup(metadataId: string, pin: string): readonly string[] | null {
  return PASS_THROUGH.get(metadataId)?.find((group) => group.includes(pin)) ?? null;
}

// Board rail pins. A rail is a return path, not a signal path, so it is never
// the start of a shared-pin trace.
const RAIL_PIN_RE = /^(gnd|vss|vee|ground|vcc|vdd|5v|3v3|3\.3v|vin|aref)([._]?\d+)?$/i;

interface Graph {
  adj: Map<string, string[]>;
  partOf: Map<string, string>;
  pinsOf: Map<string, Set<string>>;
}

interface Reached { cid: string; pin: string; metadataId: string; }

const key = (cid: string, pin: string) => `${cid}\u0000${pin}`;

const split = (node: string): [string, string] => {
  const sep = node.indexOf('\u0000');
  return [node.slice(0, sep), node.slice(sep + 1)];
};

function buildGraph(circuit: CircuitLike): Graph {
  const adj = new Map<string, string[]>();
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };
  const partOf = new Map<string, string>();
  const pinsOf = new Map<string, Set<string>>();
  for (const c of circuit.components) partOf.set(c.id, c.metadataId);
  for (const w of circuit.wires) {
    addEdge(key(w.start.componentId, w.start.pinName), key(w.end.componentId, w.end.pinName));
    addEdge(key(w.end.componentId, w.end.pinName), key(w.start.componentId, w.start.pinName));
    for (const ep of [w.start, w.end]) {
      if (!pinsOf.has(ep.componentId)) pinsOf.set(ep.componentId, new Set());
      pinsOf.get(ep.componentId)!.add(ep.pinName);
    }
  }
  return { adj, partOf, pinsOf };
}

// The nodes on one net with `node`: the pins wired to it and the other pins of
// its pass-through group.
function neighbors(g: Graph, node: string): string[] {
  const [cid, pin] = split(node);
  const group = passThroughGroup(g.partOf.get(cid) ?? '', pin) ?? [];
  return [...(g.adj.get(node) ?? []), ...group.map((other) => key(cid, other))];
}

// BFS from one board pin across pass-through parts, yielding every component
// pin reached; any other part ends the trace. Board pins other than the start
// are dead ends: a rail carries the return of every part in the circuit, so
// walking into one would make everything reachable from everything.
function* walk(g: Graph, boardId: string, startPin: string): Generator<Reached> {
  const start = key(boardId, startPin);
  const seen = new Set<string>([start]);
  const queue: string[] = [start];

  while (queue.length) {
    const node = queue.shift()!;
    const [cid, pin] = split(node);
    if (cid === boardId && node !== start) continue;
    if (cid !== boardId) yield { cid, pin, metadataId: g.partOf.get(cid) ?? '' };

    for (const n of neighbors(g, node)) {
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
}

// Every net of the circuit, as its nodes: wired pins joined across
// pass-through groups. Unlike `walk`, a net runs on through board pins.
function nets(g: Graph): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const start of g.adj.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const net = [start];
    for (let i = 0; i < net.length; i++) {
      for (const n of neighbors(g, net[i])) {
        if (!seen.has(n)) { seen.add(n); net.push(n); }
      }
    }
    result.push(net);
  }
  return result;
}

// The board signal pins each component reaches through pass-through parts, in
// the order the circuit's wires first name them. Pass-through parts and parts
// on no signal pin are absent.
export function boardPinsByComponent(circuit: CircuitLike, boardId: string): Map<string, string[]> {
  const g = buildGraph(circuit);
  const pins = new Map<string, string[]>();
  for (const pin of g.pinsOf.get(boardId) ?? []) {
    if (RAIL_PIN_RE.test(pin)) continue;
    for (const node of walk(g, boardId, pin)) {
      if (PASS_THROUGH.has(node.metadataId)) continue;
      if (!pins.has(node.cid)) pins.set(node.cid, []);
      const list = pins.get(node.cid)!;
      if (!list.includes(pin)) list.push(pin);
    }
  }
  return pins;
}

// Trace from the board's signal pin to the component a test.jsonl circuit row
// names, crossing pass-through parts only.
export function resolveRole(
  circuit: CircuitLike,
  boardId: string,
  startPin: string,
  part: string,
): string {
  const g = buildGraph(circuit);
  const found = new Set<string>();
  for (const node of walk(g, boardId, startPin)) {
    if (node.metadataId === part) found.add(node.cid);
  }
  if (found.size === 0) throw new Error(`no '${part}' component reachable from board pin ${startPin}`);
  if (found.size > 1) {
    throw new Error(`board pin ${startPin} reaches ${found.size} '${part}' components: ${[...found].join(', ')}`);
  }
  return [...found][0];
}

// Parts that never carry wires, so their circuit rows have no board pin to
// trace from: the role is the one component of that type.
export const UNWIRED_PARTS: ReadonlySet<string> = new Set(['wifi', 'ble']);

export function resolveUnwiredRole(circuit: CircuitLike, part: string): string {
  if (!UNWIRED_PARTS.has(part)) {
    throw new Error(`'${part}' is wired to the board; its row needs the board "pin"`);
  }
  const matches = circuit.components.filter((c) => c.metadataId === part);
  if (matches.length !== 1) {
    throw new Error(`a row without "pin" needs exactly one '${part}' component, found ${matches.length}`);
  }
  const { id } = matches[0];
  if (circuit.wires.some((w) => w.start.componentId === id || w.end.componentId === id)) {
    throw new Error(`'${id}' (${part}) has wires — give its row the board "pin" it is wired to`);
  }
  return id;
}

const I2C_BUS_PINS = new Set(['SDA', 'SCL']);

// A board signal pin may drive exactly one part. Two pins may share a part (a
// keypad uses eight), but one pin reaching two parts means the parts fight over
// the same net — the reason safebox_display's relay silently corrupted a keypad
// scan. The exception is an I2C bus: several parts may share it when every one
// is reached only through its SDA/SCL pins, has both wired, and no two have the same metadataId,
// so resolving a role by part type stays unambiguous. Runs once per circuit at
// load, independent of any test.jsonl row.
export function checkSharedPins(circuit: CircuitLike, boardId: string): void {
  const g = buildGraph(circuit);
  const problems: string[] = [];

  for (const pin of g.pinsOf.get(boardId) ?? []) {
    if (RAIL_PIN_RE.test(pin)) continue;
    const parts = new Map<string, { metadataId: string; pins: Set<string> }>();
    for (const node of walk(g, boardId, pin)) {
      if (PASS_THROUGH.has(node.metadataId)) continue;
      if (!parts.has(node.cid)) parts.set(node.cid, { metadataId: node.metadataId, pins: new Set() });
      parts.get(node.cid)!.pins.add(node.pin);
    }
    if (parts.size < 2) continue;

    const describe = [...parts].map(([cid, p]) => `${cid} (${p.metadataId}) via ${[...p.pins].join('/')}`);
    // A part pin merely named SDA (a DHT22's data line) is no I2C device: every
    // part on a shared bus must have both its SDA and SCL wired.
    const wiredPins = (cid: string) => new Set(
      circuit.wires.flatMap((w) => [w.start, w.end]).filter((e) => e.componentId === cid).map((e) => e.pinName),
    );
    const i2cOnly = [...parts].every(([cid, p]) =>
      [...p.pins].every((n) => I2C_BUS_PINS.has(n)) && [...I2C_BUS_PINS].every((n) => wiredPins(cid).has(n)));
    const types = new Set([...parts.values()].map((p) => p.metadataId));
    if (!i2cOnly) {
      problems.push(`board pin ${pin} is wired to ${parts.size} parts: ${describe.join(', ')}`);
    } else if (types.size < parts.size) {
      problems.push(`board pin ${pin} is an I2C bus with two parts of the same type: ${describe.join(', ')}`);
    }
  }

  if (problems.length) {
    throw new Error(`${problems.join('; ')} — one signal pin may drive one part, or distinct parts on an I2C bus`);
  }
}

// Parts whose terminals are supply rails, like the board's.
const SUPPLY_PARTS: ReadonlySet<string> = new Set(['battery-9v', 'power-supply']);

// Parts connect to each other only through board pins, which checkSharedPins
// limits to one part each: a net that reaches no board pin and no supply part
// may join only one part besides pass-through parts. Runs once per circuit at
// load, independent of any test.jsonl row.
export function checkPartToPartNets(circuit: CircuitLike, boardId: string): void {
  const g = buildGraph(circuit);
  const problems: string[] = [];

  for (const net of nets(g)) {
    const parts = new Map<string, { metadataId: string; pins: string[] }>();
    let boardOrSupply = false;
    for (const node of net) {
      const [cid, pin] = split(node);
      const metadataId = g.partOf.get(cid) ?? '';
      if (cid === boardId || SUPPLY_PARTS.has(metadataId)) {
        boardOrSupply = true;
      } else if (!PASS_THROUGH.has(metadataId)) {
        if (!parts.has(cid)) parts.set(cid, { metadataId, pins: [] });
        parts.get(cid)!.pins.push(pin);
      }
    }
    if (boardOrSupply || parts.size < 2) continue;
    const describe = [...parts].map(([cid, p]) => `${cid} (${p.metadataId}) via ${p.pins.join('/')}`);
    problems.push(`a net with no board pin joins ${parts.size} parts: ${describe.join(', ')}`);
  }

  if (problems.length) {
    throw new Error(`${problems.join('; ')} — parts connect to each other only through board pins`);
  }
}
