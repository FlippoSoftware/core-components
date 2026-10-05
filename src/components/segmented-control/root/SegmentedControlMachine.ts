import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { CompositeRootMachine } from '~@components/composite/root/CompositeRootMachine';
import { createDetachedField } from '~@components/field/root/FieldRootMachine';
import { NOOP } from '~@lib/noop';
import { visuallyHidden } from '~@lib/visuallyHidden';
import { contains } from '~@packages/floating-ui/utils/element';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { FieldRootMachine, FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { FieldsetMachine } from '~@components/fieldset/root/FieldsetMachine';
import type { LabelableController } from '~@components/labelable/root/LabelableController';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { REASONS } from '~@events/reasons';
import type { MutableRef, Orientation, TextDirection } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { segmentedControlStateAttributesMapping } from './segmentedControlStateAttributesMapping';

export type SegmentedControlChangeEventDetails = ChangeEventDetails<typeof REASONS.none>;

export type SegmentedControlState = FieldRootState & {
    readOnly: boolean;
    orientation: Orientation;
};

export type SegmentedControlOptions = {
    value?: string | null | undefined;
    /**
     * @default null
     */
    defaultValue?: string | null | undefined;
    onValueChange?: ((value: string, eventDetails: SegmentedControlChangeEventDetails) => void) | undefined;
    disabled?: boolean | undefined;
    readOnly?: boolean | undefined;
    required?: boolean | undefined;
    /**
     * @default 'horizontal'
     */
    orientation?: Orientation | undefined;
    /**
     * @default true
     */
    loopFocus?: boolean | undefined;
    name?: string | undefined;
    field?: FieldRootMachine | null | undefined;
    fieldset?: FieldsetMachine | null | undefined;
    labelable?: LabelableController | null | undefined;
    id: string;
    direction?: TextDirection | undefined;
};

/**
 * State machine of a segmented control: a radio group of buttons with a hidden input.
 */
export class SegmentedControlMachine {
    readonly store: Store<{ value: string | null }>;

    readonly composite: CompositeRootMachine;

    readonly controlRef: MutableRef<HTMLElement | null> = { current: null };

    private options: SegmentedControlOptions;

    private readonly detachedField = createDetachedField();

    private previousValue: string | null;

    constructor(options: SegmentedControlOptions) {
        this.options = options;
        this.store = new Store<{ value: string | null }>({ value: options.defaultValue ?? null });
        this.composite = new CompositeRootMachine(this.getCompositeOptions());
        this.previousValue = this.value;
        this.store.subscribe(() => this.onValueChanged());
    }

    setOptions(options: SegmentedControlOptions) {
        this.options = options;
        this.composite.setOptions(this.getCompositeOptions());
        this.onValueChanged();
    }

    private getCompositeOptions() {
        return { loopFocus: this.options.loopFocus ?? true, direction: this.options.direction ?? 'ltr' };
    }

    get field(): FieldRootMachine {
        return this.options.field ?? this.detachedField;
    }

    get value(): string | null {
        return this.options.value !== undefined ? this.options.value : this.store.state.value;
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

    get orientation(): Orientation {
        return this.options.orientation ?? 'horizontal';
    }

    getState(): SegmentedControlState {
        return { ...this.field.getState(), disabled: this.disabled, readOnly: this.readOnly, orientation: this.orientation };
    }

    static attrs(state: SegmentedControlState): Record<string, string> {
        return getStyleHookProps(state, segmentedControlStateAttributesMapping);
    }

    setValue = (nextValue: string, eventDetails: SegmentedControlChangeEventDetails) => {
        if (nextValue === this.value || this.readOnly) {
            return;
        }

        this.options.onValueChange?.(nextValue, eventDetails);

        if (eventDetails.isCanceled) {
            return;
        }

        if (this.options.value === undefined) {
            this.store.set('value', nextValue);
        }
    };

    registerField(): () => void {
        return this.field.registerControl({
            id: this.options.id,
            name: this.name,
            value: this.value ?? null,
            getValue: () => this.value ?? null,
            controlRef: this.controlRef,
            commit: this.field.commit
        });
    }

    setRootElement = (element: HTMLElement | null) => {
        this.controlRef.current = element;
        this.composite.setRoot(element);
    };

    getRootProps(elementProps: Props = {}): Props {
        const field = this.field;
        return mergeProps(
            this.composite.getRootProps(),
            {
                role: 'radiogroup',
                'aria-required': this.options.required || undefined,
                'aria-disabled': this.disabled || undefined,
                'aria-readonly': this.readOnly || undefined,
                'aria-orientation': this.orientation,
                'aria-labelledby': this.options.labelable?.labelId,
                onFocus: () => {
                    field.setFocused(true);
                },
                onBlur: (event: FocusEvent) => {
                    if (!contains(event.currentTarget as Element, event.relatedTarget as Element | null)) {
                        field.setTouched(true);
                        field.setFocused(false);

                        if (field.validationMode === 'onBlur') {
                            field.commit(this.value);
                        }
                    }
                },
                onKeyDownCapture: (event: KeyboardEvent) => {
                    if (event.key.startsWith('Arrow')) {
                        field.setTouched(true);
                        field.setFocused(true);
                    }
                }
            },
            field.getValidationProps,
            elementProps
        );
    }

    getInputProps(ariaLabelledBy?: string): Props {
        const value = this.value;
        const serialized = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
        return mergeProps(
            {
                value: serialized,
                id: this.options.id,
                name: serialized ? this.name : undefined,
                disabled: this.disabled,
                readOnly: this.readOnly,
                required: this.options.required,
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
        const value = this.value;
        if (value === this.previousValue) {
            return;
        }
        this.previousValue = value;

        const field = this.field;
        field.form.clearErrors(this.name);
        field.setDirty(value !== field.validityData.initialValue);
        field.setFilled(value != null);

        if (field.shouldValidateOnChange()) {
            field.commit(value);
        } else {
            field.commit(value, true);
        }
    }
}
