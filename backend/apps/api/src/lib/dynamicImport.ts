/**
 * Safe runtime dynamic import for sibling packages that are owned by other
 * agents and may still be stubs (`export {}`). The specifier is passed as a
 * variable so TypeScript never resolves it statically (typecheck stays green
 * regardless of what the parallel agent lands) and vitest/tsx resolve it at
 * runtime. Returns null when the package is missing or fails to load.
 */
export async function tryImport(specifier: string): Promise<Record<string, unknown> | null> {
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>;
    return mod ?? null;
  } catch {
    return null;
  }
}

/** Return the first callable export among candidate names, else null. */
export function pickFn(
  mod: Record<string, unknown> | null,
  names: string[],
): ((...args: unknown[]) => unknown) | null {
  if (!mod) return null;
  for (const name of names) {
    const fn = mod[name];
    if (typeof fn === 'function') return fn as (...args: unknown[]) => unknown;
  }
  return null;
}
