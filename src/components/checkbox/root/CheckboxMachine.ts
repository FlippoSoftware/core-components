import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { PARENT_CHECKBOX } from '~@components/checkbox-group/utils/constants';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { EMPTY_OBJECT } from '~@lib/constants';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { StateAttributesMapping } from '~@attributes/getStyleHookProps';
import type { CheckboxGroupMachine } from '~@components/checkbox-group/root/CheckboxGroupMachine';
import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { MutableRef, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { getCheckboxStateAttributesMapping } from './getCheckboxStateAttributesMapping';

export type CheckboxChangeEventDetails = ChangeEventDetails<typeof REASONS.none>;

export type CheckboxState = FieldRootState & {
    checked: boolean;
    disabled: boolean;
    readOnly: boolean;
    required: boolean;
    indeterminate: boolean;
};

export type CheckboxIndicatorState = CheckboxState & {
    transitionStatus: TransitionStatus;
};

export type CheckboxOptions = {
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
    /**
     * @default false
     */
    indeterminate?: boolean | undefined;
    name?: string | undefined;
    onCheckedChange?: ((checked: boolean, eventDetails: CheckboxChangeEventDetails) => void) | undefined;
    /**
     * Whether the checkbox controls a group of checkboxes.
     * @default false
     */
    parent?: boolean | undefined;
    /**
     * @default false
     */
    readOnly?: boolean | undefined;
    /**
     * @default false
     */
    required?: boolean | undefined;
    value?: string | undefined;
    /**
     * @default false
     */
    nativeButton?: boolean | undefined;
    field?: FieldRootMachine | null | undefined;
    /**
     * Whether an enclosing `<Field.Item>` is disabled.
     */
    fieldItemDisabled?: boolean | undefined;
    labelable?: LabelableController | null | undefined;
    group?: CheckboxGroupMachine | null | undefined;
    /**
     * Generated id of the checkbox element.
     */
    defaultId: string;
};

type GroupProps = {
    checked?: boolean;
    indeterminate?: boolean;
    onCheckedChange?: (checked: boolean, details: CheckboxChangeEventDetails) => void;
    [key: string]: unknown;
};

/**
 * State machine of a checkbox: a `role="checkbox"` element with a hidden checkbox input,
 * optionally part of a checkbox group (with a parent checkbox).
 */
export class CheckboxMachine {
    readonly store: Store<{ checked: boolean }>;

    readonly button: ButtonMachine;

    readonly controlRef: MutableRef<HTMLElement | null> = { current: null };

    readonly inputRef: MutableRef<HTMLInputElement | null> = { current: null };

    private options: CheckboxOptions;

    private readonly detachedField = createDetachedField();

    private previousChecked: boolean;

    constructor(options: CheckboxOptions) {
        this.options = options;
        const { group, value: valueProp, defaultChecked = false, parent = false } = options;
        const value = valueProp ?? this.name;
        const defaultGroupValue = group?.defaultValue;
        this.store = new Store({ checked: value && defaultGroupValue && !parent ? defaultGroupValue.includes(value) : defaultChecked });
        this.button = new ButtonMachine({ disabled: this.disabled, native: options.nativeButton ?? false });
        this.previousChecked = this.checked;
        this.store.subscribe(() => this.onCheckedValueChange());
    }

    setOptions(options: CheckboxOptions) {
        this.options = options;
        this.button.setOptions({ disabled: this.disabled, native: options.nativeButton ?? false });
        this.syncDisabledState();
        this.onCheckedValueChange();
    }

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    get name() {
        return this.field.name ?? this.options.name;
    }

    get value() {
        return this.options.value ?? this.name;
    }

    get disabled() {
        const { group, fieldItemDisabled = false, disabled = false } = this.options;
        return this.field.disabled || fieldItemDisabled || (group?.disabled ?? false) || disabled;
    }

    private get isGroupedWithParent() {
        const group = this.options.group;
        return Boolean(group && group.allValues);
    }

    private get groupProps(): GroupProps {
        const { group, parent = false } = this.options;
        const value = this.value;
        if (!group || !this.isGroupedWithParent) {
            return {};
        }
        if (parent) {
            return group.parent.getParentProps();
        }
        return value ? group.parent.getChildProps(value) : {};
    }

    private get controlledChecked(): boolean | undefined {
        const { group, parent = false, checked } = this.options;
        const value = this.value;
        const groupValue = group?.value;
        const groupChecked = this.groupProps.checked ?? checked;
        return value && groupValue && !parent ? groupValue.includes(value) : groupChecked;
    }

    get checked() {
        return this.controlledChecked ?? this.store.state.checked;
    }

    private get groupIndeterminate() {
        return this.groupProps.indeterminate ?? this.options.indeterminate ?? false;
    }

    /**
     * Id of the hidden input (associated with labels).
     */
    get inputId(): string | null | undefined {
        const { group, parent = false, id } = this.options;
        if (group && this.isGroupedWithParent) {
            return parent ? group.parentId : `${group.parentId}-${this.value}`;
        }
        if (id) {
            return id;
        }
        return this.options.labelable?.controlId;
    }

    getState(): CheckboxState {
        const { readOnly = false, required = false, indeterminate = false } = this.options;
        const isGroupedWithParent = this.isGroupedWithParent;
        return {
            ...this.field.getState(),
            checked: isGroupedWithParent ? Boolean(this.groupProps.checked) : this.checked,
            disabled: this.disabled,
            readOnly,
            required,
            indeterminate: isGroupedWithParent ? this.groupIndeterminate || indeterminate : indeterminate
        };
    }

    static attrs(state: CheckboxState): Record<string, string> {
        return getStyleHookProps(state, getCheckboxStateAttributesMapping(state));
    }

    static indicatorAttrs(state: CheckboxIndicatorState): Record<string, string> {
        return getStyleHookProps(state, {
            ...getCheckboxStateAttributesMapping(state),
            ...transitionStatusMapping,
            ...fieldValidityMapping
        } as StateAttributesMapping<CheckboxIndicatorState>);
    }

    /**
     * Whether the indicator is shown.
     */
    static isIndicatorRendered(state: CheckboxState) {
        return state.checked || state.indeterminate;
    }

    /**
     * Registers the input id with the labelable controller (the checkbox always owns the control id).
     */
    registerId(): () => void {
        const labelable = this.options.labelable;
        if (!labelable) {
            return () => {};
        }
        labelable.setControlId(this.inputId);
        return () => {
            labelable.setControlId(undefined);
        };
    }

    registerField(): () => void {
        return this.field.registerControl({
            enabled: !this.options.group,
            id: this.options.defaultId,
            name: this.name,
            value: this.checked,
            getValue: () => this.checked,
            controlRef: this.controlRef,
            commit: this.validation.commit
        });
    }

    /**
     * Ref callback of the checkbox element.
     */
    setControlElement = (element: HTMLElement | null) => {
        this.controlRef.current = element;
        this.button.setElement(element);
        this.options.group?.registerControlRef(element);
    };

    /**
     * Ref callback of the hidden input.
     */
    setInputElement = (element: HTMLInputElement | null) => {
        this.inputRef.current = element;
        this.validation.inputRef.current = element;
        this.syncInput();
    };

    /**
     * Applies `indeterminate` to the input and marks the field filled when checked.
     */
    syncInput() {
        const input = this.inputRef.current;
        if (input) {
            input.indeterminate = this.groupIndeterminate;
            if (this.checked) {
                this.field.setFilled(true);
            }
        }
    }

    /**
     * Validation of the checkbox: the group's field when grouped.
     */
    private get validation(): FieldRootMachine {
        return this.options.group?.field ?? this.field;
    }

    getRootProps(elementProps: Props = {}): Props {
        const { readOnly = false, required = false, parent = false, group, labelable } = this.options;
        const disabled = this.disabled;
        const field = this.field;
        const getDescriptionProps = labelable?.getDescriptionProps ?? ((props: Props) => props);
        const { checked: _checked, indeterminate: _indeterminate, onCheckedChange: _onChange, ...otherGroupProps } = this.groupProps;

        const rootProps = {
            id: this.options.defaultId,
            role: 'checkbox',
            'aria-checked': this.groupIndeterminate ? 'mixed' : this.checked,
            'aria-readonly': readOnly || undefined,
            'aria-required': required || undefined,
            'aria-labelledby': labelable?.labelId,
            [PARENT_CHECKBOX]: parent ? '' : undefined,
            onFocus: () => {
                field.setFocused(true);
            },
            onBlur: () => {
                const inputEl = this.inputRef.current;
                if (!inputEl) {
                    return;
                }

                field.setTouched(true);
                field.setFocused(false);

                if (field.validationMode === 'onBlur') {
                    field.commit(group ? group.value : inputEl.checked);
                }
            },
            onClick: (event: Event) => {
                if (readOnly || disabled) {
                    return;
                }

                event.preventDefault();
                this.inputRef.current?.click();
            }
        };

        return this.button.getButtonProps(
            mergeProps(rootProps, getDescriptionProps, field.getValidationProps, elementProps, otherGroupProps)
        );
    }

    getInputProps(): Props {
        const { required = false, parent = false, group, labelable, value: valueProp } = this.options;
        const getDescriptionProps = labelable?.getDescriptionProps ?? ((props: Props) => props);
        const checked = this.checked;
        const name = this.name;

        return mergeProps(
            {
                checked,
                disabled: this.disabled,
                // parent checkboxes unset `name` to be excluded from form submission
                name: parent ? undefined : name,
                // Set `id` to stop Chrome warning about an unassociated input
                id: this.inputId ?? undefined,
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
                    const details = createChangeEventDetails(REASONS.none, getNativeEvent(event));

                    this.groupProps.onCheckedChange?.(nextChecked, details);
                    this.options.onCheckedChange?.(nextChecked, details);

                    if (details.isCanceled) {
                        return;
                    }

                    if (this.controlledChecked === undefined) {
                        this.store.set('checked', nextChecked);
                    }

                    const value = this.value;
                    const groupValue = group?.value;
                    if (value && groupValue && group && !parent) {
                        const nextGroupValue = nextChecked ? [...groupValue, value] : groupValue.filter((item) => item !== value);
                        group.setValue(nextGroupValue, details);
                    }
                },
                onFocus: () => {
                    this.controlRef.current?.focus();
                }
            },
            // Only set the value if it's defined.
            valueProp === undefined ? EMPTY_OBJECT : { value: (group ? checked && valueProp : valueProp) || '' },
            getDescriptionProps,
            group ? this.validation.getValidationProps : this.validation.getInputValidationProps
        );
    }

    /**
     * Props of the extra hidden input that submits `off` when unchecked, or `null` when not needed.
     */
    getUncheckedInputProps(): Props | null {
        const { group, parent = false } = this.options;
        const name = this.name;
        return !this.checked && !group && name && !parent ? { type: 'hidden', name, value: 'off' } : null;
    }

    private syncDisabledState() {
        const { group } = this.options;
        const value = this.value;
        if (group && value) {
            group.parent.disabledStatesRef.current.set(value, this.disabled);
        }
    }

    // Replacement for `useValueChanged(checked, ...)`.
    private onCheckedValueChange() {
        const checked = this.checked;
        if (checked === this.previousChecked) {
            return;
        }
        this.previousChecked = checked;
        this.syncInput();

        const { group, parent = false } = this.options;
        if (group && !parent) {
            return;
        }

        const field = this.field;
        field.form.clearErrors(this.name);
        field.setFilled(checked);
        field.setDirty(checked !== field.validityData.initialValue);

        if (field.shouldValidateOnChange()) {
            this.validation.commit(checked);
        } else {
            this.validation.commit(checked, true);
        }
    }
}
