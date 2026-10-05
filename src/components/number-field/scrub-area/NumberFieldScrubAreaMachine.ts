import { createGenericEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { isWebKit } from '~@lib/detectBrowser';
import { ownerDocument, ownerWindow } from '~@lib/owner';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

import { DEFAULT_STEP, getViewportRect, subscribeToVisualViewportResize } from '../utils/numberFieldUtils';

import type { NumberFieldMachine } from '../root/NumberFieldMachine';

export type NumberFieldScrubAreaOptions = {
    /**
     * @default 'horizontal'
     */
    direction?: 'horizontal' | 'vertical' | undefined;
    /**
     * Pixels the pointer must move to change the value.
     * @default 2
     */
    pixelSensitivity?: number | undefined;
    /**
     * Distance the virtual cursor can travel before teleporting to the other side.
     */
    teleportDistance?: number | undefined;
    /**
     * Runs a state change synchronously in the adapter's renderer (`ReactDOM.flushSync`).
     */
    flushSync?: ((fn: () => void) => void) | undefined;
};

const runImmediately = (fn: () => void) => fn();

/**
 * Scrub area of a number field: dragging changes the value; with pointer lock a virtual cursor is shown.
 */
export class NumberFieldScrubAreaMachine {
    readonly store = new Store({ isTouchInput: false, isPointerLockDenied: false });

    private options: NumberFieldScrubAreaOptions;

    private readonly field: NumberFieldMachine;

    private scrubArea: HTMLElement | null = null;

    private cursor: HTMLElement | null = null;

    private isScrubbing = false;

    private virtualCursorCoords = { x: 0, y: 0 };

    private visualScale = 1;

    private readonly scrubListeners: Effect;

    private readonly touchListeners: Effect;

    private readonly visualViewportListener: Effect;

    private readonly unsubscribe: () => void;

    constructor(field: NumberFieldMachine, options: NumberFieldScrubAreaOptions = {}) {
        this.field = field;
        this.options = options;
        this.scrubListeners = new Effect(() => this.attachScrubListeners());
        this.touchListeners = new Effect(() => this.attachTouchListeners());
        this.visualViewportListener = new Effect(() => {
            if (!(this.field.store.state.scrubbing && this.cursor)) {
                return;
            }
            return subscribeToVisualViewportResize(this.cursor, (scale) => {
                this.visualScale = scale;
            });
        });
        this.unsubscribe = field.store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: NumberFieldScrubAreaOptions) {
        this.options = options;
        this.sync();
    }

    destroy() {
        this.unsubscribe();
        this.scrubListeners.destroy();
        this.touchListeners.destroy();
        this.visualViewportListener.destroy();
    }

    setScrubArea = (element: HTMLElement | null) => {
        this.scrubArea = element;
        this.sync();
    };

    setCursor = (element: HTMLElement | null) => {
        this.cursor = element;
        this.sync();
    };

    /**
     * Whether the virtual cursor is rendered.
     */
    shouldRenderCursor() {
        const { isTouchInput, isPointerLockDenied } = this.store.state;
        return this.field.store.state.scrubbing && !isWebKit && !isTouchInput && !isPointerLockDenied;
    }

    getCursorProps(): Props {
        return { role: 'presentation', style: { position: 'fixed', top: 0, left: 0, pointerEvents: 'none' } };
    }

    getProps(): Props {
        return {
            role: 'presentation',
            style: { touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' },
            onPointerDown: this.onPointerDown
        };
    }

    private sync() {
        const field = this.field;
        const { direction = 'horizontal', pixelSensitivity = 2 } = this.options;
        this.scrubListeners.sync([
            field.inputRef.current,
            field.disabled,
            field.readOnly,
            field.store.state.scrubbing,
            direction,
            pixelSensitivity
        ]);
        this.touchListeners.sync([this.scrubArea, field.disabled, field.readOnly]);
        this.visualViewportListener.sync([field.store.state.scrubbing, this.cursor]);
    }

    private updateCursorTransform(x: number, y: number) {
        if (this.cursor) {
            this.cursor.style.transform = `translate3d(${x}px,${y}px,0) scale(${1 / this.visualScale})`;
        }
    }

    private onScrub({ movementX, movementY }: PointerEvent) {
        const virtualCursor = this.cursor;
        const scrubAreaEl = this.scrubArea;

        if (!virtualCursor || !scrubAreaEl) {
            return;
        }

        const rect = getViewportRect(this.options.teleportDistance, scrubAreaEl);
        const coords = this.virtualCursorCoords;
        const newCoords = { x: Math.round(coords.x + movementX), y: Math.round(coords.y + movementY) };

        const cursorWidth = virtualCursor.offsetWidth;
        const cursorHeight = virtualCursor.offsetHeight;

        if (newCoords.x + cursorWidth / 2 < rect.x) {
            newCoords.x = rect.width - cursorWidth / 2;
        } else if (newCoords.x + cursorWidth / 2 > rect.width) {
            newCoords.x = rect.x - cursorWidth / 2;
        }

        if (newCoords.y + cursorHeight / 2 < rect.y) {
            newCoords.y = rect.height - cursorHeight / 2;
        } else if (newCoords.y + cursorHeight / 2 > rect.height) {
            newCoords.y = rect.y - cursorHeight / 2;
        }

        this.virtualCursorCoords = newCoords;
        this.updateCursorTransform(newCoords.x, newCoords.y);
    }

    private onScrubbingChange(scrubbingValue: boolean, { clientX, clientY }: PointerEvent) {
        (this.options.flushSync ?? runImmediately)(() => {
            this.field.setScrubbing(scrubbingValue);
        });

        const virtualCursor = this.cursor;
        if (!virtualCursor || !scrubbingValue) {
            return;
        }

        const initialCoords = { x: clientX - virtualCursor.offsetWidth / 2, y: clientY - virtualCursor.offsetHeight / 2 };

        this.virtualCursorCoords = initialCoords;
        this.updateCursorTransform(initialCoords.x, initialCoords.y);
    }

    // Only listen while actively scrubbing; avoids unrelated pointerup events committing.
    private attachScrubListeners() {
        const field = this.field;
        const input = field.inputRef.current;
        if (!input || field.disabled || field.readOnly || !field.store.state.scrubbing) {
            return;
        }

        const { direction = 'horizontal', pixelSensitivity = 2 } = this.options;
        let cumulativeDelta = 0;

        const handleScrubPointerUp = (event: PointerEvent) => {
            try {
                // Avoid errors in testing environments.
                ownerDocument(this.scrubArea).exitPointerLock();
            } catch {
                // ignore
            } finally {
                this.isScrubbing = false;
                this.onScrubbingChange(false, event);
                field.onValueCommitted(field.lastChangedValueRef.current ?? field.value, createGenericEventDetails(REASONS.scrub, event));
            }
        };

        const handleScrubPointerMove = (event: PointerEvent) => {
            if (!this.isScrubbing) {
                return;
            }

            // Prevent text selection.
            event.preventDefault();

            this.onScrub(event);

            const { movementX, movementY } = event;

            cumulativeDelta += direction === 'vertical' ? movementY : movementX;

            if (Math.abs(cumulativeDelta) >= pixelSensitivity) {
                cumulativeDelta = 0;
                const dValue = direction === 'vertical' ? -movementY : movementX;
                const stepAmount = field.getStepAmount(event) ?? DEFAULT_STEP;
                const rawAmount = dValue * stepAmount;

                if (rawAmount !== 0) {
                    field.incrementValue(Math.abs(rawAmount), { direction: rawAmount >= 0 ? 1 : -1, event, reason: REASONS.scrub });
                }
            }
        };

        const win = ownerWindow(input);

        win.addEventListener('pointerup', handleScrubPointerUp, true);
        win.addEventListener('pointermove', handleScrubPointerMove, true);

        return () => {
            win.removeEventListener('pointerup', handleScrubPointerUp, true);
            win.removeEventListener('pointermove', handleScrubPointerMove, true);
        };
    }

    // Prevent scrolling using touch input when scrubbing.
    private attachTouchListeners() {
        const element = this.scrubArea;
        if (!element || this.field.disabled || this.field.readOnly) {
            return;
        }

        const handleTouchStart = (event: TouchEvent) => {
            if (event.touches.length === 1) {
                event.preventDefault();
            }
        };

        element.addEventListener('touchstart', handleTouchStart);

        return () => {
            element.removeEventListener('touchstart', handleTouchStart);
        };
    }

    private readonly onPointerDown = async (event: PointerEvent) => {
        const field = this.field;
        const isMainButton = !event.button || event.button === 0;
        if (event.defaultPrevented || field.readOnly || !isMainButton || field.disabled) {
            return;
        }

        const nativeEvent = getNativeEvent(event);
        const isTouch = event.pointerType === 'touch';
        this.store.set('isTouchInput', isTouch);

        if (event.pointerType === 'mouse') {
            event.preventDefault();
            field.inputRef.current?.focus();
        }

        this.isScrubbing = true;
        this.onScrubbingChange(true, nativeEvent);

        // WebKit causes significant layout shift with the native message, so we can't use it.
        if (!isTouch && !isWebKit) {
            try {
                // Avoid non-deterministic errors in testing environments.
                await ownerDocument(this.scrubArea).body.requestPointerLock();
                this.store.set('isPointerLockDenied', false);
            } catch {
                this.store.set('isPointerLockDenied', true);
            } finally {
                if (this.isScrubbing) {
                    this.onScrubbingChange(true, nativeEvent);
                }
            }
        }
    };
}
