import { isElement } from '@floating-ui/utils/dom';

import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ListRegistry } from '~@components/composite/list/ListRegistry';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { createChangeEventDetails, createGenericEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { areArraysEqual } from '~@lib/areArraysEqual';
import { clamp } from '~@lib/clamp';
import { formatNumber } from '~@lib/formatNumber';
import { ownerDocument } from '~@lib/owner';
import { valueToPercent } from '~@lib/valueToPercent';
import { warn } from '~@lib/warn';
import { activeElement, contains } from '~@packages/floating-ui/utils/element';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';
import { AnimationFrame } from '~@timers/AnimationFrame';

import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails, GenericEventDetails } from '~@events/changeEventDetails';
import type { MutableRef, Orientation, Style, TextDirection } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { asc, getMidpoint, getSliderValue, resolveThumbCollision, roundValueToStep, validateMinimumDistance } from '../utils/sliderUtils';

import type { SliderThumbMetadata } from '../thumb/SliderThumbMachine';
import type { ThumbCollisionBehavior } from '../utils/sliderUtils';

import { sliderStateAttributesMapping } from './sliderStateAttributesMapping';

export type SliderValue = number | readonly number[];

export type SliderChangeEventReason =
    | typeof REASONS.inputChange
    | typeof REASONS.trackPress
    | typeof REASONS.drag
    | typeof REASONS.keyboard
    | typeof REASONS.none;

export type SliderChangeEventDetails = ChangeEventDetails<SliderChangeEventReason, { activeThumbIndex: number }>;

export type SliderCommitEventDetails = GenericEventDetails<SliderChangeEventReason>;

export type SliderState = FieldRootState & {
    activeThumbIndex: number;
    disabled: boolean;
    dragging: boolean;
    max: number;
    min: number;
    minStepsBetweenValues: number;
    orientation: Orientation;
    step: number;
    values: readonly number[];
};

export type SliderOptions = {
    id: string;
    'aria-labelledby'?: string | undefined;
    defaultValue?: SliderValue | undefined;
    value?: SliderValue | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    format?: Intl.NumberFormatOptions | undefined;
    locale?: Intl.LocalesArgument | undefined;
    /**
     * @default 10
     */
    largeStep?: number | undefined;
    /**
     * @default 100
     */
    max?: number | undefined;
    /**
     * @default 0
     */
    min?: number | undefined;
    /**
     * @default 0
     */
    minStepsBetweenValues?: number | undefined;
    name?: string | undefined;
    /**
     * @default 'horizontal'
     */
    orientation?: Orientation | undefined;
    /**
     * @default 1
     */
    step?: number | undefined;
    /**
     * @default 'push'
     */
    thumbCollisionBehavior?: ThumbCollisionBehavior | undefined;
    /**
     * @default 'center'
     */
    thumbAlignment?: 'center' | 'edge' | 'edge-client-only' | undefined;
    onValueChange?: ((value: number | number[], eventDetails: SliderChangeEventDetails) => void) | undefined;
    onValueCommitted?: ((value: SliderValue, eventDetails: SliderCommitEventDetails) => void) | undefined;
    field?: FieldRootMachine | null | undefined;
    labelable?: LabelableController | null | undefined;
    direction?: TextDirection | undefined;
};

type SliderInternalState = {
    value: SliderValue;
    active: number;
    lastUsedThumbIndex: number;
    dragging: boolean;
    indicatorPosition: (number | undefined)[];
};

function areValuesEqual(newValue: SliderValue, oldValue: SliderValue) {
    if (typeof newValue === 'number' && typeof oldValue === 'number') {
        return newValue === oldValue;
    }
    if (Array.isArray(newValue) && Array.isArray(oldValue)) {
        return areArraysEqual(newValue, oldValue);
    }
    return false;
}

const INTENTIONAL_DRAG_COUNT_THRESHOLD = 2;

