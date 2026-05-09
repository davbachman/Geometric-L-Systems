import { describe, expect, it } from 'vitest';
import { EDGE_COLORS } from './palette';
import { buildOutputGraph, collectRuleWarnings } from './substitution';
import { EXAMPLE_CATALOG, createExampleStateById } from './examples';

describe('example catalog', () => {
  it('contains the requested categories and examples', () => {
    expect(EXAMPLE_CATALOG.map((category) => category.name)).toEqual([
      'Space filling curves',
      'Plants',
      'Fractals',
    ]);

    expect(exampleNames('Space filling curves')).toEqual([
      'Gosper Curve',
      'Dragon Curve',
    ]);
    expect(exampleNames('Plants')).toEqual([
      'Binary Tree',
      'Bourke Bush',
      'Bourke Stick',
    ]);
    expect(exampleNames('Fractals')).toEqual(['Sierpinski Triangle', 'Koch Snowflake']);
  });

  it('creates valid, renderable graph-substitution states for every example', () => {
    for (const category of EXAMPLE_CATALOG) {
      for (const example of category.examples) {
        const state = createExampleStateById(example.id);

        expect(state.level, example.name).toBe(example.defaultLevel);
        expect(EDGE_COLORS.every((color) => state.rulesByColor[color].vertices.length >= 2), example.name).toBe(true);
        expect(collectRuleWarnings(state.rulesByColor), example.name).toEqual([]);

        const output = buildOutputGraph(state);

        expect(output.warnings, example.name).toEqual([]);
        expect(output.graph.edges.length, example.name).toBeGreaterThan(0);
      }
    }
  });

  it('returns an independent state copy for each load', () => {
    const first = createExampleStateById('gosper');
    const second = createExampleStateById('gosper');

    first.seed.vertices[0].x += 10;

    expect(second.seed.vertices[0].x).not.toBe(first.seed.vertices[0].x);
  });

  it('uses the two-symbol Sierpinski triangle grammar instead of a single-edge dragon-like rule', () => {
    const state = createExampleStateById('sierpinski-triangle');

    expect(coloredEdgeColors(state.seed)).toEqual(['red', 'blue', 'blue']);
    expect(coloredEdgeColors(state.rulesByColor.red)).toEqual(['red', 'blue', 'red', 'blue', 'red']);
    expect(coloredEdgeColors(state.rulesByColor.blue)).toEqual(['blue', 'blue']);
  });

  it('uses the one-edge version of the original triangular seed for the Dragon curve', () => {
    const state = createExampleStateById('dragon');

    expect(coloredEdgeColors(state.seed)).toEqual(['red']);
    expect(blackEdgeCount(state.seed)).toBe(0);
    expect(coloredEdgeColors(state.rulesByColor.red)).toEqual(['red', 'red', 'red']);
    expect(blackEdgeCount(state.rulesByColor.red)).toBe(0);
    expect(state.rulesByColor.blue.edges).toHaveLength(0);
  });

  it('uses a red branch symbol for the Binary Tree example', () => {
    const state = createExampleStateById('binary-tree');
    const redRule = state.rulesByColor.red;
    const blackEndpoint = redRule.vertices.find((vertex) => vertex.role === 'blackEndpoint');
    const whiteEndpoint = redRule.vertices.find((vertex) => vertex.role === 'whiteEndpoint');

    expect(coloredEdgeColors(state.seed)).toEqual(['red']);
    expect(blackEndpoint).toBeDefined();
    expect(whiteEndpoint).toBeDefined();
    expect(redRule.edges).toContainEqual({
      id: expect.any(String),
      sourceId: blackEndpoint?.id,
      targetId: whiteEndpoint?.id,
      kind: 'black',
    });
    expect(
      redRule.edges.filter((edge) => edge.kind === 'colored' && edge.color === 'red' && edge.sourceId === whiteEndpoint?.id),
    ).toHaveLength(2);
    expect(edgeLength(redRule, blackEndpoint?.id, whiteEndpoint?.id) / averageBranchLength(redRule, whiteEndpoint?.id)).toBeCloseTo(2);
  });

  it('doubles the blue edges in the Bourke Stick blue substitution rule', () => {
    const state = createExampleStateById('bourke-stick');
    const blueRule = state.rulesByColor.blue;

    expect(averageColoredEdgeLength(blueRule, 'blue') / averageColoredEdgeLength(blueRule, 'red')).toBeCloseTo(2);
  });

  it('uses a clean editable replacement for Gosper', () => {
    for (const id of ['gosper'] as const) {
      const state = createExampleStateById(id);

      expect(coloredEdgeColors(state.seed), id).toEqual(['red']);
      expect(blackEdgeCount(state.seed), id).toBe(0);
      expect(blackEdgeCount(state.rulesByColor.red), id).toBe(0);
      expect(coloredEdgeColors(state.rulesByColor.red).length, id).toBe(expectedRedRuleEdgeCount[id]);
    }
  });
});

const expectedRedRuleEdgeCount = {
  gosper: 7,
} as const;

function exampleNames(categoryName: string): string[] {
  const category = EXAMPLE_CATALOG.find((entry) => entry.name === categoryName);
  return category?.examples.map((example) => example.name) ?? [];
}

function coloredEdgeColors(graph: ReturnType<typeof createExampleStateById>['seed']): string[] {
  return graph.edges.flatMap((edge) => (edge.kind === 'colored' ? [edge.color] : []));
}

function blackEdgeCount(graph: ReturnType<typeof createExampleStateById>['seed']): number {
  return graph.edges.filter((edge) => edge.kind === 'black').length;
}

function edgeLength(graph: ReturnType<typeof createExampleStateById>['seed'], sourceId: string | undefined, targetId: string | undefined): number {
  const edge = graph.edges.find((item) => item.sourceId === sourceId && item.targetId === targetId);
  if (!edge) {
    return 0;
  }
  const source = graph.vertices.find((vertex) => vertex.id === edge.sourceId);
  const target = graph.vertices.find((vertex) => vertex.id === edge.targetId);
  if (!source || !target) {
    return 0;
  }
  return Math.hypot(target.x - source.x, target.y - source.y);
}

function averageBranchLength(graph: ReturnType<typeof createExampleStateById>['seed'], sourceId: string | undefined): number {
  const lengths = graph.edges
    .filter((edge) => edge.kind === 'colored' && edge.color === 'red' && edge.sourceId === sourceId)
    .map((edge) => edgeLength(graph, edge.sourceId, edge.targetId));

  return lengths.reduce((total, length) => total + length, 0) / lengths.length;
}

function averageColoredEdgeLength(graph: ReturnType<typeof createExampleStateById>['seed'], color: string): number {
  const lengths = graph.edges
    .filter((edge) => edge.kind === 'colored' && edge.color === color)
    .map((edge) => edgeLength(graph, edge.sourceId, edge.targetId));

  return lengths.reduce((total, length) => total + length, 0) / lengths.length;
}
