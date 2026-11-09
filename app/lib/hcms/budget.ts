/**
 * Time budget for root data the page can render without (S2-2): resolves with `fallback` when
 * `work` rejects or takes longer than `ms`. The work itself keeps running; only the wait ends.
 */
export async function withBudget<T>(
  work: Promise<T>,
  ms: number,
  fallback: () => T,
  label = 'Root data',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    const result = await Promise.race([work, timeout]);
    if (result !== 'timeout') return result;
    console.error(`${label} took longer than ${ms} ms; rendering without it.`);
  } catch (error) {
    console.error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
  return fallback();
}
