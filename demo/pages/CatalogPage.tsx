// Targets and components, rendered from targets.md / components.md.

import { useEffect, useMemo, useState } from 'react';

import { ComponentRegistry } from '@velxio/services/ComponentRegistry';

import { catalog, type Component } from '../data/catalog';
import { PartPreview } from '../components/PartPreview';
import { BOARD_ELEMENT } from '../components/boardTags';

const TARGET_FACTS = ['board', 'emulator', 'firmware', 'pins', 'time origin', 'serial'];

/** components.md marks up its prose with backticks; render them as code. */
function Markup({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={i}>{part.slice(1, -1)}</code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** The one line that says how a test drives or reads this part. */
function headline(component: Component): string | null {
  const preferred = component.usage.find((u) => /^(drive|observe)/.test(u));
  return preferred ?? component.usage[0] ?? null;
}

/** Disambiguate board+framework targets cleanly in compact component chips. */
function formatTargetChip(target: string): string {
  return target
    .replace('_arduino', '/ard')
    .replace('_espidf', '/idf')
    .replace('_zephyr', '/zephyr');
}

function ComponentCard({ component }: { component: Component }) {
  const meta = ComponentRegistry.getInstance().getById(component.metadataId);
  const lead = headline(component);

  return (
    <article className="comp-card">
      {meta ? (
        <PartPreview tagName={meta.tagName} properties={meta.defaultValues} />
      ) : (
        <div className="part-preview missing">?</div>
      )}

      <div className="comp-body">
        <header>
          <h3>{component.displayName}</h3>
          <code className="meta-id">{component.metadataId}</code>
        </header>

        {lead ? (
          <p className="comp-lead">
            <Markup text={lead.replace(/^(drive|observe|supply)[^:]*:\s*/, '')} />
          </p>
        ) : null}

        <footer>
          {component.implemented.map((t) => (
            <span key={t} className={`chip ${component.verified.includes(t) ? 'verified' : ''}`}>
              {formatTargetChip(t)}
            </span>
          ))}
        </footer>

        <details className="comp-more">
          <summary>pins &amp; full grammar</summary>
          <dl>
            <div className="usage-row">
              <dt>Pins</dt>
              <dd>
                <Markup text={component.pins} />
              </dd>
            </div>
            {component.usage.map((line) => {
              const [key, ...rest] = line.split(':');
              return (
                <div key={line} className="usage-row">
                  <dt>{key}</dt>
                  <dd>
                    <Markup text={rest.join(':').trim()} />
                  </dd>
                </div>
              );
            })}
          </dl>
        </details>
      </div>
    </article>
  );
}

export function CatalogPage() {
  const [query, setQuery] = useState('');
  // Component metadata (tagName, defaults) is fetched at runtime; the previews
  // can't render until it lands.
  const [registryReady, setRegistryReady] = useState(false);

  useEffect(() => {
    ComponentRegistry.getInstance().loadPromise.then(() => setRegistryReady(true));
  }, []);

  const sections = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = catalog.components.filter((c) => {
      const hay = `${c.displayName} ${c.metadataId} ${c.pins} ${c.usage.join(' ')}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    const grouped = new Map<string, Component[]>();
    for (const c of matches) {
      const list = grouped.get(c.section) ?? [];
      list.push(c);
      grouped.set(c.section, list);
    }
    return [...grouped];
  }, [query]);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Boards &amp; Components</h1>
      </div>

      <section className="targets">
        {catalog.targets.map((t) => (
          <article key={t.name} className={`target-card ${t.runnable ? 'runnable' : ''}`}>
            <div className="board-art">
              {BOARD_ELEMENT[t.boardKind] ? (
                <PartPreview
                  tagName={BOARD_ELEMENT[t.boardKind].tag}
                  attrs={BOARD_ELEMENT[t.boardKind].attrs}
                  box={210}
                />
              ) : (
                <span className="chip muted">{t.boardKind || 'no board'}</span>
              )}
            </div>

            <header>
              <h3>{t.name}</h3>
              {t.runnable ? (
                <span className="chip verified">runs in this demo</span>
              ) : (
                <span className="chip muted">needs backend emulator</span>
              )}
            </header>

            <p className="target-lead">
              {t.taskCount} tasks · {t.emulator || t.compiler}
            </p>

            <details className="comp-more">
              <summary>toolchain &amp; timing</summary>
              <dl>
                {TARGET_FACTS.filter((k) => t.facts[k]).map((k) => (
                  <div key={k} className="usage-row">
                    <dt>{k}</dt>
                    <dd>
                      <Markup text={t.facts[k]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </article>
        ))}
      </section>

      <div className="page-head">
        <h2>Components ({catalog.components.length})</h2>
        <input
          className="search"
          placeholder="Search components…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {sections.map(([section, comps]) => (
        <section key={section} className="level">
          <h2>
            {section}
            <span className="count">{comps.length}</span>
          </h2>
          <div className="comp-grid">
            {comps.map((c) => (
              <ComponentCard key={`${c.metadataId}-${registryReady}`} component={c} />
            ))}
          </div>
        </section>
      ))}

      {sections.length === 0 ? <p className="empty">No component matches “{query}”.</p> : null}
    </main>
  );
}
