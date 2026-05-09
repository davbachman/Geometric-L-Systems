import { EDGE_COLORS, PALETTE } from './palette';
import { MAX_LEVEL } from './level';
import type { AppState, Edge, EdgeColor, Graph, PaletteEntry, RuleMap, Vertex, VertexRole } from './types';

type ImportResult = { ok: true; state: AppState } | { ok: false; error: string };

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importState(serialized: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { ok: false, error: 'Import must be valid JSON.' };
  }

  return validateState(parsed);
}

export function validateState(value: unknown): ImportResult {
  if (!isRecord(value)) {
    return { ok: false, error: 'Import must be a JSON object.' };
  }

  if (value.version !== 1) {
    return { ok: false, error: 'Import version must be 1.' };
  }

  const seed = validateGraph(value.seed, 'Seed', false);
  if (!seed.ok) {
    return seed;
  }

  const rules = validateRuleMap(value.rulesByColor);
  if (!rules.ok) {
    return rules;
  }

  const level = validateLevel(value.level);
  if (!level.ok) {
    return level;
  }

  return {
    ok: true,
    state: {
      version: 1,
      palette: validatePalette(value.palette),
      seed: seed.graph,
      rulesByColor: rules.rulesByColor,
      level: level.level,
    },
  };
}

function validateRuleMap(value: unknown): { ok: true; rulesByColor: RuleMap } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: 'rulesByColor must be an object.' };
  }

  const entries = {} as RuleMap;
  for (const color of EDGE_COLORS) {
    const graph = validateGraph(value[color], `Rule ${color}`, true);
    if (!graph.ok) {
      return graph;
    }
    entries[color] = graph.graph;
  }

  return { ok: true, rulesByColor: entries };
}

function validateGraph(
  value: unknown,
  label: string,
  requireEndpoints: boolean,
): { ok: true; graph: Graph } | { ok: false; error: string } {
  if (!isRecord(value) || !Array.isArray(value.vertices) || !Array.isArray(value.edges)) {
    return { ok: false, error: `${label} must include vertices and edges arrays.` };
  }

  const vertices: Vertex[] = [];
  const vertexIds = new Set<string>();

  for (const rawVertex of value.vertices) {
    if (!isRecord(rawVertex) || typeof rawVertex.id !== 'string' || !isFiniteNumber(rawVertex.x) || !isFiniteNumber(rawVertex.y)) {
      return { ok: false, error: `${label} contains an invalid vertex.` };
    }

    if (vertexIds.has(rawVertex.id)) {
      return { ok: false, error: `${label} contains duplicate vertex id ${rawVertex.id}.` };
    }

    const role = validateRole(rawVertex.role);
    if (!role.ok) {
      return { ok: false, error: `${label} vertex ${rawVertex.id} has an invalid role.` };
    }

    vertexIds.add(rawVertex.id);
    vertices.push({ id: rawVertex.id, x: rawVertex.x, y: rawVertex.y, ...(role.role ? { role: role.role } : {}) });
  }

  if (requireEndpoints) {
    const hasBlack = vertices.some((vertex) => vertex.role === 'blackEndpoint');
    const hasWhite = vertices.some((vertex) => vertex.role === 'whiteEndpoint');
    if (!hasBlack || !hasWhite) {
      return { ok: false, error: `${label} must include black and white endpoints.` };
    }
  }

  const edges: Edge[] = [];
  const edgeIds = new Set<string>();
  for (const rawEdge of value.edges) {
    if (
      !isRecord(rawEdge) ||
      typeof rawEdge.id !== 'string' ||
      typeof rawEdge.sourceId !== 'string' ||
      typeof rawEdge.targetId !== 'string'
    ) {
      return { ok: false, error: `${label} contains an invalid edge.` };
    }

    if (edgeIds.has(rawEdge.id)) {
      return { ok: false, error: `${label} contains duplicate edge id ${rawEdge.id}.` };
    }

    if (!vertexIds.has(rawEdge.sourceId) || !vertexIds.has(rawEdge.targetId)) {
      return { ok: false, error: `${label} edge ${rawEdge.id} references a missing vertex.` };
    }

    if (rawEdge.kind === 'black') {
      edges.push({ id: rawEdge.id, sourceId: rawEdge.sourceId, targetId: rawEdge.targetId, kind: 'black' });
    } else if (rawEdge.kind === 'colored' && isEdgeColor(rawEdge.color)) {
      edges.push({
        id: rawEdge.id,
        sourceId: rawEdge.sourceId,
        targetId: rawEdge.targetId,
        kind: 'colored',
        color: rawEdge.color,
      });
    } else {
      return { ok: false, error: `${label} edge ${rawEdge.id} has an invalid kind or color.` };
    }

    edgeIds.add(rawEdge.id);
  }

  return { ok: true, graph: { vertices, edges } };
}

function validateLevel(value: unknown): { ok: true; level: number } | { ok: false; error: string } {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_LEVEL) {
    return { ok: false, error: `level must be an integer from 0 to ${MAX_LEVEL}.` };
  }

  return { ok: true, level: value };
}

function validatePalette(value: unknown): PaletteEntry[] {
  if (!Array.isArray(value)) {
    return PALETTE;
  }

  const entries = value.filter(isPaletteEntry);
  return entries.length === PALETTE.length ? entries : PALETTE;
}

function validateRole(value: unknown): { ok: true; role?: VertexRole } | { ok: false } {
  if (value === undefined) {
    return { ok: true };
  }

  return value === 'blackEndpoint' || value === 'whiteEndpoint' ? { ok: true, role: value } : { ok: false };
}

function isPaletteEntry(value: unknown): value is PaletteEntry {
  return (
    isRecord(value) &&
    isEdgeColor(value.id) &&
    typeof value.label === 'string' &&
    typeof value.hex === 'string'
  );
}

function isEdgeColor(value: unknown): value is EdgeColor {
  return typeof value === 'string' && EDGE_COLORS.includes(value as EdgeColor);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
