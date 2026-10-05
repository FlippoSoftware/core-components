import type { Orientation } from '~@lib/types';

export type SeparatorState = {
    orientation: Orientation;
};

/**
 * Attributes of a separator.
 */
export function getSeparatorProps(state: SeparatorState) {
    return { role: 'separator', 'aria-orientation': state.orientation, 'data-orientation': state.orientation };
}
