import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { mergeProps } from '~@props/mergeProps';

import type { Align, Side, TextDirection, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { NavigationMenuPositionerMachine } from '../positioner/NavigationMenuPositionerMachine';
import type { NavigationMenuRootMachine } from '../root/NavigationMenuRootMachine';

export type NavigationMenuPopupState = {
    open: boolean;
    transitionStatus: TransitionStatus;
    side: Side;
    align: Align;
    anchorHidden: boolean;
};

/**
 * `NavigationMenu.Popup`.
 */
export const NavigationMenuPopup = {
    getState(root: NavigationMenuRootMachine, positioner: NavigationMenuPositionerMachine): NavigationMenuPopupState {
        const { side, align, anchorHidden } = positioner.getState();
        return { open: root.open, transitionStatus: root.transitions.state.transitionStatus, side, align, anchorHidden };
    },
    attrs(state: NavigationMenuPopupState) {
        return getStyleHookProps(state, { ...popupStateMapping, ...transitionStatusMapping });
    },
    getProps(id: string, positioner: NavigationMenuPositionerMachine, direction: TextDirection = 'ltr', elementProps: Props = {}): Props {
        // Ensure size transitions are anchored to `bottom` (side=top) or `right` (side=left).
        const side = positioner.getState().side;
        const isInlineStart = side === (direction === 'rtl' ? 'inline-end' : 'inline-start');
        const isOriginSide = side === 'top' || isInlineStart;
        const isPhysicalLeft = side === 'left' || isInlineStart;
        return mergeProps(
            {
                id,
                tabIndex: -1,
                style: isOriginSide
                    ? { position: 'absolute', [side === 'top' ? 'bottom' : 'top']: '0', [isPhysicalLeft ? 'right' : 'left']: '0' }
                    : {}
            },
            elementProps
        );
    },
    setElement(root: NavigationMenuRootMachine, element: HTMLElement | null) {
        root.store.set('popupElement', element);
    }
};
