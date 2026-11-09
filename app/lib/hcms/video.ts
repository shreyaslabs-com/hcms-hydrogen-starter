/** External video helpers (`video_url` settings, Storefront `ExternalVideo`). */
export type VideoProvider = 'youtube' | 'vimeo';
export type ParsedVideoUrl = { provider: VideoProvider; id: string };

/** YouTube (watch, youtu.be, shorts, embed) and Vimeo URLs → provider + id. */
export function parseVideoUrl(url: string): ParsedVideoUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m)\./, '');
  const path = parsed.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' && path[0]) return { provider: 'youtube', id: path[0] };
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      parsed.searchParams.get('v') ??
      (['embed', 'shorts', 'live'].includes(path[0] ?? '') ? path[1] : undefined);
    return id && /^[\w-]{6,}$/.test(id) ? { provider: 'youtube', id } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = path.find((segment) => /^\d+$/.test(segment));
    return id ? { provider: 'vimeo', id } : null;
  }
  return null;
}

/** Privacy-friendly embed URL that autoplays once the facade is clicked. */
export function videoEmbedUrl({ provider, id }: ParsedVideoUrl, { autoplay = true } = {}): string {
  if (provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${id}?${autoplay ? 'autoplay=1&' : ''}rel=0&playsinline=1`;
  }
  return `https://player.vimeo.com/video/${id}?${autoplay ? 'autoplay=1&' : ''}dnt=1`;
}

/** YouTube has static thumbnails; Vimeo needs an API call, so callers pass a poster instead. */
export function videoThumbnailUrl({ provider, id }: ParsedVideoUrl): string | null {
  return provider === 'youtube' ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export type VideoSource = {
  url: string;
  mime: string;
  width?: number | null;
  height?: number | null;
};

/**
 * Order sources for a native `<video>`: HLS first (Safari/iOS play it natively; others skip the
 * unsupported type), then MP4 from largest to smallest so the browser picks the best it can play.
 */
export function orderVideoSources(sources: VideoSource[]): VideoSource[] {
  const hls = sources.filter((s) => s.mime.includes('mpegurl') || s.mime.includes('mpegURL'));
  const files = sources
    .filter((s) => !hls.includes(s))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return [...hls, ...files];
}

/**
 * How a Shopify-hosted video renders (T-2.35, docs/11 §2.3):
 * - `autoplay`: muted inline loop (backgrounds); the section owns pause + reduced motion;
 * - `facade`: poster + play button; the `<video>` (and its bytes) load only on click;
 * - `native`: no poster to show, so a `<video preload="metadata">` with controls.
 */
export function hostedVideoMode({
  autoPlay,
  poster,
}: {
  autoPlay?: boolean;
  poster?: { url: string } | null;
}): 'autoplay' | 'facade' | 'native' {
  if (autoPlay) return 'autoplay';
  return poster?.url ? 'facade' : 'native';
}

/** Width / height of the largest source (or the poster) for a CLS-free box; null if unknown. */
export function videoAspectRatio(
  sources: VideoSource[],
  poster?: { width?: number | null; height?: number | null } | null,
): number | null {
  const best = [...sources]
    .filter((s) => s.width && s.height)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  const w = best?.width ?? poster?.width;
  const h = best?.height ?? poster?.height;
  return w && h ? Math.round((w / h) * 10000) / 10000 : null;
}
