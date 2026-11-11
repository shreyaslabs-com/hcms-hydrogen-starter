import { useConsent } from '@hcms/hydrogen';
import { useState, type VideoHTMLAttributes } from 'react';

import { shopifyImageUrl } from '~/lib/image';
import {
  hostedVideoMode,
  orderVideoSources,
  videoAspectRatio,
  parseVideoUrl,
  videoEmbedUrl,
  videoThumbnailUrl,
  type VideoSource,
} from '~/lib/hcms/video';

type HostedVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'poster'> & {
  /** Storefront `Video.sources` or a snapshot video asset's `sources`. */
  sources: VideoSource[];
  poster?: { url: string; width?: number | null; height?: number | null } | null;
  /** Autoplay implies muted + playsInline (browsers block sound autoplay). */
  autoPlay?: boolean;
  /** Captions file (.vtt). */
  captions?: { src: string; srcLang: string; label: string } | null;
};

/**
 * Shopify-hosted video (Files / product media, T-2.35) with a native `<video>`: HLS first for
 * browsers that play it natively (Safari, iOS, Android Chrome), MP4 renditions for the rest —
 * Shopify always transcodes MP4s, so hls.js is never needed and never shipped.
 * - Autoplay (backgrounds): muted inline; the section owns pause + reduced motion.
 * - With a poster: a facade (poster + play button) so no video bytes load until the shopper
 *   asks; the box keeps the video's aspect ratio (no CLS).
 * - Without one: `preload="metadata"` with native controls.
 */
export function HcmsVideo({
  sources,
  poster,
  autoPlay = false,
  captions,
  controls,
  preload,
  className,
  style,
  ...rest
}: HostedVideoProps) {
  const [playing, setPlaying] = useState(false);
  const mode = hostedVideoMode({ autoPlay, poster });
  const ratio = videoAspectRatio(sources, poster);
  const posterUrl = poster ? shopifyImageUrl(poster.url, { width: 1280 }) : undefined;
  const label = rest['aria-label'] ?? 'Video';

  if (mode === 'facade' && !playing)
    return (
      <button
        type="button"
        data-hcms-slot="media"
        onClick={() => setPlaying(true)}
        className={`group relative block overflow-hidden bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${className ?? ''}`}
        style={{ ...(ratio ? { aspectRatio: String(ratio) } : {}), ...style }}
      >
        <span className="sr-only">Play video: {label}</span>
        <img
          src={posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white group-hover:bg-black"
        >
          ▶
        </span>
      </button>
    );

  return (
    <video
      {...rest}
      data-hcms-slot="media"
      className={className}
      style={{ ...(ratio && mode !== 'autoplay' ? { aspectRatio: String(ratio) } : {}), ...style }}
      poster={posterUrl}
      autoPlay={autoPlay || playing}
      muted={autoPlay || rest.muted}
      playsInline
      controls={controls ?? !autoPlay}
      preload={preload ?? (autoPlay || playing ? 'auto' : 'metadata')}
    >
      {orderVideoSources(sources).map((source) => (
        <source key={source.url} src={source.url} type={source.mime} />
      ))}
      {captions ? (
        <track
          kind="captions"
          src={captions.src}
          srcLang={captions.srcLang}
          label={captions.label}
          default
        />
      ) : null}
    </video>
  );
}

/**
 * YouTube/Vimeo facade: a thumbnail button that swaps to the iframe on click, so third-party
 * player JS never loads until the shopper asks for it (protects LCP and the JS budget).
 */
export function ExternalVideo({
  url,
  title,
  poster,
  className,
}: {
  url: string;
  title: string;
  poster?: { url: string } | null;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const consent = useConsent();
  const video = parseVideoUrl(url);
  if (!video) return null;
  // The provider's thumbnail is a third-party request: only after marketing consent (T-1.1.11).
  // Playing is the shopper's explicit choice, so the click still loads the player.
  const thumbnail = poster
    ? shopifyImageUrl(poster.url, { width: 1280 })
    : consent.marketing
      ? videoThumbnailUrl(video)
      : null;
  const provider = video.provider === 'youtube' ? 'YouTube' : 'Vimeo';

  return (
    <div
      data-hcms-slot="media"
      className={`relative aspect-video w-full overflow-hidden bg-black ${className ?? ''}`}
    >
      {playing ? (
        <iframe
          src={videoEmbedUrl(video)}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <span className="sr-only">
            Play video: {title} (loads from {provider})
          </span>
          {!thumbnail ? (
            <span className="absolute inset-x-0 bottom-3 text-center text-xs text-white/80">
              Plays from {provider}
            </span>
          ) : null}
          {thumbnail ? (
            <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : null}
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white group-hover:bg-black"
          >
            ▶
          </span>
        </button>
      )}
    </div>
  );
}
