import { describe, expect, it } from 'vitest';
import { EDGE_COLORS } from './palette';
import { createInitialState } from './state';

describe('initial app state', () => {
  it('starts substitution rules with only black and white endpoint vertices', () => {
    const state = createInitialState();

    for (const color of EDGE_COLORS) {
      expect(state.rulesByColor[color].vertices.map((vertex) => vertex.role)).toEqual(['blackEndpoint', 'whiteEndpoint']);
      expect(state.rulesByColor[color].edges).toEqual([]);
    }
  });
});
