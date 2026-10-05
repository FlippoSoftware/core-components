import { mergeProps } from '~@props/mergeProps';

import type { Style } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { DrawerStore } from '../store/DrawerStore';

import { DrawerPopupCssVars } from './DrawerPopupCssVars';
import { DrawerPopupStateAttributes } from './DrawerPopupStateAttributes';

/**
 * Extra props of `Drawer.Popup` (merged into `Dialog.Popup`'s props).
 */
export function getDrawerPopupProps(store: DrawerStore, elementProps: Props = {}): Props {
    const dragging = store.select('isDragging');
    const style: Style = store.select('shouldDrag')
        ? { ...store.select('popupStyle'), [DrawerPopupCssVars.dragOffset]: `${store.select('dragOffset')}px` }
        : {};

    return mergeProps(elementProps, {
        style,
        ...(dragging ? { [DrawerPopupStateAttributes.dragging]: '' } : null),
        [DrawerPopupStateAttributes.direction]: store.select('direction'),
        ...store.select('popupDataAttributes')
    });
}
