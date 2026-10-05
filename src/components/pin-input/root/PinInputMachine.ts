import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ListRegistry } from '~@components/composite/list/ListRegistry';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { getEventKey } from '~@lib/eventKey';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { contains } from '~@packages/floating-ui/utils/element';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { MutableRef, TextDirection } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { getFocusTarget, testPattern } from '../utils/pinInputUtils';

import { pinInputStateAttributesMapping } from './pinInputStateAttributesMapping';

export type PinInputType = 'alphanumeric' | 'numeric' | 'alphabetic';

export type PinInputFocusMode = 'last-active' | 'first-empty' | 'first';

export type PinInputState = FieldRootState & {
    readOnly: boolean;
    required: boolean;
};

function focusElement(element: HTMLElement | null): boolean {
    if (!element) {
        return false;
    }

    try {
        element.focus({ preventScroll: false });
        return true;
    } catch (error) {
        // biome-ignore lint/suspicious/noConsole: same diagnostics as the React component.
        console.warn('Failed to focus element:', error);
        return false;
    }
}

export type PinInputOptions = {
    disabled?: boolean | undefined;
    /**
     * @default false
     */
    readOnly?: boolean | undefined;
    required?: boolean | undefined;
    value?: string | undefined;
    defaultValue?: string | undefined;
    name?: string | undefined;
    /**
     * @default '○'
     */
    placeholder?: string | undefined;
    /**
     * @default false
     */
    otp?: boolean | undefined;
    /**
     * @default false
     */
    mask?: boolean | undefined;
    /**
     * @default false
     */
    blurOnComplete?: boolean | undefined;
    /**
     * @default false
     */
    selectOnFocus?: boolean | undefined;
    pattern?: string | undefined;
    /**
     * @default 'numeric'
     */
    type?: PinInputType | undefined;
    onValueChange?: ((value: string, values: string[], event: Event) => void) | undefined;
    onValueComplete?: ((value: string, values: string[], event: Event) => void) | undefined;
    field?: FieldRootMachine | null | undefined;
    labelable?: LabelableController | null | undefined;
    /**
     * Id of the hidden input.
     */
    id: string;
    direction?: TextDirection | undefined;
    /**
     * Focus mode of an enclosing focus funnel.
     */
    focusMode?: PinInputFocusMode | undefined;
};

type PinInputInternalState = {
    checkedValue: string;
    values: string[];
    touched: boolean;
    focusedInputIndex: number | null;
    lastFocusedInputIndex: number | null;
};

/**
 * State machine of a PIN input: one character per pin, completion detection and focus movement.
 */
export class PinInputMachine {
    readonly store: Store<PinInputInternalState>;

    readonly registry = new ListRegistry();

    readonly controlRef: MutableRef<HTMLElement | null> = { current: null };

    private options: PinInputOptions;

    private readonly detachedField = createDetachedField();

    private previousValue: string;

    constructor(options: PinInputOptions) {
        this.options = options;
        const checkedValue = options.value ?? options.defaultValue ?? '';
        this.store = new Store<PinInputInternalState>({
            checkedValue: options.defaultValue ?? '',
            values: String(checkedValue).split(''),
            touched: false,
            focusedInputIndex: null,
            lastFocusedInputIndex: null
        });
        this.previousValue = this.checkedValue;
        this.store.subscribe(() => this.onValueChanged());
    }

    setOptions(options: PinInputOptions) {
        this.options = options;
        this.onValueChanged();
    }

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    /**
     * Current options (read by the pins).
     */
    get optionsSnapshot(): Readonly<PinInputOptions> {
        return this.options;
    }

    // The controlled prop is `value ?? ''` in the React component: it is always controlled.
    get checkedValue() {
        return this.options.value ?? '';
    }

    get values() {
        return this.store.state.values;
    }

    get disabled() {
        return this.field.disabled || (this.options.disabled ?? false);
    }

    get readOnly() {
        return this.options.readOnly ?? false;
    }

    get name() {
        return this.field.name ?? this.options.name;
    }

    get elementsRef() {
        return this.registry.elementsRef;
    }

    getState(): PinInputState {
        return { ...this.field.getState(), disabled: this.disabled, required: this.options.required ?? false, readOnly: this.readOnly };
    }

    static attrs(state: PinInputState): Record<string, string> {
        return getStyleHookProps(state, pinInputStateAttributesMapping);
    }

