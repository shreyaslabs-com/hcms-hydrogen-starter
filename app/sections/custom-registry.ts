/**
 * Turns the modules in `app/sections/custom/` into registry entries (see `./custom.ts`). One file
 * = one section or theme block, and the file name is its `type`, so the browser knows every type
 * before any custom code has loaded. Pure: tested by `__test__/custom-sections.test.ts`.
 */
export type CustomModule = Record<string, unknown>;
type Module = CustomModule;
type Definition = { type: string; component: unknown };

const FILE = /([^/]+?)(\.browser)?\.tsx$/;

/** `./custom/promo-banner.tsx` (or `promo-banner.browser.tsx`) → `promo-banner`. */
export function typeFromPath(path: string): string {
  return FILE.exec(path)?.[1] ?? path;
}

const isDefinition = (value: unknown): value is Definition =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Definition).type === 'string' &&
  'component' in value;

/** The single definition a custom module exports, checked against its file name. */
function definitionOf(path: string, mod: Module): Definition {
  const file = `app/sections/${path.replace(/^\.\//, '')}`;
  const type = typeFromPath(path);
  const found = [...new Set(Object.values(mod).filter(isDefinition))];
  if (found.length === 0)
    throw new Error(
      `${file} exports no section or block definition. Every .tsx file there must export one ` +
        `(defineSection, or defineBlock under blocks/); keep helpers in a subfolder.`,
    );
  if (found.length > 1)
    throw new Error(
      `${file} exports ${found.length} definitions (${found.map((d) => d.type).join(', ')}). ` +
        `Keep one per file: the file name is the type.`,
    );
  const def = found[0] as Definition;
  if (def.type !== type)
    throw new Error(
      `${file} defines type "${def.type}", but the file name says "${type}". ` +
        `Rename the file to ${def.type}.tsx (the browser finds sections by file name).`,
    );
  return def;
}

/** Server: eagerly imported modules (`import.meta.glob(…, { eager: true })`) → definitions. */
export function customDefinitions<T>(modules: Readonly<Record<string, Module>>): T[] {
  return Object.keys(modules)
    .filter((path) => !path.endsWith('.browser.tsx'))
    .sort()
    .map((path) => definitionOf(path, modules[path] as Module) as T);
}

/**
 * Browser: lazy module loaders (`import.meta.glob(…)`) → `type → { load }` for
 * `createLazyRegistry`. A `<type>.browser.tsx` sibling (schema-free definition) wins.
 */
export function customLoaders<T>(
  loaders: Readonly<Record<string, () => Promise<Module>>>,
): Record<string, { load: () => Promise<T> }> {
  // Kept tiny: it ships in every page's entry chunk.
  const out: Record<string, { load: () => Promise<T> }> = {};
  for (const [path, load] of Object.entries(loaders)) {
    const [, type = path, browser] = FILE.exec(path) ?? [];
    // The server already checked the module; pick the export with this type.
    if (browser || !out[type])
      out[type] = {
        load: () =>
          load().then(
            (mod) => Object.values(mod).find((v) => (v as Definition)?.type === type) as T,
          ),
      };
  }
  return out;
}
