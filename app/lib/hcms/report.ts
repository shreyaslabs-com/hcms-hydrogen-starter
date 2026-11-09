/** Section/block render failures (caught by the SDK's per-section boundaries) go to the console,
 * so they show up in Oxygen logs instead of failing silently. */
export function reportSectionError(
  error: unknown,
  where: { kind: 'section' | 'block'; id: string; type: string },
): void {
  console.error(`[hcms] ${where.kind} "${where.type}" (${where.id}) failed to render`, error);
}
