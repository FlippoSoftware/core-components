import { EMPTY_OBJECT } from '~@lib/constants';
import { getEmptyRootContext } from '~@packages/floating-ui/getEmptyRootContext';
import { createSelector } from '~@store/createSelector';

import type { ElementProps, MutableRef, TransitionStatus } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';

import type { PopupTriggerMap } from './PopupTriggerMap';

/**
 * State common to all popup stores.
 */
export type PopupStoreState<Payload> = {
    /**
     * Whether the popup is open.
     */
    open: boolean;
    /**
     * Whether the popup is open (external prop).
     */
    readonly openProp: boolean | undefined;
    /**
     * Whether the popup should be mounted in the DOM.
     * This usually follows `open` but can be different during exit transitions.
     */
    mounted: boolean;
    /**
     * The current enter/exit transition status of the popup.
     */
    transitionStatus: TransitionStatus;

    floatingRootContext: FloatingRootStore;
    /**
     * Whether to prevent unmounting the popup when closed.
     * Useful for interacting with JS animation libraries that control unmounting themselves.
     */
    preventUnmountingOnClose: boolean;

    /**
     * Optional payload set by the trigger.
     */
    payload: Payload | undefined;

    /**
     * ID of the currently active trigger.
     */
    activeTriggerId: string | null;
    /**
     * The currently active trigger DOM element.
     */
    activeTriggerElement: HTMLElement | null;
    /**
     * ID of the trigger (external prop).
     */
    readonly triggerIdProp: string | null | undefined;
    /**
     * The popup DOM element.
     */
    popupElement: HTMLElement | null;
    /**
     * The positioner DOM element.
     */
    positionerElement: HTMLElement | null;

    /**
     * Props to spread onto the active trigger element.
     */
    activeTriggerProps: ElementProps;
    /**
     * Props to spread onto inactive trigger elements.
     */
    inactiveTriggerProps: ElementProps;
    /**
     * Props to spread onto the popup element.
     */
    popupProps: ElementProps;

    /**
     * ID of the primary trigger used for positioning when opened via sync (e.g., TooltipMultiple).
     * When activeTriggerId is null but primaryTriggerId is set, the primary trigger is used.
     */
    primaryTriggerId: string | null;
};

export function createInitialPopupStoreState<Payload>(): PopupStoreState<Payload> {
    return {
        open: false,
        openProp: undefined,
        mounted: false,
        transitionStatus: 'idle',
        floatingRootContext: getEmptyRootContext(),
        preventUnmountingOnClose: false,
        payload: undefined,
        activeTriggerId: null,
        activeTriggerElement: null,
        triggerIdProp: undefined,
        popupElement: null,
        positionerElement: null,
        activeTriggerProps: EMPTY_OBJECT as ElementProps,
        inactiveTriggerProps: EMPTY_OBJECT as ElementProps,
        popupProps: EMPTY_OBJECT as ElementProps,
        primaryTriggerId: null
    };
}

export type PopupStoreContext<ChangeEventDetails> = {
    /**
     * Map of registered trigger elements.
     */
    readonly triggerElements: PopupTriggerMap;
    /**
     * Reference to the popup element.
     */
    readonly popupRef: MutableRef<HTMLElement | null>;
    /**
     * Callback fired when the open state changes.
     */
    onOpenChange?: ((open: boolean, eventDetails: ChangeEventDetails) => void) | undefined;
    /**
     * Callback fired when the open state change animation completes.
     */
    onOpenChangeComplete: ((open: boolean) => void) | undefined;
};

type S = PopupStoreState<unknown>;

const activeTriggerIdSelector = createSelector((state: S) => state.triggerIdProp ?? state.activeTriggerId);

export const popupStoreSelectors = {
    open: createSelector((state: S) => state.openProp ?? state.open),
    mounted: createSelector((state: S) => state.mounted),
    transitionStatus: createSelector((state: S) => state.transitionStatus),
    floatingRootContext: createSelector((state: S) => state.floatingRootContext),
    preventUnmountingOnClose: createSelector((state: S) => state.preventUnmountingOnClose),
    payload: createSelector((state: S) => state.payload),

    activeTriggerId: activeTriggerIdSelector,
    activeTriggerElement: createSelector((state: S) => (state.mounted ? state.activeTriggerElement : null)),
    /**
     * Whether the trigger with the given ID was used to open the popup.
     */
    isTriggerActive: createSelector(
        (state: S, triggerId: string | undefined) => triggerId !== undefined && activeTriggerIdSelector(state) === triggerId
    ),
    /**
     * Whether the popup is open and was activated by a trigger with the given ID.
     */
    isOpenedByTrigger: createSelector(
        (state: S, triggerId: string | undefined) => triggerId !== undefined && activeTriggerIdSelector(state) === triggerId && state.open
    ),
    /**
     * Whether the popup is mounted and was activated by a trigger with the given ID.
     */
    isMountedByTrigger: createSelector(
        (state: S, triggerId: string | undefined) =>
            triggerId !== undefined && activeTriggerIdSelector(state) === triggerId && state.mounted
    ),

    triggerProps: createSelector((state: S, isActive: boolean) => (isActive ? state.activeTriggerProps : state.inactiveTriggerProps)),
    popupProps: createSelector((state: S) => state.popupProps),

    popupElement: createSelector((state: S) => state.popupElement),
    positionerElement: createSelector((state: S) => state.positionerElement),

    primaryTriggerId: createSelector((state: S) => state.primaryTriggerId)
};

export type PopupStoreSelectors = typeof popupStoreSelectors;
