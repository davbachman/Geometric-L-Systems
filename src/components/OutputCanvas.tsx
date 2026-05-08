import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home } from 'lucide-react';
import { colorHex } from '../domain/palette';
import type { Graph, SubstitutionWarning } from '../domain/types';

interface OutputCanvasProps {
  graph: Graph;
  warnings: SubstitutionWarning[];
  resetKey: number;
}

interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface Size {
  width: number;
  height: number;
}

const DEFAULT_WORLD = { minX: 0, minY: 0, maxX: 280, maxY: 180 };

export function OutputCanvas({ graph, warnings, resetKey }: OutputCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });

  const bounds = useMemo(() => getBounds(graph), [graph]);
  const vertexById = useMemo(() => new Map(graph.vertices.map((vertex) => [vertex.id, vertex])), [graph.vertices]);

  const resetView = useCallback(() => {
    setView(fitView(bounds, size));
  }, [bounds, size]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    resetView();
  }, [resetKey, size.width, size.height, resetView]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();

      const rect = frame.getBoundingClientRect();
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      if (event.ctrlKey || event.metaKey) {
        const zoom = clamp(Math.exp(-event.deltaY * 0.01), 0.75, 1.35);
        setView((current) => zoomAround(current, pointer, zoom));
        return;
      }

      setView((current) => ({
        ...current,
        offsetX: current.offsetX - event.deltaX,
        offsetY: current.offsetY - event.deltaY,
      }));
    };

    frame.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => frame.removeEventListener('wheel', handleNativeWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    drawScene(context, graph, vertexById, view, size, dpr);
  }, [graph, size, vertexById, view]);

  return (
    <main className="output-panel">
      <div className="canvas-frame" ref={frameRef}>
        <canvas ref={canvasRef} />
        <button
          type="button"
          className="icon-button canvas-reset-button"
          onClick={resetView}
          title="Reset view"
          aria-label="Reset view"
        >
          <Home size={18} />
        </button>
        {warnings.length > 0 ? (
          <div className="warning-bar">
            {warnings.map((warning) => (
              <span key={warning.color ?? warning.message}>{warning.message}</span>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function drawScene(
  context: CanvasRenderingContext2D,
  graph: Graph,
  vertexById: Map<string, { x: number; y: number }>,
  view: ViewState,
  size: Size,
  dpr: number,
) {
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, size.width, size.height);

  context.save();
  context.translate(view.offsetX, view.offsetY);
  context.scale(view.scale, view.scale);

  graph.edges.forEach((edge) => {
    const source = vertexById.get(edge.sourceId);
    const target = vertexById.get(edge.targetId);
    if (!source || !target) {
      return;
    }

    context.beginPath();
    context.moveTo(source.x, source.y);
    context.lineTo(target.x, target.y);
    context.strokeStyle = edge.kind === 'black' ? '#111827' : colorHex(edge.color);
    context.lineWidth = (edge.kind === 'black' ? 2.2 : 2.5) / view.scale;
    context.lineCap = 'round';
    context.stroke();
  });

  graph.vertices.forEach((vertex) => {
    context.beginPath();
    context.arc(vertex.x, vertex.y, 2.8 / view.scale, 0, Math.PI * 2);
    context.fillStyle = '#0f172a';
    context.fill();
  });

  context.restore();

  if (graph.vertices.length === 0) {
    context.fillStyle = '#64748b';
    context.font = '500 15px Inter, system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillText('No seed graph', size.width / 2, size.height / 2);
  }
}

function getBounds(graph: Graph) {
  if (graph.vertices.length === 0) {
    return DEFAULT_WORLD;
  }

  return graph.vertices.reduce(
    (bounds, vertex) => ({
      minX: Math.min(bounds.minX, vertex.x),
      minY: Math.min(bounds.minY, vertex.y),
      maxX: Math.max(bounds.maxX, vertex.x),
      maxY: Math.max(bounds.maxY, vertex.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function fitView(bounds: typeof DEFAULT_WORLD, size: Size): ViewState {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const padding = 70;
  const scale = clamp(Math.min((size.width - padding * 2) / width, (size.height - padding * 2) / height), 0.25, 8);

  return {
    scale,
    offsetX: (size.width - (bounds.minX + bounds.maxX) * scale) / 2,
    offsetY: (size.height - (bounds.minY + bounds.maxY) * scale) / 2,
  };
}

function zoomAround(view: ViewState, pointer: { x: number; y: number }, zoom: number): ViewState {
  const nextScale = clamp(view.scale * zoom, 0.05, 40);
  const worldX = (pointer.x - view.offsetX) / view.scale;
  const worldY = (pointer.y - view.offsetY) / view.scale;

  return {
    scale: nextScale,
    offsetX: pointer.x - worldX * nextScale,
    offsetY: pointer.y - worldY * nextScale,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
