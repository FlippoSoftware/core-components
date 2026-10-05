import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

import type { MenuChangeEventDetails } from '../store/MenuStore';

export type MenuRadioGroupOptions = {
    value?: unknown;
    defaultValue?: unknown;
    onValueChange?: ((value: unknown, eventDetails: MenuChangeEventDetails) => void) | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
};

/**
 * State machine of `Menu.RadioGroup`.
 */
export class MenuRadioGroupMachine {
    readonly store: Store<{ value: unknown }>;

    private options: MenuRadioGroupOptions;

    constructor(options: MenuRadioGroupOptions = {}) {
        this.options = options;
        this.store = new Store<{ value: unknown }>({ value: options.value !== undefined ? options.value : options.defaultValue });
    }

    setOptions(options: MenuRadioGroupOptions) {
        this.options = options;
        if (options.value !== undefined) {
            this.store.set('value', options.value);
        }
    }

    get value(): unknown {
        return this.options.value !== undefined ? this.options.value : this.store.state.value;
    }

    get disabled(): boolean {
        return this.options.disabled ?? false;
    }

    setValue = (value: unknown, eventDetails: MenuChangeEventDetails) => {
        this.options.onValueChange?.(value, eventDetails);
        if (eventDetails.isCanceled) {
            return;
        }
        this.store.set('value', value);
    };

    getState(): { disabled: boolean } {
        return { disabled: this.disabled };
    }

    getGroupProps(elementProps: Props = {}): Props {
        return mergeProps({ role: 'group', 'aria-disabled': this.disabled || undefined }, elementProps);
    }
}
