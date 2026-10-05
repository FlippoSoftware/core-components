import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';

import type { Props } from '~@props/mergeProps';

import { MenuItemMachine } from '../item/MenuItemMachine';
import { menuItemCheckedMapping } from '../item/menuItemCheckedMapping';

import type { MenuCheckableItemState } from '../checkbox-item/MenuCheckboxItemMachine';
import type { MenuItemBaseOptions, MenuItemSetup } from '../item/MenuItemMachine';
import type { MenuRadioGroupMachine } from '../radio-group/MenuRadioGroupMachine';
import type { MenuChangeEventDetails, MenuStore } from '../store/MenuStore';
import type { ItemEvent } from '../utils/ItemEvent';

export type MenuRadioItemOptions = MenuItemBaseOptions & {
    value: unknown;
};

/**
 * State machine of `Menu.RadioItem`.
 */
export class MenuRadioItemMachine extends MenuItemMachine<MenuRadioItemOptions> {
    private readonly group: MenuRadioGroupMachine;

    constructor(store: MenuStore<unknown>, group: MenuRadioGroupMachine, options: MenuRadioItemOptions, setup: MenuItemSetup) {
        super(store, options, setup, { closeOnClick: false });
        this.group = group;
        this.button.setOptions({ disabled: this.disabled, focusableWhenDisabled: true, native: options.nativeButton ?? false });
    }

    get disabled(): boolean {
        return (this.group?.disabled ?? false) || (this.options.disabled ?? false);
    }

    get checked(): boolean {
        return this.group.value === this.options.value;
    }

    getState(): MenuCheckableItemState {
        return { ...super.getState(), checked: this.checked };
    }

    static attrs(state: MenuCheckableItemState) {
        return getStyleHookProps(state, menuItemCheckedMapping);
    }

    getRadioItemProps(elementProps: Props = {}): Props {
        return this.getItemProps(elementProps, {
            role: 'menuitemradio',
            'aria-checked': this.checked,
            onClick: (event: ItemEvent) => {
                const details = {
                    ...createChangeEventDetails(REASONS.itemPress, getNativeEvent(event as MouseEvent)),
                    preventUnmountOnClose: () => {}
                } as MenuChangeEventDetails;
                this.group.setValue(this.options.value, details);
            }
        });
    }
}
