import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { CompositeRootMachine } from '~@components/composite/root/CompositeRootMachine';
import { SHIFT } from '~@components/composite/utils/compositeKeys';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';
import { NOOP } from '~@lib/noop';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { contains } from '~@packages/floating-ui/utils/element';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { ModifierKey } from '~@components/composite/utils/compositeKeys';
import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { FieldsetMachine } from '~@components/fieldset/root/FieldsetMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { REASONS } from '~@events/reasons';
import type { MutableRef, TextDirection } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

export type RadioGroupChangeEventDetails = ChangeEventDetails<typeof REASONS.none>;

export type RadioGroupState = FieldRootState & {
    disabled: boolean;
    required: boolean;
    readOnly: boolean;
};

export type RadioGroupOptions = {
    disabled?: boolean | undefined;
    readOnly?: boolean | undefined;
    required?: boolean | undefined;
    name?: string | undefined;
    value?: unknown;
    defaultValue?: unknown;
    onValueChange?: ((value: unknown, eventDetails: RadioGroupChangeEventDetails) => void) | undefined;
    field?: FieldRootMachine | null | undefined;
    fieldset?: FieldsetMachine | null | undefined;
    labelable?: LabelableController | null | undefined;
    /**
     * Id of the hidden input (and the form field registration).
     */
    id: string;
    direction?: TextDirection | undefined;
};

const MODIFIER_KEYS: ModifierKey[] = [SHIFT];

/**
 * State machine of a radio group: the checked value shared by its radios, plus composite navigation.
 */
export class RadioGroupMachine {
    readonly store: Store<{ checkedValue: unknown; touched: boolean }>;

    readonly composite: CompositeRootMachine;

    readonly controlRef: MutableRef<HTMLElement | null> = { current: null };

    private options: RadioGroupOptions;

    private readonly detachedField = createDetachedField();

    private previousValue: unknown;

    constructor(options: RadioGroupOptions) {
        this.options = options;
        this.store = new Store<{ checkedValue: unknown; touched: boolean }>({ checkedValue: options.defaultValue, touched: false });
        this.composite = new CompositeRootMachine(this.getCompositeOptions());
        this.previousValue = this.checkedValue;
        this.store.subscribe(() => this.onValueChanged());
    }

    setOptions(options: RadioGroupOptions) {
        this.options = options;
        this.composite.setOptions(this.getCompositeOptions());
        this.onValueChanged();
    }

    private getCompositeOptions() {
        return { direction: this.options.direction ?? 'ltr', enableHomeAndEndKeys: false, modifierKeys: MODIFIER_KEYS };
    }

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    get checkedValue() {
        return this.options.value !== undefined ? this.options.value : this.store.state.checkedValue;
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

    /**
     * Whether a radio is focused after arrow-key navigation (it then checks itself on focus).
     */
    get touched() {
        return this.store.state.touched;
    }

    setTouched = (touched: boolean) => {
        this.store.set('touched', touched);
    };

    getState(): RadioGroupState {
        return { ...this.field.getState(), disabled: this.disabled, required: this.required, readOnly: this.readOnly };
    }

    static attrs(state: RadioGroupState): Record<string, string> {
        return getStyleHookProps(state, fieldValidityMapping);
    }

    setCheckedValue = (value: unknown, eventDetails: RadioGroupChangeEventDetails) => {
        this.options.onValueChange?.(value, eventDetails);

        if (eventDetails.isCanceled) {
            return;
        }

        if (this.options.value === undefined) {
            this.store.set('checkedValue', value);
        }
    };

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

    getRootProps(elementProps: Props = {}): Props {
        const field = this.field;
        return mergeProps(
            this.composite.getRootProps(),
            {
                role: 'radiogroup',
                'aria-required': this.required || undefined,
                'aria-disabled': this.disabled || undefined,
                'aria-readonly': this.readOnly || undefined,
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
            field.getValidationProps,
            elementProps
        );
    }

    /**
     * Value serialized for the hidden input.
     */
    get serializedCheckedValue() {
        const checkedValue = this.checkedValue;
        if (checkedValue == null) {
            return ''; // avoid uncontrolled -> controlled error
        }
        if (typeof checkedValue === 'string') {
            return checkedValue;
        }
        return JSON.stringify(checkedValue);
    }

    getInputProps(ariaLabelledBy?: string): Props {
        const serialized = this.serializedCheckedValue;
        return mergeProps(
            {
                value: serialized,
                id: this.options.id,
                name: serialized ? this.name : undefined,
                disabled: this.disabled,
                readOnly: this.readOnly,
                required: this.required,
                'aria-labelledby': ariaLabelledBy ?? this.options.fieldset?.store.state.legendId,
                'aria-hidden': true,
                tabIndex: -1,
                style: visuallyHidden,
                onChange: NOOP,
                onFocus: () => {
                    this.controlRef.current?.focus();
                }
            },
            this.field.getInputValidationProps
        );
    }

    setInputElement = (element: HTMLInputElement | null) => {
        this.field.inputRef.current = element;
    };

    destroy() {
        this.composite.destroy();
    }

    private onValueChanged() {
        const checkedValue = this.checkedValue;
        if (Object.is(checkedValue, this.previousValue)) {
            return;
        }
        this.previousValue = checkedValue;

        const field = this.field;
        field.form.clearErrors(this.name);
        field.setDirty(checkedValue !== field.validityData.initialValue);
        field.setFilled(checkedValue != null);

        if (field.shouldValidateOnChange()) {
            field.commit(checkedValue);
        } else {
            field.commit(checkedValue, true);
        }
    }
}
