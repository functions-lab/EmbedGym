// @vitest-environment jsdom
/**
 * HM-10 on bridge boards (ESP32-S3, nRF52840): the part registers its circuit
 * facts with the worker model (embedgym_parts/hm10.py), forwards the element's
 * controller calls as one-off sensor actions, and takes the element state the
 * worker reports as `part_state`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = MockWebSocket.CLOSED; this.onclose?.(); }
  receive(payload: object) { this.onmessage?.({ data: JSON.stringify(payload) }); }
}
vi.stubGlobal('WebSocket', MockWebSocket);

const state = vi.hoisted(() => ({ circuit: {} as any }));
vi.mock('@velxio/store/useSimulatorStore', () => ({ getBoardSimulator: () => null, useSimulatorStore: { getState: () => state.circuit } }));
vi.mock('@velxio/simulation/RP2040Simulator', () => ({ RP2040Simulator: class {} }));

import { Esp32Bridge } from '@velxio/simulation/Esp32Bridge';
import { Hm10Element } from '../../elements/Hm10Element';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import '../../sim/Hm10';

const wire = (a: string, ap: string, b: string, bp: string) => ({ start: { componentId: a, pinName: ap }, end: { componentId: b, pinName: bp } });
const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0).reverse()) dispose(); });

function setup(extraComponents: object[] = [], extraWires: object[] = []) {
  state.circuit = {
    boards: [{ id: 'board', boardKind: 'esp32-s3' }],
    components: [{ id: 'radio', metadataId: 'hm10' }, { id: 'series', metadataId: 'resistor', properties: { value: '1000' } },
      { id: 'pull', metadataId: 'resistor', properties: { value: '10000' } }, ...extraComponents],
    wires: [wire('board', '3V3.1', 'radio', 'VCC'), wire('radio', 'GND', 'board', 'GND.1'), wire('board', '4', 'radio', 'TXD'),
      wire('board', '5', 'radio', 'RXD'), wire('radio', 'PIO1', 'board', '6'), wire('radio', 'PIO4', 'series', '1'),
      wire('series', '2', 'board', '15'), wire('radio', 'PIO6', 'pull', '1'), wire('pull', '2', 'board', '3V3.2'), ...extraWires],
  };
  const bridge = new Esp32Bridge('hm10-bridge', 'esp32-s3');
  bridge.connect();
  const ws = (bridge as unknown as { socket: MockWebSocket }).socket;
  ws.onopen?.();
  const registered: Array<[string, number, Record<string, unknown>]> = [];
  const sim = { getBridge: () => bridge, registerSensor: (type: string, pin: number, props: Record<string, unknown>) => { registered.push([type, pin, props]); return true; },
    unregisterSensor: vi.fn(), mcuPinDrive: () => ({ voltage: 3.3, resistance: 25 }) };
  const el = new Hm10Element();
  const attach = () => PartSimulationRegistry.get('hm10')!.attachEvents!(el, sim as never, () => null, 'radio');
  return { bridge, ws, sim, el, registered, attach };
}

describe('HM-10 bridge registration', () => {
  it('registers UART GPIOs, pad nets, settings and the partner on virtual pin 300', () => {
    const { registered, attach } = setup();
    disposers.push(attach());
    const [type, pin, props] = registered[0];
    expect([type, pin]).toEqual(['hm10', 300]);
    expect(props.tx_pin).toBe(4);
    expect(props.rx_pin).toBe(5);
    expect(props.rx_net).toEqual({ series: 0, high: 3.3, load: null });
    expect(props.pads).toEqual({ PIO1: { gpio: 6, series: 0, high: 3.3, load: null }, PIO4: { gpio: 15, series: 1000, high: 3.3, load: null },
      PIO6: { gpio: null, series: null, high: null, load: { voltage: 3.3, resistance: 10000 } } });
    expect(props.pressed).toEqual([]);
    expect(props.identity).toBe('00112233ABCD');
    expect((props.retained as Record<string, unknown>).mode).toBe(0);
    expect((props.partner as Record<string, unknown>).address).toBe('A1B2C3D4E5F6');
  });

  it('forwards controller calls as actions and applies reported state', () => {
    const { ws, el, attach } = setup();
    disposers.push(attach());
    el.remoteOn();
    el.sendRemote([0x31, 0x00]);
    const actions = ws.sent.map((raw) => JSON.parse(raw)).filter((msg) => msg.type === 'esp32_sensor_update').map((msg) => msg.data);
    expect(actions.map((data) => [data.pin, data.action, data.data])).toEqual([[300, 'remoteOn', undefined], [300, 'sendRemote', [0x31, 0]]]);
    expect(actions[0].partner.pin).toBe('000000');
    ws.receive({ type: 'part_state', data: { pin: 300, values: { connected: true, remoteRxHex: '4f4b', status: true }, t_ns: 5 } });
    expect(el.connected).toBe(true);
    expect(el.remoteRxHex).toBe('4f4b');
    expect(() => ws.receive({ type: 'part_state', data: { pin: 300, values: { bogus: 1 } } })).toThrow(/unknown state bogus/);
  });

  it('sees a GPIO behind a level-shifter channel at LV, with the LV pull-up as a load', () => {
    const { registered, attach } = setup([{ id: 'shifter', metadataId: 'level-shifter' }],
      [wire('radio', 'UART_CTS', 'shifter', 'LV2'), wire('shifter', 'HV2', 'board', '7'), wire('board', '5V', 'shifter', 'HV'), wire('board', '3V3.1', 'shifter', 'LV')]);
    disposers.push(attach());
    expect((registered[0][2].pads as Record<string, unknown>).UART_CTS).toEqual({ gpio: 7, series: 0, high: 3.3, load: { voltage: 3.3, resistance: 10000 } });
  });

  it('rejects circuits the model does not cover', () => {
    expect(() => setup([{ id: 'lamp', metadataId: 'led' }], [wire('radio', 'PIO2', 'lamp', 'A')]).attach()).toThrow(/PIO2 connects only to MCU GPIOs, level-shifter channels and board rails/);
    expect(() => setup([], [wire('board', '3V3.1', 'radio', 'VCC12')]).attach()).toThrow(/VCC12 is not modeled/);
    const { attach } = setup();
    disposers.push(attach());
    expect(attach).toThrow(/one module per board/);
  });
});
