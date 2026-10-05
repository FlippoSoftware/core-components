import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { CompositeRootMachine } from '~@components/composite/root/CompositeRootMachine';
import { Store } from '~@store/Store';

import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { REASONS } from '~@events/reasons';
import type { Orientation, TextDirection } from '~@lib/types';

import { toggleGroupStateAttributesMapping } from './toggleGroupStateAttributesMapping';

export type ToggleGroupChangeEventDetails = ChangeEventDetails<typeof REASONS.none>;

export type ToggleGroupOptions = {
    value?: readonly string[] | undefined;
    defaultValue?: readonly string[] | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default true
     */
    loopFocus?: boolean | undefined;
    /**
     * @default 'horizontal'
     */
    orientation?: Orientation | undefined;
    /**
     * @default false
     */
    multiple?: boolean | undefined;
    onValueChange?: ((value: string[], eventDetails: ToggleGroupChangeEventDetails) => void) | undefined;
    /**
     * Whether a parent toolbar is disabled.
     */
    toolbarDisabled?: boolean | undefined;
    /**
     * Whether the group is inside a toolbar (the toolbar then owns the composite navigation).
     */
    inToolbar?: boolean | undefined;
    direction?: TextDirection | undefined;
};

export type ToggleGroupState = {
    disabled: boolean;
    multiple: boolean;
    orientation: Orientation;
};

const EMPTY_VALUE: readonly string[] = [];

/**
 * State machine of a toggle group: the set of pressed toggle values.
 */
export class ToggleGroupMachine {
    /**
     * Internal (uncontrolled) value.
     */
    readonly store: Store<{ value: readonly string[] }>;

    /**
     * Arrow-key navigation between the toggles (unused inside a toolbar).
     */
    readonly composite: CompositeRootMachine;

    private options: ToggleGroupOptions;

    constructor(options: ToggleGroupOptions = {}) {
        this.options = options;
        this.store = new Store({ value: options.value === undefined ? (options.defaultValue ?? []) : EMPTY_VALUE });
        this.composite = new CompositeRootMachine(this.getCompositeOptions());
    }

    setOptions(options: ToggleGroupOptions) {
        this.options = options;
        this.composite.setOptions(this.getCompositeOptions());
    }

    private getCompositeOptions() {
        return {
            loopFocus: this.options.loopFocus ?? true,
            orientation: this.options.orientation ?? 'horizontal',
            direction: this.options.direction ?? 'ltr'
        };
    }

    /**
     * Props of the group element.
     */
    getRootProps() {
        return this.options.inToolbar ? { role: 'group' } : { ...this.composite.getRootProps(), role: 'group' };
    }

    destroy() {
        this.composite.destroy();
    }

    /**
     * Current value (controlled or internal).
     */
    get value(): readonly string[] {
        return this.options.value ?? this.store.state.value ?? EMPTY_VALUE;
    }

    getState(): ToggleGroupState {
        const { disabled = false, toolbarDisabled = false, multiple = false, orientation = 'horizontal' } = this.options;
        return { disabled: toolbarDisabled || disabled, multiple, orientation };
    }

    /**
     * Whether a toggle with `value` is pressed.
     */
    isPressed(value: string) {
        return this.value.includes(value);
    }

    /**
     * Called by a toggle when its pressed state changes.
     */
    setGroupValue = (newValue: string, nextPressed: boolean, eventDetails: ToggleGroupChangeEventDetails) => {
        const groupValue = this.value;
        let newGroupValue: string[];
        if (this.options.multiple) {
            newGroupValue = groupValue.slice();
            if (nextPressed) {
                newGroupValue.push(newValue);
            } else {
                newGroupValue.splice(groupValue.indexOf(newValue), 1);
            }
        } else {
            newGroupValue = nextPressed ? [newValue] : [];
        }

        this.options.onValueChange?.(newGroupValue, eventDetails);

        if (eventDetails.isCanceled) {
            return;
        }

        if (this.options.value === undefined) {
            this.store.set('value', newGroupValue);
        }
    };

    static rootAttrs(state: ToggleGroupState): Record<string, string> {
        return { role: 'group', ...getStyleHookProps(state, toggleGroupStateAttributesMapping) };
    }
}
