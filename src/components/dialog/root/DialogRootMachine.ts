import { acquireScrollLock } from '~@dom/scrollLock';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { DismissInteraction } from '~@packages/floating-ui/interactions/DismissInteraction';
import { mergeInteractionProps } from '~@packages/floating-ui/interactions/mergeInteractionProps';
import { getRoleProps } from '~@packages/floating-ui/interactions/role';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { contains, getTarget } from '~@packages/floating-ui/utils/element';
import { OpenInteractionType } from '~@patterns/OpenInteractionType';
import { PopupRootController } from '~@popup/PopupRootController';

import type { ElementProps } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { InteractionProps } from '~@packages/floating-ui/types';

import { DialogStore } from '../store/DialogStore';

import type { DialogChangeEventDetails, DialogState } from '../store/DialogStore';

export type DialogRootOptions = {
    open?: boolean | undefined;
    /**
     * @default false
     */
    defaultOpen?: boolean | undefined;
    /**
     * @default true
     */
    modal?: boolean | 'trap-focus' | undefined;
    onOpenChange?: ((open: boolean, eventDetails: DialogChangeEventDetails) => void) | undefined;
    onOpenChangeComplete?: ((open: boolean) => void) | undefined;
    /**
     * @default false
     */
    disablePointerDismissal?: boolean | undefined;
    triggerId?: string | null | undefined;
    /**
     * @default null
     */
    defaultTriggerId?: string | null | undefined;
};

export type DialogRootSetup<Payload> = {
    /**
     * Store of a handle (`createDialogHandle`); a new store is created when omitted.
     */
    store?: DialogStore<Payload> | undefined;
    /**
     * Store of the parent dialog (nested dialogs).
     */
    parentStore?: DialogStore<unknown> | null | undefined;
    /**
     * Generated ID used for the reference when the trigger has none.
     */
    fallbackReferenceId: string;
    floatingId?: string | undefined;
    /**
     * `ReactDOM.flushSync` in React.
     */
    flushSync?: ((fn: () => void) => void) | undefined;
};

export type DialogRootActions = {
    unmount: () => void;
    close: () => void;
};

/**
 * State machine of `Dialog.Root` (also the base of `AlertDialog.Root` and `Drawer.Root`):
 * open state, transitions, dismissal (only the topmost of nested dialogs), scroll lock
 * and the count of nested open dialogs.
 */
export class DialogRootMachine<Payload = unknown> {
    readonly store: DialogStore<Payload>;

    readonly floatingRoot: FloatingRootStore;

    readonly interactionType: OpenInteractionType;

    readonly actions: DialogRootActions;

    private options: DialogRootOptions;

    private readonly setup: DialogRootSetup<Payload>;

    private readonly controller: PopupRootController<DialogState<Payload>>;

    private readonly dismiss: DismissInteraction;

    private readonly scrollLock = new Effect(() => {
        if (!(this.store.select('open') && this.store.select('modal') === true)) {
            return;
        }
        return acquireScrollLock(this.store.select('popupElement'));
    });

    private readonly parentNotifyEffect = new Effect(() => this.notifyParent());

    private readonly propsEffect = new Effect(() => this.updateSharedProps());

    private readonly unsubscribers: (() => void)[] = [];

