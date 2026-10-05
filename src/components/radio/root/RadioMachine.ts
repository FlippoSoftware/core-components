import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { ACTIVE_COMPOSITE_ITEM } from '~@components/composite/utils/compositeKeys';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { RadioGroupMachine } from '~@components/radio-group/root/RadioGroupMachine';
import type { MutableRef, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { radioStateAttributesMapping } from './radioStateAttributesMapping';

export type RadioState = FieldRootState & {
    checked: boolean;
    disabled: boolean;
    readOnly: boolean;
    required: boolean;
};

export type RadioIndicatorState = RadioState & {
    transitionStatus: TransitionStatus;
};

export type RadioOptions = {
    value: unknown;
    disabled?: boolean | undefined;
    readOnly?: boolean | undefined;
    required?: boolean | undefined;
    /**
     * @default false
     */
    nativeButton?: boolean | undefined;
    id?: string | undefined;
    group?: RadioGroupMachine | null | undefined;
    field?: FieldRootMachine | null | undefined;
    fieldItemDisabled?: boolean | undefined;
    labelable?: LabelableController | null | undefined;
    /**
     * Generated id of the radio element.
     */
    defaultId: string;
    /**
     * Generated id of the hidden input.
     */
    defaultInputId: string;
};

/**
 * State machine of a radio button (a composite item of its radio group).
 */
export class RadioMachine {
    readonly button: ButtonMachine;

    readonly radioRef: MutableRef<HTMLElement | null> = { current: null };

    readonly inputRef: MutableRef<HTMLInputElement | null> = { current: null };

    readonly store = new Store({ index: -1 });

    /**
     * Registration in the group's composite navigation.
     */
    readonly listItem: ListRegistryItem | null;

    protected options: RadioOptions;

    private readonly detachedField = createDetachedField();

    constructor(options: RadioOptions) {
        this.options = options;
        this.button = new ButtonMachine({ disabled: this.disabled, native: options.nativeButton ?? false });
        this.listItem = options.group
            ? new ListRegistryItem(options.group.composite.registry, { onIndexChange: (index) => this.store.set('index', index) })
            : null;
    }

    destroy() {
        this.listItem?.destroy();
    }

    /**
     * Roving tab index props from the group.
     */
    protected getCompositeItemProps(): Props {
        const group = this.options.group;
        return group ? group.composite.getItemProps(this.store.state.index) : {};
    }

    setOptions(options: RadioOptions) {
        this.options = options;
        this.button.setOptions({ disabled: this.disabled, native: options.nativeButton ?? false });
    }

    protected get groupMachine() {
        return this.options.group;
    }

    protected get labelableController() {
        return this.options.labelable;
    }

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    get disabled() {
        const { group, fieldItemDisabled = false, disabled = false } = this.options;
        return this.field.disabled || fieldItemDisabled || (group?.disabled ?? false) || disabled;
    }

    get readOnly() {
        return (this.options.group?.readOnly ?? false) || (this.options.readOnly ?? false);
    }

    get required() {
        return (this.options.group?.required ?? false) || (this.options.required ?? false);
    }

    get checked() {
        return this.options.group ? this.options.group.checkedValue === this.options.value : false;
    }

    get inputId() {
        const { labelable, id, defaultInputId } = this.options;
        return labelable ? labelable.resolveControlId(defaultInputId) : (id ?? defaultInputId);
    }

    getState(): RadioState {
        return {
            ...this.field.getState(),
            required: this.required,
            disabled: this.disabled,
            readOnly: this.readOnly,
            checked: this.checked
        };
    }

    static attrs(state: RadioState | RadioIndicatorState): Record<string, string> {
        return getStyleHookProps(state, radioStateAttributesMapping);
    }

    registerId(): () => void {
        const { labelable, id, defaultInputId } = this.options;
        return (
            labelable?.registerControl({ id, implicit: false, controlElement: this.radioRef.current, defaultId: defaultInputId }) ??
            (() => {})
        );
    }

    setRadioElement = (element: HTMLElement | null) => {
        this.radioRef.current = element;
        this.button.setElement(element);
        this.options.group?.registerControlRef(element);
        this.listItem?.setElement(element);
    };

    setInputElement = (element: HTMLInputElement | null) => {
        this.inputRef.current = element;
        if (element?.checked) {
            this.field.setFilled(true);
        }
    };

    getRootProps(elementProps: Props = {}): Props {
        const { group, labelable } = this.options;
        const disabled = this.disabled;
        const readOnly = this.readOnly;
        const checked = this.checked;
        const getDescriptionProps = labelable?.getDescriptionProps ?? ((props: Props) => props);

        const rootProps = {
            role: 'radio',
            'aria-checked': checked,
            'aria-required': this.required || undefined,
            'aria-disabled': disabled || undefined,
            'aria-readonly': readOnly || undefined,
            'aria-labelledby': labelable?.labelId,
            [ACTIVE_COMPOSITE_ITEM]: checked ? '' : undefined,
            id: this.options.defaultId,
            disabled,
            onKeyDown(event: KeyboardEvent) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                }
            },
            onClick: (event: MouseEvent) => {
                if (event.defaultPrevented || disabled || readOnly) {
                    return;
                }

                event.preventDefault();
                this.inputRef.current?.click();
            },
            onFocus: (event: FocusEvent) => {
                if (event.defaultPrevented || disabled || readOnly || !group?.touched) {
                    return;
                }

                this.inputRef.current?.click();
                group.setTouched(false);
            }
        };

        return this.button.getButtonProps(
            mergeProps(this.getCompositeItemProps(), rootProps, getDescriptionProps, group?.field.getValidationProps, elementProps)
        );
    }

    getInputProps(): Props {
        const { value, group } = this.options;
        const disabled = this.disabled;
        const readOnly = this.readOnly;
        const field = this.field;

        return {
            type: 'radio',
            id: this.inputId,
            tabIndex: -1,
            style: visuallyHidden,
            'aria-hidden': true,
            disabled,
            checked: this.checked,
            required: this.required,
            readOnly,
            onChange: (event: Event & { nativeEvent?: Event }) => {
                // Workaround for https://github.com/facebook/react/issues/9023
                if ((event.nativeEvent ?? event).defaultPrevented) {
                    return;
                }

                if (disabled || readOnly || value === undefined) {
                    return;
                }

                const details = createChangeEventDetails(REASONS.none, getNativeEvent(event));

                if (details.isCanceled) {
                    return;
                }

                field.setTouched(true);
                field.setDirty(value !== field.validityData.initialValue);
                field.setFilled(true);
                group?.setCheckedValue(value, details);
            },
            onFocus: () => {
                this.radioRef.current?.focus();
            }
        };
    }
}
