import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { GraphEditor, ToolButton, edgeColorTools, type EditTool } from './components/GraphEditor';
import { OutputCanvas } from './components/OutputCanvas';
import { EXAMPLE_CATALOG, createExampleStateById, type ExampleId } from './domain/examples';
import { MAX_LEVEL } from './domain/level';
import { colorHex, EDGE_COLORS, PALETTE } from './domain/palette';
import { exportState, importState } from './domain/serialization';
import { createInitialState } from './domain/state';
import { buildOutputGraph } from './domain/substitution';
import type { AppState, EdgeColor, Graph } from './domain/types';

const MAX_UNDO_STATES = 100;

export default function App() {
  const [state, setState] = useState<AppState>(() => createInitialState());
  const [activeRule, setActiveRule] = useState<EdgeColor>('red');
  const [activeTool, setActiveTool] = useState<EditTool>('move');
  const [message, setMessage] = useState<string>('');
  const [resetKey, setResetKey] = useState(0);
  const stateRef = useRef<AppState>(state);
  const undoStackRef = useRef<AppState[]>([]);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const examplesMenuRef = useRef<HTMLDetailsElement | null>(null);

  stateRef.current = state;

  const output = useMemo(() => buildOutputGraph(state), [state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isUndoShortcut(event)) {
        return;
      }

      const previous = undoStackRef.current.at(-1);
      if (!previous) {
        return;
      }

      event.preventDefault();
      undoStackRef.current = undoStackRef.current.slice(0, -1);
      stateRef.current = previous;
      setState(previous);
      setMessage('Undone.');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function commitState(nextState: AppState) {
    stateRef.current = nextState;
    setState(nextState);
  }

  function commitGraphChange(update: (current: AppState) => AppState) {
    const current = stateRef.current;
    const nextState = update(current);
    undoStackRef.current = [...undoStackRef.current, cloneAppState(current)].slice(-MAX_UNDO_STATES);
    commitState(nextState);
  }

  function clearUndoHistory() {
    undoStackRef.current = [];
  }

  function updateSeed(seed: Graph) {
    commitGraphChange((current) => ({ ...current, seed }));
  }

  function updateRule(color: EdgeColor, graph: Graph) {
    commitGraphChange((current) => ({
      ...current,
      rulesByColor: {
        ...current.rulesByColor,
        [color]: graph,
      },
    }));
  }

  function updateLevel(level: number) {
    commitState({ ...stateRef.current, level });
  }

  function loadExample(id: ExampleId, name: string) {
    clearUndoHistory();
    commitState(createExampleStateById(id));
    setActiveRule('red');
    setMessage(`${name} loaded.`);
    setResetKey((key) => key + 1);
    examplesMenuRef.current?.removeAttribute('open');
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

    clearUndoHistory();
    commitState(result.state);
    setActiveRule('red');
    setMessage('JSON imported.');
    setResetKey((key) => key + 1);
  }

  return (
    <div className="app-frame">
      <header className="top-toolbar" role="toolbar" aria-label="Application toolbar">
        <h1>Geometric L-Systems</h1>

        <details className="toolbar-menu">
          <summary>File</summary>
          <div className="toolbar-menu-panel">
            <button type="button" onClick={exportJson}>
              <Download size={16} />
              Export
            </button>
            <button type="button" onClick={() => importInputRef.current?.click()}>
              <Upload size={16} />
              Import
            </button>
          </div>
        </details>

        <details className="toolbar-menu" ref={examplesMenuRef}>
          <summary>Examples</summary>
          <div className="toolbar-menu-panel examples-menu-panel" aria-label="Examples">
            {EXAMPLE_CATALOG.map((category) => (
              <div className="examples-menu-category" key={category.name}>
                <div className="toolbar-menu-section-label">{category.name}</div>
                {category.examples.map((example) => (
                  <button type="button" key={example.id} onClick={() => loadExample(example.id, example.name)}>
                    {example.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </details>
      </header>

      <div className="app-shell">
        <aside className="sidebar">
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImport} hidden />

          <div className="sidebar-content">
            <div className="sidebar-intro">
              <p>Seed graph and substitution rules</p>
            </div>

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

            {message ? <div className="status-message">{message}</div> : null}
          </div>

          <section className="control-section compact sidebar-footer">
            <label className="range-label" htmlFor="level">
              <span>Level</span>
              <strong>{state.level}</strong>
            </label>
            <input
              id="level"
              type="range"
              min="0"
              max={MAX_LEVEL}
              step="1"
              value={state.level}
              onInput={(event) => updateLevel(Number(event.currentTarget.value))}
              onChange={(event) => updateLevel(Number(event.target.value))}
            />
          </section>
        </aside>

        <OutputCanvas graph={output.graph} warnings={output.warnings} resetKey={resetKey} />
      </div>
    </div>
  );
}

function labelFor(color: EdgeColor): string {
  const entry = PALETTE.find((item) => item.id === color);
  return entry?.label ?? color;
}

function isUndoShortcut(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

function cloneAppState(state: AppState): AppState {
  return {
    ...state,
    palette: state.palette.map((entry) => ({ ...entry })),
    seed: cloneGraph(state.seed),
    rulesByColor: EDGE_COLORS.reduce((rules, color) => {
      rules[color] = cloneGraph(state.rulesByColor[color]);
      return rules;
    }, {} as AppState['rulesByColor']),
  };
}

function cloneGraph(graph: Graph): Graph {
  return {
    vertices: graph.vertices.map((vertex) => ({ ...vertex })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}
