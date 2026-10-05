import { valueToPercent } from '~@lib/valueToPercent';

import type { Style } from '~@lib/types';

/**
 * Indicator width for a value in `[min, max]`; empty when the value is not finite.
 */
export function getIndicatorStyle(value: number | null, min: number, max: number): Style {
    const percentageValue = Number.isFinite(value) && value !== null ? valueToPercent(value, min, max) : null;
    if (percentageValue == null) {
        return {};
    }

    return { insetInlineStart: 0, height: 'inherit', width: `${percentageValue}%` };
}
