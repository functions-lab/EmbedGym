// Pure serial-verification logic for testbench: line templates, the
// timestamped line store, `parse` extraction into @slots, and the JS slot
// expressions that `expect` rows evaluate. Browser-free so vitest can import
// it. Grammar reference: docs/tasks-and-tests.md.

export type FieldType = 'd' | 'f' | 's';

export interface TemplateField { name: string; type: FieldType; }

export interface SerialTemplate {
  source: string;
  regex: RegExp;
  /** Named placeholders, in capture-group order. */
  fields: TemplateField[];
}

/** One completed serial line and the sim time (ms) its newline was sent. */
export interface SerialLine { text: string; t: number; }

/** A parsed value list; `t` holds the print time of each element. */
export type SlotList = (number | string)[] & { t: number[] };

const PLACEHOLDER = /^\{(?:([A-Za-z_][A-Za-z0-9_]*):)?(d|f(?:\.(\d+))?|s)\}/;

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function placeholderPattern(type: string, digits: string | undefined): string {
  if (type === 'd') return '[+-]?\\d+';
  if (type === 's') return '\\S+';
  // Zero-padding is asked for in the prompt, never enforced here — `{d}`
  // accepts `2` and `02` alike and both parse to the same number.
  if (type === 'f') return digits === undefined ? '[+-]?\\d+(?:\\.\\d+)?' : `[+-]?\\d+\\.\\d{${digits}}`;
  throw new Error(`unknown placeholder type '${type}'`);
}

/**
 * Compile a line template into a whole-line-anchored regex. Named
 * placeholders become capture groups, in order; everything outside braces is
 * literal text.
 */
export function compileTemplate(source: string): SerialTemplate {
  if (!source) throw new Error('serial template is empty');
  const fields: TemplateField[] = [];
  let pattern = '';
  let literal = '';
  let i = 0;
  while (i < source.length) {
    if (source[i] !== '{') {
      literal += source[i++];
      continue;
    }
    const m = PLACEHOLDER.exec(source.slice(i));
    if (!m) throw new Error(`malformed placeholder in template '${source}' at offset ${i}`);
    const [matched, name, spec, digits] = m;
    const type = spec[0] as FieldType;
    pattern += escapeLiteral(literal);
    literal = '';
    const body = placeholderPattern(type, digits);
    if (name) {
      if (fields.some((f) => f.name === name)) {
        throw new Error(`duplicate placeholder name '${name}' in template '${source}'`);
      }
      fields.push({ name, type });
      pattern += `(${body})`;
    } else {
      pattern += `(?:${body})`;
    }
    i += matched.length;
  }
  pattern += escapeLiteral(literal);
  return { source, regex: new RegExp(`^${pattern}$`), fields };
}

/** Match a whole line; returns one entry per named placeholder, or null. */
export function matchLine(tpl: SerialTemplate, text: string): Array<number | string> | null {
  const m = tpl.regex.exec(text);
  if (!m) return null;
  return tpl.fields.map((f, idx) => (f.type === 's' ? m[idx + 1] : Number(m[idx + 1])));
}

/**
 * Serial TX split into completed lines, each stamped with the sim time its
 * newline arrived. A trailing partial line is held back until its newline.
 */
export class SerialLineStore {
  readonly lines: SerialLine[] = [];
  private partial = '';
  private partialT = 0;

  pushByte(byte: number, tMs: number) {
    const ch = String.fromCharCode(byte);
    if (ch === '\n') {
      this.lines.push({ text: this.partial.replace(/\r+$/, ''), t: tMs });
      this.partial = '';
    } else {
      this.partial += ch;
      this.partialT = tMs;
    }
  }

  /**
   * The lines a `parse` at `atMs` may see: those printed on the test's t=0
   * axis, up to and including `atMs`. The lower bound matters on ESP32, where
   * the axis begins at app start and the ROM/bootloader log is replayed at
   * negative times — without it, `t <= atMs` admits every boot-log line into
   * every parse row.
   */
  linesAsOf(atMs: number): SerialLine[] {
    return this.lines.filter((l) => l.t >= 0 && l.t <= atMs);
  }

  /** The unterminated trailing text, if any — a sketch's last print without a
   * newline is invisible to `parse` but must still reach a serial-mode dump. */
  get pending(): string {
    return this.partial;
  }

  /** When the pending text's last byte left the UART. */
  get pendingT(): number {
    return this.partialT;
  }
}

export class SerialByteStore {
  private readonly bytes: Array<{ byte: number; t: number }> = [];
  pushByte(byte: number, tMs: number): void {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255 || !Number.isFinite(tMs)) throw new Error('serial byte requires integer 0..255 and finite timestamp');
    this.bytes.push({ byte, t: tMs });
  }
  hexAsOf(atMs: number): string {
    return this.bytes.filter((item) => item.t >= 0 && item.t <= atMs).map((item) => item.byte.toString(16).padStart(2, '0')).join('');
  }
}

function newSlotList(): SlotList {
  const list = [] as unknown as SlotList;
  Object.defineProperty(list, 't', { value: [] as number[], enumerable: false });
  return list;
}

/**
 * Match `template` against every line printed by `atMs` and bind one slot per
 * named placeholder (plus `as` for the whole line text). Slots with no match
 * bind an empty list.
 */
