import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { MutableRef } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { switchStateAttributesMapping } from './switchStateAttributesMapping';

export type SwitchChangeEventDetails = ChangeEventDetails<typeof REASONS.none>;

export type SwitchState = FieldRootState & {
    checked: boolean;
    disabled: boolean;
    readOnly: boolean;
    required: boolean;
};

export type SwitchOptions = {
    id?: string | undefined;
    checked?: boolean | undefined;
    /**
     * @default false
     */
    defaultChecked?: boolean | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    name?: string | undefined;
    onCheckedChange?: ((checked: boolean, eventDetails: SwitchChangeEventDetails) => void) | undefined;
    /**
     * @default false
     */
    readOnly?: boolean | undefined;
    /**
     * @default false
     */
    required?: boolean | undefined;
    /**
     * @default false
     */
    nativeButton?: boolean | undefined;
    /**
     * The enclosing field (a detached one is used otherwise).
     */
    field?: FieldRootMachine | null | undefined;
    labelable?: LabelableController | null | undefined;
    /**
     * Generated id of the switch element.
     */
    defaultId: string;
    /**
     * Generated id of the hidden input.
     */
    defaultInputId: string;
};

/**
 * State machine of a switch: a `role="switch"` element with a hidden checkbox input.
 */
export class SwitchMachine {
    readonly store: Store<{ checked: boolean }>;

    readonly button: ButtonMachine;

    readonly switchRef: MutableRef<HTMLElement | null> = { current: null };

    private options: SwitchOptions;

    private readonly detachedField = createDetachedField();

    private previousChecked: boolean;

    constructor(options: SwitchOptions) {
        this.options = options;
        this.store = new Store({ checked: Boolean(options.defaultChecked) });
        this.button = new ButtonMachine({ disabled: this.disabled, native: options.nativeButton ?? false });
        this.previousChecked = this.checked;
        this.store.subscribe(() => this.onCheckedValueChange());
    }

    setOptions(options: SwitchOptions) {
        this.options = options;
        this.button.setOptions({ disabled: this.disabled, native: options.nativeButton ?? false });
        this.onCheckedValueChange();
    }

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    get checked() {
        return this.options.checked ?? this.store.state.checked;
    }

    get disabled() {
        return this.field.disabled || (this.options.disabled ?? false);
    }

    get name() {
        return this.field.name ?? this.options.name;
    }

    get inputId() {
        const { labelable, id, defaultInputId } = this.options;
        return labelable ? labelable.resolveControlId(defaultInputId) : (id ?? defaultInputId);
    }

    getState(): SwitchState {
        const { readOnly = false, required = false } = this.options;
        return { ...this.field.getState(), checked: this.checked, disabled: this.disabled, readOnly, required };
    }

    static attrs(state: SwitchState): Record<string, string> {
        return getStyleHookProps(state, switchStateAttributesMapping);
    }

    /**
     * Ref callback of the switch element.
     */
    setSwitchElement = (element: HTMLElement | null) => {
        this.switchRef.current = element;
        this.button.setElement(element);
    };

    /**
     * Ref callback of the hidden input.
     */
    setInputElement = (element: HTMLInputElement | null) => {
        this.field.inputRef.current = element;
        if (element) {
            this.field.setFilled(element.checked);
        }
    };

    /**
     * Registers the explicit `id` with the labelable controller.
     */
    registerId(): () => void {
        const { labelable, id, defaultInputId } = this.options;
        return (
            labelable?.registerControl({ id, implicit: false, controlElement: this.switchRef.current, defaultId: defaultInputId }) ??
            (() => {})
        );
    }

    /**
     * Registers the switch in the form.
     */
    registerField(): () => void {
        return this.field.registerControl({
            id: this.options.defaultId,
            name: this.name,
            value: this.checked,
            getValue: () => this.checked,
            controlRef: this.switchRef,
            commit: this.field.commit
        });
    }

    /**
     * Props of the switch element (merged with the user's `elementProps`).
     */
    getRootProps(elementProps: Props = {}): Props {
        const { readOnly = false } = this.options;
        const disabled = this.disabled;
        const field = this.field;

        const rootProps = {
            id: this.options.defaultId,
            role: 'switch',
            'aria-checked': this.checked,
            'aria-readonly': readOnly || undefined,
            'aria-labelledby': this.options.labelable?.labelId,
            onFocus: () => {
                if (!disabled) {
                    field.setFocused(true);
                }
            },
            onBlur: () => {
                const element = field.inputRef.current;
                if (!element || disabled) {
                    return;
                }

                field.setTouched(true);
                field.setFocused(false);

                if (field.validationMode === 'onBlur') {
                    field.commit(element.checked);
                }
            },
            onClick: (event: Event) => {
                if (readOnly || disabled) {
                    return;
                }

                event.preventDefault();

                field.inputRef.current?.click();
            }
        };

        return this.button.getButtonProps(mergeProps(rootProps, field.getValidationProps, elementProps));
    }

    /**
     * Props of the hidden checkbox input.
     */
    getInputProps(): Props {
        const { required = false } = this.options;
        return mergeProps(
            {
                checked: this.checked,
                disabled: this.disabled,
                id: this.inputId,
                name: this.name,
                required,
                style: visuallyHidden,
                tabIndex: -1,
                type: 'checkbox',
                'aria-hidden': true,
                onChange: (event: Event & { nativeEvent?: Event }) => {
                    // Workaround for https://github.com/facebook/react/issues/9023
                    if ((event.nativeEvent ?? event).defaultPrevented) {
                        return;
                    }

                    const nextChecked = (event.target as HTMLInputElement).checked;
                    const eventDetails = createChangeEventDetails(REASONS.none, getNativeEvent(event));

                    this.options.onCheckedChange?.(nextChecked, eventDetails);

                    if (eventDetails.isCanceled) {
                        return;
                    }

                    if (this.options.checked === undefined) {
                        this.store.set('checked', nextChecked);
                    }
                },
                onFocus: () => {
                    this.switchRef.current?.focus();
                }
            },
            this.field.getInputValidationProps
        );
    }

    /**
     * Props of the extra hidden input that submits `off` when unchecked, or `null` when not needed.
     */
    getUncheckedInputProps(): Props | null {
        const name = this.name;
        return !this.checked && name ? { type: 'hidden', name, value: 'off' } : null;
    }

    // Replacement for `useValueChanged(checked, ...)`.
    private onCheckedValueChange() {
        const checked = this.checked;
        if (checked === this.previousChecked) {
            return;
        }
        this.previousChecked = checked;

        const field = this.field;
        field.form.clearErrors(this.name);
        field.setDirty(checked !== field.validityData.initialValue);
        field.setFilled(checked);

        if (field.shouldValidateOnChange()) {
            field.commit(checked);
        } else {
            field.commit(checked, true);
        }
    }
}
