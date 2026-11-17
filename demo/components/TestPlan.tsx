// test.jsonl as a checklist. Renders rows; the runner validates them.

interface Row {
  target?: string;
  part?: string;
  name?: string;
  pin?: number | string;
  at?: number;
  expect?: string;
  set?: string;
  do?: string;
  capture?: string;
  parse?: string;
  as?: string;
  from?: string;
}

const VERBS = ['expect', 'set', 'do', 'capture', 'parse'] as const;
type Verb = (typeof VERBS)[number];

const VERB_LABEL: Record<Verb, string> = {
  expect: 'check',
  set: 'sensor',
  do: 'input',
  capture: 'sample',
  parse: 'serial',
};

function rowVerb(row: Row): Verb | null {
  return VERBS.find((v) => row[v] !== undefined) ?? null;
}

function describe(row: Row, verb: Verb): string {
  const body = String(row[verb]);
  if (verb !== 'parse') return body;
  const suffix = row.from ? ` (from ${row.from})` : row.as ? ` → @${row.as}` : '';
  return `match “${body}”${suffix}`;
}

export function TestPlan({ jsonl, target }: { jsonl: string; target: string }) {
  const rows: Row[] = jsonl
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  const circuit = rows.filter((r) => r.part !== undefined && r.target === target);
  const steps = rows.filter((r) => r.at !== undefined);

  return (
    <div className="test-plan">
      <div className="roles">
        {circuit.map((r) => (
          <span key={r.name} className="chip">
            {r.name} = {r.part} @ pin {r.pin}
          </span>
        ))}
      </div>

      <ol className="steps">
        {steps.map((row, i) => {
          const verb = rowVerb(row);
          if (!verb) throw new Error(`test.jsonl row ${i + 1} has no known verb`);
          return (
            <li key={i}>
              <span className="at">{row.at} ms</span>
              <span className={`verb ${verb}`}>{VERB_LABEL[verb]}</span>
              <code>{describe(row, verb)}</code>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
