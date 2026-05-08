import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphEditor } from './GraphEditor';
import type { Graph } from '../domain/types';

const ruleGraph: Graph = {
  vertices: [
    { id: 'black', x: 36, y: 90, role: 'blackEndpoint' },
    { id: 'white', x: 244, y: 90, role: 'whiteEndpoint' },
  ],
  edges: [{ id: 'red-edge', sourceId: 'black', targetId: 'white', kind: 'colored', color: 'red' }],
};

describe('GraphEditor visuals', () => {
  it('keeps colored arrowheads outside the target vertex and renders them larger', () => {
    const { container } = render(<GraphEditor graph={ruleGraph} title="Red Rule" activeTool="move" onChange={vi.fn()} />);

    const visibleEdge = container.querySelector('line.editor-edge') as SVGLineElement;
    const marker = container.querySelector('marker[id$="arrow-red"]') as SVGMarkerElement;

    expect(Number(visibleEdge.getAttribute('x2'))).toBeLessThan(244);
    expect(marker.getAttribute('markerWidth')).toBe('7');
    expect(marker.getAttribute('markerHeight')).toBe('7');
  });

  it('marks the required white endpoint with an extra circular ring', () => {
    const { container } = render(<GraphEditor graph={ruleGraph} title="Red Rule" activeTool="move" onChange={vi.fn()} />);

    const whiteEndpointRing = container.querySelector('circle.endpoint-white-ring');

    expect(whiteEndpointRing).toBeInTheDocument();
    expect(whiteEndpointRing).toHaveAttribute('r', '11');
  });

  it('shows selected edges with a halo instead of changing the edge stroke class', () => {
    const { container } = render(<GraphEditor graph={ruleGraph} title="Red Rule" activeTool="move" onChange={vi.fn()} />);
    const visibleEdge = container.querySelector('line.editor-edge') as SVGLineElement;

    fireEvent.pointerDown(visibleEdge, pointerAt(130, 90));

    expect(container.querySelector('line.edge-selection-halo')).toBeInTheDocument();
    expect(visibleEdge).toHaveClass('editor-edge');
    expect(visibleEdge).not.toHaveClass('selected');
  });
});

