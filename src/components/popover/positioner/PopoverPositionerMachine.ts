import { getDisabledMountTransitionStyles } from '~@attributes/getDisabledMountTransitionStyles';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { getInternalBackdropProps } from '~@dom/internalBackdrop';
import { REASONS } from '~@events/reasons';
import { PopupPositionerController } from '~@popup/PopupPositionerController';
import { mergeProps } from '~@props/mergeProps';

import type { Align, Side } from '~@lib/types';
import type { PopupPositionerOptions, PopupPositionerSetup } from '~@popup/PopupPositionerController';
import type { Props } from '~@props/mergeProps';

import type { PopoverState, PopoverStore } from '../store/PopoverStore';

export type PopoverPositionerState = {
    open: boolean;
    side: Side;
    align: Align;
    anchorHidden: boolean;
    instant: string | undefined;
};

export type PopoverPositionerOptions = PopupPositionerOptions;

export type PopoverPositionerSetup = Omit<PopupPositionerSetup, 'onTriggerChange'>;

/**
 * State machine of `Popover.Positioner`.
 */
export class PopoverPositionerMachine<Payload = unknown> {
    readonly store: PopoverStore<Payload>;

    readonly controller: PopupPositionerController<PopoverState<Payload>>;

    constructor(store: PopoverStore<Payload>, setup: PopoverPositionerSetup, options: PopoverPositionerOptions = {}) {
        this.store = store;
        this.controller = new PopupPositionerController(
            store,
            {
                ...setup,
                // When the current trigger element changes, enable transitions on the positioner temporarily.
                onTriggerChange: (instant) => store.set('instantType', instant)
            },
            options
        );
    }

    setOptions(options: PopoverPositionerOptions) {
        this.controller.setOptions(options);
    }

    setElement = (element: HTMLElement | null) => {
        this.controller.setElement(element);
    };

    static attrs(state: PopoverPositionerState) {
        return getStyleHookProps(state, popupStateMapping);
    }

    getState(): PopoverPositionerState {
        return { ...this.controller.getState(), instant: this.store.select('instantType') };
    }

    getPositionerProps(elementProps: Props = {}): Props {
        return mergeProps(
            this.controller.getPositionerProps(),
            getDisabledMountTransitionStyles(this.store.select('transitionStatus')),
            elementProps
        );
    }

    /**
     * Whether the adapter renders the internal backdrop (modal popovers not opened by hover or touch).
     */
    shouldRenderInternalBackdrop(): boolean {
        const { store } = this;
        return (
            store.select('mounted') &&
            store.select('modal') === true &&
            store.select('openChangeReason') !== REASONS.triggerHover &&
            store.select('openMethod') !== 'touch'
        );
    }

    /**
     * Props of the internal backdrop (`inert` while closing, the trigger cut out).
     */
    getInternalBackdropProps() {
        return getInternalBackdropProps(this.store.select('activeTriggerElement'), !this.store.select('open'));
    }

    destroy() {
        this.controller.destroy();
    }
}
