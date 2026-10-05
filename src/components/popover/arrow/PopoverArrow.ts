import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { mergeProps } from '~@props/mergeProps';

import type { Align, Side } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { PopoverPositionerMachine } from '../positioner/PopoverPositionerMachine';
import type { PopoverStore } from '../store/PopoverStore';

export type PopoverArrowState = {
    open: boolean;
    side: Side;
    align: Align;
    uncentered: boolean;
};

/**
 * `Popover.Arrow`: state and props derived from the positioner.
 */
export const PopoverArrow = {
    getState(store: PopoverStore<unknown>, positioner: PopoverPositionerMachine<unknown>): PopoverArrowState {
        const { side, align } = positioner.getState();
        return { open: store.select('open'), side, align, uncentered: positioner.controller.isArrowUncentered() };
    },
    attrs(state: PopoverArrowState) {
        return getStyleHookProps(state, popupStateMapping);
    },
    getProps(positioner: PopoverPositionerMachine<unknown>, elementProps: Props = {}): Props {
        return mergeProps({ style: positioner.controller.getArrowStyles(), 'aria-hidden': true }, elementProps);
    },
    /**
     * Ref callback for the arrow element.
     */
    setElement(positioner: PopoverPositionerMachine<unknown>, element: Element | null) {
        positioner.controller.setArrow(element);
    }
};
