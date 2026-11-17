import { useEffect, useRef } from 'react';

import type { LogKind } from '@harness/jsonl_runner';

export interface LogLine {
  text: string;
  kind: LogKind;
}

export type RunState = 'idle' | 'running' | 'done' | 'error';

interface Props {
  state: RunState;
  lines: LogLine[];
  pass: number;
  fail: number;
  error: string | null;
}

function Verdict({ state, pass, fail, error }: Omit<Props, 'lines'>) {
  // Before a run the panel is simply empty — a caption saying so adds nothing.
  if (state === 'idle') return null;
  if (state === 'running') return <div className="verdict running">Running…</div>;
  if (state === 'error') return <div className="verdict fail">Harness error — {error}</div>;
  if (state === 'done') {
    const ok = fail === 0;
    return (
      <div className={`verdict ${ok ? 'pass' : 'fail'}`}>
        {ok ? 'PASS' : 'FAIL'} — {pass} passed, {fail} failed
      </div>
    );
  }
  throw new Error(`unknown run state: ${state}`);
}

export function GradePanel({ state, lines, pass, fail, error }: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="grade-panel">
      <Verdict state={state} pass={pass} fail={fail} error={error} />
      <div className="grade-log" ref={logRef}>
        {lines.map((line, i) => (
          <div key={i} className={`log-line ${line.kind}`}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
