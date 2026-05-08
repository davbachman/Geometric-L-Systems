import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OutputCanvas } from './OutputCanvas';
import type { Graph } from '../domain/types';

const emptyGraph: Graph = { vertices: [], edges: [] };

describe('OutputCanvas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not draw a background grid for an empty graph', async () => {
    const context = createMockCanvasContext();
    mockCanvasContext(context);
    mockResizeObserver(640, 480);

    render(<OutputCanvas graph={emptyGraph} warnings={[]} resetKey={0} />);

    await waitFor(() => expect(context.fillRect).toHaveBeenCalled());

    expect(context.stroke).not.toHaveBeenCalled();
  });

  it('does not cover the output with a title card', () => {
    const context = createMockCanvasContext();
    mockCanvasContext(context);
    mockResizeObserver(640, 480);

    const { container } = render(<OutputCanvas graph={emptyGraph} warnings={[]} resetKey={0} />);

    expect(container.querySelector('.canvas-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset view' })).toHaveClass('canvas-reset-button');
  });

  it('cancels native pinch wheel events before the browser can page-zoom', () => {
    const context = createMockCanvasContext();
    mockCanvasContext(context);
    mockResizeObserver(640, 480);

    const { container } = render(<OutputCanvas graph={emptyGraph} warnings={[]} resetKey={0} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 640,
      bottom: 480,
      width: 640,
      height: 480,
      toJSON: () => ({}),
    });

    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -12,
      clientX: 320,
      clientY: 240,
    });

    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

function createMockCanvasContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    font: '',
    lineCap: '',
    lineWidth: 1,
    strokeStyle: '',
    textAlign: '',
  };
}

function mockCanvasContext(context: ReturnType<typeof createMockCanvasContext>) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
}

function mockResizeObserver(width: number, height: number) {
  class TestResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}

    observe() {
      this.callback(
        [
          {
            contentRect: { width, height },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }

    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', TestResizeObserver);
}