    registerControlRef = (element: HTMLElement | null) => {
        if (this.controlRef.current == null && element != null) {
            this.controlRef.current = element;
        }
    };

    registerField(): () => void {
        return this.field.registerControl({
            id: this.options.id,
            name: this.name,
            value: this.checkedValue,
            getValue: () => this.checkedValue ?? null,
            controlRef: this.controlRef,
            commit: this.field.commit
        });
    }

    setFocusedInputIndex = (index: number | null) => {
        this.store.set('focusedInputIndex', index);
    };

    setLastFocusedInputIndex = (index: number | null) => {
        this.store.set('lastFocusedInputIndex', index);
    };

    setTouched = (touched: boolean) => {
        this.store.set('touched', touched);
    };

    /**
     * Sets the character of the pin at `index`.
     */
    onValueChange = (pinValue: string, index: number, event: Event) => {
        const { onValueChange, onValueComplete, blurOnComplete = false } = this.options;
        const newValues = [...this.store.state.values];
        newValues[index] = pinValue;
        const value = newValues.join('');

        this.store.update({ values: newValues, checkedValue: value });
        onValueChange?.(value, newValues, event);

        // Check if PIN input is completed and handle completion logic
        const focusedInputIndex = this.store.state.focusedInputIndex;
        const pinCount = this.elementsRef.current.length;
        const isComplete = pinCount === newValues.length && newValues.every((val) => val !== '');

        if (isComplete && focusedInputIndex === pinCount - 1) {
            onValueComplete?.(value, newValues, event);

            if (blurOnComplete) {
                setTimeout(() => {
                    this.elementsRef.current[focusedInputIndex ?? 0]?.blur();
                }, 0);
            }
        }
    };

    getRootProps(elementProps: Props = {}): Props {
        const field = this.field;
        const getDescriptionProps = this.options.labelable?.getDescriptionProps ?? ((props: Props) => props);
        return mergeProps(
            {
                'aria-required': this.options.required,
                'aria-disabled': this.disabled,
                'aria-readonly': this.readOnly,
                'aria-labelledby': this.options.labelable?.labelId,
                onFocus: () => {
                    field.setFocused(true);
                },
                onBlur: (event: FocusEvent) => {
                    if (!contains(event.currentTarget as Element, event.relatedTarget as Element | null)) {
                        field.setTouched(true);
                        field.setFocused(false);

                        if (field.validationMode === 'onBlur') {
                            field.commit(this.checkedValue);
                        }
                    }
                },
                onKeyDownCapture: (event: KeyboardEvent) => {
                    if (event.key.startsWith('Arrow')) {
                        field.setTouched(true);
                        this.setTouched(true);
                        field.setFocused(true);
                    }
                }
            },
            elementProps,
            getDescriptionProps
        );
    }

    getInputProps(): Props {
        const serialized = this.checkedValue ?? '';
        return mergeProps(
            {
                value: serialized,
                id: this.options.id,
                name: serialized ? this.name : undefined,
                disabled: this.disabled,
                readOnly: this.readOnly,
                required: this.options.required,
                'aria-hidden': true,
                tabIndex: -1,
                style: visuallyHidden,
                onFocus: () => {
                    this.controlRef.current?.focus();
                }
            },
            this.field.getInputValidationProps
        );
    }

    setInputElement = (element: HTMLInputElement | null) => {
        this.field.inputRef.current = element;
        this.controlRef.current = element ?? this.controlRef.current;
    };

    getGroupProps(): Props {
        const valid = this.getState().valid;
        return {
            role: 'group',
            'aria-label': 'PIN code input',
            'aria-describedby': valid === false ? 'pin-input-error' : undefined,
            'aria-invalid': valid === false
        };
    }

