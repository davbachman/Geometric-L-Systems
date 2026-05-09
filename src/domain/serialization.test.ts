import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { exportState, importState } from './serialization';

describe('state import/export', () => {
  it('exports JSON that can be imported to reproduce the same state', () => {
    const state = createInitialState();
    const imported = importState(exportState(state));

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.state).toEqual(state);
    }
  });

  it('rejects rules without required black and white endpoints', () => {
    const state = createInitialState();
    const broken = {
      ...state,
      rulesByColor: {
        ...state.rulesByColor,
        red: {
          vertices: [{ id: 'only', x: 0, y: 0, role: 'blackEndpoint' }],
          edges: [],
        },
      },
    };

    const imported = importState(JSON.stringify(broken));

    expect(imported).toEqual({ ok: false, error: 'Rule red must include black and white endpoints.' });
  });

  it('rejects edges that reference missing vertices', () => {
    const state = createInitialState();
    const broken = {
      ...state,
      seed: {
        vertices: [{ id: 'a', x: 0, y: 0 }],
        edges: [{ id: 'bad', sourceId: 'a', targetId: 'missing', kind: 'black' }],
      },
    };

    const imported = importState(JSON.stringify(broken));

    expect(imported).toEqual({ ok: false, error: 'Seed edge bad references a missing vertex.' });
  });

  it('imports saved states at level 7', () => {
    const state = { ...createInitialState(), level: 7 };
    const imported = importState(exportState(state));

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.state.level).toBe(7);
    }
  });
});
