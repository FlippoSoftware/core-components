import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';

import { createPopupFloatingRoot } from './createPopupFloatingRoot';
import { PopupTransitions } from './PopupTransitions';
import { ensureImplicitActiveTrigger } from './popupTriggers';

import type { PopupStoreState } from './popupStoreState';
import type { AnyPopupStore } from './popupTriggers';

export type PopupRootControllerOptions = {
    /**
     * Controlled open state.
     */
    open?: boolean | undefined;
    /**
     * Controlled active trigger ID.
     */
    triggerId?: string | null | undefined;
    onOpenChange?: ((open: boolean, eventDetails: never) => void) | undefined;
    onOpenChangeComplete?: ((open: boolean) => void) | undefined;
};

export type PopupRootControllerSetup<Reason extends string> = {
    /**
     * Changes the open state (usually the store's `setOpen`); also used by the floating root.
     */
    setOpen: (open: boolean, eventDetails: ChangeEventDetails<Reason>) => void;
    floatingId?: string | undefined;
    /**
     * Whether the popup is nested in another floating element.
     * @default false
     */
    nested?: boolean | undefined;
    /**
     * @default false
     */
    noEmit?: boolean | undefined;
    /**
     * @default false
     */
    treatPopupAsFloatingElement?: boolean | undefined;
    /**
     * Wraps the unmount after exit animations (`ReactDOM.flushSync` in React).
     */
    flush?: ((fn: () => void) => void) | undefined;
    /**
     * Called after the popup is unmounted.
     */
    onUnmount?: (() => void) | undefined;
    /**
     * Reads the open state followed by transitions (e.g. `!disabled && open`); defaults to the store's.
     */
    getTransitionOpen?: (() => boolean) | undefined;
    /**
     * Reads the open state used to pick an implicit active trigger (e.g. a group's); defaults to the store's.
     */
    getTriggerOpen?: (() => boolean) | undefined;
    /**
     * Called whenever the popup store changes (after the controller's own updates).
     */
    onChange?: (() => void) | undefined;
};

/**
 * The parts of a popup root shared by every popup (popover, dialog, menu, tooltip, select…):
 * controlled `open`/`triggerId`, callbacks, the synced floating root, mount/transition status
 * and the implicit active trigger.
 *
 * Component root machines compose it and add their own interactions.
 */
export class PopupRootController<State extends PopupStoreState<unknown>, Reason extends string = string> {
    readonly floatingRoot: FloatingRootStore<Reason>;

    readonly transitions: PopupTransitions<State>;

    private readonly store: AnyPopupStore<State>;

    private readonly setup: PopupRootControllerSetup<Reason>;

    private readonly destroyFloatingRoot: () => void;

    private readonly unsubscribe: () => void;

    constructor(store: AnyPopupStore<State>, setup: PopupRootControllerSetup<Reason>, options: PopupRootControllerOptions = {}) {
        this.store = store;
        this.setup = setup;
        this.setOptions(options);

        const { floatingRoot, destroy } = createPopupFloatingRoot<State, Reason>(store, {
            floatingId: setup.floatingId,
            nested: setup.nested ?? false,
            noEmit: setup.noEmit,
            treatPopupAsFloatingElement: setup.treatPopupAsFloatingElement,
            onOpenChange: setup.setOpen
        });
        this.floatingRoot = floatingRoot;
        this.destroyFloatingRoot = destroy;
        store.set('floatingRootContext', floatingRoot as State['floatingRootContext']);

        this.transitions = new PopupTransitions(store, { onUnmount: setup.onUnmount, flush: setup.flush });
        this.transitions.start(setup.getTransitionOpen);

        this.unsubscribe = store.subscribe(() => this.sync());
        // `onChange` is not called here: the owner isn't fully constructed yet.
        ensureImplicitActiveTrigger(store, setup.getTriggerOpen?.());
    }

    setOptions(options: PopupRootControllerOptions) {
        const { store } = this;
        store.syncControlledValue('open', options.open as State['open'] | undefined);
        store.syncControlledValue('activeTriggerId', options.triggerId as State['activeTriggerId'] | undefined);
        store.setContextValue('onOpenChange', options.onOpenChange as never);
        store.setContextValue('onOpenChangeComplete', options.onOpenChangeComplete);
    }

    /**
     * Unmounts the popup immediately, skipping exit animations (`actionsRef.unmount`).
     */
    unmount = () => {
        this.transitions.forceUnmount();
    };

    destroy() {
        this.unsubscribe();
        this.transitions.destroy();
        this.destroyFloatingRoot();
    }

    private sync() {
        ensureImplicitActiveTrigger(this.store, this.setup.getTriggerOpen?.());
        this.setup.onChange?.();
    }
}
