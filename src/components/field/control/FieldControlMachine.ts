import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { Props } from '~@props/mergeProps';

import type { FieldRootMachine, FieldRootState } from '../root/FieldRootMachine';

export type FieldControlChangeEventDetails = ChangeEventDetails<typeof REASONS.none>;

export type FieldControlOptions = {
    id?: string | undefined;
    name?: string | undefined;
    value?: string | number | readonly string[] | undefined;
    defaultValue?: string | number | readonly string[] | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    onValueChange?: ((value: string, eventDetails: FieldControlChangeEventDetails) => void) | undefined;
    /**
     * The field the control belongs to.
     */
    field: FieldRootMachine;
    /**
     * Label/description associations of the field.
     */
    labelable?: LabelableController | null | undefined;
    /**
     * Generated id used when `id` is not provided.
     */
    defaultId: string;
};

type ControlEvent = Event & { nativeEvent?: Event; key?: string };

/**
 * A native `<input>`/`<textarea>` control of a field (also `Input` and `Textarea`).
 * Replacement for the logic of `FieldControl`.
 */
export class FieldControlMachine {
    readonly store: Store<{ value: FieldControlOptions['defaultValue'] }>;

    private options: FieldControlOptions;

    constructor(options: FieldControlOptions) {
        this.options = options;
        this.store = new Store({ value: options.defaultValue });
    }

    setOptions(options: FieldControlOptions) {
        this.options = options;
    }

    get id() {
        const { labelable, id, defaultId } = this.options;
        return labelable ? labelable.resolveControlId(id ?? defaultId) : (id ?? defaultId);
    }

    get name() {
        return this.options.field.name ?? this.options.name;
    }

    get disabled() {
        return this.options.field.disabled || (this.options.disabled ?? false);
    }

    get value() {
        return this.options.value !== undefined ? this.options.value : this.store.state.value;
    }

    getState(): FieldRootState {
        return { ...this.options.field.getState(), disabled: this.disabled };
    }

    /**
     * Registers the explicit `id` with the labelable controller.
     */
    registerId(): () => void {
        const { labelable, id, defaultId } = this.options;
        return labelable?.registerControl({ id, defaultId }) ?? (() => {});
    }

    /**
     * Registers the control in the form.
     */
    registerField(): () => void {
        const field = this.options.field;
        return field.registerControl({
            id: this.id,
            name: this.name,
            value: this.value,
            getValue: () => field.inputRef.current?.value,
            controlRef: field.inputRef as never
        });
    }

    /**
     * Updates the `filled` flag from the input or the controlled value.
     */
    syncFilled() {
        const field = this.options.field;
        const valueProp = this.options.value;
        const hasExternalValue = valueProp != null;
        if (field.inputRef.current?.value || (hasExternalValue && valueProp !== '')) {
            field.setFilled(true);
        } else if (hasExternalValue && valueProp === '') {
            field.setFilled(false);
        }
    }

    setValue = (nextValue: string, eventDetails: FieldControlChangeEventDetails) => {
        this.options.onValueChange?.(nextValue, eventDetails);

        if (eventDetails.isCanceled) {
            return;
        }

        if (this.options.value === undefined) {
            this.store.set('value', nextValue);
        }
    };

    /**
     * Props of the control element (merged with the user's `elementProps`).
     */
    getControlProps(elementProps: Props = {}): Props {
        const field = this.options.field;
        const isControlled = this.options.value !== undefined;

        const baseProps = {
            id: this.id,
            disabled: this.disabled,
            name: this.name,
            'aria-labelledby': this.options.labelable?.labelId,
            ...(isControlled ? { value: this.value } : { defaultValue: this.options.defaultValue }),
            onChange: (event: ControlEvent) => {
                const inputValue = (event.currentTarget as HTMLInputElement).value;
                this.setValue(inputValue, createChangeEventDetails(REASONS.none, getNativeEvent(event)));
                field.setDirty(inputValue !== field.validityData.initialValue);
                field.setFilled(inputValue !== '');
            },
            onFocus: () => {
                field.setFocused(true);
            },
            onBlur: (event: ControlEvent) => {
                field.setTouched(true);
                field.setFocused(false);

                if (field.validationMode === 'onBlur') {
                    field.commit((event.currentTarget as HTMLInputElement).value);
                }
            },
            onKeyDown: (event: ControlEvent) => {
                const target = event.currentTarget as HTMLInputElement;
                if (target.tagName === 'INPUT' && event.key === 'Enter') {
                    field.setTouched(true);
                    field.commit(target.value);
                }
            }
        };

        return mergeProps(baseProps, elementProps, field.getInputValidationProps());
    }
}