export function runParse(
  tpl: SerialTemplate,
  as: string | undefined,
  store: SerialLineStore,
  atMs: number,
): Map<string, SlotList> {
  const slots = new Map<string, SlotList>();
  for (const f of tpl.fields) slots.set(f.name, newSlotList());
  if (as) slots.set(as, newSlotList());

  for (const line of store.linesAsOf(atMs)) {
    const values = matchLine(tpl, line.text);
    if (!values) continue;
    tpl.fields.forEach((f, idx) => {
      const slot = slots.get(f.name)!;
      slot.push(values[idx]);
      slot.t.push(line.t);
    });
    if (as) {
      const slot = slots.get(as)!;
      slot.push(line.text);
      slot.t.push(line.t);
    }
  }
  return slots;
}

/**
 * Match `template` against one sampled value (a `parse` row with `from`) and
 * append the result to the shared slots. Unlike `runParse`, which re-reads the
 * whole line store and replaces the slot, this accumulates one sample per row —
 * so the caller must pass the same `slots` map across rows. Slots bind even
 * when nothing matches, so absence stays expressible. Returns the slots this
 * call touched, for the runner's log line.
 */
export function appendParseSample(
  tpl: SerialTemplate,
  as: string | undefined,
  sample: string,
  atMs: number,
  slots: Record<string, unknown>,
): Map<string, SlotList> {
  const touched = new Map<string, SlotList>();
  const slotFor = (name: string): SlotList => {
    const existing = slots[name];
    const list = (existing as SlotList) ?? newSlotList();
    slots[name] = list;
    touched.set(name, list);
    return list;
  };
  for (const f of tpl.fields) slotFor(f.name);
  if (as) slotFor(as);

  const values = matchLine(tpl, sample);
  if (values) {
    tpl.fields.forEach((f, idx) => {
      const slot = touched.get(f.name)!;
      slot.push(values[idx]);
      slot.t.push(atMs);
    });
    if (as) {
      const slot = touched.get(as)!;
      slot.push(sample);
      slot.t.push(atMs);
    }
  }
  return touched;
}

/** Replace `@name` → `S.name` and `[-N]` → `.at(-N)`, leaving quoted text alone. */
const SLOT_EXPR_NAMES = ['len', 'Math', 'true', 'false'];

function rewriteSlotExpr(expr: string): string {
  let out = '';
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === "'" || ch === '"') {
      const end = expr.indexOf(ch, i + 1);
      if (end === -1) throw new Error(`unterminated string in expression: '${expr}'`);
      out += expr.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (ch === '@') {
      const name = /^@([A-Za-z_][A-Za-z0-9_]*)/.exec(expr.slice(i));
      if (!name) throw new Error(`'@' must be followed by a slot name in '${expr}'`);
      out += `S.${name[1]}`;
      i += name[0].length;
      continue;
    }
    const ident = /^[A-Za-z_$][\w$]*/.exec(expr.slice(i));
    if (ident) {
      const prev = i > 0 ? expr[i - 1] : '';
      const partOfToken = prev === '.' || /[\w$]/.test(prev);
      if (!partOfToken && !SLOT_EXPR_NAMES.includes(ident[0])) {
        throw new Error(
          `unknown name '${ident[0]}' in '${expr}': slot expressions read @slots, len() and Math only — capture a role property into a slot first`,
        );
      }
      out += ident[0];
      i += ident[0].length;
      continue;
    }
    const negIndex = /^\[\s*(-\d+)\s*\]/.exec(expr.slice(i));
    if (negIndex) {
      out += `.at(${negIndex[1]})`;
      i += negIndex[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Slot names an expression reads, so the runner can check they're bound. */
export function extractSlotNames(expr: string): string[] {
  const names = new Set<string>();
  for (const m of rewriteSlotExpr(expr).matchAll(/\bS\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    names.add(m[1]);
  }
  return [...names];
}

export type SlotExpr = (slots: Record<string, unknown>) => unknown;

/**
 * Compile a slot expression to a JS function. Chained comparisons are
 * rejected because JavaScript evaluates them left-to-right into a boolean and
 * silently gives the wrong answer.
 */
export function compileSlotExpr(expr: string): SlotExpr {
  const rewritten = rewriteSlotExpr(expr);
  // Two relational operators with no logical operator between them: JS folds
  // the first comparison to a boolean and compares *that*, silently.
  const withoutEquality = rewritten.replace(/[=!]==?/g, ' ');
  if (/[<>]=?(?:[^<>&|]|&(?!&)|\|(?!\|))+[<>]=?/.test(withoutEquality)) {
    throw new Error(
      `chained comparison is not JavaScript: '${expr}' — split it with '&&'`,
    );
  }
  let fn: (S: Record<string, unknown>, len: (x: { length: number }) => number) => unknown;
  try {
    fn = new Function('S', 'len', `return (${rewritten});`) as typeof fn;
  } catch (err) {
    throw new Error(`invalid expect expression '${expr}': ${(err as Error).message}`);
  }
  return (slots) => fn(slots, (x) => x.length);
}

/** Run a compiled slot expression; a non-boolean result is a hard error. */
export function evaluateSlotExpr(
  fn: SlotExpr,
  slots: Record<string, unknown>,
  reads: string[] = [],
): boolean {
  for (const name of reads) {
    if (!(name in slots)) throw new Error(`slot '@${name}' was never bound`);
  }
  const result = fn(slots);
  if (typeof result !== 'boolean') {
    throw new Error(`expect expression must evaluate to true/false, got ${JSON.stringify(result)}`);
  }
  return result;
}
