import { acquireScrollLock } from '~@dom/scrollLock';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { FloatingTreeStore } from '~@packages/floating-ui/FloatingTreeStore';
import { DismissInteraction } from '~@packages/floating-ui/interactions/DismissInteraction';
import { mergeInteractionProps } from '~@packages/floating-ui/interactions/mergeInteractionProps';
import { getRoleProps } from '~@packages/floating-ui/interactions/role';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { OpenInteractionType } from '~@patterns/OpenInteractionType';
import { PopupRootController } from '~@popup/PopupRootController';

import type { ElementProps } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { InteractionProps } from '~@packages/floating-ui/types';

import { PopoverStore } from '../store/PopoverStore';

import type { PopoverChangeEventDetails, PopoverState } from '../store/PopoverStore';

export type PopoverRootOptions = {
    open?: boolean | undefined;
    /**
     * @default false
     */
    defaultOpen?: boolean | undefined;
    onOpenChange?: ((open: boolean, eventDetails: PopoverChangeEventDetails) => void) | undefined;
    onOpenChangeComplete?: ((open: boolean) => void) | undefined;
    /**
     * @default false
     */
    modal?: boolean | 'trap-focus' | undefined;
    triggerId?: string | null | undefined;
    /**
     * @default null
     */
    defaultTriggerId?: string | null | undefined;
};

export type PopoverRootSetup<Payload> = {
    /**
     * Store of a handle (`createPopoverHandle`); a new store is created when omitted.
     */
    store?: PopoverStore<Payload> | undefined;
    /**
     * Generated ID used for the reference when the trigger has none.
     */
    fallbackReferenceId: string;
    floatingId?: string | undefined;
    /**
     * The floating tree of the parent popup; a new tree is created when omitted.
     */
    tree?: FloatingTreeStore | null | undefined;
    /**
     * Whether the popover is nested in another floating element (has a parent tree node).
     * @default false
     */
    nested?: boolean | undefined;
    /**
     * `ReactDOM.flushSync` in React.
     */
    flushSync?: ((fn: () => void) => void) | undefined;
};

export type PopoverRootActions = {
    unmount: () => void;
    close: () => void;
};

/**
 * State machine of `Popover.Root`: open state, transitions, dismissal, ARIA role props,
 * scroll lock for modal popovers and the props shared with triggers and the popup.
 * Replacement for `PopoverRoot`'s hooks.
 */
export class PopoverRootMachine<Payload = unknown> {
    readonly store: PopoverStore<Payload>;

    readonly tree: FloatingTreeStore;

    readonly floatingRoot: FloatingRootStore;

    readonly interactionType: OpenInteractionType;

    readonly actions: PopoverRootActions;

    private options: PopoverRootOptions;

    private readonly setup: PopoverRootSetup<Payload>;

    private readonly controller: PopupRootController<PopoverState<Payload>>;

    private readonly dismiss: DismissInteraction;

    private readonly scrollLock = new Effect(() => {
        if (!this.isScrollLocked()) {
            return;
        }
        return acquireScrollLock(this.store.select('positionerElement'));
    });

    private readonly propsEffect = new Effect(() => this.updateSharedProps());

    private readonly unsubscribers: (() => void)[] = [];

    constructor(options: PopoverRootOptions, setup: PopoverRootSetup<Payload>) {
        const { open, defaultOpen = false, modal = false, triggerId, defaultTriggerId = null } = options;

        this.options = options;
        this.setup = setup;
        this.tree = setup.tree ?? new FloatingTreeStore();
        this.store =
            setup.store ??
            new PopoverStore<Payload>({
                open: open ?? defaultOpen,
                modal,
                activeTriggerId: triggerId !== undefined ? triggerId : defaultTriggerId
            });

        if (setup.flushSync) {
            this.store.setContextValue('flushSync', setup.flushSync);
        }

        this.interactionType = new OpenInteractionType(this.store.select('open'));

        this.controller = new PopupRootController<PopoverState<Payload>>(
            this.store,
            {
                setOpen: (open, details) => this.store.setOpen(open, details as never),
                floatingId: setup.floatingId,
                nested: setup.nested,
                flush: setup.flushSync,
                onUnmount: () => {
                    this.store.update({ stickIfOpen: true, openChangeReason: null });
                    this.interactionType.reset();
                },
                onChange: () => this.sync()
            },
            this.getControllerOptions()
        );
        this.floatingRoot = this.controller.floatingRoot;

        this.dismiss = new DismissInteraction(this.floatingRoot, this.getDismissOptions());

        this.actions = {
            unmount: this.controller.unmount,
            close: () => {
                this.store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction));
            }
        };

        this.unsubscribers.push(
            this.interactionType.store.subscribe(() => this.sync()),
            this.floatingRoot.subscribe(() => this.sync())
        );

        this.store.update({ modal, nested: setup.nested ?? false });
        this.sync();
    }

    setOptions(options: PopoverRootOptions) {
        this.options = options;
        this.controller.setOptions(this.getControllerOptions());
        this.dismiss.setOptions(this.getDismissOptions());
        this.store.syncValue('modal', options.modal ?? false);
        this.sync();
    }

    getState(): { payload: Payload | undefined } {
        return { payload: this.store.select('payload') as Payload | undefined };
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.scrollLock.destroy();
        this.propsEffect.destroy();
        this.dismiss.destroy();
        this.controller.destroy();
        this.store.destroy();
    }

    private getControllerOptions() {
        const { open, triggerId, onOpenChange, onOpenChangeComplete } = this.options;
        return { open, triggerId, onOpenChange: onOpenChange as never, onOpenChangeComplete };
    }

    private getDismissOptions() {
        return {
            outsidePressEvent: {
                // Ensure `aria-hidden` on outside elements is removed immediately
                // on outside press when trapping focus.
                mouse: this.options.modal === 'trap-focus' ? ('sloppy' as const) : ('intentional' as const),
                touch: 'sloppy' as const
            },
            tree: this.tree
        };
    }

    private isScrollLocked() {
        const { store } = this;
        return (
            store.select('open') &&
            store.select('modal') === true &&
            store.select('openChangeReason') !== REASONS.triggerHover &&
            this.interactionType.openMethod !== 'touch'
        );
    }

    private sync() {
        const { store } = this;
        const open = store.select('open');

        this.interactionType.setOpen(open);
        store.syncValue('openMethod', this.interactionType.openMethod);

        if (!open) {
            store.context.stickIfOpenTimeout.clear();
        }

        this.scrollLock.sync([this.isScrollLocked(), store.select('positionerElement')]);

        const rootState = this.floatingRoot.state;
        this.propsEffect.sync([
            rootState.open,
            rootState.floatingId,
            rootState.domReferenceElement,
            rootState.floatingElement,
            this.options.modal
        ]);
    }

    private updateSharedProps() {
        const role = getRoleProps(this.floatingRoot.state, {
            fallbackReferenceId: this.setup.fallbackReferenceId,
            nested: this.setup.nested ?? false
        });
        const list: InteractionProps[] = [this.dismiss.getProps(), role];
        const triggerProps = this.interactionType.triggerProps as ElementProps;

        this.store.update({
            activeTriggerProps: mergeInteractionProps(triggerProps, list, 'reference') as ElementProps,
            inactiveTriggerProps: mergeInteractionProps(triggerProps, list, 'trigger') as ElementProps,
            popupProps: mergeInteractionProps(undefined, list, 'floating') as ElementProps
        });
    }
}
