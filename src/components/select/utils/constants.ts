import type { Style } from '~@lib/types';

export const LIST_FUNCTIONAL_STYLES: Style = {
    position: 'relative',
    maxHeight: '100%',
    overflowX: 'hidden',
    overflowY: 'auto'
};

/**
 * Class name hiding the scrollbar (the adapter injects the matching style element, see `ScrollArea`).
 */
export const SELECT_DISABLE_SCROLLBAR_CLASS = 'base-ui-disable-scrollbar';
