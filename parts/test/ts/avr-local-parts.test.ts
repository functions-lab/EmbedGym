/**
 * The AVR as embedgym_parts/registry.py's host: a registered part's Python model sits
 * on the TWI bus, keeps time in CPU cycles and drives its pins.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVRSimulator } from '@velxio/simulation/AVRSimulator';
import { PinManager } from '@velxio/simulation/PinManager';
import { loadPythonModels } from '@velxio/simulation/python/PythonModels';

// Sets pin 13 HIGH, then RJMP-to-self forever.
const BLINK_HEX = ':0A0000000FEF04B900E205B9FFCFCD\n' + ':00000001FF\n';
const PIN = 200 + 0x1e;
const DRDY = 2;
// ATmega328P: DDRB 0x24, PIND 0x29, PORTD 0x2B.
const DDRB = 0x24;
const PIND = 0x29;
const PORTD = 0x2b;
// ATmega2560 USART1.
const UCSR1A = 0xc8;
const UCSR1B = 0xc9;
const UCSR1C = 0xca;
const UBRR1L = 0xcc;
const UDR1 = 0xce;

let rafQueue: FrameRequestCallback[] = [];

beforeAll(() => loadPythonModels());
beforeEach(() => {
  rafQueue = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

function runningSim(pins = new PinManager()): AVRSimulator {
  const sim = new AVRSimulator(pins);
  sim.loadHex(BLINK_HEX);
  sim.start();
  return sim;
}

async function runToMs(sim: AVRSimulator, ms: number): Promise<void> {
  const parked = sim.runToCycle(ms * 16_000);
  for (let frame = 0; rafQueue.length > 0 && frame < 1000; frame++) {
    const callbacks = rafQueue;
    rafQueue = [];
    for (const cb of callbacks) cb(frame * 1000);
  }
  await parked;
}

function device(sim: AVRSimulator) {
  return sim.getI2CBus().listDevices().find((d) => d.address === 0x1e);
}

function readRegisters(sim: AVRSimulator, reg: number, count: number): number[] {
  const dev = device(sim)!;
  expect(dev.acknowledgeAddress!(true)).toBe(true);
  dev.writeByte(reg);
  dev.stop!();
  expect(dev.acknowledgeAddress!(false)).toBe(true);
  const bytes = Array.from({ length: count }, () => dev.readByte());
  dev.stop!();
  return bytes;
}

describe('AVR local parts', () => {
  it('declines before the CPU exists and for parts without a local model', () => {
    const sim = new AVRSimulator(new PinManager());
    expect(sim.registerSensor('hmc5883l', PIN, { addr: 0x1e })).toBe(false);
    expect(runningSim().registerSensor('dht22', 4, {})).toBe(false);
  });

  it('measures on the CPU clock, pulses DRDY and takes field updates', async () => {
    const sim = runningSim();
    const levels: [number, boolean][] = [];
    sim.onLineChange(DRDY, (high) => levels.push([sim.getCurrentCycles() / 16_000, high]));
    expect(sim.registerSensor('hmc5883l', PIN, { addr: 0x1e, int_pin: DRDY, magneticX: 0.5 })).toBe(true);

    // The first measurement lands 56 ms after power-on; status bit 0 is RDY.
    await runToMs(sim, 55);
    expect(readRegisters(sim, 9, 1)).toEqual([0]);
    await runToMs(sim, 57);
    expect(readRegisters(sim, 9, 1)).toEqual([1]);
    expect(readRegisters(sim, 3, 2)).toEqual([545 >> 8, 545 & 0xff]);
    // DRDY idles HIGH and pulses LOW for 250 µs at the measurement.
    expect(levels.map(([ms, high]) => [Math.round(ms * 100) / 100, high])).toEqual([[0, true], [56, false], [56.25, true]]);

    sim.updateSensor(PIN, { magneticX: -0.5 });
    expect(device(sim)).toBeDefined();
    sim.unregisterSensor(PIN);
    expect(device(sim)).toBeUndefined();
  });

  it('turns a model ValueError into the plain Error a part throws', () => {
    const sim = runningSim();
    expect(() => sim.registerSensor('hmc5883l', PIN, { addr: 0x1f })).toThrow(/^hmc5883l: the address is 0x1e, got 0x1f$/);
    sim.registerSensor('hmc5883l', PIN, { addr: 0x1e });
    expect(() => sim.updateSensor(PIN, { magneticX: 200 })).toThrow(/^hmc5883l: magneticX must be finite/);
  });

  it('answers a DHT11 start signal on the line, at the CPU clock', async () => {
    const sim = runningSim();
    const falls: number[] = [];
    sim.onLineChange(4, (high) => { if (!high) falls.push(sim.getCurrentCycles() / 16); });
    expect(sim.registerSensor('dht11', 4, { temperature: 21, humidity: 40 })).toBe(true);
    await runToMs(sim, 1);
    sim.setPinState(4, false);
    await runToMs(sim, 19);
    sim.setPinState(4, true);
    await runToMs(sim, 25);
    // The start signal, the response LOW, 40 bits and the closing LOW.
    expect(falls).toHaveLength(43);
    expect(Math.round(falls[1] - falls[0])).toBe(18_020);
    expect(() => sim.updateSensor(4, { humidity: 95 })).toThrow(/^dht11: humidity 95 is outside 20\.\.90$/);
    sim.unregisterSensor(4);
  });

  it('echoes an HC-SR04 TRIG pulse on ECHO for the round trip', async () => {
    const sim = runningSim();
    const echo: [number, boolean][] = [];
    sim.onLineChange(6, (high) => echo.push([Math.round(sim.getCurrentCycles() / 16), high]));
    expect(sim.registerSensor('hc-sr04', 5, { distance: 100, echo_pin: 6 })).toBe(true);
    await runToMs(sim, 1);
    sim.pinManager.triggerPinChange(5, true, 'mcu');
    await runToMs(sim, 1.01);
    sim.pinManager.triggerPinChange(5, false, 'mcu');
    await runToMs(sim, 10);
    // ECHO rises 600 µs after TRIG falls, for 58.3 µs per cm.
    expect(echo).toEqual([[1_610, true], [1_610 + 5_831, false]]);
  });

  it('turns a KY-040 detent as four edges and holds a PIR pulse, on the CPU clock', async () => {
    const sim = runningSim();
    const edges: [number, number, boolean][] = [];
    for (const pin of [2, 3, 7]) sim.onLineChange(pin, (high) => edges.push([pin, Math.round(sim.getCurrentCycles() / 16_000), high]));
    expect(sim.registerSensor('ky-040', 2, { dt_pin: 3, pressed: false }, undefined, () => ({ dt_pin: 3, pressed: false }))).toBe(true);
    expect(sim.registerSensor('pir-motion-sensor', 7, {}, undefined, () => ({}))).toBe(true);
    await runToMs(sim, 1);
    sim.updateSensor(2, { step: 'cw' });
    sim.updateSensor(7, { trigger: true });
    await runToMs(sim, 3100);
    // CLK and DT idle HIGH; a detent's edges are 12.5 ms apart.
    expect(edges).toEqual([[2, 0, true], [3, 0, true], [2, 1, false], [7, 1, true], [3, 14, false], [2, 26, true], [3, 39, true],
      [7, 3001, false]]);
    sim.updateSensor(2, { pressed: true });
    await runToMs(sim, 3200);
    expect(edges.length).toBe(8);
  });

  it('resolves a keypad scan on the pin modes, before the next instruction', () => {
    const sim = runningSim();
    const cpu = (sim as unknown as { cpu: { writeData(addr: number, value: number): void; readData(addr: number): number } }).cpu;
    const rows = () => (cpu.readData(PIND) >> 4) & 0xf;
    // Rows R1-R4 on D4-D7, columns C1-C4 on D8-D11.
    expect(sim.registerSensor('membrane-keypad', 4, {
      r2_pin: 5, r3_pin: 6, r4_pin: 7, c1_pin: 8, c2_pin: 9, c3_pin: 10, c4_pin: 11, keys: [],
    })).toBe(true);
    cpu.writeData(PORTD, 0xf0);
    sim.updateSensor(4, { keys: [[1, 2]] });
    expect(rows()).toBe(0b1111);
    // Keypad.h strobes a column LOW, then parks it at high impedance.
    cpu.writeData(DDRB, 1 << 2);
    expect(rows()).toBe(0b1101);
    cpu.writeData(DDRB, 0);
    expect(rows()).toBe(0b1111);
    expect(() => sim.updateSensor(4, { keys: [[4, 0]] })).toThrow(/^membrane-keypad: no key at row 4, column 0$/);
  });

  it('streams NMEA into USART1 a 9600-baud frame per byte, past a two-byte receive buffer', async () => {
    const sim = new AVRSimulator(new PinManager(), 'mega');
    sim.loadHex(BLINK_HEX);
    sim.start();
    const cpu = (sim as unknown as { cpu: { writeData(addr: number, value: number): void; readData(addr: number): number } }).cpu;
    // Serial1.begin(9600) with the receiver only; interrupts stay off, so nothing reads UDR1.
    cpu.writeData(UBRR1L, 103);
    cpu.writeData(UCSR1C, 0x06);
    cpu.writeData(UCSR1B, 0x10);
    const fix: [number, boolean][] = [];
    sim.onLineChange(4, (high) => fix.push([Math.round(sim.getCurrentCycles() / 16), high]));
    expect(sim.registerSensor('pa1616s', 19, { rx_pin: 18, fix_pin: 4, fix: false })).toBe(true);
    await runToMs(sim, 1001);
    expect(cpu.readData(UCSR1A) & 0x80).toBe(0);
    expect(fix).toContainEqual([1_000_000, true]);
    // "$GPGGA…": '$' and 'G' wait in the buffer, 'P' is overrun, the next 'G' lands after a read.
    await runToMs(sim, 1003.5);
    expect([cpu.readData(UDR1), cpu.readData(UDR1)].map((b) => String.fromCharCode(b))).toEqual(['$', 'G']);
    await runToMs(sim, 1004.5);
    expect(String.fromCharCode(cpu.readData(UDR1))).toBe('G');
    expect(() => sim.updateSensor(19, { latitude: Number.NaN })).toThrow(/^pa1616s: latitude must be a finite number/);
  });

  it('answers an HM-10 AT command on USART1 and re-attaches it on a reset with the props it gives then', async () => {
    const sim = new AVRSimulator(new PinManager(), 'mega');
    sim.loadHex(BLINK_HEX);
    sim.start();
    const cpu = (sim as unknown as { cpu: { writeData(addr: number, value: number): void; readData(addr: number): number } }).cpu;
    // Serial1.begin(9600): receiver and transmitter.
    cpu.writeData(UBRR1L, 103);
    cpu.writeData(UCSR1C, 0x06);
    cpu.writeData(UCSR1B, 0x18);
    const state: Record<string, unknown> = {};
    sim.onPartState(300, (values) => Object.assign(state, values));
    const partner = { address: 'A1B2C3D4E5F6', pin: '000000', authenticated: true, bonding: true, intervalMs: 30, ancs: false,
      ancsEventId: 0, ancsEventFlags: 0, ancsCategoryId: 0, ancsCategoryCount: 0, ancsUid: 0, ancsAppIdentifier: '',
      ancsTitle: '', ancsSubtitle: '', ancsMessage: '', ancsDate: '' };
    const shifted = { series: 0, high: 3.3, load: { voltage: 3.3, resistance: 10000 } };
    const fields = { tx_pin: 19, rx_pin: 18, rx_net: shifted, pads: {}, identity: '00112233ABCD', retained: {}, partner, pressed: [] };
    const restart = vi.fn(() => ({ ...fields, retained: { flow: 1 } }));
    expect(sim.registerSensor('hm10', 300, fields, undefined, restart)).toBe(true);
    expect(state.connected).toBe(false);
    cpu.writeData(UDR1, 0x41);
    await runToMs(sim, 1.1);
    cpu.writeData(UDR1, 0x54);
    await runToMs(sim, 10);
    expect(String.fromCharCode(cpu.readData(UDR1), cpu.readData(UDR1))).toBe('OK');
    expect(state.uartRxHex).toBe('4154');
    sim.updateSensor(300, { action: 'remoteOn', partner });
    sim.updateSensor(300, { action: 'connect', partner });
    expect(state.connected).toBe(true);
    sim.reset();
    expect(restart).toHaveBeenCalledOnce();
    expect(JSON.parse(state.startupConfiguration as string).flow).toBe(1);
    sim.unregisterSensor(300);
  });

  it('rejects an HM-10 RXD the Mega drives at 5 V', async () => {
    const sim = new AVRSimulator(new PinManager(), 'mega');
    sim.loadHex(BLINK_HEX);
    sim.start();
    const cpu = (sim as unknown as { cpu: { writeData(addr: number, value: number): void } }).cpu;
    cpu.writeData(UBRR1L, 103);
    cpu.writeData(UCSR1C, 0x06);
    cpu.writeData(UCSR1B, 0x18);
    sim.onPartState(300, () => {});
    const partner = { address: 'A1B2C3D4E5F6', pin: '000000', authenticated: true, bonding: true, intervalMs: 30, ancs: false,
      ancsEventId: 0, ancsEventFlags: 0, ancsCategoryId: 0, ancsCategoryCount: 0, ancsUid: 0, ancsAppIdentifier: '',
      ancsTitle: '', ancsSubtitle: '', ancsMessage: '', ancsDate: '' };
    sim.registerSensor('hm10', 300, { tx_pin: 19, rx_pin: 18, rx_net: { series: 0, high: 5, load: null }, pads: {},
      identity: '00112233ABCD', retained: {}, partner, pressed: [] });
    expect(() => cpu.writeData(UDR1, 0x41)).toThrow(/^hm10: RXD exceeds raw 3\.3V pin envelope \(5\.0V\)$/);
  });

  it('power-cycles its parts on a reset: the model restarts with the clock', async () => {
    const sim = runningSim();
    sim.registerSensor('hmc5883l', PIN, { addr: 0x1e, magneticX: 0.5 });
    sim.updateSensor(PIN, { magneticX: -0.5 });
    await runToMs(sim, 57);
    expect(readRegisters(sim, 9, 1)).toEqual([1]);
    sim.reset();
    sim.start();
    await runToMs(sim, 55);
    expect(readRegisters(sim, 9, 1)).toEqual([0]);
    await runToMs(sim, 57);
    expect(readRegisters(sim, 3, 2)).toEqual([-545 >> 8 & 0xff, -545 & 0xff]);
  });
});
