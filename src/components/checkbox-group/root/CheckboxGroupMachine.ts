import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';
import { areArraysEqual } from '~@lib/areArraysEqual';
import { EMPTY_ARRAY } from '~@lib/constants';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { REASONS } from '~@events/reasons';
import type { MutableRef } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { CheckboxGroupParent } from '../parent/CheckboxGroupParent';
import { PARENT_CHECKBOX } from '../utils/constants';

export type CheckboxGroupChangeEventDetails = ChangeEventDetails<typeof REASONS.none>;

export type CheckboxGroupState = FieldRootState & {
    disabled: boolean;
};

export type CheckboxGroupOptions = {
    value?: string[] | undefined;
    defaultValue?: string[] | undefined;
    onValueChange?: ((value: string[], eventDetails: CheckboxGroupChangeEventDetails) => void) | undefined;
    /**
     * All values of the group (enables the parent checkbox).
     */
    allValues?: string[] | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    field?: FieldRootMachine | null | undefined;
    labelable?: LabelableController | null | undefined;
    /**
     * Id of the group (used for the form field registration).
     */
    id: string;
    /**
     * Generated id of the parent checkbox.
     */
    parentId: string;
};

/**
 * State machine of a checkbox group: the array of checked values shared by its checkboxes.
 */
export class CheckboxGroupMachine {
    readonly store: Store<{ value: string[] | undefined }>;

    readonly parent: CheckboxGroupParent;

    /**
     * The first non-parent checkbox (focused when the group fails validation).
     */
    readonly controlRef: MutableRef<HTMLElement | null> = { current: null };

    private options: CheckboxGroupOptions;

    private readonly detachedField = createDetachedField();

    private previousValue: readonly string[];

    constructor(options: CheckboxGroupOptions) {
        this.options = options;
        this.store = new Store({ value: options.defaultValue });
        this.parent = new CheckboxGroupParent(this);
        this.previousValue = this.value ?? EMPTY_ARRAY;
        this.store.subscribe(() => this.onValueChanged());
    }

    setOptions(options: CheckboxGroupOptions) {
        this.options = options;
        this.onValueChanged();
    }

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    get parentId() {
        return this.options.parentId;
    }

    get allValues() {
        return this.options.allValues;
    }

    get externalValue() {
        return this.options.value;
    }

    get value(): string[] | undefined {
        return this.options.value !== undefined ? this.options.value : this.store.state.value;
    }

    get defaultValue() {
        return this.options.defaultValue;
    }

    get disabled() {
        return this.field.disabled || (this.options.disabled ?? false);
    }

    getState(): CheckboxGroupState {
        return { ...this.field.getState(), disabled: this.disabled };
    }

    static attrs(state: CheckboxGroupState): Record<string, string> {
        return getStyleHookProps(state, fieldValidityMapping);
    }

    /**
     * Calls `onValueChange` (used by the parent checkbox).
     */
    notifyValueChange(value: string[], eventDetails: CheckboxGroupChangeEventDetails) {
        this.options.onValueChange?.(value, eventDetails);
    }

    setValue = (value: string[], eventDetails: CheckboxGroupChangeEventDetails) => {
        this.options.onValueChange?.(value, eventDetails);

        if (eventDetails.isCanceled) {
            return;
        }

        if (this.options.value === undefined) {
            this.store.set('value', value);
        }
    };

    /**
     * Ref callback of each checkbox: remembers the first non-parent checkbox.
     */
    registerControlRef = (element: HTMLElement | null) => {
        if (this.controlRef.current == null && element != null && !element.hasAttribute(PARENT_CHECKBOX)) {
            this.controlRef.current = element;
        }
    };

    registerField(): () => void {
        const name = this.field.name;
        return this.field.registerControl({
            enabled: Boolean(name),
            id: this.options.id,
            name,
            value: this.value,
            getValue: () => this.value,
            controlRef: this.controlRef,
            commit: this.field.commit
        });
    }

    getRootProps(elementProps: Props = {}): Props {
        const getDescriptionProps = this.options.labelable?.getDescriptionProps ?? ((props: Props) => props);
        return mergeProps({ role: 'group', 'aria-labelledby': this.options.labelable?.labelId }, getDescriptionProps, elementProps);
    }

    // Replacement for `useValueChanged(resolvedValue, ...)`.
    private onValueChanged() {
        const resolvedValue = this.value ?? (EMPTY_ARRAY as string[]);
        if (resolvedValue === this.previousValue) {
            return;
        }
        this.previousValue = resolvedValue;

        const field = this.field;
        const name = field.name;
        if (name) {
            field.form.clearErrors(name);
        }

        const initialValue = Array.isArray(field.validityData.initialValue)
            ? (field.validityData.initialValue as readonly string[])
            : EMPTY_ARRAY;

        field.setFilled(resolvedValue.length > 0);
        field.setDirty(!areArraysEqual(resolvedValue, initialValue));

        if (field.shouldValidateOnChange()) {
            field.commit(resolvedValue);
        } else {
            field.commit(resolvedValue, true);
        }
    }
}
