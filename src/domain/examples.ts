import { createInitialRules } from './state';
import { PALETTE } from './palette';
import type { AppState, EdgeColor, Graph, RuleMap, VertexRole } from './types';

export type ExampleCategoryName = 'Space filling curves' | 'Plants' | 'Fractals';
export type ExampleId =
  | 'gosper'
  | 'dragon'
  | 'binary-tree'
  | 'bourke-bush'
  | 'bourke-stick'
  | 'sierpinski-triangle'
  | 'koch-snowflake';

export interface ExampleMenuItem {
  id: ExampleId;
  name: string;
  defaultLevel: number;
}

export interface ExampleCategory {
  name: ExampleCategoryName;
  examples: ExampleMenuItem[];
}

type DrawCommand = { kind: 'black' } | { kind: 'colored'; color: EdgeColor };

interface ProductionRule {
  symbol: string;
  color: EdgeColor;
  replacement: string;
}

interface ExampleSpec extends ExampleMenuItem {
  category: ExampleCategoryName;
  axiom: string;
  angle: number;
  drawMap: Record<string, DrawCommand>;
  rules: ProductionRule[];
  lengthFactor?: number;
}

interface TurtleVertex {
  id: string;
  x: number;
  y: number;
  role?: VertexRole;
}

interface TurtleGraph {
  vertices: TurtleVertex[];
  edges: Graph['edges'];
  startVertexId: string;
  endVertexId: string;
}

const RED: DrawCommand = { kind: 'colored', color: 'red' };
const BLUE: DrawCommand = { kind: 'colored', color: 'blue' };
const BLACK: DrawCommand = { kind: 'black' };

// Source strings are adapted from Paul Bourke's L-System manual and the Wikipedia L-system examples.
const EXAMPLE_SPECS: Record<ExampleId, ExampleSpec> = {
  gosper: {
    id: 'gosper',
    name: 'Gosper Curve',
    category: 'Space filling curves',
    defaultLevel: 3,
    axiom: 'A',
    angle: 60,
    drawMap: { A: RED, B: BLUE },
    rules: [
      { symbol: 'A', color: 'red', replacement: 'A-B--B+A++AA+B-' },
      { symbol: 'B', color: 'blue', replacement: '+A-BB--B-A++A+B' },
    ],
  },
  dragon: {
    id: 'dragon',
    name: 'Dragon Curve',
    category: 'Space filling curves',
    defaultLevel: 7,
    axiom: 'F',
    angle: 120,
    drawMap: { F: RED },
    rules: [{ symbol: 'F', color: 'red', replacement: 'F-F+F' }],
  },
  'binary-tree': {
    id: 'binary-tree',
    name: 'Binary Tree',
    category: 'Plants',
    defaultLevel: 6,
    axiom: 'F',
    angle: 45,
    drawMap: { F: RED, T: BLACK },
    lengthFactor: 2,
    rules: [{ symbol: 'F', color: 'red', replacement: '>T<[+F][-F]' }],
  },
  'bourke-bush': {
    id: 'bourke-bush',
    name: 'Bourke Bush',
    category: 'Plants',
    defaultLevel: 3,
    axiom: 'F',
    angle: 22.5,
    drawMap: { F: RED },
    rules: [{ symbol: 'F', color: 'red', replacement: 'FF+[+F-F-F]-[-F+F+F]' }],
  },
  'bourke-stick': {
    id: 'bourke-stick',
    name: 'Bourke Stick',
    category: 'Plants',
    defaultLevel: 5,
    axiom: 'X',
    angle: 20,
    drawMap: { F: RED, X: BLUE },
    lengthFactor: 2,
    rules: [
      { symbol: 'F', color: 'red', replacement: 'FF' },
      { symbol: 'X', color: 'blue', replacement: 'F[+>X<]F[->X<]+>X<' },
    ],
  },
  'sierpinski-triangle': {
    id: 'sierpinski-triangle',
    name: 'Sierpinski Triangle',
    category: 'Fractals',
    defaultLevel: 6,
    axiom: 'F-G-G',
    angle: 120,
    drawMap: { F: RED, G: BLUE },
    rules: [
      { symbol: 'F', color: 'red', replacement: 'F-G+F+G-F' },
      { symbol: 'G', color: 'blue', replacement: 'GG' },
    ],
  },
  'koch-snowflake': {
    id: 'koch-snowflake',
    name: 'Koch Snowflake',
    category: 'Fractals',
    defaultLevel: 4,
    axiom: 'F++F++F',
    angle: 60,
    drawMap: { F: RED },
    rules: [{ symbol: 'F', color: 'red', replacement: 'F-F++F-F' }],
  },
};

export const EXAMPLE_CATALOG: ExampleCategory[] = [
  createCategory('Space filling curves', ['gosper', 'dragon']),
  createCategory('Plants', ['binary-tree', 'bourke-bush', 'bourke-stick']),
  createCategory('Fractals', ['sierpinski-triangle', 'koch-snowflake']),
];

