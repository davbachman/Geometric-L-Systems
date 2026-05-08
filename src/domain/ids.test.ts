import { describe, expect, it } from 'vitest';
import { createId } from './ids';

describe('createId', () => {
  it('generates prefixed unique ids', () => {
    const ids = Array.from({ length: 1000 }, () => createId('vertex'));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('vertex-'))).toBe(true);
  });
});
