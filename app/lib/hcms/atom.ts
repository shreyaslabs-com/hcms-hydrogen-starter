/**
 * Blog Atom feed (T-2.41): Online Store serves `/blogs/<blog>.atom`. Pure builder so `node:test`
 * can load it; the root middleware answers the URL (React Router can't route a `.atom` suffix on
 * a dynamic segment). Article bodies are Shopify's own HTML, sent as escaped `type="html"`
 * content, exactly as feed readers expect.
 */
import { escapeXml } from './sitemap.ts';

export type FeedArticle = {
  id: string;
  handle: string;
  title: string;
  publishedAt: string;
  contentHtml?: string | null;
  excerptHtml?: string | null;
  authorV2?: { name: string } | null;
  tags?: readonly string[] | null;
  image?: { url: string } | null;
};

export type FeedBlog = {
  handle: string;
  title: string;
  seo?: { description?: string | null } | null;
  articles: { nodes: FeedArticle[] };
};

/** `/blogs/news.atom` or `/fr-ca/blogs/news.atom` → `news`; anything else → null. */
export function atomBlogHandle(pathname: string): string | null {
  const match = /^(?:\/[a-z]{2,3}-[a-z]{2})?\/blogs\/([^/]+)\.atom$/i.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function atomFeed({
  origin,
  prefix,
  shopName,
  blog,
}: {
  origin: string;
  /** Market subfolder (`/fr-ca`) or `''`. */
  prefix: string;
  shopName: string;
  blog: FeedBlog;
}): string {
  const blogUrl = `${origin}${prefix}/blogs/${encodeURIComponent(blog.handle)}`;
  const nodes = blog.articles.nodes;
  const updated = nodes[0]?.publishedAt ?? new Date(0).toISOString();
  const entries = nodes
    .map((a) => {
      const url = `${blogUrl}/${encodeURIComponent(a.handle)}`;
      const body = a.contentHtml || a.excerptHtml || '';
      const summary = a.excerptHtml
        ? `\n    <summary type="html">${escapeXml(a.excerptHtml)}</summary>`
        : '';
      const author = a.authorV2?.name
        ? `\n    <author><name>${escapeXml(a.authorV2.name)}</name></author>`
        : '';
      const tags = (a.tags ?? []).map((t) => `\n    <category term="${escapeXml(t)}"/>`).join('');
      const image = a.image?.url
        ? `\n    <link rel="enclosure" href="${escapeXml(a.image.url)}"/>`
        : '';
      return `  <entry>
    <id>${escapeXml(a.id)}</id>
    <title>${escapeXml(a.title)}</title>
    <link rel="alternate" type="text/html" href="${escapeXml(url)}"/>
    <published>${escapeXml(a.publishedAt)}</published>
    <updated>${escapeXml(a.publishedAt)}</updated>${author}${tags}${image}${summary}
    <content type="html">${escapeXml(body)}</content>
  </entry>`;
    })
    .join('\n');
  const subtitle = blog.seo?.description
    ? `\n  <subtitle>${escapeXml(blog.seo.description)}</subtitle>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escapeXml(blogUrl)}</id>
  <title>${escapeXml(`${shopName} - ${blog.title}`)}</title>${subtitle}
  <link rel="alternate" type="text/html" href="${escapeXml(blogUrl)}"/>
  <link rel="self" type="application/atom+xml" href="${escapeXml(`${blogUrl}.atom`)}"/>
  <updated>${escapeXml(updated)}</updated>
${entries}
</feed>
`;
}

export function atomResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, stale-while-revalidate=86400',
    },
  });
}
