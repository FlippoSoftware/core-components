import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { PopoverStore } from './PopoverStore';

/**
 * A handle to control a popover imperatively and to associate detached triggers with it.
 */
export class PopoverHandle<Payload = unknown> {
    /**
     * Internal store holding the popover's state.
     * @internal
     */
    public readonly store: PopoverStore<Payload>;

    constructor(store?: PopoverStore<Payload>) {
        this.store = store ?? new PopoverStore<Payload>();
    }

    /**
     * Opens the popover and associates it with the trigger with the given id.
     * The trigger must be a Popover.Trigger component with this handle passed as a prop.
     *
     * @param triggerId ID of the trigger to associate with the popover.
     */
    open(triggerId: string) {
        const triggerElement = triggerId ? (this.store.context.triggerElements.getById(triggerId) as HTMLElement | undefined) : undefined;

        if (triggerId && !triggerElement) {
            throw new Error(`Flippo UI: PopoverHandle.open: No trigger found with id "${triggerId}".`);
        }

        this.store.setOpen(true, createChangeEventDetails(REASONS.imperativeAction, undefined, triggerElement));
    }

    /**
     * Closes the popover.
     */
    close() {
        this.store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction, undefined, undefined));
    }

    /**
     * Indicates whether the popover is currently open.
     */
    get isOpen() {
        return this.store.state.open;
    }
}

/**
 * Creates a new handle to connect a Popover.Root with detached Popover.Trigger components.
 */
export function createPopoverHandle<Payload>(): PopoverHandle<Payload> {
    return new PopoverHandle<Payload>();
}
