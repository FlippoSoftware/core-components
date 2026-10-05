import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

import { MenuItemMachine } from '../item/MenuItemMachine';
import { menuItemCheckedMapping } from '../item/menuItemCheckedMapping';

import type { MenuItemBaseOptions, MenuItemSetup } from '../item/MenuItemMachine';
import type { MenuChangeEventDetails, MenuStore } from '../store/MenuStore';
import type { ItemEvent } from '../utils/ItemEvent';

export type MenuCheckboxItemOptions = MenuItemBaseOptions & {
    checked?: boolean | undefined;
    /**
     * @default false
     */
    defaultChecked?: boolean | undefined;
    onCheckedChange?: ((checked: boolean, eventDetails: MenuChangeEventDetails) => void) | undefined;
};

export type MenuCheckableItemState = {
    disabled: boolean;
    highlighted: boolean;
    checked: boolean;
};

/**
 * State machine of `Menu.CheckboxItem`.
 */
export class MenuCheckboxItemMachine extends MenuItemMachine<MenuCheckboxItemOptions> {
    readonly checkedStore: Store<{ checked: boolean }>;

    constructor(store: MenuStore<unknown>, options: MenuCheckboxItemOptions, setup: MenuItemSetup) {
        super(store, options, setup, { closeOnClick: false });
        this.checkedStore = new Store({ checked: options.checked ?? options.defaultChecked ?? false });
    }

    setOptions(options: MenuCheckboxItemOptions) {
        super.setOptions(options);
        if (options.checked !== undefined) {
            this.checkedStore.set('checked', options.checked);
        }
    }

    get checked(): boolean {
        return this.options.checked ?? this.checkedStore.state.checked;
    }

    getState(): MenuCheckableItemState {
        return { ...super.getState(), checked: this.checked };
    }

    static attrs(state: MenuCheckableItemState) {
        return getStyleHookProps(state, menuItemCheckedMapping);
    }

    getCheckboxItemProps(elementProps: Props = {}): Props {
        return this.getItemProps(elementProps, {
            role: 'menuitemcheckbox',
            'aria-checked': this.checked,
            onClick: (event: ItemEvent) => {
                const details = {
                    ...createChangeEventDetails(REASONS.itemPress, getNativeEvent(event as MouseEvent)),
                    preventUnmountOnClose: () => {}
                } as MenuChangeEventDetails;
                this.options.onCheckedChange?.(!this.checked, details);
                if (details.isCanceled) {
                    return;
                }
                this.checkedStore.set('checked', !this.checkedStore.state.checked);
            }
        });
    }
}
