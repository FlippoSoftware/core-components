import { isSafari } from '~@lib/detectBrowser';
import { visuallyHidden } from '~@lib/visuallyHidden';

import type { Style } from '~@lib/types';

export type FocusGuardType = 'inside' | 'outside';

/**
 * Props of a focus guard: a visually hidden tabbable `<span>` that catches focus at the edges
 * of a floating element (or of a portal).
 */
export function getFocusGuardProps(type: FocusGuardType): {
    tabIndex: number;
    role: 'button' | undefined;
    'aria-hidden': true | undefined;
    style: Style;
    'data-type': FocusGuardType;
    'data-base-ui-focus-guard': '';
} {
    // Unlike other screen readers such as NVDA and JAWS, the virtual cursor
    // on VoiceOver does trigger the onFocus event, so we can use the focus
    // trap element. On Safari, only buttons trigger the onFocus event.
    const role = isSafari ? 'button' : undefined;
    return {
        tabIndex: 0,
        role,
        'aria-hidden': role ? undefined : true,
        style: visuallyHidden,
        'data-type': type,
        'data-base-ui-focus-guard': ''
    };
}
