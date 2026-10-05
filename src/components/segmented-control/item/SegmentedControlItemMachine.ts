import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { ACTIVE_COMPOSITE_ITEM } from '~@components/composite/utils/compositeKeys';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

import type { SegmentedControlMachine } from '../root/SegmentedControlMachine';

import { segmentedControlItemStateAttributesMapping } from './segmentedControlItemStateAttributesMapping';

export type SegmentedControlItemState = {
    selected: boolean;
    disabled: boolean;
};

export type SegmentedControlItemOptions = {
    value: string;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default true
     */
    nativeButton?: boolean | undefined;
};

/**
 * One segment.
 */
export class SegmentedControlItemMachine {
    readonly button: ButtonMachine;

    readonly listItem: ListRegistryItem;

    readonly store = new Store({ index: -1 });

    private options: SegmentedControlItemOptions;

    private readonly control: SegmentedControlMachine;

    constructor(control: SegmentedControlMachine, options: SegmentedControlItemOptions) {
        this.control = control;
        this.options = options;
        this.button = new ButtonMachine({ disabled: this.disabled, native: options.nativeButton ?? true });
        this.listItem = new ListRegistryItem(control.composite.registry, { onIndexChange: (index) => this.store.set('index', index) });
    }

    setOptions(options: SegmentedControlItemOptions) {
        this.options = options;
        this.button.setOptions({ disabled: this.disabled, native: options.nativeButton ?? true });
    }

    get selected() {
        return this.control.value === this.options.value;
    }

    get disabled() {
        return (this.options.disabled ?? false) || this.control.disabled;
    }

    getState(): SegmentedControlItemState {
        return { selected: this.selected, disabled: this.disabled };
    }

    static attrs(state: SegmentedControlItemState): Record<string, string> {
        return getStyleHookProps(state, segmentedControlItemStateAttributesMapping);
    }

    setElement = (element: HTMLElement | null) => {
        this.button.setElement(element);
        this.listItem.setElement(element);
    };

    getProps(elementProps: Props = {}): Props {
        const selected = this.selected;
        const disabled = this.disabled;
        return this.button.getButtonProps(
            mergeProps(
                this.control.composite.getItemProps(this.store.state.index),
                {
                    role: 'radio',
                    'aria-checked': selected,
                    'aria-disabled': disabled || undefined,
                    [ACTIVE_COMPOSITE_ITEM]: selected ? '' : undefined,
                    onClick: (event: MouseEvent) => {
                        if (this.control.readOnly || disabled || selected) {
                            return;
                        }
                        this.control.setValue(this.options.value, createChangeEventDetails(REASONS.none, getNativeEvent(event)));
                    }
                },
                elementProps
            )
        );
    }

    destroy() {
        this.listItem.destroy();
    }
}
