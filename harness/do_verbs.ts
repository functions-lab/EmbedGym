// `do <role>.<verb>` dispatch: one case per interactive element tag, each
// calling the element's own handler method — the same entry point the frontend
// UI invokes. Never re-implement a handler's effects here. Split out of
// jsonl_runner.ts because this table grows with every interactive part.

import type { PushbuttonElement, MembraneKeypadElement, KY040Element } from '@wokwi/elements';
import type { DoAction } from './jsonl_spec';
import type { SendAction } from './jsonl_spec';

export function invokeRemoteSend(el: HTMLElement, act: Extract<SendAction, { endpoint: 'remote' }>): void {
  if (el.tagName.toLowerCase() !== 'velxio-hm10') throw new Error(`send '${act.role}.remote' requires a registered HM-10 element`);
  const module = el as HTMLElement & { sendRemote(bytes: readonly number[]): void };
  if (typeof module.sendRemote !== 'function') throw new Error(`HM-10 '${act.role}' has no remote transport`);
  module.sendRemote(act.bytes);
}

export function invokeDoVerb(el: HTMLElement, act: DoAction) {
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'velxio-hm10': {
      const names = ['remoteOn', 'remoteOff', 'connect', 'subscribe', 'disconnect', 'readRemote', 'ancsNotify', 'resetDown', 'resetUp', 'keyDown', 'keyUp'];
      if (act.key !== undefined || !names.includes(act.verb)) throw new Error(`hm10 '${act.role}': unknown UI action '${act.verb}'`);
      const module = el as unknown as Record<string, () => void>;
      module[act.verb]();
      break;
    }
    case 'wokwi-pushbutton': {
      const button = el as unknown as PushbuttonElement;
      if (act.verb === 'down') button['down']();
      else if (act.verb === 'up') button['up'](new MouseEvent('mouseup'));
      else throw new Error(`pushbutton '${act.role}': unknown verb '${act.verb}'`);
      break;
    }
    case 'velxio-bounce-button': {
      const button = el as unknown as { pressed: boolean; down(): void; up(): void };
      if (act.verb !== 'down' && act.verb !== 'up') {
        throw new Error(`bounce-button '${act.role}': unknown verb '${act.verb}'`);
      }
      if (button.pressed === (act.verb === 'down')) {
        throw new Error(`bounce-button '${act.role}': already ${button.pressed ? 'down' : 'up'}`);
      }
      if (act.verb === 'down') button.down();
      else button.up();
      break;
    }
    case 'wokwi-membrane-keypad': {
      const keypad = el as unknown as MembraneKeypadElement;
      if (act.key === undefined) throw new Error(`keypad '${act.role}' needs a key, e.g. ${act.role}.5.${act.verb}`);
      if (act.verb === 'down') keypad['down'](act.key);
      else if (act.verb === 'up') keypad['up'](act.key);
      else throw new Error(`keypad '${act.role}': unknown verb '${act.verb}'`);
      break;
    }
    case 'velxio-mpr121': {
      const touch = el as unknown as { down(key: string): void; up(key: string): void };
      if (act.key === undefined || !/^(?:[0-9]|1[01])$/.test(act.key)) throw new Error(`mpr121 '${act.role}' needs electrode 0..11`);
      if (act.verb === 'down') touch.down(act.key);
      else if (act.verb === 'up') touch.up(act.key);
      else throw new Error(`mpr121 '${act.role}': unknown verb '${act.verb}'`);
      break;
    }
    case 'wokwi-ky-040': {
      const encoder = el as unknown as KY040Element;
      if (act.verb === 'clockwiseStep') encoder['clockwiseStep']();
      else if (act.verb === 'counterClockwiseStep') encoder['counterClockwiseStep']();
      else if (act.verb === 'press') encoder['press']();
      else if (act.verb === 'release') encoder['release']();
      else throw new Error(`ky-040 '${act.role}': unknown verb '${act.verb}'`);
      break;
    }
    default:
      throw new Error(`do <role>.${act.verb} not supported for <${tag}> (role '${act.role}')`);
  }
}
