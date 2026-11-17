// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import '../../elements/Amg8833Element';
import '../../sim/Amg8833';
import { PartSimulationRegistry } from '@velxio/simulation/parts/PartSimulationRegistry';
import { dispatchSensorUpdate, hasSensorUpdateHandler, registerSensorUpdate, unregisterSensorUpdate } from '@velxio/simulation/SensorUpdateRegistry';
import { LOCAL_SENSOR_CONTROLS } from '../../sim/sensorControls';
import { SensorControlPanel } from '@velxio/components/simulator/SensorControlPanel';

type ThermalInputs = { thermistorTemperature: number; pixelAdcOverflow: boolean; [pixel: `pixel${number}`]: number };

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('AMG8833 element, attachment and actual controls', () => {
  it('uses six physical QT header pad centers and exposes every independent default input', () => {
    const el = document.createElement('velxio-amg8833') as HTMLElement & ThermalInputs & { pinInfo: { name: string; x: number; y: number }[] };
    expect(el.shadowRoot?.querySelector('svg')?.getAttribute('width')).toBe('96');
    expect(el.shadowRoot?.querySelector('svg')?.getAttribute('height')).toBe('96');
    expect(el.pinInfo.map(({ name, x, y }) => [name, x, y])).toEqual([
      ['VIN', 24, 86.4], ['3Vo', 33.6, 86.4], ['GND', 43.2, 86.4], ['SCL', 52.8, 86.4], ['SDA', 62.4, 86.4], ['INT', 72, 86.4],
    ]);
    expect(el.thermistorTemperature).toBe(25); expect(el.pixelAdcOverflow).toBe(false);
    for (let i = 0; i < 64; i++) expect(el[`pixel${i}`]).toBe(25);
    expect(LOCAL_SENSOR_CONTROLS.amg8833.controls).toHaveLength(65);
  });

  it.each([['0x68', 0x68], ['0x69', 0x69]])('registers address %s with the worker at virtual pin 200 + address, with every input and INT', (address, addr) => {
    const el = document.createElement('velxio-amg8833') as HTMLElement & ThermalInputs & { address: string };
    el.address = address; el.pixel5 = -3.25; el.thermistorTemperature = 30;
    const sim = { registerSensor: vi.fn(() => true), updateSensor: vi.fn(), unregisterSensor: vi.fn() };
    const cleanup = PartSimulationRegistry.get('amg8833')!.attachEvents!(el, sim as any, (name) => name === 'INT' ? 4 : null, `bridge-${address}`);
    const pixels = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`pixel${i}`, i === 5 ? -3.25 : 25]));
    expect(sim.registerSensor).toHaveBeenCalledWith('amg8833', 200 + addr,
      { addr, thermistorTemperature: 30, pixelAdcOverflow: false, ...pixels, int_pin: 4 });
    dispatchSensorUpdate(`bridge-${address}`, { pixel63: 40, pixelAdcOverflow: true });
    expect(sim.updateSensor).toHaveBeenCalledWith(200 + addr, { pixel63: 40, pixelAdcOverflow: true });
    expect(el.pixel63).toBe(40);
    sim.updateSensor.mockClear();
    expect(() => dispatchSensorUpdate(`bridge-${address}`, { thermistorTemperature: 81 })).toThrow('thermistorTemperature');
    expect(sim.updateSensor).not.toHaveBeenCalled();
    cleanup();
    expect(sim.unregisterSensor).toHaveBeenCalledWith(200 + addr);
    expect(hasSensorUpdateHandler(`bridge-${address}`)).toBe(false);
  });

  it('registers no INT pin when INT is unwired, and rejects a malformed input before registering', () => {
    const el = document.createElement('velxio-amg8833') as HTMLElement & ThermalInputs;
    const sim = { registerSensor: vi.fn((_type: string, _pin: number, _props: object) => true), updateSensor: vi.fn(), unregisterSensor: vi.fn() };
    PartSimulationRegistry.get('amg8833')!.attachEvents!(el, sim as any, () => null, 'bridge-noint')();
    expect(sim.registerSensor.mock.calls[0][2]).not.toHaveProperty('int_pin');
    const invalid = document.createElement('velxio-amg8833') as HTMLElement & ThermalInputs;
    Object.assign(invalid, { pixel17: '25' });
    const rejecting = { registerSensor: vi.fn(() => true), updateSensor: vi.fn(), unregisterSensor: vi.fn() };
    expect(() => PartSimulationRegistry.get('amg8833')!.attachEvents!(invalid, rejecting as any, () => null, 'bridge-invalid')).toThrow('pixel17');
    expect(rejecting.registerSensor).not.toHaveBeenCalled();
  });

  it('uses a real pixel dropdown, preserves individual slider values and dispatches the physical ADC fault checkbox', async () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const updates: Record<string, number | boolean>[] = [];
    registerSensorUpdate('thermal-panel', (values) => updates.push(values));
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(SensorControlPanel, { componentId: 'thermal-panel', metadataId: 'amg8833', sensorName: 'Thermal', onClose: () => {} })));
    expect(updates[0]).toHaveProperty('pixel63', 25);
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(2);
    const select = container.querySelector('select')!;
    expect(select.options).toHaveLength(64);
    await act(async () => { select.value = '63'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.textContent).toContain('Pixel 63');
    const pixel = container.querySelectorAll('input[type="range"]')[1] as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(pixel, '40');
      pixel.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(updates.at(-1)).toEqual({ pixel63: 40 });
    await act(async () => { select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect((container.querySelectorAll('input[type="range"]')[1] as HTMLInputElement).value).toBe('25');
    await act(async () => { select.value = '63'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect((container.querySelectorAll('input[type="range"]')[1] as HTMLInputElement).value).toBe('40');
    await act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(updates.at(-1)).toEqual({ pixelAdcOverflow: true });
    await act(async () => root.unmount()); container.remove(); unregisterSensorUpdate('thermal-panel');
  });
});
