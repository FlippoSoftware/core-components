import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { REASONS } from '~@events/reasons';
import { mergeProps } from '~@props/mergeProps';

import type { Style, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { menuPopupStateAttributesMapping } from '../popup/menuPopupStateAttributesMapping';

import type { MenuStore } from '../store/MenuStore';

export type MenuBackdropState = {
    open: boolean;
    transitionStatus: TransitionStatus;
};

/**
 * `Menu.Backdrop`.
 */
export const MenuBackdrop = {
    getState(store: MenuStore<unknown>): MenuBackdropState {
        return { open: store.select('open'), transitionStatus: store.select('transitionStatus') };
    },
    attrs(state: MenuBackdropState) {
        return getStyleHookProps(state, menuPopupStateAttributesMapping);
    },
    getProps(store: MenuStore<unknown>, elementProps: Props = {}): Props {
        const style: Style = {
            pointerEvents: store.select('lastOpenChangeReason') === REASONS.triggerHover ? 'none' : undefined,
            userSelect: 'none',
            WebkitUserSelect: 'none'
        };
        return mergeProps({ role: 'presentation', hidden: !store.select('mounted'), style }, elementProps);
    },
    /**
     * Ref callback (context menus track their backdrop for outside presses).
     */
    setElement(store: MenuStore<unknown>, element: HTMLDivElement | null) {
        const parent = store.select('parent');
        if ((parent.type === 'context-menu' || parent.type === 'nested-context-menu') && parent.context.backdropRef) {
            parent.context.backdropRef.current = element;
        }
    }
};
