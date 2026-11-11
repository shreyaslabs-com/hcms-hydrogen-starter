import { useEffect, type HTMLAttributes } from 'react';

// Pinned; loaded only on pages that render a 3D model, and allowed by that exact URL in the CSP.
import { MODEL_VIEWER_SRC } from './model-viewer-src';

export { MODEL_VIEWER_SRC };

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': HTMLAttributes<HTMLElement> & {
        src: string;
        alt: string;
        poster?: string;
        ar?: boolean;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        loading?: 'auto' | 'lazy' | 'eager';
      };
    }
  }
}

function loadModelViewer() {
  if (typeof document === 'undefined' || customElements.get('model-viewer')) return;
  if (document.querySelector(`script[src="${MODEL_VIEWER_SRC}"]`)) return;
  const script = document.createElement('script');
  script.type = 'module';
  script.src = MODEL_VIEWER_SRC;
  document.head.appendChild(script);
}

/** Storefront `Model3d` (GLB) with AR on supported devices. */
export function ModelViewer({
  src,
  alt,
  poster,
  className,
}: {
  src: string;
  alt: string;
  poster?: string | null;
  className?: string;
}) {
  useEffect(loadModelViewer, []);
  return (
    <model-viewer
      data-hcms-slot="media"
      src={src}
      alt={alt}
      poster={poster ?? undefined}
      ar
      camera-controls
      loading="lazy"
      className={className}
      style={{ width: '100%', aspectRatio: '1' }}
    />
  );
}
