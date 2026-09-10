/**
 * Small helper for page loaders that need several INDEPENDENT API calls.
 *
 * Loaders used to `await` their option endpoints one after another, so a page
 * paid the SUM of every call. The sources passed here have no data dependency
 * on each other, so they are all started in the same tick and the page pays
 * only the MAX (API latency budget: under 500 ms server-side per call).
 *
 * A source that rejects resolves to `null` instead of failing the whole load,
 * which preserves the per-call error handling the page loaders had before.
 */
export async function allSettledOrNull<T extends readonly unknown[]>(
  promises: readonly [...T],
): Promise<{ [K in keyof T]: Awaited<T[K]> | null }> {
  const settled = await Promise.all(promises.map((p) => Promise.resolve(p).catch(() => null)));
  return settled as unknown as { [K in keyof T]: Awaited<T[K]> | null };
}