    constructor(options: DialogRootOptions, setup: DialogRootSetup<Payload>) {
        const { open, defaultOpen = false, modal = true, disablePointerDismissal = false, triggerId, defaultTriggerId = null } = options;
        const nested = setup.parentStore != null;

        this.options = options;
        this.setup = setup;
        this.store =
            setup.store ??
            new DialogStore<Payload>({
                open: open ?? defaultOpen,
                activeTriggerId: triggerId !== undefined ? triggerId : defaultTriggerId,
                modal,
                disablePointerDismissal,
                nested
            });
        this.store.update({ modal, disablePointerDismissal, nested });

        this.store.setContextValue('onNestedDialogOpen', (ownChildrenCount: number) => {
            this.store.set('nestedOpenDialogCount', ownChildrenCount + 1);
        });
        this.store.setContextValue('onNestedDialogClose', () => {
            this.store.set('nestedOpenDialogCount', 0);
        });

        this.interactionType = new OpenInteractionType(this.store.select('open'));

        this.controller = new PopupRootController<DialogState<Payload>>(
            this.store,
            {
                setOpen: (nextOpen, details) => this.store.setOpen(nextOpen, details as never),
                floatingId: setup.floatingId,
                treatPopupAsFloatingElement: true,
                noEmit: true,
                flush: setup.flushSync,
                onUnmount: () => this.interactionType.reset(),
                onChange: () => this.sync()
            },
            this.getControllerOptions()
        );
        this.floatingRoot = this.controller.floatingRoot;

        this.dismiss = new DismissInteraction(this.floatingRoot, this.getDismissOptions());

        this.actions = {
            unmount: this.controller.unmount,
            close: () => {
                this.store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction) as never);
            }
        };

        this.unsubscribers.push(
            this.interactionType.store.subscribe(() => this.sync()),
            this.floatingRoot.subscribe(() => this.sync())
        );
        this.sync();
    }

    setOptions(options: DialogRootOptions) {
        this.options = options;
        this.controller.setOptions(this.getControllerOptions());
        this.store.update({
            modal: options.modal ?? true,
            disablePointerDismissal: options.disablePointerDismissal ?? false,
            nested: this.setup.parentStore != null
        });
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
        this.parentNotifyEffect.destroy();
        this.propsEffect.destroy();
        this.dismiss.destroy();
        this.controller.destroy();
    }

    private get isTopmost() {
        return this.store.select('nestedOpenDialogCount') === 0;
    }

    private getControllerOptions() {
        const { open, triggerId, onOpenChange, onOpenChangeComplete } = this.options;
        return { open, triggerId, onOpenChange: onOpenChange as never, onOpenChangeComplete };
    }

    private getDismissOptions() {
        const { store } = this;
        const { backdropRef, internalBackdropRef } = store.context;

        return {
            outsidePressEvent: () => {
                if (internalBackdropRef.current || backdropRef.current) {
                    return 'intentional' as const;
                }
                // Ensure `aria-hidden` on outside elements is removed immediately
                // on outside press when trapping focus.
                return {
                    mouse: store.select('modal') === 'trap-focus' ? ('sloppy' as const) : ('intentional' as const),
                    touch: 'sloppy' as const
                };
            },
            outsidePress: (event: MouseEvent | TouchEvent) => {
                // For mouse events, only accept the main button; a single touch is equivalent to it.
                if ('button' in event && event.button !== 0) {
                    return false;
                }
                if ('touches' in event && event.touches.length !== 1) {
                    return false;
                }
                if (!this.isTopmost || store.select('disablePointerDismissal')) {
                    return false;
                }

                const target = getTarget(event) as Element | null;
                if (store.select('modal')) {
                    // Only close if the press occurred on the dialog's owning backdrop.
                    // This supports multiple modal dialogs that aren't nested in each other.
                    return internalBackdropRef.current || backdropRef.current
                        ? internalBackdropRef.current === target ||
                              backdropRef.current === target ||
                              (contains(target, store.select('popupElement')) && !target?.hasAttribute('data-base-ui-portal'))
                        : true;
                }
                return true;
            },
            escapeKey: this.isTopmost
        };
    }

    private sync() {
        const { store } = this;

        this.interactionType.setOpen(store.select('open'));
        store.syncValue('openMethod', this.interactionType.openMethod);
        this.dismiss.setOptions(this.getDismissOptions());

        this.scrollLock.sync([store.select('open'), store.select('modal'), store.select('popupElement')]);
        this.parentNotifyEffect.sync([store.select('open'), store.select('nestedOpenDialogCount')]);

        const rootState = this.floatingRoot.state;
        this.propsEffect.sync([rootState.open, rootState.floatingId, rootState.domReferenceElement, rootState.floatingElement]);
    }

    /**
     * Notifies the parent dialog of this dialog's open state (it tracks its nested open dialogs).
     */
    private notifyParent() {
        const parentContext = this.setup.parentStore?.context;
        const open = this.store.select('open');
        if (!parentContext) {
            return;
        }

        if (open) {
            parentContext.onNestedDialogOpen?.(this.store.select('nestedOpenDialogCount'));
        } else {
            parentContext.onNestedDialogClose?.();
        }

        return () => {
            if (open) {
                parentContext.onNestedDialogClose?.();
            }
        };
    }

    private updateSharedProps() {
        const role = getRoleProps(this.floatingRoot.state, { fallbackReferenceId: this.setup.fallbackReferenceId, nested: false });
        const list: InteractionProps[] = [role, this.dismiss.getProps()];
        const triggerProps = this.interactionType.triggerProps as ElementProps;

        this.store.update({
            activeTriggerProps: mergeInteractionProps(triggerProps, list, 'reference') as ElementProps,
            inactiveTriggerProps: mergeInteractionProps(triggerProps, list, 'trigger') as ElementProps,
            popupProps: mergeInteractionProps(undefined, list, 'floating') as ElementProps
        });
    }
}
