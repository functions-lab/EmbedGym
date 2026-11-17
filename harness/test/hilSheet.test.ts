import { describe, it, expect } from 'vitest';
import { renderHilSheet, type SheetCircuit } from '../hil_sheet.ts';

const names: Record<string, string> = { pushbutton: 'Pushbutton', resistor: 'Resistor (custom)' };
const partName = (id: string) => names[id];

const circuit: SheetCircuit = {
  boards: [{ id: 'arduino-mega', boardKind: 'arduino-mega' }],
  components: [
    { id: 'BTN', metadataId: 'pushbutton' },
    { id: 'R1', metadataId: 'resistor', properties: { value: '10000' } },
  ],
  wires: [
    { start: { componentId: 'arduino-mega', pinName: '2' }, end: { componentId: 'BTN', pinName: '1.l' } },
    { start: { componentId: 'R1', pinName: '2' }, end: { componentId: 'arduino-mega', pinName: 'GND' } },
  ],
};

describe('renderHilSheet', () => {
  it('lists the task, every part with its settings, and every wire', () => {
    const sheet = renderHilSheet({ name: 'demo', description: 'Print on press.', serial: ['Pressed'] }, circuit, partName);
    expect(sheet.split('\n')).toEqual(expect.arrayContaining([
      '# demo — Arduino Mega 2560',
      'Print on press.',
      '- `Pressed`',
      '| arduino-mega | Arduino Mega 2560 |  |',
      '| BTN | Pushbutton |  |',
      '| R1 | Resistor (custom) | value: 10000 |',
      '| arduino-mega 2 | BTN 1.l |',
      '| R1 2 | arduino-mega GND |',
    ]));
  });

  it('omits the serial block for a task that prints nothing', () => {
    expect(renderHilSheet({ name: 'demo', description: 'Blink.' }, circuit, partName)).not.toContain('Serial lines:');
  });

  it('rejects a circuit with more than one board', () => {
    const two = { ...circuit, boards: [...circuit.boards, { id: 'uno', boardKind: 'arduino-uno' as const }] };
    expect(() => renderHilSheet({ name: 'demo', description: '' }, two, partName)).toThrow(/expected one board, found 2/);
  });
});
