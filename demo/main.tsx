// Demo entry point. The side-effect imports are the same set harness/main.tsx
// needs — without registerAll the wokwi elements never define, and without
// simulation/parts nothing reacts to pin changes.

import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';

import '@velxio/i18n';
import '@velxio/index.css';
import '@velxio/components/velxio-components/registerAll';
import '@velxio/simulation/parts';

import { CatalogPage } from './pages/CatalogPage';
import { TasksPage } from './pages/TasksPage';
import { TaskPage } from './pages/TaskPage';
import { ResultsPage } from './pages/ResultsPage';
import './style.css';

function Nav() {
  return (
    <header className="demo-nav">
      <span className="demo-brand">
        Velxio <span>Testbench</span>
      </span>
      <nav>
        <NavLink to="/tasks">Tasks</NavLink>
        <NavLink to="/boards">Boards &amp; Components</NavLink>
        <NavLink to="/results">Agent Runs</NavLink>
      </nav>
    </header>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="demo-app">
        <Nav />
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:name" element={<TaskPage />} />
          <Route path="/boards" element={<CatalogPage />} />
          <Route path="/results" element={<ResultsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
