/**
 * A/B tests (T-3.5): root middleware buckets the visitor from the snapshot's `experiments`
 * (SDK `bucketRequest`, sticky `_hcms_ab` cookie), applies the arms to the document before any
 * route renders (no flicker/CLS), and marks the response private + `Vary: Cookie`.
 */
import { NO_EXPERIMENTS, type ExperimentState } from '@hcms/hydrogen';
import { createContext } from 'react-router';

export const experimentContext = createContext<ExperimentState>(NO_EXPERIMENTS);
