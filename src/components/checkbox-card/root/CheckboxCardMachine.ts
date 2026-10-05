import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { EMPTY_OBJECT } from '~@lib/constants';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { CheckboxGroupMachine } from '~@components/checkbox-group/root/CheckboxGroupMachine';
import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { MutableRef } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { checkboxCardStateAttributesMapping } from './checkboxCardStateAttributesMapping';

export type CheckboxCardChangeEventDetails = ChangeEventDetails<typeof REASONS.none>;

export type CheckboxCardState = FieldRootState & {
    checked: boolean;
    indeterminate: boolean;
    disabled: boolean;
    required: boolean;
};

export type CheckboxCardOptions = {
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
    /**
     * @default false
     */
    required?: boolean | undefined;
    value?: string | undefined;
    name?: string | undefined;
    onCheckedChange?: ((checked: boolean, eventDetails: CheckboxCardChangeEventDetails) => void) | undefined;
    field?: FieldRootMachine | null | undefined;
    fieldItemDisabled?: boolean | undefined;
    labelable?: LabelableController | null | undefined;
    group?: CheckboxGroupMachine | null | undefined;
    /**
     * Generated id used for the form field registration.
     */
    fieldId: string;
};

/**
 * State machine of a checkbox card: the whole card is the interactive target.
 */
export class CheckboxCardMachine {
    readonly store: Store<{ checked: boolean }>;

    readonly cardRef: MutableRef<HTMLElement | null> = { current: null };

    readonly inputRef: MutableRef<HTMLInputElement | null> = { current: null };

    private options: CheckboxCardOptions;

    private readonly detachedField = createDetachedField();

    private previousChecked: boolean;

    constructor(options: CheckboxCardOptions) {
        this.options = options;
        this.store = new Store({ checked: options.group ? false : (options.defaultChecked ?? false) });
        this.previousChecked = this.checked;
        this.store.subscribe(() => this.onCheckedValueChange());
    }

    setOptions(options: CheckboxCardOptions) {
        this.options = options;
        this.onCheckedValueChange();
    }

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    private get validation(): FieldRootMachine {
        return this.options.group?.field ?? this.field;
    }

    get name() {
        return this.field.name ?? this.options.name;
    }

    get disabled() {
        const { group, fieldItemDisabled = false, disabled = false } = this.options;
        return this.field.disabled || fieldItemDisabled || (group?.disabled ?? false) || disabled;
    }

    get checked() {
        const { group, value, checked } = this.options;
        if (group) {
            return value === undefined ? false : (group.value?.includes(value) ?? false);
        }
        return checked ?? this.store.state.checked ?? false;
    }

    getState(): CheckboxCardState {
        const { indeterminate = false, required = false } = this.options;
        return { ...this.field.getState(), checked: this.checked, disabled: this.disabled, indeterminate, required };
    }

    static attrs(state: CheckboxCardState): Record<string, string> {
        return getStyleHookProps(state, checkboxCardStateAttributesMapping);
    }

    setCardElement = (element: HTMLElement | null) => {
        this.cardRef.current = element;
        this.options.group?.registerControlRef(element);
    };

    setInputElement = (element: HTMLInputElement | null) => {
        this.inputRef.current = element;
        this.validation.inputRef.current = element;
        this.syncInput();
    };

    syncInput() {
        const input = this.inputRef.current;
        if (input) {
            input.indeterminate = this.options.indeterminate ?? false;
            if (this.checked) {
                this.field.setFilled(true);
            }
        }
    }

    registerField(): () => void {
        return this.field.registerControl({
            enabled: !this.options.group,
            id: this.options.fieldId,
            name: this.name,
            value: this.checked,
            getValue: () => this.checked,
            controlRef: this.cardRef,
            commit: this.validation.commit
        });
    }

    getRootProps(elementProps: Props = {}): Props {
        const { indeterminate = false, required = false, group, labelable } = this.options;
        const disabled = this.disabled;
        const field = this.field;
        const checked = this.checked;

        return mergeProps(
            {
                role: 'checkbox',
                'aria-checked': indeterminate ? 'mixed' : checked,
                'aria-disabled': disabled || undefined,
                'aria-required': required || undefined,
                'aria-labelledby': labelable?.labelId,
                tabIndex: disabled ? -1 : 0,
                onKeyDown: (event: KeyboardEvent) => {
                    if (event.key === ' ' || event.key === 'Enter') {
                        event.preventDefault();
                        this.inputRef.current?.click();
                    }
                },
                onClick: (event: MouseEvent) => {
                    if (event.defaultPrevented || disabled) {
                        return;
                    }
                    event.preventDefault();
                    this.inputRef.current?.click();
                },
                onFocus: () => {
                    field.setFocused(true);
                },
                onBlur: () => {
                    field.setTouched(true);
                    field.setFocused(false);

                    if (field.validationMode === 'onBlur') {
                        this.validation.commit(group ? group.value : checked);
                    }
                }
            },
            elementProps
        );
    }

    getInputProps(): Props {
        const { required = false, group, value: valueProp, labelable } = this.options;
        const getDescriptionProps = labelable?.getDescriptionProps ?? ((props: Props) => props);
        const checked = this.checked;

        return mergeProps(
            {
                type: 'checkbox',
                tabIndex: -1,
                style: visuallyHidden,
                'aria-hidden': true,
                checked,
                disabled: this.disabled,
                required,
                name: group ? undefined : this.name,
                onChange: (event: Event & { nativeEvent?: Event }) => {
                    if ((event.nativeEvent ?? event).defaultPrevented) {
                        return;
                    }

                    const nextChecked = (event.target as HTMLInputElement).checked;
                    const details = createChangeEventDetails(REASONS.none, getNativeEvent(event));

                    if (group && valueProp !== undefined) {
                        const currentValues = group.value ?? [];
                        const nextValues = nextChecked ? [...currentValues, valueProp] : currentValues.filter((v) => v !== valueProp);
                        group.setValue(nextValues, details);
                    } else {
                        this.options.onCheckedChange?.(nextChecked, details);
                        if (!details.isCanceled && this.options.checked === undefined && !group) {
                            this.store.set('checked', nextChecked);
                        }
                    }
                },
                onFocus: () => {
                    this.cardRef.current?.focus();
                }
            },
            valueProp === undefined ? EMPTY_OBJECT : { value: (group ? checked && valueProp : valueProp) || '' },
            getDescriptionProps,
            group ? this.validation.getValidationProps : this.validation.getInputValidationProps
        );
    }

    getUncheckedInputProps(): Props | null {
        const name = this.name;
        return !this.checked && !this.options.group && name ? { type: 'hidden', name, value: 'off' } : null;
    }

    private onCheckedValueChange() {
        const checked = this.checked;
        if (checked === this.previousChecked) {
            return;
        }
        this.previousChecked = checked;
        this.syncInput();

        if (this.options.group) {
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
