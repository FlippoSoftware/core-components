import type { Style } from './types';

export const OPEN_DELAY = 500;

export const TYPEAHEAD_RESET_MS = 500;
export const PATIENT_CLICK_THRESHOLD = 500;
export const DISABLED_TRANSITIONS_STYLE = { style: { transition: 'none' } };
export const EMPTY_OBJECT = {};
export const EMPTY_ARRAY = [];
export const CLICK_TRIGGER_IDENTIFIER = 'data-headless-ui-click-trigger';

export const DROPDOWN_COLLISION_AVOIDANCE = {
    fallbackAxisSide: 'none'
} as const;

export const POPUP_COLLISION_AVOIDANCE = {
    fallbackAxisSide: 'end'
} as const;

/**
 * Special visually hidden styles for the aria-owns owner element to ensure owned element
 * accessibility in iOS/Safari/VoiceControl.
 * The owner element is an empty span, so most of the common visually hidden styles are not needed.
 * @see https://github.com/floating-ui/floating-ui/issues/3403
 */
export const ownerVisuallyHidden: Style = {
    clipPath: 'inset(50%)',
    position: 'fixed',
    top: 0,
    left: 0
};
