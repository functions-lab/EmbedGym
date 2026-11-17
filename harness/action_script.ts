// A embedgym-run action script (`run.sh --actions`, see docs/tasks-and-tests.md): one
// timed action per line, addressed by circuit.ts component id and checked
// against the actions harness/part_actions.json lists for the part's
// metadataId. Pure, so vitest covers it; jsonl_runner.ts executes the result.

import partActionsJson from './part_actions.json';
import { PASS_THROUGH, type ComponentLike } from './resolve_role';
import { parseSend, type DoAction, type SendAction } from './jsonl_spec';

interface PartActions {
  label?: string;
  do?: string[];
  set?: Record<string, string>;
  read?: string[];
  send?: string[];
  slots?: Record<string, { text: string; pattern: string }>;
}

const PART_ACTIONS = partActionsJson as Record<string, PartActions>;

/** A mistake in the agent's script: its message reaches the agent as is. */
export class ActionScriptError extends Error {}

interface Timed { at: number; line: number; text: string; }
export type ScriptAction =
  | Timed & { kind: 'do'; act: DoAction }
  | Timed & { kind: 'set'; id: string; prop: string; value: number | boolean }
  | Timed & { kind: 'read'; id: string; prop: string }
  | Timed & { kind: 'send'; act: SendAction };

const ID = '[A-Za-z_][A-Za-z0-9_]*';
const LINE_RE = /^(\S+)\s+(do|set|read|send)\s+(.*)$/;
const MS_RE = /^\d+(?:\.\d+)?$/;
const DO_RE = new RegExp(`^(${ID})\\.(?:([^.\\s]+)\\.)?(${ID})$`);
const SET_RE = new RegExp(`^(${ID})\\.(${ID})\\s*=\\s*(\\S+)$`);
const READ_RE = new RegExp(`^(${ID})\\.(${ID})$`);
const SEND_RE = new RegExp(`^(serial|(${ID})\\.(${ID}))\\s+(".*")$`);
const NUMBER_RE = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** A listed action such as `<key>.down` or `pixel<n>` as a whole-string regex. */
function templateRegex(template: string, spec: PartActions, type: string): RegExp {
  const source = template.split(/<(\w+)>/).map((piece, i) => {
    if (i % 2 === 0) return piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const slot = spec.slots?.[piece];
    if (!slot) throw new Error(`part_actions.json: ${type} uses <${piece}> without a slot`);
    return `(?:${slot.pattern})`;
  }).join('');
  return new RegExp(`^${source}$`);
}

function findTemplate(templates: string[], name: string, spec: PartActions, type: string): string | undefined {
  return templates.find((template) => templateRegex(template, spec, type).test(name));
}

// part_actions.json value hints: a placeholder such as `<°C>` takes a number,
// `true|false` a boolean, and `true` only true.
function valueFits(hint: string, value: number | boolean): boolean {
  if (hint === 'true|false') return typeof value === 'boolean';
  if (hint === 'true') return value === true;
  if (/^<.+>$/.test(hint)) return typeof value === 'number';
  throw new Error(`part_actions.json: unknown value hint '${hint}'`);
}

function parseValue(raw: string): number | boolean | null {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (!NUMBER_RE.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** The script's actions in execution order: by time, ties in line order. */
export function parseActionScript(text: string, components: ComponentLike[], runMs: number): ScriptAction[] {
  const typeOf = new Map(components.map((c) => [c.id, c.metadataId]));
  const actions: ScriptAction[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const fail = (message: string): never => { throw new ActionScriptError(`line ${line}: ${message}`); };
    const source = raw.trim();
    if (!source) return;

    const m = LINE_RE.exec(source) ?? fail(`expected '<ms> do|set|read|send <ID>.…', got '${source}'`);
    const [, ms, kind, rest] = m;
    const at = MS_RE.test(ms) ? Number(ms) : NaN;
    if (!(at <= runMs)) fail(`time must be a number of ms from 0 to ${runMs}, got '${ms}'`);

    const partOf = (id: string): { spec: PartActions; type: string } => {
      const type = typeOf.get(id) ?? fail(`no component '${id}'`);
      if (PASS_THROUGH.has(type)) fail(`${id} has no actions`);
      const spec = PART_ACTIONS[type];
      if (!spec) throw new Error(`part_actions.json has no entry for '${type}' (${id})`);
      return { spec, type };
    };

    if (kind === 'do') {
      const d = DO_RE.exec(rest) ?? fail(`expected '<ms> do <ID>.<verb>' or '<ms> do <ID>.<key>.<verb>', got '${source}'`);
      const [, id, key, verb] = d;
      const name = key === undefined ? verb : `${key}.${verb}`;
      const { spec, type } = partOf(id);
      if (!findTemplate(spec.do ?? [], name, spec, type)) fail(`${id} has no action 'do ${id}.${name}'`);
      actions.push({ kind: 'do', at, line, text: `do ${id}.${name}`, act: { role: id, key, verb } });
    } else if (kind === 'set') {
      const s = SET_RE.exec(rest) ?? fail(`expected '<ms> set <ID>.<prop> = <value>', got '${source}'`);
      const [, id, prop, rawValue] = s;
      const { spec, type } = partOf(id);
      const template = findTemplate(Object.keys(spec.set ?? {}), prop, spec, type)
        ?? fail(`${id} has no action 'set ${id}.${prop}'`);
      const hint = spec.set![template];
      const value = parseValue(rawValue);
      if (value === null || !valueFits(hint, value)) fail(`expected 'set ${id}.${prop} = ${hint}', got '${source}'`);
      actions.push({ kind: 'set', at, line, text: `set ${id}.${prop} = ${value}`, id, prop, value: value! });
    } else if (kind === 'read') {
      const r = READ_RE.exec(rest) ?? fail(`expected '<ms> read <ID>.<prop>', got '${source}'`);
      const [, id, prop] = r;
      const { spec, type } = partOf(id);
      if (!findTemplate(spec.read ?? [], prop, spec, type)) fail(`${id} has no action 'read ${id}.${prop}'`);
      actions.push({ kind: 'read', at, line, text: `read ${id}.${prop}`, id, prop });
    } else if (kind === 'send') {
      const usage = `expected '<ms> send <ID>.<endpoint> "<text>"' or '<ms> send serial "<text>"', got '${source}'`;
      const p = SEND_RE.exec(rest) ?? fail(usage);
      const [, endpoint, id, name, literal] = p;
      let payload: unknown;
      try { payload = JSON.parse(literal); } catch { fail(usage); }
      if (typeof payload !== 'string' || payload === '') fail(usage);
      const bytes = [...(payload as string)].map((ch) => ch.codePointAt(0)!);
      if (bytes.some((b) => b > 255)) fail(`send text must use characters U+0000..U+00FF only, got '${source}'`);
      if (id !== undefined) {
        const { spec, type } = partOf(id);
        if (!findTemplate(spec.send ?? [], name, spec, type)) fail(`${id} has no action 'send ${id}.${name}'`);
      }
      const act = parseSend({ at, send: endpoint, bytes });
      actions.push({ kind: 'send', at, line, text: `send ${endpoint} ${JSON.stringify(payload)}`, act });
    } else {
      throw new Error(`unknown action kind '${kind}'`);
    }
  });

  return actions.sort((a, b) => a.at - b.at);
}
