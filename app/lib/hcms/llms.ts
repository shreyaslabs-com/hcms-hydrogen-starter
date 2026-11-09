/**
 * `/llms.txt` (llmstxt.org): a markdown map of the store for AI assistants. Built from ONE
 * Storefront query (`lib/llms-data.ts`) + the document's `seo.llms` (enabled, summary, custom)
 * and `seo.robots` (anything robots.txt disallows is left out). Pure; the route adds headers.
 *
 * Format: `# <shop>`, `> <summary>`, then `## Collections` / `## Pages` / `## Blogs` /
 * `## Policies` link lists (`- [Title](url): description`), merchant markdown, `## Optional`
 * with the sitemap. Primary-market URLs on the request origin.
 */
import { customRobotsRules } from './sitemap.ts';

export const LLMS_LIMITS = {
  collections: 50,
  pages: 30,
  blogs: 10,
  summary: 1_000,
  custom: 10_000,
  description: 160,
} as const;

export type LlmsSettings = { enabled: boolean; summary: string; custom: string };

type Described = {
  handle: string;
  title: string;
  description?: string | null;
  bodySummary?: string | null;
  seo?: { description?: string | null } | null;
  hidden?: { value: string } | null;
};
type Policy = { title: string; handle: string } | null | undefined;

export type LlmsData = {
  shop: {
    name: string;
    description?: string | null;
    privacyPolicy?: Policy;
    refundPolicy?: Policy;
    shippingPolicy?: Policy;
    termsOfService?: Policy;
    subscriptionPolicy?: Policy;
  };
  collections: { nodes: Described[] };
  pages: { nodes: Described[] };
  blogs: { nodes: Described[] };
};

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAG = /<[A-Za-z!/?][^>]*>?/g;

/** Plain text / markdown only: control characters and anything tag-like removed. */
function stripHtml(text: string): string {
  let out = text.replace(CONTROL, '');
  for (let prev = ''; prev !== out;) {
    prev = out;
    out = out.replace(HTML_TAG, '');
  }
  return out;
}

const oneLine = (text: string) => stripHtml(text).replace(/\s+/g, ' ').trim();

function truncate(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .replace(/\s+\S*$/, '')}…`;
}

/** Tolerant read of `seo.llms` (the schema validates on save; this never trusts it). */
export function llmsSettings(raw: unknown): LlmsSettings {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const summary = typeof value.summary === 'string' ? value.summary : '';
  const custom = typeof value.custom === 'string' ? value.custom : '';
  return {
    enabled: value.enabled !== false,
    summary: truncate(oneLine(summary.slice(0, LLMS_LIMITS.summary * 2)), LLMS_LIMITS.summary),
    custom: stripHtml(custom.slice(0, LLMS_LIMITS.custom))
      .replace(/\r\n?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  };
}

// ── robots.txt rules (paths it disallows for every crawler are left out) ─────────────────────

/** Paths `robotsTxt` always disallows, plus our internal endpoints. */
const DEFAULT_DISALLOW = ['/cart', '/account', '/search', '/api/', '/__hcms/'];

type RobotsRule = { allow: boolean; pattern: string };

/** Allow/Disallow rules that apply to `User-agent: *` (default group + merchant `*` groups). */
export function robotsRulesForAll(customRobots: unknown): RobotsRule[] {
  const rules: RobotsRule[] = DEFAULT_DISALLOW.flatMap((path) => [
    { allow: false, pattern: path },
    { allow: false, pattern: `/*${path}` },
  ]);
  // Lines before any `User-agent` extend the default `*` group (as in `robotsTxt`).
  let agents: string[] = ['*'];
  let lastWasAgent = false;
  for (const line of customRobotsRules(customRobots)) {
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = (match[1] as string).toLowerCase();
    const value = (match[2] as string).trim();
    if (key === 'user-agent') {
      agents = lastWasAgent ? [...agents, value] : [value];
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if ((key === 'allow' || key === 'disallow') && agents.includes('*') && value.startsWith('/')) {
      rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  return rules;
}

function robotsPatternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

/** Google's precedence: the longest matching rule wins; on a tie, Allow wins. */
export function robotsAllows(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!robotsPatternMatches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return !best || best.allow;
}

// ── Document ─────────────────────────────────────────────────────────────────────────────────