function getControlOffset(styles: CSSStyleDeclaration | null, vertical: boolean) {
    if (!styles) {
        return { start: 0, end: 0 };
    }

    const parseSize = (value: string | null | undefined) => {
        const parsed = value == null ? 0 : Number.parseFloat(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    };

    const start = vertical ? 'Top' : 'InlineStart';
    const end = vertical ? 'Bottom' : 'InlineEnd';

    return {
        start: parseSize(styles[`border${start}Width`]) + parseSize(styles[`padding${start}`]),
        end: parseSize(styles[`border${end}Width`]) + parseSize(styles[`padding${end}`])
    };
}

type FingerState = {
    value: number | number[];
    thumbIndex: number;
    didSwap: boolean;
};

type Coords = { x: number; y: number };

/**
 * State machine of a slider: values (single or range), dragging over the control, keyboard input
 * on the thumbs, thumb collisions and field integration.
 */
export class SliderMachine {
    readonly store: Store<SliderInternalState>;

    readonly thumbRegistry: ListRegistry<SliderThumbMetadata>;

    readonly controlRef: MutableRef<HTMLElement | null> = { current: null };

    /**
     * The input of the pressed thumb.
     */
    readonly pressedInputRef: MutableRef<HTMLInputElement | null> = { current: null };

    /**
     * The px distance between the pointer and the center of a pressed thumb.
     */
    readonly pressedThumbCenterOffsetRef: MutableRef<number | null> = { current: null };

    /**
     * The index of the pressed thumb, or the closest thumb if the control was pressed.
     */
    readonly pressedThumbIndexRef: MutableRef<number> = { current: -1 };

    readonly lastChangedValueRef: MutableRef<SliderValue | null> = { current: null };

    readonly lastChangeReasonRef: MutableRef<SliderChangeEventReason> = { current: 'none' };

    private options: SliderOptions;

    private readonly detachedField = createDetachedField();

    private sliderElement: HTMLElement | null = null;

    private controlElement: HTMLElement | null = null;

    private controlStyles: CSSStyleDeclaration | null = null;

    private pressedValues: readonly number[] | null = null;

    private touchId: number | null = null;

    private moveCount = 0;

    private insetThumbOffset = 0;

    private latestValues: readonly number[] | null = null;

    private readonly focusFrame = new AnimationFrame();

    private previousValue: SliderValue;

    private previousDisabled = false;

    private detachTouchStart: (() => void) | null = null;

    constructor(options: SliderOptions) {
        this.options = options;
        this.store = new Store<SliderInternalState>({
            value: options.defaultValue ?? options.min ?? 0,
            active: -1,
            lastUsedThumbIndex: -1,
            dragging: false,
            indicatorPosition: [undefined, undefined]
        });
        this.thumbRegistry = new ListRegistry<SliderThumbMetadata>();
        this.previousValue = this.rawValue;
        this.store.subscribe(() => this.sync());
        this.warn();
    }

    setOptions(options: SliderOptions) {
        this.options = options;
        this.warn();
        this.sync();
    }

    destroy() {
        this.detachTouchStart?.();
        this.focusFrame.cancel();
        this.stopListening();
        this.thumbRegistry.destroy();
    }

    private warn() {
        if (process.env.NODE_ENV !== 'production' && this.min >= this.max) {
            warn('Slider `max` must be greater than `min`.');
        }
    }

    // ---- derived ----------------------------------------------------------------------

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    get rawValue(): SliderValue {
        return this.options.value === undefined ? this.store.state.value : this.options.value;
    }

    get min() {
        return this.options.min ?? 0;
    }

    get max() {
        return this.options.max ?? 100;
    }

    get step() {
        return this.options.step ?? 1;
    }

    get largeStep() {
        return this.options.largeStep ?? 10;
    }

    get minStepsBetweenValues() {
        return this.options.minStepsBetweenValues ?? 0;
    }

    get orientation(): Orientation {
        return this.options.orientation ?? 'horizontal';
    }

    get direction(): TextDirection {
        return this.options.direction ?? 'ltr';
    }

    get disabled() {
        return this.field.disabled || (this.options.disabled ?? false);
    }

    get name() {
        return this.field.name ?? this.options.name;
    }

    get range() {
        return Array.isArray(this.rawValue);
    }

    /**
     * Sorted values (the internal value may be unsorted, e.g. to support frozen arrays).
     */
    get values(): readonly number[] {
        const value = this.rawValue;
        if (!Array.isArray(value)) {
            return [clamp(value as number, this.min, this.max)];
        }
        return value.slice().sort(asc);
    }

    get inset() {
        return (this.options.thumbAlignment ?? 'center') !== 'center';
    }

    get renderBeforeHydration() {
        return this.options.thumbAlignment === 'edge';
    }

    get labelId() {
        return this.options['aria-labelledby'] ?? this.options.labelable?.labelId;
    }

    get formatOptions() {
        return this.options.format;
    }

    get locale() {
        return this.options.locale;
    }

    get thumbCollisionBehavior(): ThumbCollisionBehavior {
        return this.options.thumbCollisionBehavior ?? 'push';
    }

    get thumbElements() {
        return this.thumbRegistry.elementsRef.current;
    }

    getState(): SliderState {
        const { active, dragging } = this.store.state;
        return {
            ...this.field.getState(),
            activeThumbIndex: active,
            disabled: this.disabled,
            dragging,
            orientation: this.orientation,
            max: this.max,
            min: this.min,
            minStepsBetweenValues: this.minStepsBetweenValues,
            step: this.step,
            values: this.values
        };
    }

    static attrs(state: SliderState): Record<string, string> {
        return getStyleHookProps(state, sliderStateAttributesMapping);
    }

    // ---- state changes ----------------------------------------------------------------

    setActive = (value: number) => {
        this.store.set('active', value);
        if (value !== -1) {
            this.store.set('lastUsedThumbIndex', value);
        }
    };

    setDragging = (dragging: boolean) => {
        this.store.set('dragging', dragging);
    };

    setIndicatorPosition = (update: (previous: (number | undefined)[]) => (number | undefined)[]) => {
        this.store.set('indicatorPosition', update(this.store.state.indicatorPosition));
    };

    setValue = (newValue: number | number[], details?: SliderChangeEventDetails) => {
        if (Number.isNaN(newValue) || areValuesEqual(newValue, this.rawValue)) {
            return;
        }

        const changeDetails =
            details ?? (createChangeEventDetails(REASONS.none, undefined, undefined, { activeThumbIndex: -1 }) as SliderChangeEventDetails);

        this.lastChangeReasonRef.current = changeDetails.reason;

        // Redefine target to allow name and value to be read (integration with form libraries).
        // Clone the event to not override `target` of the original event.
        const event = changeDetails.event as Event;
        const EventConstructor = event.constructor as new (type: string, init?: EventInit) => Event;
        const clonedEvent = new EventConstructor(event.type, event);
        Object.defineProperty(clonedEvent, 'target', { writable: true, value: { value: newValue, name: this.name } });
        (changeDetails as { event: Event }).event = clonedEvent;

        this.lastChangedValueRef.current = newValue;

        this.options.onValueChange?.(newValue, changeDetails);

        if (changeDetails.isCanceled) {
            return;
        }

        if (this.options.value === undefined) {
            this.store.set('value', newValue);
        }
    };

    handleInputChange = (valueInput: number, index: number, event: Event) => {
        const newValue = getSliderValue(valueInput, index, this.min, this.max, this.range, this.values);

        if (validateMinimumDistance(newValue, this.step, this.minStepsBetweenValues)) {
            const reason = 'key' in event ? REASONS.keyboard : REASONS.inputChange;
            const nativeEvent = getNativeEvent(event);
            this.setValue(
                newValue,
                createChangeEventDetails(reason, nativeEvent as KeyboardEvent, undefined, {
                    activeThumbIndex: index
                }) as SliderChangeEventDetails
            );
            this.field.setTouched(true);

            const nextValue = this.lastChangedValueRef.current ?? newValue;
            this.options.onValueCommitted?.(nextValue, createGenericEventDetails(reason, nativeEvent as KeyboardEvent));
        }
    };

    onValueCommitted = (value: SliderValue, eventDetails: SliderCommitEventDetails) => {
        this.options.onValueCommitted?.(value, eventDetails);
    };

    registerField(): () => void {
        return this.field.registerControl({
            id: this.options.id,
            name: this.name,
            value: this.rawValue,
            getValue: () => this.rawValue,
            controlRef: this.controlRef,
            commit: this.field.commit
        });
    }

    private sync() {
        const value = this.rawValue;
        if (value !== this.previousValue) {
            this.previousValue = value;
            this.onValueChanged();
        }

        const disabled = this.disabled;
        if (disabled !== this.previousDisabled) {
            this.previousDisabled = disabled;
            // Firefox and Safari keep focus on a disabled element.
            const activeEl = activeElement(ownerDocument(this.sliderElement));
            if (disabled && activeEl && this.sliderElement?.contains(activeEl)) {
                (activeEl as HTMLElement).blur();
            }
            if (disabled) {
                this.stopListening();
            }
        }

        if (disabled && this.store.state.active !== -1) {
            this.setActive(-1);
        }
    }

    // Replacement for `useValueChanged(valueUnwrapped, ...)`.
    private onValueChanged() {
        const field = this.field;
        const value = this.rawValue;

        field.form.clearErrors(this.name);

        if (field.shouldValidateOnChange()) {
            field.commit(value);
        } else {
            field.commit(value, true);
        }

        const initialValue = field.validityData.initialValue as SliderValue | undefined;
        const isDirty = Array.isArray(value) && Array.isArray(initialValue) ? !areArraysEqual(value, initialValue) : value !== initialValue;
        field.setDirty(isDirty);
    }

    // ---- root -------------------------------------------------------------------------

    setSliderElement = (element: HTMLElement | null) => {
        this.sliderElement = element;
    };

    getRootProps(elementProps: Props = {}): Props {
        return mergeProps(
            { 'aria-labelledby': this.labelId, id: this.options.id, role: 'group' },
            this.field.getValidationProps,
            elementProps
        );
    }

    // ---- control ----------------------------------------------------------------------

    setControlElement = (element: HTMLElement | null) => {
        this.detachTouchStart?.();
        this.detachTouchStart = null;
        this.controlElement = element;
        if (element) {
            this.controlRef.current = element;
            if (this.controlStyles == null) {
                this.controlStyles = getComputedStyle(element);
            }
            element.addEventListener('touchstart', this.handleTouchStart, { passive: true });
            this.detachTouchStart = () => {
                element.removeEventListener('touchstart', this.handleTouchStart);
                this.focusFrame.cancel();
                this.stopListening();
            };
        }
    };

    getControlProps(elementProps: Props = {}): Props {
        return mergeProps(
            {
                'data-base-ui-slider-control': this.renderBeforeHydration ? '' : undefined,
                onPointerDown: this.onControlPointerDown,
                tabIndex: -1
            },
            elementProps
        );
    }

    private getFingerCoords(event: TouchEvent | PointerEvent): Coords | null {
        // The event is a TouchEvent
        if (this.touchId != null && (event as TouchEvent).changedTouches) {
            const touchEvent = event as TouchEvent;
            for (const touch of Array.from(touchEvent.changedTouches)) {
                if (touch.identifier === this.touchId) {
                    return { x: touch.clientX, y: touch.clientY };
                }
            }
            return null;
        }

        // The event is a PointerEvent
        return { x: (event as PointerEvent).clientX, y: (event as PointerEvent).clientY };
    }

    private updatePressedThumb(nextIndex: number) {
        if (this.pressedThumbIndexRef.current !== nextIndex) {
            this.pressedThumbIndexRef.current = nextIndex;
        }

        const thumbElement = this.thumbElements[nextIndex];
        if (!thumbElement) {
            this.pressedThumbCenterOffsetRef.current = null;
            this.pressedInputRef.current = null;
            return;
        }

        this.pressedInputRef.current = thumbElement.querySelector<HTMLInputElement>('input[type="range"]');
    }

    private getFingerState(fingerCoords: Coords): FingerState | null {
        const control = this.controlElement;
        if (!control) {
            return null;
        }

        const vertical = this.orientation === 'vertical';
        const { width, height, bottom, left, right } = control.getBoundingClientRect();
        const controlOffset = getControlOffset(this.controlStyles, vertical);
        const insetThumbOffset = this.insetThumbOffset;
        const controlSize = (vertical ? height : width) - controlOffset.start - controlOffset.end - insetThumbOffset * 2;
        const thumbCenterOffset = this.pressedThumbCenterOffsetRef.current ?? 0;
        const fingerX = fingerCoords.x - thumbCenterOffset;
        const fingerY = fingerCoords.y - thumbCenterOffset;

        const valueSize = vertical
            ? bottom - fingerY - controlOffset.end
            : (this.direction === 'rtl' ? right - fingerX : fingerX - left) - controlOffset.start;

        // the value at the finger origin scaled down to fit the range [0, 1]
        const valueRescaled = clamp((valueSize - insetThumbOffset) / controlSize, 0, 1);

        let newValue = (this.max - this.min) * valueRescaled + this.min;
        newValue = roundValueToStep(newValue, this.step, this.min);
        newValue = clamp(newValue, this.min, this.max);

        if (!(this.values.length > 1)) {
            return { value: newValue, thumbIndex: 0, didSwap: false };
        }

        const thumbIndex = this.pressedThumbIndexRef.current;
        if (thumbIndex < 0) {
            return null;
        }

        const collisionResult = resolveThumbCollision({
            behavior: this.thumbCollisionBehavior,
            values: this.values,
            currentValues: this.latestValues ?? this.values,
            initialValues: this.pressedValues,
            pressedIndex: thumbIndex,
            nextValue: newValue,
            min: this.min,
            max: this.max,
            step: this.step,
            minStepsBetweenValues: this.minStepsBetweenValues
        });

        if (this.thumbCollisionBehavior === 'swap' && collisionResult.didSwap) {
            this.updatePressedThumb(collisionResult.thumbIndex);
        } else {
            this.pressedThumbIndexRef.current = collisionResult.thumbIndex;
        }

        return collisionResult;
    }

    private startPressing(fingerCoords: Coords) {
        const values = this.values;
        const range = values.length > 1;
        const vertical = this.orientation === 'vertical';

        this.pressedValues = range ? values.slice() : null;
        this.latestValues = values;

        const pressedThumbIndex = this.pressedThumbIndexRef.current;
        let closestThumbIndex = pressedThumbIndex;

        if (pressedThumbIndex > -1 && pressedThumbIndex < values.length) {
            if (values[pressedThumbIndex] === this.max) {
                let candidateIndex = pressedThumbIndex;
                while (candidateIndex > 0 && values[candidateIndex - 1] === this.max) {
                    candidateIndex -= 1;
                }
                closestThumbIndex = candidateIndex;
            }
        } else {
            // pressed on control
            const axis = vertical ? 'y' : 'x';
            let minDistance: number | undefined;
            closestThumbIndex = -1;

            this.thumbElements.forEach((thumbEl, i) => {
                if (isElement(thumbEl)) {
                    const midpoint = getMidpoint(thumbEl);
                    const distance = Math.abs(fingerCoords[axis] - midpoint[axis]);

                    if (minDistance === undefined || distance <= minDistance) {
                        closestThumbIndex = i;
                        minDistance = distance;
                    }
                }
            });
        }

        if (closestThumbIndex > -1 && closestThumbIndex !== pressedThumbIndex) {
            this.updatePressedThumb(closestThumbIndex);
        }

        if (this.inset) {
            const thumbEl = this.thumbElements[closestThumbIndex];
            if (isElement(thumbEl)) {
                const thumbRect = thumbEl.getBoundingClientRect();
                this.insetThumbOffset = thumbRect[vertical ? 'height' : 'width'] / 2;
            }
        }
    }

    private focusThumb(thumbIndex: number) {
        this.thumbElements[thumbIndex]?.querySelector<HTMLInputElement>('input[type="range"]')?.focus({ preventScroll: true });
    }

    private applyFinger(finger: FingerState, reason: typeof REASONS.trackPress | typeof REASONS.drag, nativeEvent: Event) {
        this.setValue(
            finger.value,
            createChangeEventDetails(reason, nativeEvent as PointerEvent, undefined, {
                activeThumbIndex: finger.thumbIndex
            }) as SliderChangeEventDetails
        );
        this.latestValues = Array.isArray(finger.value) ? finger.value : [finger.value];
        if (finger.didSwap) {
            this.focusThumb(finger.thumbIndex);
        }
    }

    private readonly handleTouchMove = (nativeEvent: TouchEvent | PointerEvent) => {
        const fingerCoords = this.getFingerCoords(nativeEvent);
        if (fingerCoords == null) {
            return;
        }

        this.moveCount += 1;

        // Cancel move in case some other element consumed a pointerup event and it was not fired.
        if (nativeEvent.type === 'pointermove' && (nativeEvent as PointerEvent).buttons === 0) {
            this.handleTouchEnd(nativeEvent);
            return;
        }

        const finger = this.getFingerState(fingerCoords);
        if (finger == null) {
            return;
        }

        if (validateMinimumDistance(finger.value, this.step, this.minStepsBetweenValues)) {
            if (!this.store.state.dragging && this.moveCount > INTENTIONAL_DRAG_COUNT_THRESHOLD) {
                this.setDragging(true);
            }

            this.applyFinger(finger, REASONS.drag, nativeEvent);
        }
    };

    private stopListening() {
        const doc = ownerDocument(this.controlElement);
        doc.removeEventListener('pointermove', this.handleTouchMove);
        doc.removeEventListener('pointerup', this.handleTouchEnd);
        doc.removeEventListener('touchmove', this.handleTouchMove);
        doc.removeEventListener('touchend', this.handleTouchEnd);
        this.pressedValues = null;
    }

    private readonly handleTouchEnd = (nativeEvent: TouchEvent | PointerEvent) => {
        this.setActive(-1);
        this.setDragging(false);
        this.pressedInputRef.current = null;
        this.pressedThumbCenterOffsetRef.current = null;
        this.pressedThumbIndexRef.current = -1;

        const fingerCoords = this.getFingerCoords(nativeEvent);
        const finger = fingerCoords == null ? null : this.getFingerState(fingerCoords);

        if (finger != null) {
            const commitReason = this.lastChangeReasonRef.current;
            const committed = this.lastChangedValueRef.current ?? finger.value;
            this.field.commit(committed);
            this.onValueCommitted(committed, createGenericEventDetails(commitReason, nativeEvent as PointerEvent));
        }

        if ('pointerType' in nativeEvent && this.controlElement?.hasPointerCapture(nativeEvent.pointerId)) {
            this.controlElement.releasePointerCapture(nativeEvent.pointerId);
        }

        this.touchId = null;
        this.pressedValues = null;
        this.stopListening();
    };

    private readonly handleTouchStart = (nativeEvent: TouchEvent) => {
        if (this.disabled) {
            return;
        }

        const touch = nativeEvent.changedTouches[0];
        if (touch != null) {
            this.touchId = touch.identifier;
        }

        const fingerCoords = this.getFingerCoords(nativeEvent);
        if (fingerCoords != null) {
            this.startPressing(fingerCoords);

            const finger = this.getFingerState(fingerCoords);
            if (finger == null) {
                return;
            }

            this.focusThumb(finger.thumbIndex);
            this.applyFinger(finger, REASONS.trackPress, nativeEvent);
        }

        this.moveCount = 0;
        const doc = ownerDocument(this.controlElement);
        doc.addEventListener('touchmove', this.handleTouchMove, { passive: true });
        doc.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    };

    private readonly onControlPointerDown = (event: PointerEvent) => {
        const control = this.controlElement;
        if (!control || this.disabled || event.defaultPrevented || !isElement(event.target) || event.button !== 0) {
            return;
        }

        const nativeEvent = getNativeEvent(event);
        const fingerCoords = this.getFingerCoords(nativeEvent);

        if (fingerCoords != null) {
            this.startPressing(fingerCoords);

            const finger = this.getFingerState(fingerCoords);
            if (finger == null) {
                return;
            }

            const pressedOnFocusedThumb = contains(this.thumbElements[finger.thumbIndex], activeElement(ownerDocument(control)));

            if (pressedOnFocusedThumb) {
                event.preventDefault();
            } else {
                this.focusFrame.request(() => {
                    this.focusThumb(finger.thumbIndex);
                });
            }

            this.setDragging(true);

            const pressedOnAnyThumb = this.pressedThumbCenterOffsetRef.current != null;
            if (!pressedOnAnyThumb) {
                this.applyFinger(finger, REASONS.trackPress, nativeEvent);
            }
        }

        if (nativeEvent.pointerId) {
            control.setPointerCapture(nativeEvent.pointerId);
        }

        this.moveCount = 0;
        const doc = ownerDocument(this.controlElement);
        doc.addEventListener('pointermove', this.handleTouchMove, { passive: true });
        doc.addEventListener('pointerup', this.handleTouchEnd, { once: true });
    };

    // ---- value / indicator ------------------------------------------------------------

    /**
     * `htmlFor` of `<Slider.Value>`: ids of the thumb inputs.
     */
    getValueOutputFor() {
        let htmlFor = '';
        for (const thumbMetadata of this.thumbRegistry.getMap().values()) {
            if (thumbMetadata?.inputId) {
                htmlFor += `${thumbMetadata.inputId} `;
            }
        }
        return htmlFor.trim() === '' ? undefined : htmlFor.trim();
    }

    getFormattedValues() {
        return this.values.map((value) => formatNumber(value, this.locale, this.formatOptions));
    }

    /**
     * Text `<Slider.Value>` shows by default.
     */
    getDefaultDisplayValue() {
        const formattedValues = this.getFormattedValues();
        return this.values.map((value, i) => formattedValues[i] || value).join(' – ');
    }

    getIndicatorStyle(mounted: boolean): Style {
        const vertical = this.orientation === 'vertical';
        const values = this.values;
        const range = values.length > 1;
        const startEdge = vertical ? 'bottom' : 'insetInlineStart';
        const mainSide = vertical ? 'height' : 'width';
        const crossSide = vertical ? 'width' : 'height';

        if (this.inset) {
            const [start, end] = this.store.state.indicatorPosition;
            const visibility = start === undefined || (range && end === undefined) ? 'hidden' : undefined;
            const styles: Style = {
                visibility: this.renderBeforeHydration && !mounted ? 'hidden' : visibility,
                position: vertical ? 'absolute' : 'relative',
                [crossSide]: 'inherit',
                '--start-position': `${start ?? 0}%`
            };

            if (!range) {
                styles[startEdge] = 0;
                styles[mainSide] = 'var(--start-position)';
                return styles;
            }

            styles['--relative-size'] = `${(end ?? 0) - (start ?? 0)}%`;
            styles[startEdge] = 'var(--start-position)';
            styles[mainSide] = 'var(--relative-size)';
            return styles;
        }

        const start = valueToPercent(values[0] ?? 0, this.min, this.max);
        const end = valueToPercent(values.at(-1) ?? 0, this.min, this.max);
        const styles: Style = { position: vertical ? 'absolute' : 'relative', [crossSide]: 'inherit' };

        if (!range) {
            styles[startEdge] = 0;
            styles[mainSide] = `${start}%`;
            return styles;
        }

        styles[startEdge] = `${start}%`;
        styles[mainSide] = `${end - start}%`;
        return styles;
    }

    getIndicatorProps(mounted: boolean): Props {
        return {
            'data-base-ui-slider-indicator': this.renderBeforeHydration ? '' : undefined,
            style: this.getIndicatorStyle(mounted),
            suppressHydrationWarning: this.renderBeforeHydration || undefined
        };
    }
}
