import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { ComponentStore } from '~@store/ComponentStore';
import { createSelector } from '~@store/createSelector';

import type { TooltipChangeEventDetails, TooltipChangeEventReason, TooltipStore } from './TooltipStore';

export type TooltipMultipleState = {
    /**
     * Shared open state for all tooltips in the group.
     */
    open: boolean;
    /**
     * The index of the active tooltip in the group.
     */
    activeIndex: number | null;
};

export type TooltipMultipleContext = {
    /**
     * Set of registered tooltip stores.
     * Provides access to each tooltip's triggers and popups.
     */
    stores: Set<TooltipStore<unknown>>;
    /**
     * Original setOpen functions for each store (before override).
     */
    originalSetOpenMap: WeakMap<TooltipStore<unknown>, TooltipStore<unknown>['setOpen']>;
    /**
     * Set of registered popup elements.
     */
    popupElements: Set<HTMLElement>;
    /**
     * Callback when open state changes.
     */
    onOpenChange?: ((open: boolean, eventDetails: TooltipChangeEventDetails) => void) | undefined;
};

export const tooltipMultipleSelectors = {
    open: createSelector((state: TooltipMultipleState) => state.open),
    activeIndex: createSelector((state: TooltipMultipleState) => state.activeIndex)
};

export type TooltipMultipleSelectors = typeof tooltipMultipleSelectors;

/**
 * Store that manages shared open state for multiple tooltips.
 * Registers tooltip stores to provide access to all triggers and popups
 * for safePolygon tracking.
 */
export class TooltipMultipleStore extends ComponentStore<Readonly<TooltipMultipleState>, TooltipMultipleContext, TooltipMultipleSelectors> {
    constructor(defaultOpen = false) {
        super(
            { open: defaultOpen, activeIndex: null },
            {
                stores: new Set(),
                originalSetOpenMap: new WeakMap(),
                popupElements: new Set()
            },
            tooltipMultipleSelectors
        );
    }

    /**
     * Sets the shared open state and syncs all registered stores.
     */
    public setOpen = (nextOpen: boolean, eventDetails: Omit<TooltipChangeEventDetails, 'preventUnmountOnClose'>): void => {
        if (this.state.open === nextOpen) {
            return;
        }

        // Notify callback
        const details = eventDetails as TooltipChangeEventDetails;
        details.preventUnmountOnClose = () => {};
        this.context.onOpenChange?.(nextOpen, details);

        if (details.isCanceled) {
            return;
        }

        // Update shared state
        this.set('open', nextOpen);

        if (details.multipleItemIndex !== undefined) {
            this.set('activeIndex', details.multipleItemIndex);
        }
    };

    /**
     * Registers a tooltip store with this multiple group.
     * The store's setOpen is overridden to sync with the group.
     */
    public registerStore = (store: TooltipStore<unknown>): (() => void) => {
        if (this.context.stores.has(store)) {
            return () => {};
        }

        // Save original setOpen
        this.context.originalSetOpenMap.set(store, store.setOpen);
        this.context.stores.add(store);

        // Override setOpen to sync through this store
        store.setOpen = this.setOpen;

        // Sync initial state to match Multiple's open state
        this.syncStoreOpenState(store, this.state.open);

        // Return cleanup function
        return () => {
            this.unregisterStore(store);
        };
    };

    /**
     * Syncs a single store's open state with the given value.
     */
    private readonly syncStoreOpenState = (store: TooltipStore<unknown>, open: boolean): void => {
        const originalSetOpen = this.context.originalSetOpenMap.get(store);
        if (!originalSetOpen) {
            return;
        }

        // Only sync if store's open state differs
        if (store.select('open') === open) {
            return;
        }

        const primaryTriggerId = store.select('primaryTriggerId');
        const primaryTriggerElement = primaryTriggerId
            ? (store.context.triggerElements.getById(primaryTriggerId) as HTMLElement | undefined)
            : undefined;

        const details = createChangeEventDetails(REASONS.none as TooltipChangeEventReason) as TooltipChangeEventDetails;
        details.preventUnmountOnClose = () => {
            store.set('preventUnmountingOnClose', true);
        };
        details.trigger = primaryTriggerElement;

        originalSetOpen(open, details);
    };

    /**
     * Registers a popup element for hover tracking.
     */
    public registerPopup = (element: HTMLElement): void => {
        this.context.popupElements.add(element);
    };

    /**
     * Unregisters a popup element.
     */
    public unregisterPopup = (element: HTMLElement): void => {
        this.context.popupElements.delete(element);
    };

    /**
     * Unregisters a tooltip store from this multiple group.
     */
    public unregisterStore = (store: TooltipStore<unknown>): void => {
        const originalSetOpen = this.context.originalSetOpenMap.get(store);
        if (originalSetOpen) {
            store.setOpen = originalSetOpen;
        }

        this.context.originalSetOpenMap.delete(store);
        this.context.stores.delete(store);
    };

    /**
     * Gets all trigger elements from all registered tooltips.
     */
    public getAllTriggerElements = (): HTMLElement[] => {
        const triggers: HTMLElement[] = [];
        for (const store of this.context.stores) {
            for (const [, element] of store.context.triggerElements.entries()) {
                triggers.push(element as HTMLElement);
            }
        }

        return triggers;
    };

    /**
     * Gets all popup elements from all registered tooltips.
     */
    public getAllPopupElements = (): HTMLElement[] => {
        const popups: HTMLElement[] = [];
        for (const store of this.context.stores) {
            const popupElement = store.select('popupElement');
            if (popupElement) {
                popups.push(popupElement);
            }
        }
        return popups;
    };

    /**
     * Checks if an element is a trigger or popup in this group.
     */
    public isElementInGroup = (element: Element | null): boolean => {
        if (!element) {
            return false;
        }

        for (const store of this.context.stores) {
            // Check triggers
            if (store.context.triggerElements.hasElement(element)) {
                return true;
            }
            // Check if inside a trigger
            if (store.context.triggerElements.hasMatchingElement((el) => el.contains(element))) {
                return true;
            }
            // Check popup
            const popupElement = store.select('popupElement');
            if (popupElement && (popupElement === element || popupElement.contains(element))) {
                return true;
            }
        }

        return false;
    };
}

/**
 * Open state of a tooltip: inside a group, the group's shared state wins.
 * Framework-agnostic replacement for `TooltipStore#useOpen`.
 */
export function selectTooltipOpen(store: TooltipStore<unknown>, multiple: TooltipMultipleStore | null): boolean {
    return multiple ? multiple.select('open') : store.select('open');
}

/**
 * Whether the tooltip is the active one of its group.
 * Framework-agnostic replacement for `TooltipStore#useMultipleActive`.
 */
export function selectTooltipMultipleActive(store: TooltipStore<unknown>, multiple: TooltipMultipleStore | null): boolean {
    return multiple ? store.select('multipleItemIndex') === multiple.select('activeIndex') : false;
}
