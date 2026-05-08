import { EDGE_COLORS } from './palette';
import type { AppState, Edge, EdgeColor, Graph, OutputResult, RuleMap, SubstitutionWarning, Vertex } from './types';

const EPSILON = 0.0001;
const MAX_OUTPUT_VERTICES = 500_000;
const MAX_OUTPUT_EDGES = 250_000;

interface Transform {
  source: Vertex;
  cos: number;
  sin: number;
  scale: number;
  origin: Vertex;
}

export function applySubstitution(seed: Graph, rulesByColor: RuleMap, level: number): Graph {
  let graph = cloneGraph(seed);
  for (let depth = 0; depth < level; depth += 1) {
    graph = substituteOnce(graph, rulesByColor, depth);
  }
  return graph;
}

export function buildOutputGraph(state: AppState): OutputResult {
  const warnings = collectRuleWarnings(state.rulesByColor);
  if (warnings.length > 0) {
    return { graph: cloneGraph(state.seed), warnings };
  }

  const estimatedSize = estimateSubstitutionSize(state.seed, state.rulesByColor, state.level);
  if (estimatedSize.vertices > MAX_OUTPUT_VERTICES || estimatedSize.edges > MAX_OUTPUT_EDGES) {
    return {
      graph: cloneGraph(state.seed),
      warnings: [
        {
          message: `Output is too large to render safely at level ${state.level}: about ${formatCount(
            estimatedSize.vertices,
          )} vertices and ${formatCount(estimatedSize.edges)} edges. Lower the level or simplify the rules.`,
        },
      ],
    };
  }

  try {
    return {
      graph: applySubstitution(state.seed, state.rulesByColor, state.level),
      warnings,
    };
  } catch (error) {
    return {
      graph: cloneGraph(state.seed),
      warnings: [{ message: `Could not build output: ${error instanceof Error ? error.message : 'unknown error'}` }],
    };
  }
}

export function collectRuleWarnings(rulesByColor: RuleMap): SubstitutionWarning[] {
  return EDGE_COLORS.flatMap((color) => {
    const endpoints = getRuleEndpoints(rulesByColor[color]);
    if (!endpoints) {
      return [{ color, message: `Rule ${color} must include black and white endpoints.` }];
    }

    if (distance(endpoints.black, endpoints.white) < EPSILON) {
      return [{ color, message: `Rule ${color} endpoints are too close together.` }];
    }

    return [];
  });
}

function substituteOnce(graph: Graph, rulesByColor: RuleMap, depth: number): Graph {
  const next: Graph = { vertices: [], edges: [] };
  const sourceById = new Map(graph.vertices.map((vertex) => [vertex.id, vertex]));
  const copiedVertexIds = new Map<string, string>();

  const copySourceVertex = (vertexId: string): string => {
    const existing = copiedVertexIds.get(vertexId);
    if (existing) {
      return existing;
    }

    const vertex = sourceById.get(vertexId);
    if (!vertex) {
      throw new Error(`Edge references missing vertex ${vertexId}.`);
    }

    const copiedId = `d${depth}:keep:${vertex.id}`;
    copiedVertexIds.set(vertexId, copiedId);
    next.vertices.push({ ...vertex, id: copiedId });
    return copiedId;
  };

  graph.edges.forEach((edge, edgeIndex) => {
    if (edge.kind === 'black') {
      next.edges.push({
        id: `d${depth}:black:${edge.id}`,
        sourceId: copySourceVertex(edge.sourceId),
        targetId: copySourceVertex(edge.targetId),
        kind: 'black',
      });
      return;
    }

    const source = sourceById.get(edge.sourceId);
    const target = sourceById.get(edge.targetId);
    if (!source || !target) {
      throw new Error(`Edge ${edge.id} references a missing vertex.`);
    }

    appendRuleReplacement(next, rulesByColor[edge.color], edge.color, source, target, `d${depth}:e${edgeIndex}`);
  });

  return next;
}

