import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import { MenuItemMachine } from '../item/MenuItemMachine';

import type { MenuItemBaseOptions, MenuItemSetup } from '../item/MenuItemMachine';
import type { MenuStore } from '../store/MenuStore';

export type MenuLinkItemState = { highlighted: boolean };

/**
 * State machine of `Menu.LinkItem` (an `<a>`, not a button).
 */
export class MenuLinkItemMachine extends MenuItemMachine {
    constructor(store: MenuStore<unknown>, options: MenuItemBaseOptions, setup: MenuItemSetup) {
        super(store, options, setup, { closeOnClick: false });
    }

    getLinkState(): MenuLinkItemState {
        return { highlighted: this.highlighted };
    }

    getLinkProps(elementProps: Props = {}): Props {
        return mergeProps(this.store.select('itemProps'), elementProps, this.getCommonProps());
    }
}
