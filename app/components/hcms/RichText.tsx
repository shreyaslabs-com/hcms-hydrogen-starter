import type { ReactNode } from 'react';

import { parseRichText, type RichTextNode } from '~/lib/hcms/rich-text';

function render(node: RichTextNode, key: number | string): ReactNode {
  const kids = 'children' in node ? node.children.map((child, i) => render(child, i)) : null;
  switch (node.type) {
    case 'root':
      return kids;
    case 'paragraph':
      return <p key={key}>{kids}</p>;
    case 'heading': {
      const Tag = `h${node.level}` as const;
      return <Tag key={key}>{kids}</Tag>;
    }
    case 'list':
      return node.ordered ? <ol key={key}>{kids}</ol> : <ul key={key}>{kids}</ul>;
    case 'list-item':
      return <li key={key}>{kids}</li>;
    case 'link':
      return (
        <a
          key={key}
          href={node.url}
          title={node.title}
          {...(node.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {kids}
        </a>
      );
    case 'text': {
      let content: ReactNode = node.value;
      if (node.italic) content = <em>{content}</em>;
      if (node.bold) content = <strong>{content}</strong>;
      return <span key={key}>{content}</span>;
    }
  }
}

/**
 * Renders a `rich_text_field` metafield (replaces Hydrogen's removed `<RichText>`). Builds React
 * elements from the JSON tree, so no HTML is injected; unsafe link URLs are dropped.
 */
export function RichText({ value, className = 'rte' }: { value: unknown; className?: string }) {
  const tree = parseRichText(value);
  if (!tree) return null;
  return <div className={className}>{render(tree, 'root')}</div>;
}
