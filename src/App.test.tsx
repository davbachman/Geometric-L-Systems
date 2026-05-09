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
