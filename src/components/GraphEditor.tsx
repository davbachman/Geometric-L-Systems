import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MousePointer2 } from 'lucide-react';
import { colorHex, EDGE_COLORS, PALETTE } from '../domain/palette';
import { createId } from '../domain/ids';
import type { Edge, EdgeColor, Graph, Vertex } from '../domain/types';

export type EditTool = 'move' | 'black' | EdgeColor;

interface GraphEditorProps {
  graph: Graph;
  title: string;
  activeTool: EditTool;
  onChange: (graph: Graph) => void;
}

type Selection = { kind: 'vertex' | 'edge'; id: string } | null;

type Interaction =
  | { kind: 'move'; vertexId: string; pointerId: number }
  | { kind: 'edge'; sourceId: string; pointerId: number; pointer: Point; startedAt: Point; hasDragged: boolean }
  | { kind: 'new-edge'; source: Point; pointerId: number; pointer: Point; hasDragged: boolean }
  | null;

interface Point {
  x: number;
  y: number;
}

interface EditorViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const VIEW_WIDTH = 280;
const VIEW_HEIGHT = 180;
const INITIAL_VIEW_BOX: EditorViewBox = { x: 0, y: 0, width: VIEW_WIDTH, height: VIEW_HEIGHT };
const VERTEX_RADIUS = 7;
const WHITE_ENDPOINT_RING_RADIUS = 11;
const ARROW_ENDPOINT_GAP = 12;
const EDGE_TARGET_RADIUS = 14;
const MIN_EDGE_DRAG_DISTANCE = 6;
const MIN_VIEW_WIDTH = 28;
const MAX_VIEW_WIDTH = 1800;

