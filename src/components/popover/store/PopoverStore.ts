import { REASONS } from '~@events/reasons';
import { PATIENT_CLICK_THRESHOLD } from '~@lib/constants';
import { createRef } from '~@lib/ref';
import { PopupTriggerMap } from '~@popup/PopupTriggerMap';
import { createInitialPopupStoreState, popupStoreSelectors } from '~@popup/popupStoreState';
import { ComponentStore } from '~@store/ComponentStore';
import { createSelector } from '~@store/createSelector';
import { Timeout } from '~@timers/Timeout';

import type { FloatingOpenChangeDetails, PopupChangeEventDetails } from '~@events/changeEventDetails';
import type { Interaction, MutableRef } from '~@lib/types';
import type { PopupStoreContext, PopupStoreState } from '~@popup/popupStoreState';

export type PopoverChangeEventReason =
    | typeof REASONS.triggerHover
    | typeof REASONS.triggerFocus
    | typeof REASONS.triggerPress
    | typeof REASONS.outsidePress
    | typeof REASONS.escapeKey
    | typeof REASONS.closePress
    | typeof REASONS.focusOut
    | typeof REASONS.imperativeAction
    | typeof REASONS.none;

export type PopoverChangeEventDetails = PopupChangeEventDetails<PopoverChangeEventReason>;

export type PopoverState<Payload> = PopupStoreState<Payload> & {
    disabled: boolean;
    instantType: 'dismiss' | 'click' | 'focus' | 'trigger-change' | undefined;
    modal: boolean | 'trap-focus';
    openMethod: Interaction | null;
    openChangeReason: PopoverChangeEventReason | null;
    stickIfOpen: boolean;
    nested: boolean;
    titleElementId: string | undefined;
    descriptionElementId: string | undefined;
    openOnHover: boolean;
    closeDelay: number;
};

export type PopoverContext = PopupStoreContext<PopoverChangeEventDetails> & {
    readonly backdropRef: MutableRef<HTMLDivElement | null>;
    readonly internalBackdropRef: MutableRef<HTMLDivElement | null>;
    readonly triggerFocusTargetRef: MutableRef<HTMLElement | null>;
    readonly beforeContentFocusGuardRef: MutableRef<HTMLElement | null>;
    readonly stickIfOpenTimeout: Timeout;
    /**
     * Runs a state change synchronously in the adapter's renderer.
     * Hover-triggered changes go through it so that `getAnimations()` sees the new state.
     * React adapters set it to `ReactDOM.flushSync`.
     */
    flushSync: (fn: () => void) => void;
};

function createInitialState<Payload>(): PopoverState<Payload> {
    return {
        ...createInitialPopupStoreState<Payload>(),
        disabled: false,
        modal: false,
        instantType: undefined,
        openMethod: null,
        openChangeReason: null,
        titleElementId: undefined,
        descriptionElementId: undefined,
        stickIfOpen: true,
        nested: false,
        openOnHover: false,
        closeDelay: 0
    };
}

type S = PopoverState<unknown>;

export const popoverSelectors = {
    ...popupStoreSelectors,
    disabled: createSelector((state: S) => state.disabled),
    instantType: createSelector((state: S) => state.instantType),
    openMethod: createSelector((state: S) => state.openMethod),
    openChangeReason: createSelector((state: S) => state.openChangeReason),
    modal: createSelector((state: S) => state.modal),
    stickIfOpen: createSelector((state: S) => state.stickIfOpen),
    titleElementId: createSelector((state: S) => state.titleElementId),
    descriptionElementId: createSelector((state: S) => state.descriptionElementId),
    openOnHover: createSelector((state: S) => state.openOnHover),
    closeDelay: createSelector((state: S) => state.closeDelay)
};

export type PopoverSelectors = typeof popoverSelectors;

/**
 * State machine of a popover.
 */
export class PopoverStore<Payload = unknown> extends ComponentStore<Readonly<PopoverState<Payload>>, PopoverContext, PopoverSelectors> {
    constructor(initialState?: Partial<PopoverState<Payload>>) {
        const initial = { ...createInitialState<Payload>(), ...initialState };

        if (initial.open && initialState?.mounted === undefined) {
            initial.mounted = true;
        }

        super(
            initial,
            {
                popupRef: createRef<HTMLElement>(),
                backdropRef: createRef<HTMLDivElement>(),
                internalBackdropRef: createRef<HTMLDivElement>(),
                onOpenChange: undefined,
                onOpenChangeComplete: undefined,
                triggerFocusTargetRef: createRef<HTMLElement>(),
                beforeContentFocusGuardRef: createRef<HTMLElement>(),
                stickIfOpenTimeout: new Timeout(),
                triggerElements: new PopupTriggerMap(),
                flushSync: (fn) => fn()
            },
            popoverSelectors
        );
    }

    setOpen = (nextOpen: boolean, eventDetails: Omit<PopoverChangeEventDetails, 'preventUnmountOnClose'>) => {
        const isHover = eventDetails.reason === REASONS.triggerHover;
        const isKeyboardClick = eventDetails.reason === REASONS.triggerPress && (eventDetails.event as MouseEvent).detail === 0;
        const isDismissClose = !nextOpen && (eventDetails.reason === REASONS.escapeKey || eventDetails.reason == null);

        const details = eventDetails as PopoverChangeEventDetails;
        details.preventUnmountOnClose = () => {
            this.set('preventUnmountingOnClose', true);
        };

        this.context.onOpenChange?.(nextOpen, details);

        if (details.isCanceled) {
            return;
        }

        const floatingDetails: FloatingOpenChangeDetails = {
            open: nextOpen,
            nativeEvent: details.event,
            reason: details.reason,
            nested: this.state.nested,
            triggerElement: details.trigger
        };

        this.state.floatingRootContext.context.events?.emit('openchange', floatingDetails);

        const changeState = () => {
            const updatedState: Partial<PopoverState<Payload>> = {
                open: nextOpen,
                openChangeReason: details.reason
            };

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
            // Only allow "patient" clicks to close the popover if it's open.
            // If they clicked within 500ms of the popover opening, keep it open.
            this.set('stickIfOpen', true);
            this.context.stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
                this.set('stickIfOpen', false);
            });

            this.context.flushSync(changeState);
        } else {
            changeState();
        }

        if (isKeyboardClick || isDismissClose) {
            this.set('instantType', isKeyboardClick ? 'click' : 'dismiss');
        } else if (details.reason === REASONS.focusOut) {
            this.set('instantType', 'focus');
        } else {
            this.set('instantType', undefined);
        }
    };

    /**
     * Clears pending timers. Call when the popover root is destroyed.
     */
    destroy() {
        this.context.stickIfOpenTimeout.clear();
    }
}
