import { clamp } from '~@lib/clamp';
import { getFormatter } from '~@lib/formatNumber';
import { ownerWindow } from '~@lib/owner';

export const CHANGE_VALUE_TICK_DELAY = 60;

export const START_AUTO_CHANGE_DELAY = 400;

export const TOUCH_TIMEOUT = 50;

export const MAX_POINTER_MOVES_AFTER_TOUCH = 3;

export const SCROLLING_POINTER_MOVE_DISTANCE = 8;

export const DEFAULT_STEP = 1;

export function removeFloatingPointErrors(value: number, format: Intl.NumberFormatOptions = {}) {
    return Number.parseFloat(
        getFormatter('en-US', {
            maximumFractionDigits: format.maximumFractionDigits,
            minimumFractionDigits: format.minimumFractionDigits,
            useGrouping: false
        }).format(value)
    );
}

export function toValidatedNumber(
    value: number | null,
    {
        step,
        minWithDefault,
        maxWithDefault,
        minWithZeroDefault,
        format,
        snapOnStep,
        small
    }: {
        step: number | undefined;
        minWithDefault: number;
        maxWithDefault: number;
        minWithZeroDefault: number;
        format: Intl.NumberFormatOptions | undefined;
        snapOnStep: boolean;
        small: boolean;
    }
) {
    if (value === null) {
        return value;
    }

    const clampedValue = clamp(value, minWithDefault, maxWithDefault);

    if (step != null && snapOnStep) {
        if (small) {
            const stepsFromMin = (clampedValue - minWithZeroDefault) / step;
            const roundedSteps = Math.round(stepsFromMin);
            const snappedValue = minWithZeroDefault + roundedSteps * step;
            return removeFloatingPointErrors(snappedValue, format);
        }

        // If a real minimum is provided, use it
        const base = minWithDefault === Number.MIN_SAFE_INTEGER ? minWithZeroDefault : minWithDefault;

        if (step > 0) {
            // "Undo" the increment by subtracting step, then snap.
            const unsnapped = clampedValue - step;
            const steps = Math.floor((unsnapped - base) / step);
            // Reapply the increment by adding step
            return removeFloatingPointErrors(base + steps * step + step, format);
        }

        if (step < 0) {
            const absStep = Math.abs(step);
            const unsnapped = clampedValue - step;
            const steps = Math.ceil((unsnapped - base) / absStep);
            return removeFloatingPointErrors(base + steps * absStep + step, format);
        }
    }

    return removeFloatingPointErrors(clampedValue, format);
}

/**
 * Calculates the viewport rect for the virtual scrub cursor.
 */
export function getViewportRect(teleportDistance: number | undefined, scrubAreaEl: HTMLElement) {
    const win = ownerWindow(scrubAreaEl);
    const rect = scrubAreaEl.getBoundingClientRect();

    if (rect && teleportDistance != null) {
        return {
            x: rect.left - teleportDistance / 2,
            y: rect.top - teleportDistance / 2,
            width: rect.right + teleportDistance / 2,
            height: rect.bottom + teleportDistance / 2
        };
    }

    const vV = win.visualViewport;

    if (vV) {
        return { x: vV.offsetLeft, y: vV.offsetTop, width: vV.offsetLeft + vV.width, height: vV.offsetTop + vV.height };
    }

    return { x: 0, y: 0, width: win.document.documentElement.clientWidth, height: win.document.documentElement.clientHeight };
}

/**
 * Tracks the visual viewport scale (to invert the scrub cursor scale on pinch-zoom).
 */
export function subscribeToVisualViewportResize(element: Element, onScale: (scale: number) => void) {
    const vV = ownerWindow(element).visualViewport;

    if (!vV) {
        return () => {};
    }

    const handleVisualResize = () => onScale(vV.scale);

    handleVisualResize();
    vV.addEventListener('resize', handleVisualResize);

    return () => {
        vV.removeEventListener('resize', handleVisualResize);
    };
}