export function GraphEditor({ graph, title, activeTool, onChange }: GraphEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const markerPrefix = useId().replaceAll(':', '');
  const [selection, setSelection] = useState<Selection>(null);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const interactionRef = useRef<Interaction>(null);
  const [pendingEdgeSourceId, setPendingEdgeSourceId] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState<EditorViewBox>(INITIAL_VIEW_BOX);

  const vertexById = useMemo(() => new Map(graph.vertices.map((vertex) => [vertex.id, vertex])), [graph.vertices]);

  useEffect(() => {
    if (activeTool === 'move') {
      setPendingEdgeSourceId(null);
    }
  }, [activeTool]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();

      const bounds = svg.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        const zoom = clamp(Math.exp(-event.deltaY * 0.01), 0.75, 1.35);
        setViewBox((current) => {
          const renderedViewBox = getRenderedViewBox(bounds, current);
          const pointerFraction = clientToViewBoxFraction(event.clientX, event.clientY, renderedViewBox);
          return zoomEditorViewBox(current, pointerFraction, zoom);
        });
        return;
      }

      setViewBox((current) => {
        const renderedViewBox = getRenderedViewBox(bounds, current);
        return {
          ...current,
          x: roundViewValue(current.x + event.deltaX * (current.width / renderedViewBox.width)),
          y: roundViewValue(current.y + event.deltaY * (current.height / renderedViewBox.height)),
        };
      });
    };

    svg.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleNativeWheel);
  }, []);

  useEffect(() => {
    const cancelEdgeDraft = () => {
      const currentInteraction = interactionRef.current;
      if (!isEdgeDraft(currentInteraction)) {
        return;
      }

      setPendingEdgeSourceId(null);
      updateInteraction(null);
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isEdgeDraft(interactionRef.current)) {
        return;
      }

      event.preventDefault();
      cancelEdgeDraft();
    };

    const cancelIfOutside = (event: PointerEvent) => {
      const host = hostRef.current;
      if (!host || !isEdgeDraft(interactionRef.current) || !(event.target instanceof Node)) {
        return;
      }

      if (!host.contains(event.target)) {
        cancelEdgeDraft();
      }
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    document.addEventListener('pointerdown', cancelIfOutside, true);
    document.addEventListener('pointerup', cancelIfOutside, true);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
      document.removeEventListener('pointerdown', cancelIfOutside, true);
      document.removeEventListener('pointerup', cancelIfOutside, true);
    };
  }, []);

  function focusEditor() {
    hostRef.current?.focus();
  }

  function updateInteraction(nextInteraction: Interaction) {
    interactionRef.current = nextInteraction;
    setInteraction(nextInteraction);
  }

  function toSvgPoint(event: React.PointerEvent<SVGElement>): Point {
    return clientToGraphPoint(event.clientX, event.clientY);
  }

  function clientToGraphPoint(clientX: number, clientY: number): Point {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) {
      return { x: 0, y: 0 };
    }

    const renderedViewBox = getRenderedViewBox(bounds, viewBox);
    const pointerFraction = clientToViewBoxFraction(clientX, clientY, renderedViewBox);

    return {
      x: viewBox.x + pointerFraction.x * viewBox.width,
      y: viewBox.y + pointerFraction.y * viewBox.height,
    };
  }

  function handleBackgroundPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const target = event.target as Element;
    if (event.target !== event.currentTarget && !target.classList.contains('editor-bg')) {
      return;
    }

    focusEditor();
    const point = toSvgPoint(event);
    if (activeTool !== 'move') {
      const nearbyVertex = findNearestVertex(point);
      if (nearbyVertex) {
        setSelection({ kind: 'vertex', id: nearbyVertex.id });
        setPendingEdgeSourceId(nearbyVertex.id);
        updateInteraction({
          kind: 'edge',
          sourceId: nearbyVertex.id,
          pointerId: event.pointerId,
          pointer: point,
          startedAt: point,
          hasDragged: false,
        });
        return;
      }

      setSelection(null);
      setPendingEdgeSourceId(null);
      updateInteraction({ kind: 'new-edge', source: point, pointerId: event.pointerId, pointer: point, hasDragged: false });
      return;
    }

    setSelection(null);
    setPendingEdgeSourceId(null);
  }

  function handleVertexPointerDown(event: React.PointerEvent<SVGCircleElement>, vertexId: string) {
    event.stopPropagation();
    focusEditor();
    setSelection({ kind: 'vertex', id: vertexId });

    if (activeTool === 'move') {
      svgRef.current?.setPointerCapture(event.pointerId);
      updateInteraction({ kind: 'move', vertexId, pointerId: event.pointerId });
    } else if (pendingEdgeSourceId && pendingEdgeSourceId !== vertexId) {
      addEdge(pendingEdgeSourceId, vertexId);
      setPendingEdgeSourceId(null);
      updateInteraction(null);
    } else if (pendingEdgeSourceId === vertexId) {
      setPendingEdgeSourceId(null);
      updateInteraction(null);
    } else {
      setPendingEdgeSourceId(vertexId);
      const point = toSvgPoint(event);
      updateInteraction({
        kind: 'edge',
        sourceId: vertexId,
        pointerId: event.pointerId,
        pointer: point,
        startedAt: point,
        hasDragged: false,
      });
    }
  }

  function handleVertexPointerUp(event: React.PointerEvent<SVGCircleElement>, vertexId: string) {
    const currentInteraction = interactionRef.current;
    if (activeTool === 'move' || !currentInteraction || currentInteraction.kind !== 'edge' || currentInteraction.sourceId === vertexId) {
      return;
    }

    event.stopPropagation();
    addEdge(currentInteraction.sourceId, vertexId);
    setPendingEdgeSourceId(null);
    updateInteraction(null);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const currentInteraction = interactionRef.current;
    if (!currentInteraction || currentInteraction.pointerId !== event.pointerId) {
      return;
    }

    const point = toSvgPoint(event);
    if (currentInteraction.kind === 'edge') {
      updateInteraction({
        ...currentInteraction,
        pointer: point,
        hasDragged:
          currentInteraction.hasDragged ||
          Math.hypot(point.x - currentInteraction.startedAt.x, point.y - currentInteraction.startedAt.y) >= MIN_EDGE_DRAG_DISTANCE,
      });
      return;
    }

    if (currentInteraction.kind === 'new-edge') {
      updateInteraction({
        ...currentInteraction,
        pointer: point,
        hasDragged:
          currentInteraction.hasDragged ||
          Math.hypot(point.x - currentInteraction.source.x, point.y - currentInteraction.source.y) >= MIN_EDGE_DRAG_DISTANCE,
      });
      return;
    }

    onChange({
      ...graph,
      vertices: graph.vertices.map((vertex) =>
        vertex.id === currentInteraction.vertexId ? { ...vertex, x: point.x, y: point.y } : vertex,
      ),
    });
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const currentInteraction = interactionRef.current;
    if (!currentInteraction || currentInteraction.pointerId !== event.pointerId) {
      return;
    }

    const point = toSvgPoint(event);
    if (currentInteraction.kind === 'edge') {
      const target = findNearestVertex(point, currentInteraction.sourceId);
      if (target) {
        addEdge(currentInteraction.sourceId, target.id);
        setPendingEdgeSourceId(null);
      } else if (isCompletedEdgeDrag(currentInteraction, point)) {
        addVertexWithEdge(currentInteraction.sourceId, point);
        setPendingEdgeSourceId(null);
      }
    } else if (currentInteraction.kind === 'new-edge' && isCompletedNewEdgeDrag(currentInteraction, point)) {
      const target = findNearestVertex(point);
      if (target) {
        addSourceVertexWithEdge(currentInteraction.source, target.id);
        setPendingEdgeSourceId(null);
      } else {
        addEdgeWithNewVertices(currentInteraction.source, point);
        setPendingEdgeSourceId(null);
      }
    }

    updateInteraction(null);
    if (svgRef.current?.hasPointerCapture?.(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function addEdge(sourceId: string, targetId: string) {
    if (sourceId === targetId || activeTool === 'move') {
      return;
    }

    const newEdge = createEdge(sourceId, targetId);
    if (!newEdge) {
      return;
    }

    if (hasDuplicateEdge(graph.edges, newEdge)) {
      return;
    }

    onChange({ ...graph, edges: [...graph.edges, newEdge] });
    setSelection({ kind: 'edge', id: newEdge.id });
  }

  function addVertexWithEdge(sourceId: string, point: Point) {
    if (activeTool === 'move') {
      return;
    }

    const vertex: Vertex = { id: createId('vertex'), x: point.x, y: point.y };
    const edge = createEdge(sourceId, vertex.id);
    if (!edge) {
      return;
    }

    onChange({ ...graph, vertices: [...graph.vertices, vertex], edges: [...graph.edges, edge] });
    setSelection({ kind: 'edge', id: edge.id });
  }

  function addSourceVertexWithEdge(point: Point, targetId: string) {
    if (activeTool === 'move') {
      return;
    }

    const vertex: Vertex = { id: createId('vertex'), x: point.x, y: point.y };
    const edge = createEdge(vertex.id, targetId);
    if (!edge) {
      return;
    }

    onChange({ ...graph, vertices: [...graph.vertices, vertex], edges: [...graph.edges, edge] });
    setSelection({ kind: 'edge', id: edge.id });
  }

  function addEdgeWithNewVertices(sourcePoint: Point, targetPoint: Point) {
    if (activeTool === 'move') {
      return;
    }

    const source: Vertex = { id: createId('vertex'), x: sourcePoint.x, y: sourcePoint.y };
    const target: Vertex = { id: createId('vertex'), x: targetPoint.x, y: targetPoint.y };
    const edge = createEdge(source.id, target.id);
    if (!edge) {
      return;
    }

    onChange({ ...graph, vertices: [...graph.vertices, source, target], edges: [...graph.edges, edge] });
    setSelection({ kind: 'edge', id: edge.id });
  }

  function createEdge(sourceId: string, targetId: string): Edge | null {
    if (sourceId === targetId || activeTool === 'move') {
      return null;
    }

    return activeTool === 'black'
      ? { id: createId('edge'), sourceId, targetId, kind: 'black' }
      : { id: createId('edge'), sourceId, targetId, kind: 'colored', color: activeTool };
  }

  function isCompletedEdgeDrag(interaction: Extract<Interaction, { kind: 'edge' }>, point: Point): boolean {
    return interaction.hasDragged || Math.hypot(point.x - interaction.startedAt.x, point.y - interaction.startedAt.y) >= MIN_EDGE_DRAG_DISTANCE;
  }

  function isCompletedNewEdgeDrag(interaction: Extract<Interaction, { kind: 'new-edge' }>, point: Point): boolean {
    return interaction.hasDragged || Math.hypot(point.x - interaction.source.x, point.y - interaction.source.y) >= MIN_EDGE_DRAG_DISTANCE;
  }

  function findNearestVertex(point: Point, excludeId?: string): Vertex | null {
    let best: { vertex: Vertex; distance: number } | null = null;
    for (const vertex of graph.vertices) {
      if (vertex.id === excludeId) {
        continue;
      }

      const distance = Math.hypot(vertex.x - point.x, vertex.y - point.y);
      if (distance <= EDGE_TARGET_RADIUS && (!best || distance < best.distance)) {
        best = { vertex, distance };
      }
    }

    return best?.vertex ?? null;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Backspace' && event.key !== 'Delete') {
      return;
    }

    if (!selection) {
      return;
    }

    event.preventDefault();
    if (selection.kind === 'edge') {
      onChange({ ...graph, edges: graph.edges.filter((edge) => edge.id !== selection.id) });
      setSelection(null);
      return;
    }

    const vertex = vertexById.get(selection.id);
    if (!vertex || vertex.role) {
      return;
    }

    onChange({
      vertices: graph.vertices.filter((item) => item.id !== selection.id),
      edges: graph.edges.filter((edge) => edge.sourceId !== selection.id && edge.targetId !== selection.id),
    });
    setSelection(null);
  }

  function renderVertex(vertex: Vertex) {
    const selected = selection?.kind === 'vertex' && selection.id === vertex.id;
    const pending = pendingEdgeSourceId === vertex.id;
    const className = vertex.role === 'blackEndpoint' ? 'vertex endpoint-black' : vertex.role === 'whiteEndpoint' ? 'vertex endpoint-white' : 'vertex';

    return (
      <g key={vertex.id}>
        {vertex.role === 'whiteEndpoint' ? (
          <circle
            className="endpoint-white-ring"
            cx={vertex.x}
            cy={vertex.y}
            r={WHITE_ENDPOINT_RING_RADIUS}
            pointerEvents="none"
          />
        ) : null}
        <circle
          className={`${className}${selected || pending ? ' selected' : ''}`}
          cx={vertex.x}
          cy={vertex.y}
          r={selected ? VERTEX_RADIUS + 2 : VERTEX_RADIUS}
          onPointerDown={(event) => handleVertexPointerDown(event, vertex.id)}
          onPointerUp={(event) => handleVertexPointerUp(event, vertex.id)}
        />
      </g>
    );
  }

  function renderEdge(edge: Edge) {
    const source = vertexById.get(edge.sourceId);
    const target = vertexById.get(edge.targetId);
    if (!source || !target) {
      return null;
    }

    const selected = selection?.kind === 'edge' && selection.id === edge.id;
    const stroke = edge.kind === 'black' ? '#111827' : colorHex(edge.color);
    const marker = edge.kind === 'colored' ? `url(#${markerPrefix}-arrow-${edge.color})` : undefined;
    const visibleTarget = edge.kind === 'colored' ? shortenLineEnd(source, target, ARROW_ENDPOINT_GAP) : target;
    const selectEdge = (event: React.PointerEvent<SVGLineElement>) => {
      event.stopPropagation();
      focusEditor();
      setSelection({ kind: 'edge', id: edge.id });
    };

    return (
      <g key={edge.id}>
        <line
          className="edge-hit"
          x1={source.x}
          y1={source.y}
          x2={target.x}
          y2={target.y}
          onPointerDown={selectEdge}
        />
        {selected ? (
          <line
            className="edge-selection-halo"
            x1={source.x}
            y1={source.y}
            x2={visibleTarget.x}
            y2={visibleTarget.y}
            pointerEvents="none"
          />
        ) : null}
        <line
          className="editor-edge"
          x1={source.x}
          y1={source.y}
          x2={visibleTarget.x}
          y2={visibleTarget.y}
          stroke={stroke}
          markerEnd={marker}
          onPointerDown={selectEdge}
        />
      </g>
    );
  }

  const activeToolLabel =
    activeTool === 'move' ? 'Move vertices' : activeTool === 'black' ? 'Black edge' : `${activeTool} edge`;

  return (
    <section className="graph-editor" ref={hostRef} tabIndex={0} onKeyDown={handleKeyDown} aria-label={title}>
      <div className="editor-heading">
        <h2>{title}</h2>
        <span className="tool-pill">
          {activeTool === 'move' ? <MousePointer2 size={13} /> : <span className="mini-swatch" style={{ background: activeTool === 'black' ? '#111827' : colorHex(activeTool) }} />}
          {activeToolLabel}
        </span>
      </div>
      <svg
        ref={svgRef}
        className="editor-svg"
        viewBox={formatViewBox(viewBox)}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => updateInteraction(null)}
      >
        <defs>
          {PALETTE.map((entry) => (
            <marker
              key={entry.id}
              id={`${markerPrefix}-arrow-${entry.id}`}
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 12 6 L 0 12 z" fill={entry.hex} />
            </marker>
          ))}
        </defs>
        <rect className="editor-bg" x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} />
        <g>{graph.edges.map(renderEdge)}</g>
        {interaction?.kind === 'edge' ? (
          <DraftEdge source={vertexById.get(interaction.sourceId)} pointer={interaction.pointer} tool={activeTool} />
        ) : null}
        {interaction?.kind === 'new-edge' ? <DraftEdge source={interaction.source} pointer={interaction.pointer} tool={activeTool} /> : null}
        <g>{graph.vertices.map(renderVertex)}</g>
      </svg>
    </section>
  );
}

