import { MenuItemMachine } from '../item/MenuItemMachine';

import type { MenuItemBaseOptions, MenuItemSetup } from '../item/MenuItemMachine';
import type { MenuStore } from '../store/MenuStore';

/**
 * State machine of `Menu.Item`.
 */
export class MenuRegularItemMachine extends MenuItemMachine {
    constructor(store: MenuStore<unknown>, options: MenuItemBaseOptions, setup: MenuItemSetup) {
        super(store, options, setup, { closeOnClick: true });
    }
}
