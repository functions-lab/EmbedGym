// Sketch + live circuit, side by side. Both read the stores directly, so
// mounting them is enough once the page has called loadProjectState.

import { useEffect } from 'react';

import { CodeEditor } from '@velxio/components/editor/CodeEditor';
import { SimulatorCanvas } from '@velxio/components/simulator/SimulatorCanvas';
import { SerialMonitor } from '@velxio/components/simulator/SerialMonitor';
import { Oscilloscope } from '@velxio/components/simulator/Oscilloscope';
import { startSimulation } from '@velxio/simulation/spice/start';
import { useSimulatorStore } from '@velxio/store/useSimulatorStore';
import { useOscilloscopeStore } from '@velxio/store/useOscilloscopeStore';

const DRAWER_HEIGHT = 190;

export function TaskWorkbench({ ready }: { ready: boolean }) {
  const serialOpen = useSimulatorStore((s) => s.serialMonitorOpen);
  const scopeOpen = useOscilloscopeStore((s) => s.open);

  // Without the electrical layer every button reads permanently pressed.
  useEffect(() => {
    startSimulation();
  }, []);

  return (
    <div className="workbench">
      <div className="panes">
        <div className="pane pane-code">
          <CodeEditor />
        </div>
        <div className="pane pane-canvas">
          {ready ? <SimulatorCanvas /> : <div className="pane-empty" />}
          {serialOpen ? (
            <div className="drawer" style={{ height: DRAWER_HEIGHT }}>
              <SerialMonitor />
            </div>
          ) : null}
          {scopeOpen ? (
            <div className="drawer" style={{ height: DRAWER_HEIGHT }}>
              <Oscilloscope />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