function DraftEdge({ source, pointer, tool }: { source?: Point; pointer: Point; tool: EditTool }) {
  if (tool === 'move' || !source) {
    return null;
  }

  return (
    <line
      className="draft-edge"
      x1={source.x}
      y1={source.y}
      x2={pointer.x}
      y2={pointer.y}
      stroke={tool === 'black' ? '#111827' : colorHex(tool)}
    />
  );
}

function hasDuplicateEdge(edges: Edge[], candidate: Edge): boolean {
  return edges.some((edge) => {
    if (edge.kind !== candidate.kind) {
      return false;
    }

    if (candidate.kind === 'black') {
      return (
        (edge.sourceId === candidate.sourceId && edge.targetId === candidate.targetId) ||
        (edge.sourceId === candidate.targetId && edge.targetId === candidate.sourceId)
      );
    }

    return (
      edge.kind === 'colored' &&
      edge.color === candidate.color &&
      edge.sourceId === candidate.sourceId &&
      edge.targetId === candidate.targetId
    );
  });
}

function isEdgeDraft(interaction: Interaction): interaction is Extract<Interaction, { kind: 'edge' | 'new-edge' }> {
  return interaction?.kind === 'edge' || interaction?.kind === 'new-edge';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function zoomEditorViewBox(viewBox: EditorViewBox, pointerFraction: Point, zoom: number): EditorViewBox {
  const pointer = {
    x: viewBox.x + pointerFraction.x * viewBox.width,
    y: viewBox.y + pointerFraction.y * viewBox.height,
  };
  const nextWidth = clamp(viewBox.width / zoom, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
  const aspect = viewBox.height / viewBox.width;
  const nextHeight = nextWidth * aspect;

  return {
    x: roundViewValue(pointer.x - pointerFraction.x * nextWidth),
    y: roundViewValue(pointer.y - pointerFraction.y * nextHeight),
    width: roundViewValue(nextWidth),
    height: roundViewValue(nextHeight),
  };
}

function getRenderedViewBox(bounds: DOMRect, viewBox: EditorViewBox) {
  const scale = Math.min(bounds.width / viewBox.width, bounds.height / viewBox.height);
  const width = viewBox.width * scale;
  const height = viewBox.height * scale;

  return {
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width,
    height,
  };
}

function clientToViewBoxFraction(clientX: number, clientY: number, renderedViewBox: ReturnType<typeof getRenderedViewBox>): Point {
  return {
    x: (clientX - renderedViewBox.left) / renderedViewBox.width,
    y: (clientY - renderedViewBox.top) / renderedViewBox.height,
  };
}

function formatViewBox(viewBox: EditorViewBox): string {
  return [viewBox.x, viewBox.y, viewBox.width, viewBox.height].map(formatViewNumber).join(' ');
}

function formatViewNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundViewValue(value));
}

function roundViewValue(value: number): number {
  return Math.abs(value) < 0.000001 ? 0 : Number(value.toFixed(6));
}

function shortenLineEnd(source: Point, target: Point, gap: number): Point {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) {
    return target;
  }

  const adjustedGap = Math.min(gap, Math.max(0, length * 0.45));
  return {
    x: target.x - (dx / length) * adjustedGap,
    y: target.y - (dy / length) * adjustedGap,
  };
}

export function ToolButton({
  tool,
  activeTool,
  label,
  onSelect,
}: {
  tool: EditTool;
  activeTool: EditTool;
  label: string;
  onSelect: (tool: EditTool) => void;
}) {
  const isActive = tool === activeTool;

  return (
    <button className={`tool-button${isActive ? ' active' : ''}`} type="button" title={label} onClick={() => onSelect(tool)}>
      {tool === 'move' ? <MousePointer2 size={16} /> : <span className="tool-swatch" style={{ background: tool === 'black' ? '#111827' : colorHex(tool) }} />}
    </button>
  );
}

export function edgeColorTools(): EdgeColor[] {
  return [...EDGE_COLORS];
}
