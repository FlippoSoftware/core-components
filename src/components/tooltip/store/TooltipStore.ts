import { REASONS } from '~@events/reasons';
import { createRef } from '~@lib/ref';
import { PopupTriggerMap } from '~@popup/PopupTriggerMap';
import { createInitialPopupStoreState, popupStoreSelectors } from '~@popup/popupStoreState';
import { ComponentStore } from '~@store/ComponentStore';
import { createSelector } from '~@store/createSelector';

import type { PopupChangeEventDetails } from '~@events/changeEventDetails';
import type { PopupStoreContext, PopupStoreState } from '~@popup/popupStoreState';

export type TooltipChangeEventReason =
    | typeof REASONS.triggerHover
    | typeof REASONS.triggerFocus
    | typeof REASONS.triggerPress
    | typeof REASONS.outsidePress
    | typeof REASONS.escapeKey
    | typeof REASONS.disabled
    | typeof REASONS.imperativeAction
    | typeof REASONS.none;

export type TooltipChangeEventDetails = PopupChangeEventDetails<
    TooltipChangeEventReason,
    {
        multipleItemIndex?: number | null;
    }
>;

export type TooltipState<Payload> = PopupStoreState<Payload> & {
    disabled: boolean;
    instantType: 'delay' | 'dismiss' | 'focus' | undefined;
    isInstantPhase: boolean;
    trackCursorAxis: 'none' | 'x' | 'y' | 'both';
    disableHoverablePopup: boolean;
    openChangeReason: TooltipChangeEventReason | null;
    closeDelay: number;
    multipleItemRef: ((node: HTMLElement | null) => void) | null;
    multipleItemIndex: number | null;
};

export type TooltipContext = PopupStoreContext<TooltipChangeEventDetails> & {
    /**
     * Runs a state change synchronously in the adapter's renderer.
     * Hover-triggered changes go through it so that `getAnimations()` sees the new state.
     * React adapters set it to `ReactDOM.flushSync`.
     */
    flushSync: (fn: () => void) => void;
};

type S = TooltipState<unknown>;

export const tooltipSelectors = {
    ...popupStoreSelectors,
    disabled: createSelector((state: S) => state.disabled),
    instantType: createSelector((state: S) => state.instantType),
    isInstantPhase: createSelector((state: S) => state.isInstantPhase),
    trackCursorAxis: createSelector((state: S) => state.trackCursorAxis),
    disableHoverablePopup: createSelector((state: S) => state.disableHoverablePopup),
    lastOpenChangeReason: createSelector((state: S) => state.openChangeReason),
    closeDelay: createSelector((state: S) => state.closeDelay),
    multipleItemRef: createSelector((state: S) => state.multipleItemRef),
    multipleItemIndex: createSelector((state: S) => state.multipleItemIndex)
};

export type TooltipSelectors = typeof tooltipSelectors;

function createInitialState<Payload>(): TooltipState<Payload> {
    return {
        ...createInitialPopupStoreState<Payload>(),
        disabled: false,
        instantType: undefined,
        isInstantPhase: true,
        trackCursorAxis: 'none',
        disableHoverablePopup: false,
        openChangeReason: null,
        closeDelay: 0,
        multipleItemRef: null,
        multipleItemIndex: null
    };
}

/**
 * State machine of a tooltip.
 */
export class TooltipStore<Payload = unknown> extends ComponentStore<Readonly<TooltipState<Payload>>, TooltipContext, TooltipSelectors> {
    constructor(initialState?: Partial<TooltipState<Payload>>) {
        super(
            { ...createInitialState<Payload>(), ...initialState },
            {
                popupRef: createRef<HTMLElement>(),
                onOpenChange: undefined,
                onOpenChangeComplete: undefined,
                triggerElements: new PopupTriggerMap(),
                flushSync: (fn) => fn()
            },
            tooltipSelectors
        );
    }

    /**
     * Changes the open state. Inside a {@link TooltipMultipleStore} group this method is replaced
     * by the group's `setOpen` while the tooltip is registered.
     */
    public setOpen = (nextOpen: boolean, eventDetails: Omit<TooltipChangeEventDetails, 'preventUnmountOnClose'>) => {
        const reason = eventDetails.reason;

        const isHover = reason === REASONS.triggerHover;
        const isFocusOpen = nextOpen && reason === REASONS.triggerFocus;
        const isDismissClose = !nextOpen && (reason === REASONS.triggerPress || reason === REASONS.escapeKey);

        const details = eventDetails as TooltipChangeEventDetails;
        details.preventUnmountOnClose = () => {
            this.set('preventUnmountingOnClose', true);
        };

        this.context.onOpenChange?.(nextOpen, details);

        if (details.isCanceled) {
            return;
        }

        const changeState = () => {
            const updatedState: Partial<TooltipState<Payload>> = { open: nextOpen, openChangeReason: reason };

            if (isFocusOpen) {
                updatedState.instantType = 'focus';
            } else if (isDismissClose) {
                updatedState.instantType = 'dismiss';
            } else if (reason === REASONS.triggerHover) {
                updatedState.instantType = undefined;
            }

            // If a popup is closing, the `trigger` may be null.
            // We want to keep the previous value so that exit animations are played and focus is returned correctly.
            const newTriggerId = details.trigger?.id ?? null;
            if (newTriggerId || nextOpen) {
                updatedState.activeTriggerId = newTriggerId;
                updatedState.activeTriggerElement = details.trigger ?? null;
            }

            this.update(updatedState);
        };

        if (isHover) {
            // If a hover reason is provided, we need to flush the state synchronously. This ensures
            // `node.getAnimations()` knows about the new state.
            this.context.flushSync(changeState);
        } else {
            changeState();
        }
    };
}
