import { createEventEmitter } from '~@events/EventEmitter';
import { ComponentStore } from '~@store/ComponentStore';
import { createSelector } from '~@store/createSelector';

import type { ChangeEventDetails, FloatingOpenChangeDetails, NoCustomProperties } from '~@events/changeEventDetails';
import type { FloatingEvents } from '~@events/EventEmitter';
import type { MutableRef } from '~@lib/types';
import type { PopupTriggerMap } from '~@popup/PopupTriggerMap';

import type { ContextData, ReferenceType } from './types';

export type FloatingRootState = {
    open: boolean;
    domReferenceElement: Element | null;
    referenceElement: ReferenceType | null;
    floatingElement: HTMLElement | null;
    positionReference: ReferenceType | null;
    /**
     * The ID of the floating element.
     */
    floatingId: string | undefined;
};

export type FloatingRootStoreContext<Reason extends string = string, CustomProperties extends object = NoCustomProperties> = {
    onOpenChange: ((open: boolean, eventDetails: ChangeEventDetails<Reason, CustomProperties>) => void) | undefined;
    readonly dataRef: MutableRef<ContextData>;
    readonly events: FloatingEvents;
    nested: boolean;
    noEmit: boolean;
    readonly triggerElements: PopupTriggerMap;
};

export const floatingRootSelectors = {
    open: createSelector((state: FloatingRootState) => state.open),
    domReferenceElement: createSelector((state: FloatingRootState) => state.domReferenceElement),
    referenceElement: createSelector((state: FloatingRootState) => state.positionReference ?? state.referenceElement),
    floatingElement: createSelector((state: FloatingRootState) => state.floatingElement),
    floatingId: createSelector((state: FloatingRootState) => state.floatingId)
};

export type FloatingRootStoreOptions<Reason extends string = string, CustomProperties extends object = NoCustomProperties> = {
    open: boolean;
    referenceElement: ReferenceType | null;
    floatingElement: HTMLElement | null;
    triggerElements: PopupTriggerMap;
    floatingId: string | undefined;
    nested: boolean;
    noEmit: boolean;
    onOpenChange: ((open: boolean, eventDetails: ChangeEventDetails<Reason, CustomProperties>) => void) | undefined;
};

/**
 * Root state of a floating element: open state, reference/floating elements and the event bus
 * that interactions (dismiss, hover, focus, list navigation) use to communicate.
 */
export class FloatingRootStore<Reason extends string = string, CustomProperties extends object = NoCustomProperties> extends ComponentStore<
    Readonly<FloatingRootState>,
    FloatingRootStoreContext<Reason, CustomProperties>,
    typeof floatingRootSelectors
> {
    constructor(options: FloatingRootStoreOptions<Reason, CustomProperties>) {
        const { nested, noEmit, onOpenChange, triggerElements, ...initialState } = options;

        super(
            {
                ...initialState,
                positionReference: initialState.referenceElement,
                domReferenceElement: initialState.referenceElement as Element | null
            },
            {
                onOpenChange,
                dataRef: { current: {} },
                events: createEventEmitter(),
                nested,
                noEmit,
                triggerElements
            },
            floatingRootSelectors
        );
    }

    /**
     * Emits the `openchange` event through the internal event emitter and calls the `onOpenChange` handler with the provided arguments.
     *
     * @param newOpen The new open state.
     * @param eventDetails Details about the event that triggered the open state change.
     */
    setOpen = (newOpen: boolean, eventDetails: ChangeEventDetails<Reason, CustomProperties>) => {
        this.context.dataRef.current.openEvent = newOpen ? eventDetails.event : undefined;
        if (!this.context.noEmit) {
            const details: FloatingOpenChangeDetails = {
                open: newOpen,
                reason: eventDetails.reason,
                nativeEvent: eventDetails.event,
                nested: this.context.nested,
                triggerElement: eventDetails.trigger
            };

            this.context.events.emit('openchange', details);
        }

        this.context.onOpenChange?.(newOpen, eventDetails);
    };
}

/**
 * Alias kept for parity with the Floating UI fork.
 */
export type FloatingRootContext<Reason extends string = string> = FloatingRootStore<Reason>;
