import type { Props } from '~@props/mergeProps';

import type { DrawerStore } from '../store/DrawerStore';

/**
 * Extra props of `Drawer.Backdrop` (merged into `Dialog.Backdrop`'s props).
 */
export function getDrawerBackdropProps(store: DrawerStore): Props {
    return { ...store.select('popupDataAttributes') };
}