export function createExampleStateById(id: ExampleId): AppState {
  const spec = EXAMPLE_SPECS[id];
  return {
    version: 1,
    palette: PALETTE,
    seed: createGraph(spec.axiom, spec, false, `seed-${id}`),
    rulesByColor: createRules(spec),
    level: spec.defaultLevel,
  };
}

function createCategory(name: ExampleCategoryName, ids: ExampleId[]): ExampleCategory {
  return {
    name,
    examples: ids.map((id) => {
      const spec = EXAMPLE_SPECS[id];
      return { id: spec.id, name: spec.name, defaultLevel: spec.defaultLevel };
    }),
  };
}

function createRules(spec: ExampleSpec): RuleMap {
  const rules = createInitialRules();

  spec.rules.forEach((rule) => {
    rules[rule.color] = createGraph(rule.replacement, spec, true, `${spec.id}-${rule.symbol}`);
  });

  return rules;
}

function createGraph(source: string, spec: ExampleSpec, includeEndpointRoles: boolean, prefix: string): Graph {
  const raw = traceTurtle(source, spec, prefix);
  return normalizeGraph(raw, includeEndpointRoles);
}

function traceTurtle(source: string, spec: ExampleSpec, prefix: string): TurtleGraph {
  const vertices: TurtleVertex[] = [];
  const edges: Graph['edges'] = [];
  const stack: Array<{ x: number; y: number; heading: number; length: number; vertexId: string; turnSign: number }> = [];
  const turn = (spec.angle * Math.PI) / 180;
  const lengthFactor = spec.lengthFactor ?? 1;
  let x = 0;
  let y = 0;
  let heading = 0;
  let length = 1;
  let turnSign = 1;

  const addVertex = (nextX: number, nextY: number): string => {
    const id = `${prefix}-v${vertices.length}`;
    vertices.push({ id, x: round(nextX), y: round(nextY) });
    return id;
  };

  let currentVertexId = addVertex(x, y);
  const startVertexId = currentVertexId;

  for (const symbol of source) {
    if (symbol === '+') {
      heading += turn * turnSign;
    } else if (symbol === '-') {
      heading -= turn * turnSign;
    } else if (symbol === '|') {
      heading += Math.PI;
    } else if (symbol === '[') {
      stack.push({ x, y, heading, length, vertexId: currentVertexId, turnSign });
    } else if (symbol === ']') {
      const restored = stack.pop();
      if (restored) {
        x = restored.x;
        y = restored.y;
        heading = restored.heading;
        length = restored.length;
        currentVertexId = restored.vertexId;
        turnSign = restored.turnSign;
      }
    } else if (symbol === '>') {
      length *= lengthFactor;
    } else if (symbol === '<') {
      length /= lengthFactor;
    } else if (symbol === '&') {
      turnSign *= -1;
    } else if (symbol === 'f') {
      x += Math.cos(heading) * length;
      y += Math.sin(heading) * length;
      currentVertexId = addVertex(x, y);
    } else {
      const command = spec.drawMap[symbol];
      if (!command) {
        continue;
      }

      const sourceId = currentVertexId;
      x += Math.cos(heading) * length;
      y += Math.sin(heading) * length;
      const targetId = addVertex(x, y);
      edges.push(
        command.kind === 'black'
          ? { id: `${prefix}-e${edges.length}`, sourceId, targetId, kind: 'black' }
          : { id: `${prefix}-e${edges.length}`, sourceId, targetId, kind: 'colored', color: command.color },
      );
      currentVertexId = targetId;
    }
  }

  return { vertices, edges, startVertexId, endVertexId: currentVertexId };
}

function normalizeGraph(raw: TurtleGraph, includeEndpointRoles: boolean): Graph {
  const bounds = raw.vertices.reduce(
    (current, vertex) => ({
      minX: Math.min(current.minX, vertex.x),
      minY: Math.min(current.minY, vertex.y),
      maxX: Math.max(current.maxX, vertex.x),
      maxY: Math.max(current.maxY, vertex.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const width = Math.max(bounds.maxX - bounds.minX, 0);
  const height = Math.max(bounds.maxY - bounds.minY, 0);
  const scaleX = width > 0 ? 208 / width : Infinity;
  const scaleY = height > 0 ? 130 / height : Infinity;
  const scale = Math.min(scaleX, scaleY, 90);
  const safeScale = Number.isFinite(scale) ? scale : 90;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    vertices: raw.vertices.map((vertex) => ({
      id: vertex.id,
      x: round(140 + (vertex.x - centerX) * safeScale),
      y: round(90 - (vertex.y - centerY) * safeScale),
      ...(includeEndpointRoles && vertex.id === raw.startVertexId ? { role: 'blackEndpoint' as const } : {}),
      ...(includeEndpointRoles && vertex.id === raw.endVertexId ? { role: 'whiteEndpoint' as const } : {}),
    })),
    edges: raw.edges,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
