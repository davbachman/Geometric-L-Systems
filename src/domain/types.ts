export type EdgeColor = 'red' | 'blue' | 'green' | 'purple';

export type VertexRole = 'blackEndpoint' | 'whiteEndpoint';

export interface Vertex {
  id: string;
  x: number;
  y: number;
  role?: VertexRole;
}

export type Edge =
  | {
      id: string;
      sourceId: string;
      targetId: string;
      kind: 'black';
    }
  | {
      id: string;
      sourceId: string;
      targetId: string;
      kind: 'colored';
      color: EdgeColor;
    };

export interface Graph {
  vertices: Vertex[];
  edges: Edge[];
}

export interface PaletteEntry {
  id: EdgeColor;
  label: string;
  hex: string;
}

export type RuleMap = Record<EdgeColor, Graph>;

export interface AppState {
  version: 1;
  palette: PaletteEntry[];
  seed: Graph;
  rulesByColor: RuleMap;
  level: number;
}

export interface SubstitutionWarning {
  color?: EdgeColor;
  message: string;
}

export interface OutputResult {
  graph: Graph;
  warnings: SubstitutionWarning[];
}
