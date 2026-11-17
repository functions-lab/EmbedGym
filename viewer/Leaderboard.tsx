import type { Run, Workspace } from './load_workspace';

export type SortKey = 'task' | 'grade' | 'rounds' | 'cost' | 'tokens' | 'wall' | 'cache' | 'status';

function totalTokens(run: Run): number | null {
  const t = run.tokens;
  if (!t) return null;
  return t.prompt_tokens + t.completion_tokens;
}

// Share of input tokens served from cache — the cheap ones. A run that reread
// a large task description every round shows up here as a low ratio.
// OpenRouter's prompt_tokens already includes the cached tokens.
function cacheRatio(run: Run): number | null {
  const t = run.tokens;
  if (!t) return null;
  if (t.prompt_tokens === 0) return null;
  return t.cache_read_input_tokens / t.prompt_tokens;
}

function sortValue(run: Run, key: SortKey): string | number {
  if (key === 'task') return run.task;
  // Ascending puts failures first — the rows worth triaging.
  if (key === 'grade') {
    if (run.grade === 'fail') return 0;
    if (run.grade === 'no_sketch' || run.grade === 'error') return 1;
    if (run.grade === 'pass' || run.grade === 'timeout') return 2;
    if (run.grade === null) return 3;
    throw new Error(`unknown grade: ${run.grade}`);
  }
  if (key === 'status') return run.exitStatus ?? '';
  if (key === 'rounds') return run.rounds ?? -1;
  if (key === 'cost') return run.cost ?? -1;
  if (key === 'tokens') return totalTokens(run) ?? -1;
  if (key === 'cache') return cacheRatio(run) ?? -1;
  if (key === 'wall') return run.wallClockS ?? -1;
  throw new Error(`unknown sort key: ${key}`);
}

// run.sh's verdict line is "PASS — 6 passed, 0 failed"; show it as passed over
// total checks. A no_sketch row has no verdict line and no counts.
function checkCounts(summary: string | null): string | null {
  if (summary === null) return null;
  const m = summary.match(/(\d+) passed, (\d+) failed/);
  if (!m) return null;
  const passed = Number(m[1]);
  return `${passed}/${passed + Number(m[2])} passed`;
}

// An `error` grade is the harness failing, not the firmware: it needs a regrade.
export function gradeClass(grade: string): 'pass' | 'fail' | 'warn' {
  if (grade === 'pass') return 'pass';
  if (grade === 'fail') return 'fail';
  if (grade === 'timeout' || grade === 'no_sketch' || grade === 'error') return 'warn';
  throw new Error(`unknown grade: ${grade}`);
}

function GradeCell({ run }: { run: Run }) {
  if (run.grade === null) return <span className="badge muted">ungraded</span>;

  const cls = gradeClass(run.grade);
  // "0/5 passed" reads very differently from "6/7 passed" — the ratio is what
  // points at whether the sketch or the test is wrong.
  const counts = checkCounts(run.gradeSummary);

  return (
    <>
      <span className={`badge ${cls}`}>{run.grade}</span>
      {counts ? <span className="counts">{counts}</span> : null}
    </>
  );
}

function StatusCell({ run }: { run: Run }) {
  if (!run.complete) return <span className="badge warn">running</span>;
  if (run.exitStatus === 'Submitted') return <span className="badge muted">submitted</span>;
  return <span className="badge fail">{run.exitStatus}</span>;
}

function num(value: number | null, digits = 0, suffix = ''): string {
  if (value === null) return '—';
  return value.toFixed(digits) + suffix;
}

interface Props {
  workspace: Workspace;
  selected: string | null;
  sort: { key: SortKey; desc: boolean };
  onSort: (sort: { key: SortKey; desc: boolean }) => void;
  onSelect: (task: string) => void;
}

export function Leaderboard({ workspace, selected, sort, onSort, onSelect }: Props) {
  const runs = [...workspace.runs].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number);
    return sort.desc ? -cmp : cmp;
  });

  const costs = workspace.runs.map((r) => r.cost).filter((c): c is number => c !== null);
  const walls = workspace.runs.map((r) => r.wallClockS).filter((w): w is number => w !== null);
  const passes = workspace.runs.filter((r) => r.grade === 'pass').length;
  const errors = workspace.runs.filter((r) => r.grade === 'error').length;

  function header(key: SortKey, label: string, numeric = false) {
    const arrow = sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '';
    return (
      <th
        className={numeric ? 'num' : undefined}
        onClick={() => onSort({ key, desc: sort.key === key ? !sort.desc : true })}
      >
        {label}
        {arrow}
      </th>
    );
  }

  return (
    <div className="board">
      <div className="totals">
        <div>
          <span className="k">Runs</span>
          <span className="v">{workspace.runs.length}</span>
        </div>
        <div>
          <span className="k">Graded</span>
          <span className="v">
            {workspace.graded
              ? `${passes}/${workspace.runs.length} pass${errors ? `, ${errors} error` : ''}`
              : '—'}
          </span>
        </div>
        <div>
          <span className="k">Total cost</span>
          <span className="v">${costs.reduce((a, b) => a + b, 0).toFixed(2)}</span>
        </div>
        <div>
          <span className="k">Total time</span>
          <span className="v">{(walls.reduce((a, b) => a + b, 0) / 60).toFixed(1)}m</span>
        </div>
        <div>
          <span className="k">Model</span>
          <span className="v mono" style={{ fontSize: 12 }}>
            {[...new Set(workspace.runs.map((r) => r.model))].join(', ') || '—'}
          </span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            {header('task', 'Task')}
            {header('grade', 'Grade')}
            {header('status', 'Exit')}
            {header('rounds', 'Rounds', true)}
            {header('cost', 'Cost', true)}
            {header('tokens', 'Tokens', true)}
            {header('cache', 'Cache', true)}
            {header('wall', 'Wall', true)}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const ratio = cacheRatio(run);
            return (
              <tr
                key={run.task}
                className={run.task === selected ? 'selected' : undefined}
                onClick={() => onSelect(run.task)}
              >
                <td>
                  <span className="task-name">{run.task}</span>
                  {!run.hexPresent && run.complete ? (
                    <span className="badge fail" style={{ marginLeft: 6 }}>
                      no hex
                    </span>
                  ) : null}
                </td>
                <td>
                  <GradeCell run={run} />
                </td>
                <td>
                  <StatusCell run={run} />
                </td>
                <td className="num">{run.rounds ?? '—'}</td>
                <td className="num">{run.cost === null ? '—' : `$${run.cost.toFixed(3)}`}</td>
                <td className="num">{(totalTokens(run) ?? 0).toLocaleString()}</td>
                <td className="num">{ratio === null ? '—' : `${(ratio * 100).toFixed(0)}%`}</td>
                <td className="num">{num(run.wallClockS, 1, 's')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
