import type { ComponentStore } from '~@store/ComponentStore';

import type { PopupStoreContext, PopupStoreSelectors, PopupStoreState } from './popupStoreState';

/**
 * Any popup store: a {@link ComponentStore} with the common popup state, context and selectors.
 */
export type AnyPopupStore<State extends PopupStoreState<unknown> = PopupStoreState<unknown>> = ComponentStore<
    State,
    PopupStoreContext<never>,
    PopupStoreSelectors
>;

type TriggerStateUpdates<State> = Omit<Partial<State>, 'activeTriggerId' | 'activeTriggerElement'>;

/**
 * Registers a trigger element under `id`.
 *
 * @returns A function that unregisters it.
 */
export function registerTrigger(store: Pick<AnyPopupStore, 'context'>, id: string, element: Element): () => void {
    store.context.triggerElements.add(id, element);
    return () => {
        store.context.triggerElements.delete(id);
    };
}

/**
 * Keeps one trigger element registered in a popup store and forwards its data
 * to the store while it is the active trigger.
 *
 * Replaces `useTriggerRegistration` + `useTriggerDataForwarding`: adapters call
 * {@link PopupTriggerRegistration.setElement} from their ref callback and
 * {@link PopupTriggerRegistration.sync} when the trigger becomes the one that mounted the popup.
 */
export class PopupTriggerRegistration<State extends PopupStoreState<unknown>> {
    private registeredId: string | null = null;

    private element: Element | null = null;

    private readonly store: AnyPopupStore<State>;

    private triggerId: string | undefined;

    private stateUpdates: TriggerStateUpdates<State>;

    constructor(store: AnyPopupStore<State>, triggerId: string | undefined, stateUpdates = {} as TriggerStateUpdates<State>) {
        this.store = store;
        this.triggerId = triggerId;
        this.stateUpdates = stateUpdates;
    }

    /**
     * Updates the trigger ID and the state the trigger forwards when active.
     */
    public setOptions(triggerId: string | undefined, stateUpdates = {} as TriggerStateUpdates<State>) {
        if (triggerId !== this.triggerId) {
            this.triggerId = triggerId;
            this.setElement(this.element);
        }
        this.stateUpdates = stateUpdates;
    }

    /**
     * Whether the popup is mounted and was activated by this trigger.
     */
    public isMountedByThisTrigger(): boolean {
        return this.store.select('isMountedByTrigger', this.triggerId);
    }

    /**
     * Registers (or unregisters, with `null`) the trigger element.
     * When the popup is open, the trigger becomes active if it is the active one,
     * or if no trigger is active yet (controlled mode, trigger mounted after opening).
     */
    public setElement = (element: Element | null) => {
        this.unregister();
        this.element = element;

        if (this.triggerId === undefined || element === null) {
            return;
        }

        this.registeredId = this.triggerId;
        this.store.context.triggerElements.add(this.triggerId, element);

        if (!this.store.select('open')) {
            return;
        }

        const activeTriggerId = this.store.select('activeTriggerId');

        if (activeTriggerId === this.triggerId) {
            this.store.update({
                activeTriggerElement: element,
                ...this.stateUpdates
            } as Partial<State>);
            return;
        }

        if (activeTriggerId == null) {
            // This runs when popup is open, but no active trigger is set.
            // It can happen when using controlled mode and the trigger is mounted after opening or if `triggerId` prop
            // is not set explicitly. In such cases the first trigger to run this code becomes the active trigger
            // (store.select('activeTriggerId') should not return null after that). This is mostly for compatibility
            // with contained triggers where no explicit `triggerId` was required in controlled mode.
            this.store.update({
                activeTriggerId: this.triggerId,
                activeTriggerElement: element,
                ...this.stateUpdates
            } as Partial<State>);
        }
    };

    /**
     * Forwards the trigger element and its state to the store if this trigger mounted the popup.
     * Call it whenever `isMountedByThisTrigger()` or the state updates change.
     */
    public sync() {
        if (this.isMountedByThisTrigger()) {
            this.store.update({
                activeTriggerElement: this.element,
                ...this.stateUpdates
            } as Partial<State>);
        }
    }

    /**
     * Unregisters the trigger element.
     */
    public destroy() {
        this.unregister();
        this.element = null;
    }

    private unregister() {
        if (this.registeredId !== null) {
            this.store.context.triggerElements.delete(this.registeredId);
            this.registeredId = null;
        }
    }
}

/**
 * Ensures that when there's no active trigger, one is selected implicitly.
 * Priority order:
 * 1. Primary trigger (if set via `primary` prop)
 * 2. First trigger (if only one trigger is registered)
 *
 * This allows controlled popups to work correctly without an explicit triggerId,
 * and enables TooltipMultiple to sync open state while each tooltip positions
 * relative to its own primary trigger.
 *
 * @param store The popup store.
 * @param open The open state to use (e.g. a shared one from a group); defaults to the store's.
 */
export function ensureImplicitActiveTrigger<State extends PopupStoreState<unknown>>(
    store: AnyPopupStore<State>,
    open = store.select('open')
) {
    if (!open || store.select('activeTriggerId')) {
        return;
    }

    const primaryTriggerId = store.select('primaryTriggerId');

    // 1. Try primary trigger first
    if (primaryTriggerId) {
        const primaryElement = store.context.triggerElements.getById(primaryTriggerId);
        if (primaryElement) {
            store.update({
                activeTriggerId: primaryTriggerId,
                activeTriggerElement: primaryElement
            } as Partial<State>);
            return;
        }
    }

    // 2. Fallback: first trigger if only one exists
    if (store.context.triggerElements.size === 1) {
        const iteratorResult = store.context.triggerElements.entries().next();
        if (!iteratorResult.done) {
            const [implicitTriggerId, implicitTriggerElement] = iteratorResult.value;
            store.update({
                activeTriggerId: implicitTriggerId,
                activeTriggerElement: implicitTriggerElement
            } as Partial<State>);
        }
    }
}
