import { describe, expect, it } from 'vitest';
import { buildTimeline, parseJsonl } from '../jsonl_spec';

describe('MPR121 keyed actions at load time', () => {
  const build = (action: string) => buildTimeline(parseJsonl([
    '{"target":"atmega2560_arduino","part":"mpr121","name":"touch","pin":20}',
    JSON.stringify({ at: 100, do: action }),
  ].join('\n'), 'atmega2560_arduino'), () => 'sensor');
  it.each(['touch.0.down', 'touch.11.up'])('accepts %s', (action) => expect(build(action).events).toHaveLength(1));
  it.each(['touch.down', 'touch.12.down', 'touch.01.down', 'touch.0.press', 'touch.-1.up'])('rejects %s', (action) => {
    expect(() => build(action)).toThrow('mpr121 requires');
  });
});