/** `[text]` safe: brackets escaped, one line. */
const linkText = (text: string) => oneLine(text).replace(/([[\]\\])/g, '\\$1');

function describe(node: Described): string {
  const raw = node.seo?.description || node.description || node.bodySummary || '';
  return truncate(oneLine(raw), LLMS_LIMITS.description);
}

const isHidden = (node: Described) => node.hidden?.value === '1' || node.hidden?.value === 'true';

export type LlmsInput = {
  origin: string;
  settings: LlmsSettings;
  /** `null` = the Storefront query failed: the file still answers with what we know. */
  data: LlmsData | null;
  /** Document `seo.robots` (merchant rules). */
  robots?: unknown;
  /** Document `seo.overrides` (a template-wide `noindex` leaves that section out). */
  overrides?: unknown;
  /** Shop name when the query failed (e.g. the host name). */
  fallbackName: string;
};

export function llmsTxt({
  origin,
  settings,
  data,
  robots,
  overrides,
  fallbackName,
}: LlmsInput): string {
  const rules = robotsRulesForAll(robots);
  const noindex = (template: string) => {
    const entry = (overrides as Record<string, { noindex?: unknown }> | null | undefined)?.[
      template
    ];
    return entry?.noindex === true;
  };
  const shop = data?.shop;
  const name = oneLine(shop?.name ?? '') || fallbackName;
  const summary =
    settings.summary || truncate(oneLine(shop?.description ?? ''), LLMS_LIMITS.summary);

  const lines = [`# ${name}`, ''];
  if (summary) lines.push(`> ${summary}`, '');

  const section = (title: string, items: { title: string; path: string; note: string }[]) => {
    const listed = items.filter((item) => robotsAllows(rules, item.path));
    if (!listed.length) return;
    lines.push(`## ${title}`, '');
    for (const item of listed) {
      lines.push(
        `- [${linkText(item.title)}](${origin}${item.path})${item.note ? `: ${item.note}` : ''}`,
      );
    }
    lines.push('');
  };
  const resources = (
    nodes: Described[] | undefined,
    template: string,
    cap: number,
    prefix: string,
  ) =>
    noindex(template)
      ? []
      : (nodes ?? [])
          .filter((node) => node.handle && !isHidden(node))
          .slice(0, cap)
          .map((node) => ({
            title: node.title || node.handle,
            path: `${prefix}/${encodeURIComponent(node.handle)}`,
            note: describe(node),
          }));

  section(
    'Collections',
    resources(data?.collections.nodes, 'collection', LLMS_LIMITS.collections, '/collections'),
  );
  section('Pages', resources(data?.pages.nodes, 'page', LLMS_LIMITS.pages, '/pages'));
  section('Blogs', resources(data?.blogs.nodes, 'blog', LLMS_LIMITS.blogs, '/blogs'));
  const policies = [
    shop?.privacyPolicy,
    shop?.refundPolicy,
    shop?.shippingPolicy,
    shop?.termsOfService,
    shop?.subscriptionPolicy,
  ].flatMap((policy) =>
    policy?.handle
      ? [{ title: policy.title, path: `/policies/${encodeURIComponent(policy.handle)}`, note: '' }]
      : [],
  );
  section('Policies', policies);

  if (settings.custom) lines.push(settings.custom, '');

  lines.push(
    '## Optional',
    '',
    `- [Sitemap](${origin}/sitemap.xml): Every product, collection, page and article URL`,
  );
  return `${lines.join('\n')}\n`;
}

/**
 * The `/llms.txt` response: 404 when the merchant turned it off; `text/plain`, cached like
 * robots.txt (published edits show within minutes; a failed query retries sooner).
 */
export function llmsResponse(input: LlmsInput & { preview: boolean }): Response {
  const headers = { 'Content-Type': 'text/plain; charset=utf-8' };
  if (!input.settings.enabled) {
    return new Response('Not found\n', {
      status: 404,
      headers: { ...headers, 'Cache-Control': input.preview ? 'no-store' : 'public, max-age=300' },
    });
  }
  return new Response(llmsTxt(input), {
    headers: {
      ...headers,
      'Cache-Control': input.preview
        ? 'no-store'
        : input.data
          ? 'public, max-age=300, stale-while-revalidate=3600'
          : 'public, max-age=60',
    },
  });
}
