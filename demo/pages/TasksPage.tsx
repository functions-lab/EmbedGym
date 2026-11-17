import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ComponentRegistry } from '@velxio/services/ComponentRegistry';

import { catalog, type Task } from '../data/catalog';
import { PartPreview } from '../components/PartPreview';

const LEVELS = [1, 2, 3];

/** Latest verdict recorded for a task across every run workspace on disk. */
function verdicts(): Map<string, string> {
  const byTask = new Map<string, string>();
  for (const ws of catalog.workspaces) {
    for (const run of ws.runs) {
      // Attempt 2+ is recorded as `<task>_r2` — fold it back onto the task.
      const task = run.task.replace(/_r\d+$/, '');
      if (run.grade) byTask.set(task, run.grade);
    }
  }
  return byTask;
}

/** The parts a task wires up, as pictures — enough to recognise a task at a glance. */
function PartStrip({ parts }: { parts: string[] }) {
  const registry = ComponentRegistry.getInstance();
  return (
    <div className="part-strip">
      {parts.map((id) => {
        const meta = registry.getById(id);
        return meta ? (
          <PartPreview key={id} tagName={meta.tagName} box={52} properties={meta.defaultValues} />
        ) : (
          <span key={id} className="chip">
            {id}
          </span>
        );
      })}
    </div>
  );
}

function TaskCard({ task, grade }: { task: Task; grade: string | undefined }) {
  return (
    <Link to={`/tasks/${task.name}`} className="task-card">
      <div className="task-card-head">
        <span className="task-name">{task.name}</span>
        {grade ? <span className={`badge ${grade === 'pass' ? 'pass' : 'fail'}`}>{grade}</span> : null}
      </div>
      <PartStrip parts={task.parts} />
      <p className="task-desc">{task.description}</p>
    </Link>
  );
}

export function TasksPage() {
  const [query, setQuery] = useState('');
  const grades = useMemo(verdicts, []);
  // Part thumbnails need the runtime component metadata (tagName).
  const [registryReady, setRegistryReady] = useState(false);

  useEffect(() => {
    ComponentRegistry.getInstance().loadPromise.then(() => setRegistryReady(true));
  }, []);

  const matches = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return catalog.tasks;
    return catalog.tasks.filter((t) => {
      const hay = `${t.name} ${t.description} ${t.parts.join(' ')}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [query]);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Tasks</h1>
        <input
          className="search"
          placeholder="Search tasks or components…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {LEVELS.map((level) => {
        const tasks = matches.filter((t) => t.level === level);
        if (!tasks.length) return null;
        return (
          <section key={level} className="level">
            <h2>
              Level {level}
              <span className="count">{tasks.length}</span>
            </h2>
            <div className="task-grid">
              {tasks.map((t) => (
                <TaskCard key={`${t.name}-${registryReady}`} task={t} grade={grades.get(t.name)} />
              ))}
            </div>
          </section>
        );
      })}

      {matches.length === 0 ? <p className="empty">No task matches “{query}”.</p> : null}
    </main>
  );
}
