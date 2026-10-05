import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { createChangeEventDetails, createGenericEventDetails } from '~@events/changeEventDetails';
import { parseNumber } from '~@lib/parseNumeric';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import { DEFAULT_STEP, MAX_POINTER_MOVES_AFTER_TOUCH, SCROLLING_POINTER_MOVE_DISTANCE, TOUCH_TIMEOUT } from '../utils/numberFieldUtils';

import type { NumberFieldChangeEventDetails, NumberFieldMachine, NumberFieldState } from '../root/NumberFieldMachine';

export type NumberFieldButtonOptions = {
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default true
     */
    nativeButton?: boolean | undefined;
};

/**
 * Increment or decrement button of a number field (click, press-and-hold auto-repeat, touch handling).
 * Replacement for `useNumberFieldButton`.
 */
export class NumberFieldButtonMachine {
    readonly button: ButtonMachine;

    private options: NumberFieldButtonOptions;

    private readonly field: NumberFieldMachine;

    private readonly isIncrement: boolean;

    private incrementDownCoords = { x: 0, y: 0 };

    private isTouchingButton = false;

    private ignoreClick = false;

    private pointerType = '';

    constructor(field: NumberFieldMachine, isIncrement: boolean, options: NumberFieldButtonOptions = {}) {
        this.field = field;
        this.isIncrement = isIncrement;
        this.options = options;
        this.button = new ButtonMachine({ disabled: this.disabled, native: options.nativeButton ?? true });
    }

    setOptions(options: NumberFieldButtonOptions) {
        this.options = options;
        this.button.setOptions({ disabled: this.disabled, native: options.nativeButton ?? true });
    }

    get disabled() {
        return (this.options.disabled ?? false) || this.field.disabled;
    }

    getState(): NumberFieldState {
        return { ...this.field.getState(), disabled: this.disabled };
    }

    private get isMin() {
        const value = this.field.value;
        return value != null && value <= this.field.minWithDefault;
    }

    private get isMax() {
        const value = this.field.value;
        return value != null && value >= this.field.maxWithDefault;
    }

    private get atLimit() {
        return this.isIncrement ? this.isMax : this.isMin;
    }

    private get pressReason() {
        return this.isIncrement ? ('increment-press' as const) : ('decrement-press' as const);
    }

    private commitValue(nativeEvent: Event) {
        const field = this.field;
        field.allowInputSyncRef.current = true;

        // The input may be dirty but not yet blurred, so the value won't have been committed.
        const parsedValue = parseNumber(field.inputValue, field.locale, field.format);
        if (parsedValue !== null) {
            // The increment needs to know the current input value to increment it correctly.
            field.setPendingValue(parsedValue);
            field.setValue(
                parsedValue,
                createChangeEventDetails(this.pressReason, nativeEvent as MouseEvent, undefined, {
                    direction: this.isIncrement ? 1 : -1
                }) as NumberFieldChangeEventDetails
            );
        }
    }

    getProps(elementProps: Props = {}): Props {
        const field = this.field;
        const disabled = this.disabled;
        const readOnly = field.readOnly;
        const direction = this.isIncrement ? 1 : -1;

        const props = {
            disabled: disabled || this.atLimit,
            'aria-readonly': readOnly || undefined,
            'aria-label': this.isIncrement ? 'Increase' : 'Decrease',
            'aria-controls': field.id,
            // Keyboard users change the value with the input; touch screen readers can still use the buttons.
            tabIndex: -1,
            style: { WebkitUserSelect: 'none', userSelect: 'none' },
            onTouchStart: () => {
                this.isTouchingButton = true;
            },
            onTouchEnd: () => {
                this.isTouchingButton = false;
            },
            onClick: (event: MouseEvent) => {
                const isDisabled = disabled || readOnly || this.atLimit;
                if (
                    event.defaultPrevented ||
                    isDisabled ||
                    // If it's not a keyboard/virtual click, ignore.
                    (this.pointerType === 'touch' ? this.ignoreClick : event.detail !== 0)
                ) {
                    return;
                }

                const nativeEvent = getNativeEvent(event);
                this.commitValue(nativeEvent);

                const amount = field.getStepAmount(event) ?? DEFAULT_STEP;
                const prev = field.value;

                field.incrementValue(amount, { direction, event: nativeEvent, reason: this.pressReason });

                const committed = field.lastChangedValueRef.current ?? field.value;
                if (committed !== prev) {
                    field.onValueCommitted(committed, createGenericEventDetails(this.pressReason, nativeEvent));
                }
            },
            onPointerDown: (event: PointerEvent) => {
                const isMainButton = !event.button || event.button === 0;
                if (event.defaultPrevented || readOnly || !isMainButton || disabled || this.atLimit) {
                    return;
                }

                const nativeEvent = getNativeEvent(event);
                this.pointerType = event.pointerType;
                this.ignoreClick = false;
                field.isPressedRef.current = true;
                this.incrementDownCoords = { x: event.clientX, y: event.clientY };

                this.commitValue(nativeEvent);

                // Note: "pen" is sometimes returned for mouse usage on Linux Chrome.
                if (event.pointerType !== 'touch') {
                    event.preventDefault();
                    field.inputRef.current?.focus();
                    field.startAutoChange(this.isIncrement, nativeEvent);
                    return;
                }

                // Check if the pointerdown was intentional, and not the result of a scroll or pinch-zoom.
                field.intentionalTouchCheckTimeout.start(TOUCH_TIMEOUT, () => {
                    const moves = field.movesAfterTouchRef.current;
                    field.movesAfterTouchRef.current = 0;
                    // Only start auto-change if the touch is still pressed.
                    if (field.isPressedRef.current && moves < MAX_POINTER_MOVES_AFTER_TOUCH) {
                        field.startAutoChange(this.isIncrement, nativeEvent);
                        this.ignoreClick = true; // synthesized click should be ignored
                    } else {
                        // Simple tap or scroll gesture: the click handler performs a single increment.
                        this.ignoreClick = false;
                        field.stopAutoChange();
                    }
                });
            },
            onPointerUp: (event: PointerEvent) => {
                // Mark the press as released for touch flows even if auto-change never started.
                if (event.pointerType === 'touch') {
                    field.isPressedRef.current = false;
                }
            },
            onPointerMove: (event: PointerEvent) => {
                const isDisabled = disabled || readOnly || this.atLimit;
                if (isDisabled || event.pointerType !== 'touch' || !field.isPressedRef.current) {
                    return;
                }

                field.movesAfterTouchRef.current += 1;

                const { x, y } = this.incrementDownCoords;
                const dx = x - event.clientX;
                const dy = y - event.clientY;

                // The container is probably being scrolled.
                if (dx ** 2 + dy ** 2 > SCROLLING_POINTER_MOVE_DISTANCE ** 2) {
                    field.stopAutoChange();
                }
            },
            onMouseEnter: (event: MouseEvent) => {
                const isDisabled = disabled || readOnly || this.atLimit;
                if (
                    event.defaultPrevented ||
                    isDisabled ||
                    !field.isPressedRef.current ||
                    this.isTouchingButton ||
                    this.pointerType === 'touch'
                ) {
                    return;
                }

                field.startAutoChange(this.isIncrement, getNativeEvent(event));
            },
            onMouseLeave: () => {
                if (!this.isTouchingButton) {
                    field.stopAutoChange();
                }
            },
            onMouseUp: () => {
                if (!this.isTouchingButton) {
                    field.stopAutoChange();
                }
            }
        };

        return this.button.getButtonProps(mergeProps(props, elementProps));
    }
}
