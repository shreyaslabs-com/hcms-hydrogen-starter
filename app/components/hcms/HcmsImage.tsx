import type { CSSProperties, ImgHTMLAttributes } from 'react';
import { preload } from 'react-dom';

import {
  MOBILE_MEDIA,
  artDirectedPreloads,
  focalToObjectPosition,
  imageSrcSet,
  shopifyImageUrl,
  type ImageCrop,
} from '~/lib/image';

/** Storefront `Image` or a snapshot asset (`assets[gid]`, type image). */
export type HcmsImageSource = {
  url: string;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
  alt?: string | null;
  focal?: { x: number; y: number } | null;
};

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'width' | 'height'> & {
  image: HcmsImageSource;
  /** CSS `sizes`; required for correct srcset choice. */
  sizes: string;
  /** Force a shape (width / height), e.g. 1 for square, 16 / 9 for banners. */
  aspectRatio?: number;
  crop?: ImageCrop;
  /** First visible image (LCP): eager + fetchpriority high. Everything else lazy-loads. */
  priority?: boolean;
  /** Per-setting focal point; falls back to the file's own focal point. */
  focal?: { x: number; y: number } | null;
  /** Art-directed image below the `md` breakpoint (`<picture>`; only one file downloads). */
  mobile?: HcmsImageSource | null;
};

/** The mobile source is always full-bleed below `md`. */
const MOBILE_SIZES = '100vw';

/**
 * Responsive Shopify image: srcset from the CDN, intrinsic width/height to avoid layout shift,
 * focal point as `object-position`, lazy unless `priority`.
 */
export function HcmsImage({
  image,
  sizes,
  aspectRatio,
  crop,
  priority = false,
  focal,
  alt,
  style,
  mobile,
  ...rest
}: Props) {
  const ratio =
    aspectRatio ?? (image.width && image.height ? image.width / image.height : undefined);
  const width = image.width ?? undefined;
  const height = width && ratio ? Math.round(width / ratio) : (image.height ?? undefined);
  const objectPosition = focalToObjectPosition(focal ?? image.focal);
  const mergedStyle: CSSProperties | undefined =
    objectPosition || aspectRatio
      ? { ...(aspectRatio ? { aspectRatio: String(aspectRatio) } : {}), objectPosition, ...style }
      : style;

  const shape = aspectRatio ? { aspectRatio, crop: crop ?? 'center' } : {};
  const src = shopifyImageUrl(image.url, {
    width: 1024,
    ...(aspectRatio ? { height: 1024 / aspectRatio, crop: crop ?? 'center' } : {}),
  });
  const srcSet = imageSrcSet(image.url, { intrinsicWidth: image.width, ...shape });
  const mobileSrcSet = mobile
    ? imageSrcSet(mobile.url, { intrinsicWidth: mobile.width, ...shape })
    : '';

  // React doesn't preload an `<img>` inside `<picture>`, so an art-directed LCP image was only
  // found late in the body. Preload both sources, each scoped to its media (T-2.132).
  if (priority && mobile) {
    for (const options of artDirectedPreloads(
      { srcSet, sizes },
      { srcSet: mobileSrcSet, sizes: MOBILE_SIZES },
    )) {
      preload(src, { as: 'image', fetchPriority: 'high', ...options });
    }
  }

  const img = (
    <img
      {...rest}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={width}
      height={height}
      alt={alt ?? image.altText ?? image.alt ?? ''}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'sync' : 'async'}
      {...(mobile ? { className: `hcms-art ${rest.className ?? ''}` } : {})}
      style={mobile ? pictureStyle(mergedStyle, objectPosition, mobile) : mergedStyle}
    />
  );
  if (!mobile) return img;

  const mobileRatio =
    aspectRatio ?? (mobile.width && mobile.height ? mobile.width / mobile.height : undefined);
  const mobileWidth = mobile.width ?? undefined;
  return (
    <picture style={{ display: 'contents' }}>
      <source
        media={MOBILE_MEDIA}
        srcSet={mobileSrcSet}
        sizes={MOBILE_SIZES}
        width={mobileWidth}
        height={
          mobileWidth && mobileRatio
            ? Math.round(mobileWidth / mobileRatio)
            : (mobile.height ?? undefined)
        }
      />
      {img}
    </picture>
  );
}

/**
 * With a mobile source each image keeps its own focal point: inline `object-position` can't vary
 * by media query, so the mobile one is a CSS variable applied by the global `.hcms-art` rule.
 */
function pictureStyle(
  base: CSSProperties | undefined,
  desktop: string | undefined,
  mobile: HcmsImageSource,
): CSSProperties {
  return {
    ...base,
    objectPosition: undefined,
    ['--hcms-op' as string]: desktop ?? '50% 50%',
    ['--hcms-op-m' as string]: focalToObjectPosition(mobile.focal) ?? '50% 50%',
  } as CSSProperties;
}