describe('GraphEditor navigation', () => {
  it('pans the editor view with a two-finger wheel gesture', () => {
    const { container } = render(<GraphEditor graph={ruleGraph} title="Red Rule" activeTool="move" onChange={vi.fn()} />);
    const svg = container.querySelector('svg.editor-svg') as SVGSVGElement;

    mockSvgBounds(svg);

    fireEvent.wheel(svg, { deltaX: 28, deltaY: 18, clientX: 140, clientY: 90 });

    expect(svg).toHaveAttribute('viewBox', '28 18 280 180');
  });

  it('zooms the editor view around the pointer with a pinch-style wheel gesture', () => {
    const { container } = render(<GraphEditor graph={ruleGraph} title="Red Rule" activeTool="move" onChange={vi.fn()} />);
    const svg = container.querySelector('svg.editor-svg') as SVGSVGElement;

    mockSvgBounds(svg);

    fireEvent.wheel(svg, { ctrlKey: true, deltaY: -12, clientX: 140, clientY: 90 });

    const [, , width, height] = parseViewBox(svg.getAttribute('viewBox') ?? '');
    expect(width).toBeLessThan(280);
    expect(height).toBeLessThan(180);
  });

  it('cancels native pinch wheel events before the browser can page-zoom', () => {
    const { container } = render(<GraphEditor graph={ruleGraph} title="Red Rule" activeTool="move" onChange={vi.fn()} />);
    const svg = container.querySelector('svg.editor-svg') as SVGSVGElement;

    mockSvgBounds(svg);

    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -12,
      clientX: 140,
      clientY: 90,
    });

    svg.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('GraphEditor editing', () => {
  it('does not add an isolated vertex when clicking empty editor space', () => {
    const handleChange = vi.fn();
    const graph: Graph = { vertices: [], edges: [] };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="move" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const background = container.querySelector('rect.editor-bg') as SVGRectElement;

    mockSvgBounds(svg);

    fireEvent.pointerDown(background, pointerAt(120, 80));

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('creates a colored edge by dragging from one vertex to another', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [
        { id: 'a', x: 40, y: 90 },
        { id: 'b', x: 220, y: 90 },
      ],
      edges: [],
    };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="red" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const source = container.querySelector('circle.vertex') as SVGCircleElement;

    mockSvgBounds(svg);
    mockPointerCapture(svg);

    fireEvent.pointerDown(source, pointerAt(40, 90));
    fireEvent.pointerMove(svg, pointerAt(220, 90));
    fireEvent.pointerUp(svg, pointerAt(220, 90));

    expect(handleChange).toHaveBeenCalledWith({
      vertices: graph.vertices,
      edges: [expect.objectContaining({ sourceId: 'a', targetId: 'b', kind: 'colored', color: 'red' })],
    });
  });

  it('creates a new target vertex and edge when dragging from an existing vertex to empty space', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [{ id: 'a', x: 40, y: 90 }],
      edges: [],
    };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="blue" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const source = container.querySelector('circle.vertex') as SVGCircleElement;

    mockSvgBounds(svg);

    fireEvent.pointerDown(source, pointerAt(40, 90));
    fireEvent.pointerMove(svg, pointerAt(180, 120));
    fireEvent.pointerUp(svg, pointerAt(180, 120));

    expect(handleChange).toHaveBeenCalledWith({
      vertices: [graph.vertices[0], expect.objectContaining({ x: 180, y: 120 })],
      edges: [
        expect.objectContaining({
          sourceId: 'a',
          targetId: expect.stringMatching(/^vertex-/),
          kind: 'colored',
          color: 'blue',
        }),
      ],
    });
  });

  it('cancels an in-progress edge when Escape is pressed', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [{ id: 'a', x: 40, y: 90 }],
      edges: [],
    };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="blue" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const source = container.querySelector('circle.vertex') as SVGCircleElement;

    mockSvgBounds(svg);

    fireEvent.pointerDown(source, pointerAt(40, 90));
    fireEvent.pointerMove(svg, pointerAt(180, 120));
    expect(container.querySelector('line.draft-edge')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerUp(svg, pointerAt(180, 120));

    expect(container.querySelector('line.draft-edge')).not.toBeInTheDocument();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('cancels an in-progress edge when the pointer is released outside the editor', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [{ id: 'a', x: 40, y: 90 }],
      edges: [],
    };
    const { container, getByText } = render(
      <>
        <GraphEditor graph={graph} title="Seed" activeTool="blue" onChange={handleChange} />
        <button type="button">Outside</button>
      </>,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    const source = container.querySelector('circle.vertex') as SVGCircleElement;

    mockSvgBounds(svg);

    fireEvent.pointerDown(source, pointerAt(40, 90));
    fireEvent.pointerMove(svg, pointerAt(180, 120));
    expect(container.querySelector('line.draft-edge')).toBeInTheDocument();

    fireEvent.pointerUp(getByText('Outside'), pointerAt(360, 240));

    expect(container.querySelector('line.draft-edge')).not.toBeInTheDocument();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('creates two connected vertices when dragging an edge across empty space', () => {
    const handleChange = vi.fn();
    const graph: Graph = { vertices: [], edges: [] };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="green" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const background = container.querySelector('rect.editor-bg') as SVGRectElement;

    mockSvgBounds(svg);

    fireEvent.pointerDown(background, pointerAt(60, 70));
    fireEvent.pointerMove(svg, pointerAt(180, 120));
    fireEvent.pointerUp(svg, pointerAt(180, 120));

    expect(handleChange).toHaveBeenCalledWith({
      vertices: [expect.objectContaining({ x: 60, y: 70 }), expect.objectContaining({ x: 180, y: 120 })],
      edges: [
        expect.objectContaining({
          sourceId: expect.stringMatching(/^vertex-/),
          targetId: expect.stringMatching(/^vertex-/),
          kind: 'colored',
          color: 'green',
        }),
      ],
    });
  });

  it('creates a colored edge when the drag pointerup lands on the target vertex', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [
        { id: 'a', x: 40, y: 90 },
        { id: 'b', x: 220, y: 90 },
      ],
      edges: [],
    };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="red" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const vertices = container.querySelectorAll('circle.vertex');

    mockSvgBounds(svg);
    mockPointerCapture(svg);

    fireEvent.pointerDown(vertices[0], pointerAt(40, 90));
    fireEvent.pointerMove(svg, pointerAt(180, 90));
    fireEvent.pointerUp(vertices[1], pointerAt(220, 90));

    expect(handleChange).toHaveBeenCalledWith({
      vertices: graph.vertices,
      edges: [expect.objectContaining({ sourceId: 'a', targetId: 'b', kind: 'colored', color: 'red' })],
    });
  });

  it('creates an edge when releasing on a target vertex in a letterboxed rule editor', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [
        { id: 'black', x: 36, y: 90, role: 'blackEndpoint' },
        { id: 'white', x: 244, y: 90, role: 'whiteEndpoint' },
      ],
      edges: [],
    };
    const { container } = render(<GraphEditor graph={graph} title="Red Rule" activeTool="red" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const source = container.querySelector('circle.endpoint-black') as SVGCircleElement;

    mockSvgBounds(svg, { width: 400, height: 196 });

    const scale = 196 / 180;
    const horizontalInset = (400 - 280 * scale) / 2;
    const targetClient = pointerAt(horizontalInset + 244 * scale, 90 * scale);

    fireEvent.pointerDown(source, pointerAt(horizontalInset + 36 * scale, 90 * scale));
    fireEvent.pointerMove(svg, targetClient);
    fireEvent.pointerUp(svg, targetClient);

    expect(handleChange).toHaveBeenCalledWith({
      vertices: graph.vertices,
      edges: [expect.objectContaining({ sourceId: 'black', targetId: 'white', kind: 'colored', color: 'red' })],
    });
  });

  it('does not capture the pointer while drawing an edge so the target vertex can receive pointerup', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [
        { id: 'a', x: 40, y: 90 },
        { id: 'b', x: 220, y: 90 },
      ],
      edges: [],
    };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="red" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const source = container.querySelector('circle.vertex') as SVGCircleElement;

    mockSvgBounds(svg);
    mockPointerCapture(svg);

    fireEvent.pointerDown(source, pointerAt(40, 90));

    expect(svg.setPointerCapture).not.toHaveBeenCalled();
  });

  it('starts an edge when an edge-tool drag begins on the background near a vertex', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [
        { id: 'a', x: 40, y: 90 },
        { id: 'b', x: 220, y: 90 },
      ],
      edges: [],
    };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="red" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const background = container.querySelector('rect.editor-bg') as SVGRectElement;

    mockSvgBounds(svg);

    fireEvent.pointerDown(background, pointerAt(40, 90));
    fireEvent.pointerMove(svg, pointerAt(160, 90));
    fireEvent.pointerUp(svg, pointerAt(220, 90));

    expect(handleChange).toHaveBeenCalledWith({
      vertices: graph.vertices,
      edges: [expect.objectContaining({ sourceId: 'a', targetId: 'b', kind: 'colored', color: 'red' })],
    });
  });

  it('creates a colored edge by clicking two vertices with an edge tool selected', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [
        { id: 'a', x: 40, y: 90 },
        { id: 'b', x: 220, y: 90 },
      ],
      edges: [],
    };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="red" onChange={handleChange} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    const vertices = container.querySelectorAll('circle.vertex');

    mockSvgBounds(svg);
    mockPointerCapture(svg);

    fireEvent.pointerDown(vertices[0], pointerAt(40, 90));
    fireEvent.pointerUp(svg, pointerAt(40, 90));
    fireEvent.pointerDown(vertices[1], pointerAt(220, 90));

    expect(handleChange).toHaveBeenCalledWith({
      vertices: graph.vertices,
      edges: [expect.objectContaining({ sourceId: 'a', targetId: 'b', kind: 'colored', color: 'red' })],
    });
  });

  it('deletes an existing edge after selecting its visible line', () => {
    const handleChange = vi.fn();
    const graph: Graph = {
      vertices: [
        { id: 'a', x: 40, y: 90 },
        { id: 'b', x: 220, y: 90 },
      ],
      edges: [{ id: 'edge-a-b', sourceId: 'a', targetId: 'b', kind: 'black' }],
    };
    const { container } = render(<GraphEditor graph={graph} title="Seed" activeTool="move" onChange={handleChange} />);
    const editor = container.querySelector('section.graph-editor') as HTMLElement;
    const visibleEdge = container.querySelector('line.editor-edge') as SVGLineElement;

    fireEvent.pointerDown(visibleEdge, pointerAt(130, 90));
    fireEvent.keyDown(editor, { key: 'Backspace' });

    expect(handleChange).toHaveBeenCalledWith({ vertices: graph.vertices, edges: [] });
  });
});

function pointerAt(x: number, y: number) {
  return {
    pointerId: 1,
    clientX: x,
    clientY: y,
    buttons: 1,
  };
}

function mockSvgBounds(svg: SVGSVGElement, size: { width: number; height: number } = { width: 280, height: 180 }) {
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: size.width,
    bottom: size.height,
    width: size.width,
    height: size.height,
    toJSON: () => ({}),
  });
}

function mockPointerCapture(svg: SVGSVGElement) {
  svg.setPointerCapture = vi.fn();
  svg.releasePointerCapture = vi.fn();
  svg.hasPointerCapture = vi.fn(() => true);
}

function parseViewBox(viewBox: string) {
  return viewBox.split(/\s+/).map(Number);
}
