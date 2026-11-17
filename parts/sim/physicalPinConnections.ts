import { isBreadboard, unionBreadboardGroups } from '@velxio/utils/breadboardNets';
import { UnionFind } from '@velxio/simulation/spice/unionFind';
import { parseValueWithUnits } from '@velxio/simulation/spice/valueParser';
import type { PinDrive } from '@velxio/simulation/PhysicalPinDrives';

interface Endpoint { componentId: string; pinName: string }
interface Connection { endpoint: Endpoint; resistance: number; path: string[] }
interface Circuit {
  wires: Array<{ start: Endpoint; end: Endpoint }>;
  components: Array<{ id: string; metadataId?: string; properties?: Record<string, unknown> }>;
  boards: Array<{ id: string; boardKind: string }>;
}

export function physicalPinConnections(circuit: Circuit, component: string, pin: string): Connection[] {
  const uf = new UnionFind();
  const key = (endpoint: Endpoint) => `${endpoint.componentId}:${endpoint.pinName}`;
  for (const wire of circuit.wires) uf.union(key(wire.start), key(wire.end));
  unionBreadboardGroups(uf, circuit.components, circuit.wires, (id, name) => `${id}:${name}`);
  const resistors = circuit.components.filter((part) => part.metadataId === 'resistor' || part.metadataId === 'resistor-10k');
  const connections: Connection[] = [];
  const visit = (net: string, resistance: number, visited: Set<string>, path: string[]) => {
    if (visited.has(net)) throw new Error('physical pin connection: resistor loops require the electrical solver');
    const nextVisited = new Set(visited).add(net);
    const endpoints = [...uf.entries()].filter(([, endpointNet]) => endpointNet === net).map(([endpointKey]) => {
      const split = endpointKey.lastIndexOf(':');
      return { componentId: endpointKey.slice(0, split), pinName: endpointKey.slice(split + 1) };
    });
    const sources = endpoints.filter((endpoint) => {
      const board = circuit.boards.some((part) => part.id === endpoint.componentId);
      return (board && /^(GND([._]?\d+)?|5V|VDD|(3V3|3\.3V)([._]?\d+)?)$/.test(endpoint.pinName)) ||
        (endpoint.componentId === component && ['GND', '3Vo'].includes(endpoint.pinName) && endpoint.pinName !== pin);
    });
    if (sources.length) {
      const distinct = new Map<string, Endpoint>();
      for (const endpoint of sources) {
        const voltage = endpoint.componentId === component && endpoint.pinName === 'GND' ? 0 : endpoint.pinName === '3Vo' ? 3.3 : railDrive(circuit, { endpoint, resistance, path })?.voltage;
        distinct.set(String(voltage), endpoint);
      }
      connections.push(...[...distinct.values()].map((endpoint) => ({ endpoint, resistance, path })));
      if (path.length === 0) {
        for (const endpoint of endpoints) {
          if (sources.includes(endpoint) || (endpoint.componentId === component && endpoint.pinName === pin)) continue;
          const part = circuit.components.find((candidate) => candidate.id === endpoint.componentId);
          if (part && (isBreadboard(part.metadataId ?? '') || resistors.includes(part))) continue;
          connections.push({ endpoint, resistance, path });
        }
      }
      return;
    }
    for (const [endpointKey, endpointNet] of uf.entries()) {
      if (endpointNet !== net) continue;
      const split = endpointKey.lastIndexOf(':');
      const endpoint = { componentId: endpointKey.slice(0, split), pinName: endpointKey.slice(split + 1) };
      if (endpoint.componentId === component && endpoint.pinName === pin) continue;
      if (circuit.components.some((part) => part.id === endpoint.componentId && isBreadboard(part.metadataId ?? ''))) continue;
      const resistor = resistors.find((part) => part.id === endpoint.componentId);
      if (resistor) {
        if (endpoint.pinName !== '1' && endpoint.pinName !== '2') throw new Error('physical pin connection: invalid resistor pad');
        const ohms = resistor.metadataId === 'resistor-10k' ? 10000 : parseValueWithUnits(resistor.properties?.value);
        if (!Number.isFinite(ohms) || ohms <= 0) throw new Error('physical pin connection: resistor needs a positive resistance');
        const other = uf.find(`${resistor.id}:${endpoint.pinName === '1' ? '2' : '1'}`);
        if (path.includes(resistor.id)) continue;
        if (nextVisited.has(other)) throw new Error('physical pin connection: resistor loops require the electrical solver');
        visit(other, resistance + ohms, nextVisited, [...path, resistor.id]);
      } else connections.push({ endpoint, resistance, path });
    }
  };
  visit(uf.find(`${component}:${pin}`), 0, new Set(), []);
  const seen = new Map<string, string>();
  for (const connection of connections) {
    for (const resistor of connection.path) {
      if (seen.has(resistor) && seen.get(resistor) !== connection.path.join(':')) throw new Error('physical pin connection: coupled resistor branches require the electrical solver');
      seen.set(resistor, connection.path.join(':'));
    }
  }
  return connections;
}

export function railDrive(circuit: Circuit, connection: Connection, supplies: ReadonlyMap<string, number> = new Map()): PinDrive | null {
  const { endpoint, resistance } = connection;
  const supplied = supplies.get(`${endpoint.componentId}:${endpoint.pinName}`);
  if (supplied !== undefined) return { voltage: supplied, resistance: Math.max(0.01, resistance) };
  const board = circuit.boards.find((part) => part.id === endpoint.componentId);
  if (!board) return null;
  if (/^GND([._]?\d+)?$/.test(endpoint.pinName)) return { voltage: 0, resistance: Math.max(0.01, resistance) };
  if (endpoint.pinName === '5V') return { voltage: 5, resistance: Math.max(0.01, resistance) };
  if (/^(VDD|(3V3|3\.3V)([._]?\d+)?)$/.test(endpoint.pinName)) return { voltage: 3.3, resistance: Math.max(0.01, resistance) };
  return null;
}
