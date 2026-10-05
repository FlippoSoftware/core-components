import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';
import { mergeProps } from '~@props/mergeProps';

import type { TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { NavigationMenuRootMachine } from '../root/NavigationMenuRootMachine';

export type NavigationMenuBackdropState = {
    open: boolean;
    transitionStatus: TransitionStatus;
};

/**
 * Small parts of the navigation menu.
 */
export const NavigationMenuParts = {
    popupStateAttributesMapping: { ...popupStateMapping, ...transitionStatusMapping },
    getBackdropState(root: NavigationMenuRootMachine): NavigationMenuBackdropState {
        return { open: root.open, transitionStatus: root.transitions.state.transitionStatus };
    },
    attrs(state: NavigationMenuBackdropState) {
        return getStyleHookProps(state, NavigationMenuParts.popupStateAttributesMapping);
    },
    getBackdropProps(root: NavigationMenuRootMachine, elementProps: Props = {}): Props {
        return mergeProps(
            { role: 'presentation', hidden: !root.transitions.state.mounted, style: { userSelect: 'none', WebkitUserSelect: 'none' } },
            elementProps
        );
    },
    /**
     * `NavigationMenu.Icon`: open when its item is the active one.
     */
    getIconState(root: NavigationMenuRootMachine, itemValue: unknown): { open: boolean } {
        return { open: root.open && root.store.state.value === itemValue };
    },
    getIconProps(elementProps: Props = {}): Props {
        return mergeProps({ 'aria-hidden': true }, elementProps);
    }
};
