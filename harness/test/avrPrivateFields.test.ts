// avr_driver.release() clears AVRSimulator's private `pauseAtCycle` through a
// cast, because only stop() clears it and the harness needs the sim to keep
// free-running after the last check. A cast compiles whatever the field is
// called, so a rename upstream would silently leave the sim parked instead.
//
// Read as text: importing AVRSimulator needs a browser, which the unit suite
// has not got.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(__dirname, '../..');
const AVR_SIMULATOR = path.join(REPO, 'velxio/frontend/src/simulation/AVRSimulator.ts');
const AVR_DRIVER = path.join(REPO, 'harness/avr_driver.ts');

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('AVRSimulator internals the harness reaches into', () => {
  it('still declares pauseAtCycle', () => {
    expect(read(AVR_SIMULATOR)).toMatch(/private\s+pauseAtCycle\s*:\s*number\s*\|\s*null/);
  });

  // The park is what runToCycle() arms; clearing the field only resumes the CPU
  // while the run loop keeps breaking on it.
  it('still parks the run loop on pauseAtCycle', () => {
    expect(read(AVR_SIMULATOR)).toMatch(
      /this\.pauseAtCycle\s*!==\s*null\s*&&\s*(this\.)?cpu\.cycles\s*>=\s*this\.pauseAtCycle/,
    );
  });

  it('avr_driver.release() clears it', () => {
    expect(read(AVR_DRIVER)).toMatch(/pauseAtCycle\s*\]?\s*=\s*null/);
  });

  // stop() clearing it is why release() has to exist as a separate path.
  it('stop() is the only other place it is cleared', () => {
    const assignments = read(AVR_SIMULATOR).match(/this\.pauseAtCycle\s*=/g) ?? [];
    expect(assignments).toHaveLength(2); // stop() and runToCycle()
  });
});
