import type { PreviewState } from '@hcms/hydrogen';
import { createContext } from 'react-router';

/** Resolved editor preview for this request (null = normal storefront). */
export const previewContext = createContext<PreviewState | null>(null);
