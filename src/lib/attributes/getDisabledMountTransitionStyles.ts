import { DISABLED_TRANSITIONS_STYLE, EMPTY_OBJECT } from '~@lib/constants';

import type { Style, TransitionStatus } from '~@lib/types';

export function getDisabledMountTransitionStyles(transitionStatus: TransitionStatus): {
    style?: Style;
} {
    return transitionStatus === 'starting' ? DISABLED_TRANSITIONS_STYLE : EMPTY_OBJECT;
}
