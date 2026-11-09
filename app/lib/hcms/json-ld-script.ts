/** JSON-LD `<script>` payloads (T-1.7.2); builders live in `./json-ld.ts`. */
export type JsonLd = Record<string, unknown>;

/** JSON safe inside `<script type="application/ld+json">`: `<`, `>`, `&`, U+2028/9 escaped. */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
