let counter = 0;

export function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}
