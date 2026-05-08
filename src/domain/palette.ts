import type { EdgeColor, PaletteEntry } from './types';

export const PALETTE: PaletteEntry[] = [
  { id: 'red', label: 'Red', hex: '#dc2626' },
  { id: 'blue', label: 'Blue', hex: '#2563eb' },
  { id: 'green', label: 'Green', hex: '#16a34a' },
  { id: 'purple', label: 'Purple', hex: '#9333ea' },
];

export const EDGE_COLORS = PALETTE.map((entry) => entry.id) as EdgeColor[];

export function colorHex(color: EdgeColor): string {
  return PALETTE.find((entry) => entry.id === color)?.hex ?? '#111827';
}
