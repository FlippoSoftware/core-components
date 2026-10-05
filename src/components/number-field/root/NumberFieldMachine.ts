import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { createChangeEventDetails, createGenericEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { isIOS } from '~@lib/detectBrowser';
import { formatNumber, formatNumberMaxPrecision } from '~@lib/formatNumber';
import { ownerDocument, ownerWindow } from '~@lib/owner';
import {
    ANY_MINUS_DETECT_RE,
    ANY_MINUS_RE,
    ANY_PLUS_DETECT_RE,
    ANY_PLUS_RE,
    ARABIC_DETECT_RE,
    BASE_NON_NUMERIC_SYMBOLS,
    FULLWIDTH_DETECT_RE,
    getNumberLocaleDetails,
    HAN_DETECT_RE,
    MINUS_SIGNS_WITH_ASCII,
    PERCENTAGES,
    PERMILLE,
    PERSIAN_DETECT_RE,
    PLUS_SIGNS_WITH_ASCII,
    parseNumber,
    SPACE_SEPARATOR_RE
} from '~@lib/parseNumeric';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { getNativeEvent, stopEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails, GenericEventDetails, ReasonToEvent } from '~@events/changeEventDetails';
import type { MutableRef } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { CHANGE_VALUE_TICK_DELAY, DEFAULT_STEP, START_AUTO_CHANGE_DELAY, toValidatedNumber } from '../utils/numberFieldUtils';

import { numberFieldStateAttributesMapping } from './numberFieldStateAttributesMapping';

export type NumberFieldDirection = -1 | 1;

export type NumberFieldChangeEventReason =
    | typeof REASONS.inputChange
    | typeof REASONS.inputClear
    | typeof REASONS.inputBlur
    | typeof REASONS.inputPaste
    | typeof REASONS.keyboard
    | typeof REASONS.incrementPress
    | typeof REASONS.decrementPress
    | typeof REASONS.wheel
    | typeof REASONS.scrub
    | typeof REASONS.none;

export type NumberFieldChangeEventDetails = ChangeEventDetails<NumberFieldChangeEventReason, { direction?: NumberFieldDirection }>;

export type NumberFieldCommitEventReason =
    | typeof REASONS.inputBlur
    | typeof REASONS.inputClear
    | typeof REASONS.keyboard
    | typeof REASONS.incrementPress
    | typeof REASONS.decrementPress
    | typeof REASONS.wheel
    | typeof REASONS.scrub
    | typeof REASONS.none;

export type NumberFieldCommitEventDetails = GenericEventDetails<NumberFieldCommitEventReason>;

export type NumberFieldDirectionalReason = 'increment-press' | 'decrement-press' | 'wheel' | 'scrub' | 'keyboard';

export type NumberFieldInputMode = 'numeric' | 'decimal' | 'text';

type EventWithOptionalKeyState = { altKey?: boolean | undefined; shiftKey?: boolean | undefined };

export type NumberFieldState = FieldRootState & {
    value: number | null;
    inputValue: string;
    required: boolean;
    disabled: boolean;
    readOnly: boolean;
    scrubbing: boolean;
};

export type NumberFieldOptions = {
    id?: string | undefined;
    min?: number | undefined;
    max?: number | undefined;
    /**
     * @default 0.1
     */
    smallStep?: number | undefined;
    /**
     * @default 1
     */
    step?: number | undefined;
    /**
     * @default 10
     */
    largeStep?: number | undefined;
    required?: boolean | undefined;
    disabled?: boolean | undefined;
    readOnly?: boolean | undefined;
    name?: string | undefined;
    value?: number | null | undefined;
    defaultValue?: number | undefined;
    allowWheelScrub?: boolean | undefined;
    snapOnStep?: boolean | undefined;
    format?: Intl.NumberFormatOptions | undefined;
    locale?: Intl.LocalesArgument | undefined;
    onValueChange?: ((value: number | null, eventDetails: NumberFieldChangeEventDetails) => void) | undefined;
    onValueCommitted?: ((value: number | null, eventDetails: NumberFieldCommitEventDetails) => void) | undefined;
    field?: FieldRootMachine | null | undefined;
    labelable?: LabelableController | null | undefined;
    /**
     * Generated id of the input.
     */
    defaultId: string;
};

type NumberFieldInternalState = {
    value: number | null;
    inputValue: string;
    inputMode: NumberFieldInputMode;
    scrubbing: boolean;
};

const NAVIGATE_KEYS = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape']);

function getControlledInputValue(value: number | null, locale: Intl.LocalesArgument, format: Intl.NumberFormatOptions | undefined) {
    const explicitPrecision = format?.maximumFractionDigits != null || format?.minimumFractionDigits != null;
    return explicitPrecision ? formatNumber(value, locale, format) : formatNumberMaxPrecision(value, locale, format);
}

type InputEvent = Event & { nativeEvent?: Event; key?: string; which?: number; isTrusted: boolean };

/**
 * State machine of a number field: parsing, formatting, stepping, auto-repeat, wheel and keyboard.
 */
export class NumberFieldMachine {
    readonly store: Store<NumberFieldInternalState>;

    readonly inputRef: MutableRef<HTMLInputElement | null> = { current: null };

    /**
     * When `false`, the input text is not overwritten from the value (the user is typing).
     */
    readonly allowInputSyncRef: MutableRef<boolean> = { current: true };

    readonly lastChangedValueRef: MutableRef<number | null> = { current: null };

    readonly hasPendingCommitRef: MutableRef<boolean> = { current: false };

    readonly isPressedRef: MutableRef<boolean> = { current: false };

    readonly movesAfterTouchRef: MutableRef<number> = { current: 0 };

    readonly intentionalTouchCheckTimeout = new Timeout();

    private options: NumberFieldOptions;

    private readonly detachedField = createDetachedField();

    private readonly startTickTimeout = new Timeout();

    private tickInterval: ReturnType<typeof setInterval> | null = null;

    private unsubscribeFromGlobalContextMenu: () => void = () => {};

    private valueOverride: number | null | undefined;

    private hasTouchedInput = false;

    private blockRevalidation = false;

    private previousValue: number | null;

    private readonly wheelEffect: Effect;

    constructor(options: NumberFieldOptions) {
        this.options = options;
        const initialValue = options.value !== undefined ? (options.value ?? null) : (options.defaultValue ?? null);
        this.store = new Store<NumberFieldInternalState>({
            value: options.defaultValue ?? null,
            inputValue:
                options.value === undefined
                    ? formatNumber(initialValue, options.locale, options.format)
                    : getControlledInputValue(initialValue, options.locale, options.format),
            inputMode: 'numeric',
            scrubbing: false
        });
        this.previousValue = this.value;
        this.wheelEffect = new Effect(() => this.attachWheel());
        this.store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: NumberFieldOptions) {
        this.options = options;
        this.sync();
    }

    destroy() {
        this.stopAutoChange();
        this.wheelEffect.destroy();
    }

    // ---- derived ----------------------------------------------------------------------

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    get value(): number | null {
        if (this.valueOverride !== undefined) {
            return this.valueOverride;
        }
        return this.options.value !== undefined ? (this.options.value ?? null) : this.store.state.value;
    }

    get inputValue() {
        return this.store.state.inputValue;
    }

    get disabled() {
        return this.field.disabled || (this.options.disabled ?? false);
    }

    get readOnly() {
        return this.options.readOnly ?? false;
    }

    get required() {
        return this.options.required ?? false;
    }

    get name() {
        return this.field.name ?? this.options.name;
    }

    get id() {
        const { labelable, id, defaultId } = this.options;
        return labelable ? labelable.resolveControlId(id ?? defaultId) : (id ?? defaultId);
    }

    get locale() {
        return this.options.locale;
    }

    get format() {
        return this.options.format;
    }

    get minWithDefault() {
        return this.options.min ?? Number.MIN_SAFE_INTEGER;
    }

    get maxWithDefault() {
        return this.options.max ?? Number.MAX_SAFE_INTEGER;
    }

    getState(): NumberFieldState {
        const { value, inputValue, scrubbing } = { ...this.store.state, value: this.value };
        return {
            ...this.field.getState(),
            disabled: this.disabled,
            readOnly: this.readOnly,
            required: this.required,
            value,
            inputValue,
            scrubbing
        };
    }

    static attrs(state: NumberFieldState): Record<string, string> {
        return getStyleHookProps(state, numberFieldStateAttributesMapping);
    }

    registerId(): () => void {
        const { labelable, id, defaultId } = this.options;
        return labelable?.registerControl({ id, defaultId }) ?? (() => {});
    }

    registerField(): () => void {
        return this.field.registerControl({
            id: this.id,
            name: this.name,
            value: this.value,
            getValue: () => this.value ?? null,
            controlRef: this.inputRef as MutableRef<HTMLElement | null>,
            commit: this.field.commit
        });
    }

    setInputElement = (element: HTMLInputElement | null) => {
        this.inputRef.current = element;
        this.field.inputRef.current = element;
        this.sync();
    };

    setInputValue = (inputValue: string) => {
        this.store.set('inputValue', inputValue);
    };

    setScrubbing = (scrubbing: boolean) => {
        this.store.set('scrubbing', scrubbing);
    };

    // ---- syncing ----------------------------------------------------------------------

    private sync() {
        const value = this.value;
        this.field.setFilled(value !== null);

        // Keep the input text in sync with the value unless the user is typing.
        if (this.allowInputSyncRef.current) {
            const { locale, format } = this.options;
            const nextInputValue =
                this.options.value === undefined ? formatNumber(value, locale, format) : getControlledInputValue(value, locale, format);
            if (nextInputValue !== this.store.state.inputValue) {
                this.store.set('inputValue', nextInputValue);
            }
        }

        if (isIOS) {
            // iOS numeric software keyboard doesn't have a minus key: use the default keyboard for negatives.
            const inputMode: NumberFieldInputMode = this.minWithDefault >= 0 ? 'decimal' : 'text';
            if (inputMode !== this.store.state.inputMode) {
                this.store.set('inputMode', inputMode);
            }
        }

        this.wheelEffect.sync([this.inputRef.current, this.disabled, this.readOnly, this.options.allowWheelScrub ?? false]);

        if (value !== this.previousValue) {
            const previousValue = this.previousValue;
            this.previousValue = value;
            this.onValueChanged(previousValue);
        }
    }

    // Replacement for the input's `useValueChanged(value, ...)`.
    private onValueChanged(previousValue: number | null) {
        const field = this.field;
        const validateOnChange = field.shouldValidateOnChange();

        field.form.clearErrors(this.name);

        if (validateOnChange) {
            field.commit(this.value);
        }

        if (previousValue === this.value || validateOnChange) {
            return;
        }

        if (this.blockRevalidation) {
            this.blockRevalidation = false;
            return;
        }

        field.commit(this.value, true);
    }

    // ---- value changes ----------------------------------------------------------------

    getAllowedNonNumericKeys() {
        const { locale, format } = this.options;
        const formatStyle = format?.style;
        const { decimal, group, currency, literal } = getNumberLocaleDetails(locale, format);

        const keys = new Set<string>();
        for (const symbol of BASE_NON_NUMERIC_SYMBOLS) {
            keys.add(symbol);
        }

        if (decimal) {
            keys.add(decimal);
        }

        if (group) {
            keys.add(group);
            if (SPACE_SEPARATOR_RE.test(group)) {
                keys.add(' ');
            }
        }

        const allowPercentSymbols = formatStyle === 'percent' || (formatStyle === 'unit' && format?.unit === 'percent');
        const allowPermilleSymbols = formatStyle === 'percent' || (formatStyle === 'unit' && format?.unit === 'permille');

        if (allowPercentSymbols) {
            for (const key of PERCENTAGES) {
                keys.add(key);
            }
        }

        if (allowPermilleSymbols) {
            for (const key of PERMILLE) {
                keys.add(key);
            }
        }

        if (formatStyle === 'currency' && currency) {
            keys.add(currency);
        }

        if (literal) {
            // Some locales (e.g. de-DE) insert a literal space between the number and the symbol.
            for (const char of Array.from(literal)) {
                keys.add(char);
            }
            if (SPACE_SEPARATOR_RE.test(literal)) {
                keys.add(' ');
            }
        }

        // Allow plus sign in all cases; minus sign only when negatives are valid
        for (const key of PLUS_SIGNS_WITH_ASCII) {
            keys.add(key);
        }

        if (this.minWithDefault < 0) {
            for (const key of MINUS_SIGNS_WITH_ASCII) {
                keys.add(key);
            }
        }

        return keys;
    }

    getStepAmount(event?: EventWithOptionalKeyState) {
        const { smallStep = 0.1, step = 1, largeStep = 10 } = this.options;
        if (event?.altKey) {
            return smallStep;
        }
        if (event?.shiftKey) {
            return largeStep;
        }
        return step;
    }

    setValue = (unvalidatedValue: number | null, details: NumberFieldChangeEventDetails) => {
        const { format, snapOnStep = false, min, locale, onValueChange } = this.options;
        const eventWithOptionalKeyState = details.event as EventWithOptionalKeyState;
        const dir = details.direction;
        const value = this.value;

        const validatedValue = toValidatedNumber(unvalidatedValue, {
            step: dir ? this.getStepAmount(eventWithOptionalKeyState) * dir : undefined,
            format,
            minWithDefault: this.minWithDefault,
            maxWithDefault: this.maxWithDefault,
            minWithZeroDefault: min ?? 0,
            snapOnStep,
            small: eventWithOptionalKeyState?.altKey ?? false
        });

        // Notify even if the numeric value is unchanged when the input was clamped/snapped
        // to the current value, or when the user was typing.
        const shouldFireChange = validatedValue !== value || unvalidatedValue !== value || this.allowInputSyncRef.current === false;

        if (shouldFireChange) {
            this.lastChangedValueRef.current = validatedValue;
            onValueChange?.(validatedValue, details);

            if (details.isCanceled) {
                return;
            }

            if (this.options.value === undefined) {
                this.store.set('value', validatedValue);
            }
            this.field.setDirty(validatedValue !== this.field.validityData.initialValue);
            this.hasPendingCommitRef.current = true;
        }

        // Keep the visible input in sync immediately when programmatic changes occur.
        if (this.allowInputSyncRef.current) {
            this.store.set('inputValue', formatNumber(validatedValue, locale, format));
        }
    };

    incrementValue = (
        amount: number,
        {
            direction,
            currentValue,
            event,
            reason
        }: {
            direction: NumberFieldDirection;
            event?: Event | undefined;
            reason: NumberFieldDirectionalReason;
            currentValue?: number | null | undefined;
        }
    ) => {
        const prevValue = currentValue == null ? this.value : currentValue;
        const nextValue = typeof prevValue === 'number' ? prevValue + amount * direction : Math.max(0, this.options.min ?? 0);
        this.setValue(
            nextValue,
            createChangeEventDetails(reason, event as ReasonToEvent<typeof reason> | undefined, undefined, {
                direction
            }) as NumberFieldChangeEventDetails
        );
    };

    onValueCommitted = (nextValue: number | null, eventDetails: NumberFieldCommitEventDetails) => {
        this.hasPendingCommitRef.current = false;
        this.options.onValueCommitted?.(nextValue, eventDetails);
    };

    /**
     * Sets the value used by stepping before the next state update (e.g. after parsing the input text).
     */
    setPendingValue(value: number | null) {
        this.valueOverride = value;
        queueMicrotask(() => {
            this.valueOverride = undefined;
        });
    }

    stopAutoChange = () => {
        this.intentionalTouchCheckTimeout.clear();
        this.startTickTimeout.clear();
        if (this.tickInterval !== null) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        this.unsubscribeFromGlobalContextMenu();
        this.movesAfterTouchRef.current = 0;
    };

    startAutoChange = (isIncrement: boolean, triggerEvent?: Event) => {
        this.stopAutoChange();

        const input = this.inputRef.current;
        if (!input) {
            return;
        }

        const win = ownerWindow(input);

        const handleContextMenu = (event: Event) => {
            event.preventDefault();
        };

        // A global context menu is necessary to prevent the context menu from appearing when the touch
        // is slightly outside of the element's hit area.
        win.addEventListener('contextmenu', handleContextMenu);
        this.unsubscribeFromGlobalContextMenu = () => {
            win.removeEventListener('contextmenu', handleContextMenu);
        };

        win.addEventListener(
            'pointerup',
            (event) => {
                this.isPressedRef.current = false;
                this.stopAutoChange();
                const committed = this.lastChangedValueRef.current ?? this.value;
                this.onValueCommitted(committed, createGenericEventDetails(isIncrement ? 'increment-press' : 'decrement-press', event));
            },
            { once: true }
        );

        const tick = () => {
            const amount = this.getStepAmount(triggerEvent as EventWithOptionalKeyState) ?? DEFAULT_STEP;
            this.incrementValue(amount, {
                direction: isIncrement ? 1 : -1,
                event: triggerEvent,
                reason: isIncrement ? 'increment-press' : 'decrement-press'
            });
        };

        tick();

        this.startTickTimeout.start(START_AUTO_CHANGE_DELAY, () => {
            this.tickInterval = setInterval(tick, CHANGE_VALUE_TICK_DELAY);
        });
    };

    // The `onWheel` prop can't be prevented, so a native listener is used.
    private attachWheel() {
        const element = this.inputRef.current;
        if (this.disabled || this.readOnly || !this.options.allowWheelScrub || !element) {
            return;
        }

        const handleWheel = (event: WheelEvent) => {
            // Allow pinch-zooming.
            if (event.ctrlKey || ownerDocument(element).activeElement !== element) {
                return;
            }

            // Prevent the default behavior to avoid scrolling the page.
            event.preventDefault();

            const amount = this.getStepAmount(event) ?? DEFAULT_STEP;

            this.incrementValue(amount, { direction: event.deltaY > 0 ? -1 : 1, event, reason: 'wheel' });
        };

        element.addEventListener('wheel', handleWheel);

        return () => {
            element.removeEventListener('wheel', handleWheel);
        };
    }

    // ---- input ------------------------------------------------------------------------

    /**
     * Props of the hidden input that submits the value, or `null` without a `name`.
     */
    getHiddenInputProps(): Props | null {
        const name = this.name;
        return name ? { type: 'hidden', name, value: this.value ?? '', disabled: this.disabled, required: this.required } : null;
    }

    getInputProps(elementProps: Props = {}): Props {
        const { locale, format } = this.options;
        const field = this.field;
        const disabled = this.disabled;
        const readOnly = this.readOnly;

        const inputProps = {
            id: this.id,
            required: this.required,
            disabled,
            readOnly,
            inputMode: this.store.state.inputMode,
            value: this.inputValue,
            type: 'text',
            autoComplete: 'off',
            autoCorrect: 'off',
            spellCheck: 'false',
            'aria-roledescription': 'Number field',
            'aria-invalid': field.invalid || undefined,
            'aria-labelledby': this.options.labelable?.labelId,
            // If the server's locale does not match the client's locale, the formatting may not match.
            suppressHydrationWarning: true,
            onFocus: (event: FocusEvent) => {
                if (event.defaultPrevented || readOnly || disabled || this.hasTouchedInput) {
                    return;
                }

                this.hasTouchedInput = true;
                field.setFocused(true);

                // Browsers set selection at the start of the input field by default. We want to set it at
                // the end for the first focus.
                const target = event.currentTarget as HTMLInputElement;
                const length = target.value.length;
                target.setSelectionRange(length, length);
            },
            onBlur: (event: FocusEvent) => this.onInputBlur(event),
            onChange: (event: InputEvent) => this.onInputChange(event),
            onKeyDown: (event: KeyboardEvent) => this.onInputKeyDown(event),
            onPaste: (event: ClipboardEvent) => {
                if (event.defaultPrevented || readOnly || disabled) {
                    return;
                }

                // Prevent `onChange` from being called.
                event.preventDefault();

                const pastedData = event.clipboardData?.getData('text/plain') ?? '';
                const parsedValue = parseNumber(pastedData, locale, format);

                if (parsedValue !== null) {
                    this.allowInputSyncRef.current = false;
                    this.setValue(
                        parsedValue,
                        createChangeEventDetails(REASONS.inputPaste, getNativeEvent(event)) as NumberFieldChangeEventDetails
                    );
                    this.setInputValue(pastedData);
                }
            }
        };

        return mergeProps(inputProps, field.getInputValidationProps(), elementProps);
    }

    private onInputBlur(event: FocusEvent) {
        const { locale, format } = this.options;
        const field = this.field;
        if (event.defaultPrevented || this.readOnly || this.disabled) {
            return;
        }

        field.setTouched(true);
        field.setFocused(false);

        const hadManualInput = !this.allowInputSyncRef.current;
        const hadPendingProgrammaticChange = this.hasPendingCommitRef.current;

        this.allowInputSyncRef.current = true;

        const inputValue = this.inputValue;
        const nativeEvent = getNativeEvent(event);

        if (inputValue.trim() === '') {
            this.setValue(null, createChangeEventDetails(REASONS.inputClear, nativeEvent) as NumberFieldChangeEventDetails);
            if (field.validationMode === 'onBlur') {
                field.commit(null);
            }
            this.onValueCommitted(null, createGenericEventDetails(REASONS.inputClear, nativeEvent));
            return;
        }

        const parsedValue = parseNumber(inputValue, locale, format);
        if (parsedValue === null) {
            return;
        }

        this.blockRevalidation = true;

        // If an explicit precision is requested, round the committed numeric value.
        const hasExplicitPrecision = format?.maximumFractionDigits != null || format?.minimumFractionDigits != null;
        const maxFrac = format?.maximumFractionDigits;
        const committed = hasExplicitPrecision && typeof maxFrac === 'number' ? Number(parsedValue.toFixed(maxFrac)) : parsedValue;

        const nextEventDetails = createGenericEventDetails(REASONS.inputBlur, nativeEvent);
        const shouldUpdateValue = this.value !== committed;
        const shouldCommit = hadManualInput || shouldUpdateValue || hadPendingProgrammaticChange;

        if (field.validationMode === 'onBlur') {
            field.commit(committed);
        }

        if (shouldUpdateValue) {
            this.setValue(committed, createChangeEventDetails(REASONS.inputBlur, nativeEvent) as NumberFieldChangeEventDetails);
        }

        if (shouldCommit) {
            this.onValueCommitted(committed, nextEventDetails);
        }

        // Normalize only the displayed text
        const canonicalText = formatNumber(committed, locale, format);
        const maxPrecisionText = formatNumberMaxPrecision(parsedValue, locale, format);
        const shouldPreserveFullPrecision = !hasExplicitPrecision && parsedValue === this.value && inputValue === maxPrecisionText;

        if (!shouldPreserveFullPrecision && inputValue !== canonicalText) {
            this.setInputValue(canonicalText);
        }
    }

    private onInputChange(event: InputEvent) {
        const { locale, format } = this.options;
        const nativeEvent = getNativeEvent(event);

        // Workaround for https://github.com/facebook/react/issues/9023
        if (nativeEvent.defaultPrevented) {
            return;
        }

        this.allowInputSyncRef.current = false;
        const targetValue = (event.target as HTMLInputElement).value;

        if (targetValue.trim() === '') {
            this.setInputValue(targetValue);
            this.setValue(null, createChangeEventDetails(REASONS.inputClear, nativeEvent) as NumberFieldChangeEventDetails);
            return;
        }

        const allowedNonNumericKeys = this.getAllowedNonNumericKeys();
        const isValidCharacterString = Array.from(targetValue).every((ch) => {
            const isAsciiDigit = ch >= '0' && ch <= '9';
            return (
                isAsciiDigit ||
                ARABIC_DETECT_RE.test(ch) ||
                HAN_DETECT_RE.test(ch) ||
                PERSIAN_DETECT_RE.test(ch) ||
                FULLWIDTH_DETECT_RE.test(ch) ||
                ANY_MINUS_DETECT_RE.test(ch) ||
                allowedNonNumericKeys.has(ch)
            );
        });

        if (!isValidCharacterString) {
            return;
        }

        // For trusted user typing, update the input text immediately and only fire onValueChange
        // if the typed value is currently parseable into a number.
        if (event.isTrusted) {
            this.setInputValue(targetValue);
            const parsedValue = parseNumber(targetValue, locale, format);
            if (parsedValue !== null) {
                this.setValue(parsedValue, createChangeEventDetails(REASONS.inputChange, nativeEvent) as NumberFieldChangeEventDetails);
            }
            return;
        }

        const parsedValue = parseNumber(targetValue, locale, format);
        if (parsedValue !== null) {
            this.setInputValue(targetValue);
            this.setValue(parsedValue, createChangeEventDetails(REASONS.inputChange, nativeEvent) as NumberFieldChangeEventDetails);
        }
    }

    private onInputKeyDown(event: KeyboardEvent) {
        const { locale, format, min, max } = this.options;
        if (event.defaultPrevented || this.readOnly || this.disabled) {
            return;
        }

        const nativeEvent = getNativeEvent(event);
        const inputValue = this.inputValue;

        this.allowInputSyncRef.current = true;

        const allowedNonNumericKeys = this.getAllowedNonNumericKeys();

        let isAllowedNonNumericKey = allowedNonNumericKeys.has(event.key);

        const { decimal, currency, percentSign } = getNumberLocaleDetails(locale, format);

        const target = event.currentTarget as HTMLInputElement;
        const selectionStart = target.selectionStart;
        const selectionEnd = target.selectionEnd;
        const isAllSelected = selectionStart === 0 && selectionEnd === inputValue.length;

        const selectionIsExactlyCharAt = (index: number) => selectionStart === index && selectionEnd === index + 1;

        const hasSign = ANY_MINUS_DETECT_RE.test(inputValue) || ANY_PLUS_DETECT_RE.test(inputValue);

        // Only allow one sign unless replacing the existing one or all text is selected
        if (ANY_MINUS_DETECT_RE.test(event.key) && Array.from(allowedNonNumericKeys).some((k) => ANY_MINUS_DETECT_RE.test(k || ''))) {
            const existingIndex = inputValue.search(ANY_MINUS_RE);
            const isReplacingExisting = existingIndex !== -1 && selectionIsExactlyCharAt(existingIndex);
            isAllowedNonNumericKey = !hasSign || isAllSelected || isReplacingExisting;
        }

        if (ANY_PLUS_DETECT_RE.test(event.key) && Array.from(allowedNonNumericKeys).some((k) => ANY_PLUS_DETECT_RE.test(k || ''))) {
            const existingIndex = inputValue.search(ANY_PLUS_RE);
            const isReplacingExisting = existingIndex !== -1 && selectionIsExactlyCharAt(existingIndex);
            isAllowedNonNumericKey = !hasSign || isAllSelected || isReplacingExisting;
        }

        // Only allow one of each symbol.
        for (const symbol of [decimal, currency, percentSign]) {
            if (event.key === symbol) {
                const symbolIndex = inputValue.indexOf(symbol);
                const isSymbolHighlighted = selectionStart === symbolIndex && selectionEnd === symbolIndex + 1;
                isAllowedNonNumericKey = !inputValue.includes(symbol) || isAllSelected || isSymbolHighlighted;
            }
        }

        const isAsciiDigit = event.key >= '0' && event.key <= '9';

        if (
            // Allow composition events (e.g., pinyin); `isComposing` does not work in Safari.
            event.which === 229 ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            isAllowedNonNumericKey ||
            isAsciiDigit ||
            ARABIC_DETECT_RE.test(event.key) ||
            FULLWIDTH_DETECT_RE.test(event.key) ||
            HAN_DETECT_RE.test(event.key) ||
            NAVIGATE_KEYS.has(event.key)
        ) {
            return;
        }

        // We need to commit the number at this point if the input hasn't been blurred.
        const parsedValue = parseNumber(inputValue, locale, format);

        const amount = this.getStepAmount(event) ?? DEFAULT_STEP;

        // Prevent insertion of text or caret from moving.
        stopEvent(event);

        const commitDetails = createGenericEventDetails(REASONS.keyboard, nativeEvent);
        const commit = () => this.onValueCommitted(this.lastChangedValueRef.current ?? this.value, commitDetails);

        if (event.key === 'ArrowUp') {
            this.incrementValue(amount, { direction: 1, currentValue: parsedValue, event: nativeEvent, reason: REASONS.keyboard });
            commit();
        } else if (event.key === 'ArrowDown') {
            this.incrementValue(amount, { direction: -1, currentValue: parsedValue, event: nativeEvent, reason: REASONS.keyboard });
            commit();
        } else if (event.key === 'Home' && min != null) {
            this.setValue(min, createChangeEventDetails(REASONS.keyboard, nativeEvent) as NumberFieldChangeEventDetails);
            commit();
        } else if (event.key === 'End' && max != null) {
            this.setValue(max, createChangeEventDetails(REASONS.keyboard, nativeEvent) as NumberFieldChangeEventDetails);
            commit();
        }
    }
}
