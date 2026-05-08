import { EDGE_COLORS, PALETTE } from './palette';
import type { AppState, Graph, RuleMap } from './types';

export function createEndpointRule(): Graph {
  return {
    vertices: [
      { id: 'black', x: 36, y: 90, role: 'blackEndpoint' },
      { id: 'white', x: 244, y: 90, role: 'whiteEndpoint' },
    ],
    edges: [],
  };
}

export function createInitialRules(): RuleMap {
  return EDGE_COLORS.reduce((rules, color) => {
    rules[color] = createEndpointRule();
    return rules;
  }, {} as RuleMap);
}

export function createInitialState(): AppState {
  return {
    version: 1,
    palette: PALETTE,
    seed: { vertices: [], edges: [] },
    rulesByColor: createInitialRules(),
    level: 0,
  };
}