function estimateSubstitutionSize(seed: Graph, rulesByColor: RuleMap, level: number): { vertices: number; edges: number } {
  let blackEdges = 0;
  let coloredEdges = createEmptyColorCounts();
  for (const edge of seed.edges) {
    if (edge.kind === 'black') {
      blackEdges += 1;
    } else {
      coloredEdges[edge.color] += 1;
    }
  }

  let vertices = seed.vertices.length;
  let edges = seed.edges.length;
  for (let depth = 0; depth < level; depth += 1) {
    const nextColoredEdges = createEmptyColorCounts();
    let nextBlackEdges = blackEdges;
    let nextVertices = blackEdges * 2;

    for (const color of EDGE_COLORS) {
      const count = coloredEdges[color];
      if (count === 0) {
        continue;
      }

      const rule = rulesByColor[color];
      nextVertices += count * rule.vertices.length;
      for (const edge of rule.edges) {
        if (edge.kind === 'black') {
          nextBlackEdges += count;
        } else {
          nextColoredEdges[edge.color] += count;
        }
      }
    }

    blackEdges = nextBlackEdges;
    coloredEdges = nextColoredEdges;
    edges = blackEdges + EDGE_COLORS.reduce((total, color) => total + coloredEdges[color], 0);
    vertices = nextVertices;

    if (vertices > MAX_OUTPUT_VERTICES || edges > MAX_OUTPUT_EDGES) {
      return { vertices, edges };
    }
  }

  return { vertices, edges };
}

function createEmptyColorCounts(): Record<EdgeColor, number> {
  return { red: 0, blue: 0, green: 0, purple: 0 };
}

function appendRuleReplacement(
  targetGraph: Graph,
  rule: Graph,
  color: EdgeColor,
  source: Vertex,
  target: Vertex,
  prefix: string,
): void {
  const endpoints = getRuleEndpoints(rule);
  if (!endpoints) {
    throw new Error(`Rule ${color} must include black and white endpoints.`);
  }

  const transform = createSimilarityTransform(endpoints.black, endpoints.white, source, target);
  const idMap = new Map<string, string>();

  rule.vertices.forEach((vertex) => {
    const mapped = applyTransform(vertex, transform);
    const id = `${prefix}:${color}:v:${vertex.id}`;
    idMap.set(vertex.id, id);
    targetGraph.vertices.push({ ...mapped, id, role: vertex.role });
  });

  rule.edges.forEach((edge, index) => {
    const sourceId = idMap.get(edge.sourceId);
    const targetId = idMap.get(edge.targetId);
    if (!sourceId || !targetId) {
      throw new Error(`Rule ${color} edge ${edge.id} references a missing vertex.`);
    }

    targetGraph.edges.push(
      edge.kind === 'black'
        ? {
            id: `${prefix}:${color}:edge:${index}:${edge.id}`,
            sourceId,
            targetId,
            kind: 'black',
          }
        : {
            id: `${prefix}:${color}:edge:${index}:${edge.id}`,
            sourceId,
            targetId,
            kind: 'colored',
            color: edge.color,
          },
    );
  });
}

function createSimilarityTransform(ruleBlack: Vertex, ruleWhite: Vertex, edgeSource: Vertex, edgeTarget: Vertex): Transform {
  const ruleVector = { x: ruleWhite.x - ruleBlack.x, y: ruleWhite.y - ruleBlack.y };
  const edgeVector = { x: edgeTarget.x - edgeSource.x, y: edgeTarget.y - edgeSource.y };
  const ruleLength = Math.hypot(ruleVector.x, ruleVector.y);
  const edgeLength = Math.hypot(edgeVector.x, edgeVector.y);

  if (ruleLength < EPSILON) {
    throw new Error('Rule endpoints are too close together.');
  }

  const ruleAngle = Math.atan2(ruleVector.y, ruleVector.x);
  const edgeAngle = Math.atan2(edgeVector.y, edgeVector.x);
  const angle = edgeAngle - ruleAngle;

  return {
    source: edgeSource,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    scale: edgeLength / ruleLength,
    origin: ruleBlack,
  };
}

function applyTransform(vertex: Vertex, transform: Transform): Vertex {
  const x = vertex.x - transform.origin.x;
  const y = vertex.y - transform.origin.y;

  return {
    id: vertex.id,
    x: round(transform.source.x + transform.scale * (x * transform.cos - y * transform.sin)),
    y: round(transform.source.y + transform.scale * (x * transform.sin + y * transform.cos)),
    role: vertex.role,
  };
}

function getRuleEndpoints(rule: Graph): { black: Vertex; white: Vertex } | null {
  const black = rule.vertices.find((vertex) => vertex.role === 'blackEndpoint');
  const white = rule.vertices.find((vertex) => vertex.role === 'whiteEndpoint');

  if (!black || !white) {
    return null;
  }

  return { black, white };
}

function distance(a: Vertex, b: Vertex): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cloneGraph(graph: Graph): Graph {
  return {
    vertices: graph.vertices.map((vertex) => ({ ...vertex })),
    edges: graph.edges.map(cloneEdge),
  };
}

function cloneEdge(edge: Edge): Edge {
  return edge.kind === 'black' ? { ...edge } : { ...edge };
}

function round(value: number): number {
  return Math.abs(value) < EPSILON ? 0 : Number(value.toFixed(6));
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
