import { getDisabledMountTransitionStyles } from '~@attributes/getDisabledMountTransitionStyles';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { PopupPositionerController } from '~@popup/PopupPositionerController';
import { mergeProps } from '~@props/mergeProps';

import type { Align, Side } from '~@lib/types';
import type { PopupPositionerOptions } from '~@popup/PopupPositionerController';
import type { Props } from '~@props/mergeProps';

import type { TooltipRootMachine } from '../root/TooltipRootMachine';
import type { TooltipState } from '../store/TooltipStore';

export type TooltipPositionerState = {
    open: boolean;
    side: Side;
    align: Align;
    anchorHidden: boolean;
    instant: string | undefined;
};

export type TooltipArrowState = {
    open: boolean;
    side: Side;
    align: Align;
    uncentered: boolean;
};

/**
 * State machine of `Tooltip.Positioner` (default side: `top`).
 */
export class TooltipPositionerMachine<Payload = unknown> {
    readonly controller: PopupPositionerController<TooltipState<Payload>>;

    private readonly root: TooltipRootMachine<Payload>;

    constructor(root: TooltipRootMachine<Payload>, options: PopupPositionerOptions = {}) {
        this.root = root;
        this.controller = new PopupPositionerController(root.store, { getOpen: () => root.getOpenState() }, withDefaults(options));
    }

    setOptions(options: PopupPositionerOptions) {
        this.controller.setOptions(withDefaults(options));
    }

    setElement = (element: HTMLElement | null) => {
        this.controller.setElement(element);
    };

    static attrs(state: TooltipPositionerState) {
        return getStyleHookProps(state, popupStateMapping);
    }

    getState(): TooltipPositionerState {
        const { store } = this.root;
        return {
            ...this.controller.getState(),
            instant: store.select('trackCursorAxis') !== 'none' ? 'tracking-cursor' : store.select('instantType')
        };
    }

    getPositionerProps(elementProps: Props = {}): Props {
        const { store } = this.root;
        const props = this.controller.getPositionerProps();
        if (store.select('trackCursorAxis') === 'both' || store.select('disableHoverablePopup')) {
            props.style.pointerEvents = 'none';
        }
        return mergeProps(props, getDisabledMountTransitionStyles(store.select('transitionStatus')), elementProps);
    }

    getArrowState(): TooltipArrowState {
        const { side, align, open } = this.controller.getState();
        return { open, side, align, uncentered: this.controller.isArrowUncentered() };
    }

    getArrowProps(elementProps: Props = {}): Props {
        return mergeProps({ style: this.controller.getArrowStyles(), 'aria-hidden': true }, elementProps);
    }

    destroy() {
        this.controller.destroy();
    }
}

function withDefaults(options: PopupPositionerOptions): PopupPositionerOptions {
    return { ...options, side: options.side ?? 'top' };
}
