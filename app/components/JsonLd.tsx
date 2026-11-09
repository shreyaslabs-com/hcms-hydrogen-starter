import { serializeJsonLd, type JsonLd as JsonLdData } from '~/lib/hcms/json-ld-script';

/** `<script type="application/ld+json">` with escaping (data blocks need no CSP nonce). */
export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
