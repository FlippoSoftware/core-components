import type { Dimensions } from '@floating-ui/utils';

import { getCssDimensions } from '~@lib/getCssDimensions';
import { AnimationFrame } from '~@timers/AnimationFrame';

import { runOnceAnimationsFinish } from './animations';

export type PopupAutoResizeOptions = {
    /**
     * Element to resize.
     */
    popupElement: HTMLElement | null;
    /**
     * Positioner element (parent of the popup).
     */
    positionerElement: HTMLElement | null;
    /**
     * Whether the popup is mounted.
     */
    mounted: boolean;
    /**
     * A value that changes when the content changes and triggers a resize.
     */
    content: unknown;
    /**
     * Whether the auto-resize is enabled.
     */
    enabled?: (() => boolean) | undefined;
    /**
     * Called immediately before measuring the dimensions of the new content.
     */
    onMeasureLayout?: (() => void) | undefined;
    /**
     * Called after the new dimensions have been measured.
     */
    onMeasureLayoutComplete?: ((previousDimensions: Dimensions | null, newDimensions: Dimensions) => void) | undefined;
};

const DEFAULT_ENABLED = () => true;

function overrideElementStyle(element: HTMLElement, property: string, value: string) {
    const originalValue = element.style.getPropertyValue(property);
    element.style.setProperty(property, value);

    return () => {
        element.style.setProperty(property, originalValue);
    };
}

/**
 * Lets a popup resize with its content while supporting CSS transitions of
 * `--popup-width`/`--popup-height` and `--positioner-width`/`--positioner-height`.
 * Replacement for `usePopupAutoResize`; call {@link PopupAutoResize.setOptions} whenever an option changes.
 */
export class PopupAutoResize {
    private options: PopupAutoResizeOptions;

    private isInitialRender = true;

    private previousDimensions: Dimensions | null = null;

    private readonly animationFrame = new AnimationFrame();

    private readonly finishFrame = new AnimationFrame();

    private cleanup: (() => void) | null = null;

    private deps: unknown[] | null = null;

    constructor(options: PopupAutoResizeOptions) {
        this.options = options;
        this.sync();
    }

    setOptions(options: PopupAutoResizeOptions) {
        this.options = options;
        this.sync();
    }

    destroy() {
        this.cleanup?.();
        this.cleanup = null;
    }

    private sync() {
        const { content, popupElement, positionerElement, enabled, mounted } = this.options;
        const deps = [content, popupElement, positionerElement, enabled, mounted];
        if (this.deps && deps.every((dep, index) => Object.is(dep, this.deps?.[index]))) {
            return;
        }
        this.deps = deps;
        this.cleanup?.();
        this.cleanup = this.run() ?? null;
    }

    private run(): (() => void) | undefined {
        const {
            popupElement,
            positionerElement,
            mounted,
            enabled = DEFAULT_ENABLED,
            onMeasureLayout,
            onMeasureLayoutComplete
        } = this.options;

        // Reset the state when the popup is closed.
        if (!mounted || !enabled() || typeof ResizeObserver === 'undefined') {
            this.isInitialRender = true;
            this.previousDimensions = null;
            return undefined;
        }

        if (!popupElement || !positionerElement) {
            return undefined;
        }

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const width = Math.ceil(entry.borderBoxSize[0]?.inlineSize ?? 0);
                const height = Math.ceil(entry.borderBoxSize[0]?.blockSize ?? 0);
                if (this.previousDimensions === null) {
                    this.previousDimensions = { width, height };
                } else {
                    this.previousDimensions.width = width;
                    this.previousDimensions.height = height;
                }
            }
        });

        observer.observe(popupElement);

        // Measure the rendered size to enable transitions:
        popupElement.style.setProperty('--popup-width', 'auto');
        popupElement.style.setProperty('--popup-height', 'auto');

        const restorePopupPosition = overrideElementStyle(popupElement, 'position', 'static');
        const restorePopupTransform = overrideElementStyle(popupElement, 'transform', 'none');
        const restorePopupScale = overrideElementStyle(popupElement, 'scale', '1');
        const restoreAvailableWidth = overrideElementStyle(positionerElement, '--available-width', 'max-content');
        const restoreAvailableHeight = overrideElementStyle(positionerElement, '--available-height', 'max-content');
        onMeasureLayout?.();

        // Initial render (for each time the popup opens).
        if (this.isInitialRender || this.previousDimensions === null) {
            positionerElement.style.setProperty('--positioner-width', 'max-content');
            positionerElement.style.setProperty('--positioner-height', 'max-content');

            const dimensions = getCssDimensions(popupElement);

            positionerElement.style.setProperty('--positioner-width', `${dimensions.width}px`);
            positionerElement.style.setProperty('--positioner-height', `${dimensions.height}px`);
            restorePopupPosition();
            restorePopupTransform();
            restorePopupScale();
            restoreAvailableWidth();
            restoreAvailableHeight();
            onMeasureLayoutComplete?.(null, dimensions);

            this.isInitialRender = false;

            return () => {
                observer.disconnect();
            };
        }

        // Subsequent renders while open (when `content` changes).
        const previousDimensions = this.previousDimensions;
        popupElement.style.setProperty('--popup-width', 'auto');
        popupElement.style.setProperty('--popup-height', 'auto');
        positionerElement.style.setProperty('--positioner-width', 'max-content');
        positionerElement.style.setProperty('--positioner-height', 'max-content');

        const newDimensions = getCssDimensions(popupElement);

        popupElement.style.setProperty('--popup-width', `${previousDimensions.width}px`);
        popupElement.style.setProperty('--popup-height', `${previousDimensions.height}px`);
        restorePopupPosition();
        restorePopupTransform();
        restoreAvailableWidth();
        restoreAvailableHeight();
        onMeasureLayoutComplete?.(previousDimensions, newDimensions);

        positionerElement.style.setProperty('--positioner-width', `${newDimensions.width}px`);
        positionerElement.style.setProperty('--positioner-height', `${newDimensions.height}px`);

        const abortController = new AbortController();

        this.animationFrame.request(() => {
            popupElement.style.setProperty('--popup-width', `${newDimensions.width}px`);
            popupElement.style.setProperty('--popup-height', `${newDimensions.height}px`);

            runOnceAnimationsFinish(
                popupElement,
                () => {
                    popupElement.style.setProperty('--popup-width', 'auto');
                    popupElement.style.setProperty('--popup-height', 'auto');
                },
                { signal: abortController.signal, waitForNextTick: true, treatAbortedAsFinished: false, frame: this.finishFrame }
            );
        });

        return () => {
            observer.disconnect();
            abortController.abort();
            this.animationFrame.cancel();
            this.finishFrame.cancel();
        };
    }
}
