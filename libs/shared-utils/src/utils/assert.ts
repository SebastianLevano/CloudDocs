export class AssertionError extends Error {
  override name = 'AssertionError';
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new AssertionError(message);
  }
}

export function unreachable(value: never, message = 'Unreachable code reached'): never {
  throw new AssertionError(`${message}: ${String(value)}`);
}
