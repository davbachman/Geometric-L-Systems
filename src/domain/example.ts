import { PALETTE } from './palette';
import type { AppState } from './types';

export function createExampleState(): AppState {
  return {
    version: 1,
    palette: PALETTE,
    level: 3,
    seed: {
      vertices: [
        { id: 's0', x: 60, y: 126 },
        { id: 's1', x: 212, y: 126 },
        { id: 's2', x: 136, y: 46 },
      ],
      edges: [
        { id: 'seed-red', sourceId: 's0', targetId: 's1', kind: 'colored', color: 'red' },
        { id: 'seed-blue', sourceId: 's1', targetId: 's2', kind: 'colored', color: 'blue' },
        { id: 'seed-black', sourceId: 's2', targetId: 's0', kind: 'black' },
      ],
    },
    rulesByColor: {
      red: {
        vertices: [
          { id: 'black', x: 35, y: 92, role: 'blackEndpoint' },
          { id: 'white', x: 245, y: 92, role: 'whiteEndpoint' },
          { id: 'peak', x: 140, y: 35 },
        ],
        edges: [
          { id: 'r-a', sourceId: 'black', targetId: 'peak', kind: 'colored', color: 'red' },
          { id: 'r-b', sourceId: 'peak', targetId: 'white', kind: 'colored', color: 'blue' },
        ],
      },
      blue: {
        vertices: [
          { id: 'black', x: 35, y: 94, role: 'blackEndpoint' },
          { id: 'white', x: 245, y: 94, role: 'whiteEndpoint' },
          { id: 'low', x: 140, y: 145 },
        ],
        edges: [
          { id: 'b-a', sourceId: 'black', targetId: 'low', kind: 'colored', color: 'green' },
          { id: 'b-b', sourceId: 'low', targetId: 'white', kind: 'colored', color: 'blue' },
        ],
      },
      green: {
        vertices: [
          { id: 'black', x: 35, y: 92, role: 'blackEndpoint' },
          { id: 'white', x: 245, y: 92, role: 'whiteEndpoint' },
          { id: 'join', x: 140, y: 92 },
        ],
        edges: [
          { id: 'g-a', sourceId: 'black', targetId: 'join', kind: 'colored', color: 'purple' },
          { id: 'g-b', sourceId: 'join', targetId: 'white', kind: 'colored', color: 'green' },
          { id: 'g-c', sourceId: 'black', targetId: 'white', kind: 'black' },
        ],
      },
      purple: {
        vertices: [
          { id: 'black', x: 35, y: 92, role: 'blackEndpoint' },
          { id: 'white', x: 245, y: 92, role: 'whiteEndpoint' },
        ],
        edges: [{ id: 'p-a', sourceId: 'black', targetId: 'white', kind: 'colored', color: 'red' }],
      },
    },
  };
}
