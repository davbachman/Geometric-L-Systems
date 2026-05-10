import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App toolbar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places the title and File and Examples dropdowns in a top toolbar', () => {
    mockCanvas();
    mockResizeObserver(640, 480);

    render(<App />);

    const toolbar = screen.getByRole('toolbar', { name: 'Application toolbar' });

    expect(within(toolbar).getByRole('heading', { name: 'Geometric L-Systems' })).toBeInTheDocument();

    fireEvent.click(within(toolbar).getByText('File'));

    expect(within(toolbar).getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(within(toolbar).getByText('Examples')).toBeInTheDocument();
  });

  it('places the Level slider at the bottom of the left toolbar with seven available levels', () => {
    mockCanvas();
    mockResizeObserver(640, 480);

    render(<App />);

    const sidebar = screen.getByRole('complementary');
    const activeRuleEditor = within(sidebar).getByRole('region', { name: 'Red Rule' });
    const levelSlider = within(sidebar).getByRole('slider', { name: /Level/ });

    expect(levelSlider).toHaveAttribute('max', '7');
    expect(activeRuleEditor.compareDocumentPosition(levelSlider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sidebar.lastElementChild).toContainElement(levelSlider);
  });

  it('shows grouped examples and loads the selected example', () => {
    mockCanvas();
    mockResizeObserver(640, 480);

    render(<App />);

    const toolbar = screen.getByRole('toolbar', { name: 'Application toolbar' });

    fireEvent.click(within(toolbar).getByText('Examples'));

    expect(within(toolbar).getByText('Space filling curves')).toBeInTheDocument();
    expect(within(toolbar).getByText('Plants')).toBeInTheDocument();
    expect(within(toolbar).getByText('Fractals')).toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: 'Hilbert Curve' })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: 'Peano Curve' })).not.toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Gosper Curve' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Binary Tree' })).toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: 'Bourke Weed' })).not.toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Koch Snowflake' })).toBeInTheDocument();

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Gosper Curve' }));

    expect(screen.getByText('Gosper Curve loaded.')).toBeInTheDocument();
    expect((screen.getByRole('slider', { name: /Level/ }) as HTMLInputElement).value).toBe('3');
  });

  it('undoes seed graph edits with Cmd+Z', () => {
    mockCanvas();
    mockResizeObserver(640, 480);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'red oriented edge' }));

    const seedEditor = screen.getByRole('region', { name: 'Seed' });
    const svg = seedEditor.querySelector('svg') as SVGSVGElement;
    const background = seedEditor.querySelector('rect.editor-bg') as SVGRectElement;
    mockSvgBounds(svg);

    fireEvent.pointerDown(background, pointerAt(60, 70));
    fireEvent.pointerMove(svg, pointerAt(180, 120));
    fireEvent.pointerUp(svg, pointerAt(180, 120));

    expect(seedEditor.querySelectorAll('line.editor-edge')).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'z', metaKey: true });

    expect(seedEditor.querySelectorAll('line.editor-edge')).toHaveLength(0);
  });

  it('undoes rule graph edits with Cmd+Z', () => {
    mockCanvas();
    mockResizeObserver(640, 480);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'red oriented edge' }));

    const ruleEditor = screen.getByRole('region', { name: 'Red Rule' });
    const svg = ruleEditor.querySelector('svg') as SVGSVGElement;
    const source = ruleEditor.querySelector('circle.endpoint-black') as SVGCircleElement;
    mockSvgBounds(svg);

    fireEvent.pointerDown(source, pointerAt(36, 90));
    fireEvent.pointerMove(svg, pointerAt(244, 90));
    fireEvent.pointerUp(svg, pointerAt(244, 90));

    expect(ruleEditor.querySelectorAll('line.editor-edge')).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'z', metaKey: true });

    expect(ruleEditor.querySelectorAll('line.editor-edge')).toHaveLength(0);
  });
});

function mockCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
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
  } as unknown as CanvasRenderingContext2D);
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