    /**
     * Props of a focus funnel that routes focus and typing to the right pin.
     */
    getFocusFunnelProps(focusMode: PinInputFocusMode = 'first-empty'): Props {
        const field = this.field;
        const getTargetInputIndex = () => {
            const maxIndex = Math.max(0, (this.elementsRef.current?.length ?? 1) - 1);
            return getFocusTarget(focusMode, this.values, this.store.state.lastFocusedInputIndex, maxIndex);
        };

        return {
            role: 'application',
            'aria-label': 'PIN input focus funnel',
            'aria-describedby': this.getState().valid === false ? 'pin-focus-funnel-error' : undefined,
            tabIndex: -1,
            style: { outline: 'none' },
            onClick: (event: MouseEvent) => {
                if (focusMode !== 'first-empty' && (event.target as HTMLElement)?.tagName === 'INPUT') {
                    return;
                }

                const targetIndex = getTargetInputIndex();
                if (focusElement(this.elementsRef.current?.[targetIndex] ?? null)) {
                    field.setFocused(true);
                    this.setFocusedInputIndex(targetIndex);
                }
            },
            onFocus: (event: FocusEvent) => {
                // Only handle if the focus funnel itself received focus (not from child inputs)
                if (!(event.currentTarget as Element).contains(event.relatedTarget as Node | null)) {
                    focusElement(this.elementsRef.current?.[getTargetInputIndex()] ?? null);
                }
            },
            onKeyDown: (event: KeyboardEvent) => {
                // Only handle if the focus funnel itself has focus, not its children
                if (event.target !== event.currentTarget) {
                    return;
                }

                const targetIndex = this.store.state.focusedInputIndex ?? getTargetInputIndex();
                const targetElement = this.elementsRef.current?.[targetIndex] ?? null;

                switch (event.key) {
                    case 'Enter':
                    case ' ':
                        event.preventDefault();
                        if (focusElement(targetElement)) {
                            field.setFocused(true);
                            this.setFocusedInputIndex(targetIndex);
                        }
                        break;
                    case 'Escape':
                        (event.currentTarget as HTMLElement).blur();
                        break;
                    default:
                        // For any other key, focus the target input and pass the key
                        if (targetElement && event.key.length === 1) {
                            event.preventDefault();
                            if (focusElement(targetElement)) {
                                targetElement.dispatchEvent(
                                    new KeyboardEvent('keydown', { key: event.key, code: event.code, bubbles: true, cancelable: true })
                                );
                            }
                        }
                        break;
                }
            }
        };
    }

    destroy() {
        this.registry.destroy();
    }

    private onValueChanged() {
        const checkedValue = this.checkedValue;
        if (checkedValue === this.previousValue) {
            return;
        }
        this.previousValue = checkedValue;

        const field = this.field;
        field.form.clearErrors(this.name);

        if (field.validationMode === 'onChange') {
            field.commit(checkedValue);
        } else {
            field.commit(checkedValue, true);
        }
    }

    /**
     * Distributes pasted characters across the pins starting at `startIndex`.
     */
    handlePasteValue(pastedValue: string, startIndex: number) {
        const { type = 'numeric', pattern } = this.options;
        const validChars = pastedValue.split('').filter((char) => testPattern(char, type, pattern));

        if (validChars.length === 0) {
            return;
        }

        this.field.setDirty(true);
        this.field.setFilled(true);

        const maxInputs = this.elementsRef.current?.length || 0;
        let focusIndex = startIndex;

        validChars.forEach((char, charIndex) => {
            const inputIndex = startIndex + charIndex;
            if (inputIndex < maxInputs) {
                this.onValueChange(char, inputIndex, new Event('input', { bubbles: true }));
                focusIndex = inputIndex + 1;
            }
        });

        const nextFocusIndex = Math.min(focusIndex, maxInputs - 1);
        this.elementsRef.current?.[nextFocusIndex]?.focus();
    }

    handleSpecialKeys(event: KeyboardEvent, index: number) {
        const elements = this.elementsRef.current;
        const nativeEvent = getNativeEvent(event);
        const focus = (targetIndex: number) => {
            const element = elements?.[targetIndex];
            if (element && targetIndex !== index) {
                element.focus();
            }
        };

        const keyMap: Record<string, () => void> = {
            Backspace: () => {
                this.onValueChange('', index, nativeEvent);
                elements?.[Math.max(0, index - 1)]?.focus();
            },
            Delete: () => {
                this.onValueChange('', index, nativeEvent);
            },
            Enter: () => {
                // Trigger value change to check completion logic without changing value
                this.onValueChange(this.values[index] ?? '', index, nativeEvent);
            },
            ...(this.options.focusMode === 'first-empty'
                ? {}
                : {
                      ArrowLeft: () => focus(Math.max(0, index - 1)),
                      ArrowRight: () => focus(Math.min(elements?.length - 1 || 0, index + 1)),
                      Home: () => elements?.[0]?.focus(),
                      End: () => elements?.[(elements?.length || 1) - 1]?.focus()
                  })
        };

        keyMap[getEventKey(event, { dir: this.options.direction ?? 'ltr', orientation: 'horizontal' })]?.();
    }
}
