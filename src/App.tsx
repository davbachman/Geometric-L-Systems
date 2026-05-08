import { useMemo, useRef, useState } from 'react';
import { Download, FolderOpen, MousePointer2, Upload } from 'lucide-react';
import { GraphEditor, ToolButton, edgeColorTools, type EditTool } from './components/GraphEditor';
import { OutputCanvas } from './components/OutputCanvas';
import { colorHex, PALETTE } from './domain/palette';
import { createExampleState } from './domain/example';
import { exportState, importState } from './domain/serialization';
import { createInitialState } from './domain/state';
import { buildOutputGraph } from './domain/substitution';
import type { AppState, EdgeColor, Graph } from './domain/types';

export default function App() {
  const [state, setState] = useState<AppState>(() => createInitialState());
  const [activeRule, setActiveRule] = useState<EdgeColor>('red');
  const [activeTool, setActiveTool] = useState<EditTool>('move');
  const [message, setMessage] = useState<string>('');
  const [resetKey, setResetKey] = useState(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const output = useMemo(() => buildOutputGraph(state), [state]);

  function updateSeed(seed: Graph) {
    setState((current) => ({ ...current, seed }));
  }

  function updateRule(color: EdgeColor, graph: Graph) {
    setState((current) => ({
      ...current,
      rulesByColor: {
        ...current.rulesByColor,
        [color]: graph,
      },
    }));
  }

  function updateLevel(level: number) {
    setState((current) => ({ ...current, level }));
  }

  function loadExample() {
    setState(createExampleState());
    setActiveRule('red');
    setMessage('Example loaded.');
    setResetKey((key) => key + 1);
  }

  function exportJson() {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'geometric-lsystem.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('JSON exported.');
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const result = importState(await file.text());
    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    setState(result.state);
    setActiveRule('red');
    setMessage('JSON imported.');
    setResetKey((key) => key + 1);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="app-header">
          <div>
            <h1>Geometric L-Systems</h1>
            <p>Seed graph and substitution rules</p>
          </div>
          <button type="button" className="icon-button" onClick={loadExample} title="Load example">
            <FolderOpen size={18} />
          </button>
        </header>

        <section className="control-section">
          <div className="section-label">Edit Tool</div>
          <div className="tool-strip" aria-label="Edit tools">
            <ToolButton tool="move" activeTool={activeTool} label="Move vertices" onSelect={setActiveTool} />
            <ToolButton tool="black" activeTool={activeTool} label="Black edge" onSelect={setActiveTool} />
            {edgeColorTools().map((color) => (
              <ToolButton key={color} tool={color} activeTool={activeTool} label={`${color} oriented edge`} onSelect={setActiveTool} />
            ))}
          </div>
        </section>

        <GraphEditor graph={state.seed} title="Seed" activeTool={activeTool} onChange={updateSeed} />

        <section className="control-section compact">
          <label className="range-label" htmlFor="level">
            <span>Level</span>
            <strong>{state.level}</strong>
          </label>
          <input
            id="level"
            type="range"
            min="0"
            max="5"
            step="1"
            value={state.level}
            onInput={(event) => updateLevel(Number(event.currentTarget.value))}
            onChange={(event) => updateLevel(Number(event.target.value))}
          />
        </section>

        <section className="control-section">
          <div className="section-label">Rules</div>
          <div className="rule-tabs" role="tablist" aria-label="Substitution rules">
            {PALETTE.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`rule-tab${activeRule === entry.id ? ' active' : ''}`}
                onClick={() => setActiveRule(entry.id)}
                role="tab"
                aria-selected={activeRule === entry.id}
              >
                <span className="tab-swatch" style={{ background: entry.hex }} />
                {entry.label}
              </button>
            ))}
          </div>
        </section>

        <GraphEditor
          graph={state.rulesByColor[activeRule]}
          title={`${labelFor(activeRule)} Rule`}
          activeTool={activeTool}
          onChange={(graph) => updateRule(activeRule, graph)}
        />

        <section className="control-section import-export">
          <button type="button" onClick={exportJson}>
            <Download size={16} />
            Export JSON
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()}>
            <Upload size={16} />
            Import JSON
          </button>
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImport} hidden />
        </section>

        {message ? <div className="status-message">{message}</div> : null}
      </aside>

      <OutputCanvas graph={output.graph} warnings={output.warnings} resetKey={resetKey} />
    </div>
  );
}

function labelFor(color: EdgeColor): string {
  const entry = PALETTE.find((item) => item.id === color);
  return entry?.label ?? color;
}
