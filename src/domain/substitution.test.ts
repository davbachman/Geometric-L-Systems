import { describe, expect, it } from 'vitest';
import { PALETTE } from './palette';
import { applySubstitution, buildOutputGraph } from './substitution';
import type { AppState, EdgeColor, Graph, RuleMap } from './types';

const seed: Graph = {
  vertices: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 100, y: 0 },
    { id: 'c', x: 0, y: 40 },
  ],
  edges: [
    { id: 'red-edge', sourceId: 'a', targetId: 'b', kind: 'colored', color: 'red' },
    { id: 'black-edge', sourceId: 'a', targetId: 'c', kind: 'black' },
  ],
};

const rules: RuleMap = {
  red: {
    vertices: [
      { id: 'black', x: 0, y: 0, role: 'blackEndpoint' },
      { id: 'white', x: 50, y: 0, role: 'whiteEndpoint' },
      { id: 'mid', x: 25, y: 25 },
    ],
    edges: [
      { id: 'r1', sourceId: 'black', targetId: 'mid', kind: 'colored', color: 'blue' },
      { id: 'r2', sourceId: 'mid', targetId: 'white', kind: 'black' },
    ],
  },
  blue: {
    vertices: [
      { id: 'black', x: 0, y: 0, role: 'blackEndpoint' },
      { id: 'white', x: 10, y: 0, role: 'whiteEndpoint' },
      { id: 'mid', x: 5, y: -5 },
    ],
    edges: [
      { id: 'b1', sourceId: 'black', targetId: 'mid', kind: 'colored', color: 'green' },
      { id: 'b2', sourceId: 'mid', targetId: 'white', kind: 'colored', color: 'green' },
    ],
  },
  green: {
    vertices: [
      { id: 'black', x: 0, y: 0, role: 'blackEndpoint' },
      { id: 'white', x: 10, y: 0, role: 'whiteEndpoint' },
    ],
    edges: [{ id: 'g1', sourceId: 'black', targetId: 'white', kind: 'colored', color: 'green' }],
  },
  purple: {
    vertices: [
      { id: 'black', x: 0, y: 0, role: 'blackEndpoint' },
      { id: 'white', x: 10, y: 0, role: 'whiteEndpoint' },
    ],
    edges: [{ id: 'p1', sourceId: 'black', targetId: 'white', kind: 'colored', color: 'purple' }],
  },
};

describe('applySubstitution', () => {
  it('returns the seed unchanged at level 0', () => {
    expect(applySubstitution(seed, rules, 0)).toEqual(seed);
  });

  it('replaces a colored edge with the matching rule graph at level 1', () => {
    const result = applySubstitution(seed, rules, 1);

    expect(result.vertices).toHaveLength(5);
    expect(result.edges).toHaveLength(3);
    expect(result.edges.filter((edge) => edge.kind === 'black')).toHaveLength(2);
    expect(result.edges.filter((edge) => edge.kind === 'colored').map((edge) => edge.color)).toEqual(['blue']);

    const mappedMid = result.vertices.find((vertex) => vertex.id.includes('mid'));
    expect(mappedMid).toMatchObject({ x: 50, y: 50 });
  });

  it('recursively substitutes colored edges produced by earlier levels', () => {
    const result = applySubstitution(seed, rules, 2);

    expect(result.edges.filter((edge) => edge.kind === 'colored').map((edge) => edge.color)).toEqual([
      'green',
      'green',
    ]);
    expect(result.edges.filter((edge) => edge.kind === 'black')).toHaveLength(2);
  });

  it('maps rule endpoints exactly to the tail and tip of diagonal edges', () => {
    const diagonalSeed: Graph = {
      vertices: [
        { id: 'a', x: 10, y: 20 },
        { id: 'b', x: 70, y: 100 },
      ],
      edges: [{ id: 'red-edge', sourceId: 'a', targetId: 'b', kind: 'colored', color: 'red' }],
    };

    const result = applySubstitution(diagonalSeed, rules, 1);
    const blackEndpoint = result.vertices.find((vertex) => vertex.id.includes('black'));
    const whiteEndpoint = result.vertices.find((vertex) => vertex.id.includes('white'));

    expect(blackEndpoint).toMatchObject({ x: 10, y: 20 });
    expect(whiteEndpoint).toMatchObject({ x: 70, y: 100 });
  });
});

describe('buildOutputGraph', () => {
  it('returns a warning instead of expanding an output that is too large to render safely', () => {
    const state = createBranchingState(15, 5);

    const result = buildOutputGraph(state);

    expect(result.graph).toEqual(state.seed);
    expect(result.warnings.map((warning) => warning.message).join(' ')).toContain('Output is too large');
  });

  it('returns a warning instead of crashing when graph references are inconsistent', () => {
    const state = createBranchingState(1, 1);
    state.seed.edges[0] = { id: 'broken', sourceId: 's0', targetId: 'missing', kind: 'colored', color: 'red' };

    expect(() => buildOutputGraph(state)).not.toThrow();
    expect(buildOutputGraph(state).warnings.map((warning) => warning.message).join(' ')).toContain('Could not build output');
  });
});

function createBranchingState(branching: number, level: number): AppState {
  return {
    version: 1,
    palette: PALETTE,
    level,
    seed: {
      vertices: [
        { id: 's0', x: 0, y: 0 },
        { id: 's1', x: 100, y: 0 },
      ],
      edges: [{ id: 'seed-red', sourceId: 's0', targetId: 's1', kind: 'colored', color: 'red' }],
    },
    rulesByColor: {
      red: createChainRule('red', branching),
      blue: createChainRule('blue', 1),
      green: createChainRule('green', 1),
      purple: createChainRule('purple', 1),
    },
  };
}

function createChainRule(color: EdgeColor, edgeCount: number): Graph {
  const vertices = [
    { id: 'black', x: 0, y: 0, role: 'blackEndpoint' as const },
    { id: 'white', x: edgeCount * 10, y: 0, role: 'whiteEndpoint' as const },
    ...Array.from({ length: Math.max(0, edgeCount - 1) }, (_, index) => ({
      id: `v${index + 1}`,
      x: (index + 1) * 10,
      y: 0,
    })),
  ];
  const orderedVertexIds = ['black', ...Array.from({ length: Math.max(0, edgeCount - 1) }, (_, index) => `v${index + 1}`), 'white'];

  return {
    vertices,
    edges: Array.from({ length: edgeCount }, (_, index) => ({
      id: `${color}-${index}`,
      sourceId: orderedVertexIds[index],
      targetId: orderedVertexIds[index + 1],
      kind: 'colored' as const,
      color,
    })),
  };
}
