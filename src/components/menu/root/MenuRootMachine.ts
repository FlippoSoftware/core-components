import { acquireScrollLock } from '~@dom/scrollLock';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { EMPTY_ARRAY, TYPEAHEAD_RESET_MS } from '~@lib/constants';
import { warn } from '~@lib/warn';
import { FloatingNodeRegistration } from '~@packages/floating-ui/FloatingNodeRegistration';
import { DismissInteraction } from '~@packages/floating-ui/interactions/DismissInteraction';
import { ListNavigationInteraction } from '~@packages/floating-ui/interactions/ListNavigationInteraction';
import { mergeInteractionProps } from '~@packages/floating-ui/interactions/mergeInteractionProps';
import { getRoleProps } from '~@packages/floating-ui/interactions/role';
import { TypeaheadInteraction } from '~@packages/floating-ui/interactions/TypeaheadInteraction';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { PopupRootController } from '~@popup/PopupRootController';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

import type { FloatingOpenChangeDetails } from '~@events/changeEventDetails';
import type { ElementProps, TextDirection } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { FloatingTreeStore } from '~@packages/floating-ui/FloatingTreeStore';
import type { InteractionProps } from '~@packages/floating-ui/types';

import { MenuStore } from '../store/MenuStore';

import type { MenuChangeEventDetails, MenuChangeEventReason, MenuOrientation, MenuParent, MenuState } from '../store/MenuStore';

export type MenuRootOptions = {
    open?: boolean | undefined;
    /**
     * @default false
     */
    defaultOpen?: boolean | undefined;
    onOpenChange?: ((open: boolean, eventDetails: MenuChangeEventDetails) => void) | undefined;
    onOpenChangeComplete?: ((open: boolean) => void) | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * Ignored for nested menus.
     * @default true
     */
    modal?: boolean | undefined;
    /**
     * @default true
     */
    loopFocus?: boolean | undefined;
    /**
     * @default 'vertical'
     */
    orientation?: MenuOrientation | undefined;
    /**
     * @default true
     */
    closeParentOnEsc?: boolean | undefined;
    triggerId?: string | null | undefined;
    /**
     * @default null
     */
    defaultTriggerId?: string | null | undefined;
    /**
     * @default true
     */
    highlightItemOnHover?: boolean | undefined;
};

export type MenuRootSetup<Payload> = {
    /**
     * Store of a handle (`createMenuHandle`); a new store is created when omitted.
     */
    store?: MenuStore<Payload> | undefined;
    /**
     * What the menu is nested in (a parent menu for submenus, a menubar or a context menu).
     */
    parent?: MenuParent | undefined;
    /**
     * Generated ID of the root (marks the popup with `data-rootownerid`).
     */
    rootId: string;
    /**
     * Generated ID used for the reference when the trigger has none.
     */
    fallbackReferenceId: string;
    /**
     * Generated ID of the menu's floating tree node.
     */
    nodeId: string;
    /**
     * Floating tree node ID of the parent (derived from a parent menu or menubar when omitted).
     */
    parentNodeId?: string | null | undefined;
    floatingId?: string | undefined;
    /**
     * @default 'ltr'
     */
    direction?: TextDirection | undefined;
    /**
     * `ReactDOM.flushSync` in React.
     */
    flushSync?: ((fn: () => void) => void) | undefined;
};

export type MenuRootActions = {
    unmount: () => void;
    close: () => void;
};

type MenuOpenMethod = 'mouse' | 'touch' | 'keyboard' | null;

type KeyboardEventWithPropagation = KeyboardEvent & { isPropagationStopped?: () => boolean };

/**
 * State machine of `Menu.Root` (also the base of `ContextMenu.Root`, `Menu.SubmenuRoot` and menubar menus):
 * open state, transitions, dismissal, list navigation, typeahead and the props shared with triggers,
 * the popup and items.
 */
export class MenuRootMachine<Payload = unknown> {
    readonly store: MenuStore<Payload>;

    readonly floatingRoot: FloatingRootStore;

    readonly node: FloatingNodeRegistration;

    readonly actions: MenuRootActions;

    /**
     * How the menu was opened (for the scroll lock).
     */
    readonly openMethod = new Store<{ openMethod: MenuOpenMethod }>({ openMethod: null });

    private options: MenuRootOptions;

    private readonly setup: MenuRootSetup<Payload>;

    private readonly controller: PopupRootController<MenuState<Payload>>;

    private readonly dismiss: DismissInteraction;

    private readonly listNavigation: ListNavigationInteraction;

    private readonly typeahead: TypeaheadInteraction;

    private openEvent: Event | null = null;

    private allowOutsidePressDismissal: boolean;

    private readonly allowOutsidePressDismissalTimeout = new Timeout();

    private allowTouchToClose = true;

    private readonly allowTouchToCloseTimeout = new Timeout();

    private readonly scrollLock = new Effect(() => {
        if (!this.isScrollLocked()) {
            return;
        }
        return acquireScrollLock(this.store.select('positionerElement'));
    });

    private readonly openEffect = new Effect(() => this.handleOpenChange());

    private readonly propsEffect = new Effect(() => this.updateSharedProps());

    private readonly unsubscribers: (() => void)[] = [];

    private readonly interactionTypeProps = {
        onPointerDown: (event: PointerEvent) => {
            this.openMethod.set('openMethod', event.pointerType === 'touch' ? 'touch' : 'mouse');
        },
        onKeyDown: () => {
            this.openMethod.set('openMethod', 'keyboard');
        }
    };

    constructor(options: MenuRootOptions, setup: MenuRootSetup<Payload>) {
        const { open, defaultOpen = false, triggerId, defaultTriggerId = null } = options;
        const parent = setup.parent ?? { type: undefined };

        this.options = options;
        this.setup = setup;
        this.store =
            setup.store ??
            new MenuStore<Payload>({
                open: defaultOpen,
                openProp: open,
                activeTriggerId: defaultTriggerId,
                triggerIdProp: triggerId,
                parent
            });

        // Support an initially open state when uncontrolled (e.g. with a handle's store).
        if (open === undefined && this.store.state.open === false && defaultOpen) {
            this.store.update({ open: true, activeTriggerId: defaultTriggerId });
        }

        if (setup.parent) {
            this.store.set('parent', setup.parent);
        }
        if (parent.type === 'menubar' && parent.context.tree) {
            this.store.set('floatingTreeRoot', parent.context.tree);
        }

        const parentNodeId = setup.parentNodeId ?? this.getParentNodeId(parent);
        this.node = new FloatingNodeRegistration(this.store.select('floatingTreeRoot'), setup.nodeId, parentNodeId);
        this.store.update({ floatingNodeId: setup.nodeId, floatingParentNodeId: parentNodeId });

        this.allowOutsidePressDismissal = parent.type !== 'context-menu';
        this.syncOptions();

        this.controller = new PopupRootController<MenuState<Payload>>(
            this.store,
            {
                setOpen: (nextOpen, details) => this.setOpen(nextOpen, details as never),
                floatingId: setup.floatingId,
                flush: setup.flushSync,
                onUnmount: () => {
                    this.store.update({ allowMouseEnter: false, stickIfOpen: true });
                    this.openMethod.set('openMethod', null);
                },
                onChange: () => this.sync()
            },
            { onOpenChangeComplete: options.onOpenChangeComplete }
        );
        this.floatingRoot = this.controller.floatingRoot;
        this.node.attach(this.floatingRoot);

        this.dismiss = new DismissInteraction(this.floatingRoot, this.getDismissOptions());
        this.listNavigation = new ListNavigationInteraction(this.floatingRoot, this.getListNavigationOptions());
        this.typeahead = new TypeaheadInteraction(this.floatingRoot, this.getTypeaheadOptions());

        this.actions = {
            unmount: this.controller.unmount,
            close: () => {
                this.store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction));
            }
        };

        const handleSetOpenEvent = ({ open: nextOpen, eventDetails }: { open: boolean; eventDetails: MenuChangeEventDetails }) =>
            this.setOpen(nextOpen, eventDetails);
        this.floatingRoot.context.events.on('setOpen', handleSetOpenEvent);

        this.unsubscribers.push(
            () => this.floatingRoot.context.events.off('setOpen', handleSetOpenEvent),
            this.openMethod.subscribe(() => this.sync()),
            this.floatingRoot.subscribe(() => this.sync())
        );

        this.sync();
    }

    setOptions(options: MenuRootOptions) {
        this.options = options;
        this.syncOptions();
        this.controller.setOptions({ onOpenChangeComplete: options.onOpenChangeComplete });
        this.dismiss.setOptions(this.getDismissOptions());
        this.sync();
    }

    getState(): { payload: Payload | undefined } {
        return { payload: this.store.select('payload') as Payload | undefined };
    }

    /**
     * The floating tree the adapter provides to nested menus.
     */
    get tree(): FloatingTreeStore {
        return this.store.select('floatingTreeRoot');
    }

    /**
     * Changes the open state (the floating root and `store.setOpen` end up here).
     */
    setOpen = (nextOpen: boolean, eventDetails: Omit<MenuChangeEventDetails, 'preventUnmountOnClose'>) => {
        const { store } = this;
        const reason = eventDetails.reason;
        const activeTriggerElement = store.select('activeTriggerElement');

        if (
            store.select('open') === nextOpen &&
            eventDetails.trigger === activeTriggerElement &&
            store.select('lastOpenChangeReason') === reason
        ) {
            return;
        }

        const details = eventDetails as MenuChangeEventDetails;
        details.preventUnmountOnClose = () => {
            store.set('preventUnmountingOnClose', true);
        };

        // Do not immediately reset the active trigger to let exit animations play and focus return correctly.
        if (!nextOpen && details.trigger == null) {
            details.trigger = activeTriggerElement ?? undefined;
        }

        this.options.onOpenChange?.(nextOpen, details);
        if (details.isCanceled) {
            return;
        }

        const floatingDetails: FloatingOpenChangeDetails = {
            open: nextOpen,
            nativeEvent: details.event,
            reason: details.reason,
            nested: store.select('floatingParentNodeId') != null
        };
        this.floatingRoot.context.events.emit('openchange', floatingDetails);

        const nativeEvent = details.event as Event | undefined;
        if (
            !nextOpen &&
            nativeEvent?.type === 'click' &&
            (nativeEvent as PointerEvent).pointerType === 'touch' &&
            !this.allowTouchToClose
        ) {
            return;
        }

        // Prevent options from retaining `tabindex=0` when the popup closes by tabbing out with `keepMounted`.
        const activeIndex = store.select('activeIndex');
        if (!nextOpen && activeIndex !== null) {
            const activeOption = store.context.itemDomElements.current[activeIndex];
            queueMicrotask(() => {
                activeOption?.setAttribute('tabindex', '-1');
            });
        }

        // Prevent the menu from closing on mobile devices that fire focus before a delayed click.
        if (nextOpen && reason === REASONS.triggerFocus) {
            this.allowTouchToClose = false;
            this.allowTouchToCloseTimeout.start(300, () => {
                this.allowTouchToClose = true;
            });
        } else {
            this.allowTouchToClose = true;
            this.allowTouchToCloseTimeout.clear();
        }

        const isKeyboardClick =
            (reason === REASONS.triggerPress || reason === REASONS.itemPress) &&
            (nativeEvent as MouseEvent | undefined)?.detail === 0 &&
            nativeEvent?.isTrusted;
        const isDismissClose = !nextOpen && (reason === REASONS.escapeKey || reason == null);

        const updatedState: Partial<MenuState<Payload>> = { open: nextOpen, openChangeReason: reason };
        this.openEvent = details.event ?? null;

        // If a popup is closing, the `trigger` may be null; keep the previous one for exit animations and focus return.
        const newTriggerId = details.trigger?.id ?? null;
        if (newTriggerId || nextOpen) {
            updatedState.activeTriggerId = newTriggerId;
            updatedState.activeTriggerElement = details.trigger ?? null;
        }

        const parent = store.select('parent');
        const groupReasons: (MenuChangeEventReason | null)[] = [
            REASONS.triggerFocus,
            REASONS.focusOut,
            REASONS.triggerHover,
            REASONS.listNavigation,
            REASONS.siblingOpen
        ];
        if (parent.type === 'menubar' && groupReasons.includes(reason)) {
            updatedState.instantType = 'group';
        } else if (isKeyboardClick || isDismissClose) {
            updatedState.instantType = isKeyboardClick ? 'click' : 'dismiss';
        } else {
            updatedState.instantType = undefined;
        }

        store.update(updatedState);
    };

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.scrollLock.destroy();
        this.openEffect.destroy();
        this.propsEffect.destroy();
        this.dismiss.destroy();
        this.listNavigation.destroy();
        this.typeahead.destroy();
        this.allowOutsidePressDismissalTimeout.clear();
        this.allowTouchToCloseTimeout.clear();
        this.controller.destroy();
        this.node.destroy();
        this.store.destroy();
    }

    private getParentNodeId(parent: MenuParent): string | null {
        if (parent.type === 'menu') {
            return parent.store.select('floatingNodeId') ?? null;
        }
        if (parent.type === 'menubar') {
            return parent.context.nodeId ?? null;
        }
        if (parent.type === 'nested-context-menu') {
            return parent.menuContext.store.select('floatingNodeId') ?? null;
        }
        return null;
    }

    private syncOptions() {
        const { open, triggerId, disabled = false, modal } = this.options;
        const parent = this.store.select('parent');

        if (process.env.NODE_ENV !== 'production' && parent.type !== undefined && modal !== undefined) {
            warn('The `modal` prop is not supported on nested menus. It will be ignored.');
        }

        this.store.update({
            openProp: open,
            triggerIdProp: triggerId,
            disabled,
            modal: (parent.type === undefined ? modal : undefined) as boolean,
            rootId: this.setup.rootId
        });
    }

    private get nested() {
        return this.store.select('floatingParentNodeId') != null;
    }

    private getDismissOptions() {
        const { closeParentOnEsc = true } = this.options;
        const parent = this.store.select('parent');
        return {
            enabled: !this.store.select('disabled'),
            bubbles: { escapeKey: closeParentOnEsc && parent.type === 'menu' },
            outsidePress: () => {
                if (this.store.select('parent').type !== 'context-menu' || this.openEvent?.type === 'contextmenu') {
                    return true;
                }
                return this.allowOutsidePressDismissal;
            },
            tree: this.nested ? this.tree : undefined
        };
    }

    private getListNavigationOptions() {
        const { store } = this;
        const { loopFocus = true, orientation = 'vertical', highlightItemOnHover = true } = this.options;
        const parent = store.select('parent');

        return {
            enabled: !store.select('disabled'),
            listRef: store.context.itemDomElements,
            activeIndex: store.select('activeIndex'),
            nested: parent.type !== undefined,
            loopFocus,
            orientation,
            parentOrientation: parent.type === 'menubar' ? parent.context.orientation : undefined,
            rtl: this.setup.direction === 'rtl',
            disabledIndices: EMPTY_ARRAY,
            onNavigate: (index: number | null) => {
                if (store.select('activeIndex') !== index) {
                    store.set('activeIndex', index);
                }
            },
            openOnArrowKeyDown: parent.type !== 'context-menu',
            tree: this.nested ? this.tree : undefined,
            parentId: store.select('floatingParentNodeId'),
            focusItemOnHover: highlightItemOnHover
        };
    }

    private getTypeaheadOptions() {
        const { store } = this;
        return {
            listRef: store.context.itemLabels,
            activeIndex: store.select('activeIndex'),
            resetMs: TYPEAHEAD_RESET_MS,
            onMatch: (index: number) => {
                if (store.select('open') && index !== store.select('activeIndex')) {
                    store.set('activeIndex', index);
                }
            },
            onTypingChange: (typing: boolean) => {
                store.context.typingRef.current = typing;
            }
        };
    }

    private isScrollLocked() {
        const { store } = this;
        return (
            store.select('open') &&
            store.select('modal') &&
            store.select('lastOpenChangeReason') !== REASONS.triggerHover &&
            this.openMethod.state.openMethod !== 'touch'
        );
    }

    private sync() {
        const { store } = this;
        const open = store.select('open');
        const parent = store.select('parent');

        this.openEffect.sync([open, parent.type]);

        if (!open && !store.select('hoverEnabled')) {
            store.set('hoverEnabled', true);
        }

        if (parent.type === 'context-menu') {
            if (parent.context.positionerRef) {
                parent.context.positionerRef.current = store.select('positionerElement');
            }
            if (parent.context.actionsRef) {
                parent.context.actionsRef.current = { setOpen: this.setOpen as never };
            }
        }

        this.scrollLock.sync([this.isScrollLocked(), store.select('positionerElement')]);
        this.listNavigation.setOptions(this.getListNavigationOptions());
        this.typeahead.setOptions(this.getTypeaheadOptions());

        const rootState = this.floatingRoot.state;
        this.propsEffect.sync([
            rootState.open,
            rootState.floatingId,
            rootState.domReferenceElement,
            rootState.floatingElement,
            store.select('disabled'),
            parent.type
        ]);
    }

    private handleOpenChange() {
        const open = this.store.select('open');
        const parent = this.store.select('parent');

        if (!open) {
            this.openEvent = null;
            this.openMethod.set('openMethod', null);
        }

        if (parent.type !== 'context-menu') {
            return;
        }

        if (!open) {
            this.allowOutsidePressDismissalTimeout.clear();
            this.allowOutsidePressDismissal = false;
            return;
        }

        // With `mousedown` outside press events and long press touch input, there needs to be a grace
        // period after opening to ensure the dismissal event doesn't fire immediately after open.
        this.allowOutsidePressDismissalTimeout.start(500, () => {
            this.allowOutsidePressDismissal = true;
        });
        return;
    }

    private updateSharedProps() {
        const { store } = this;
        const role = getRoleProps(this.floatingRoot.state, {
            role: 'menu',
            fallbackReferenceId: this.setup.fallbackReferenceId,
            nested: this.nested
        });
        const list: InteractionProps[] = [this.dismiss.getProps(), role, this.listNavigation.getProps(), this.typeahead.getProps()];

        const activeTriggerProps = mergeProps(
            mergeInteractionProps(undefined, list, 'reference'),
            {
                onMouseMove: () => {
                    store.set('allowMouseEnter', true);
                }
            },
            this.interactionTypeProps
        );
        delete activeTriggerProps.role;

        const inactiveTriggerProps = mergeProps(mergeInteractionProps(undefined, list, 'trigger'), this.interactionTypeProps);
        delete inactiveTriggerProps.role;
        delete inactiveTriggerProps['aria-controls'];

        const popupProps = mergeInteractionProps(
            {
                onMouseMove: () => {
                    store.set('allowMouseEnter', true);
                    if (store.select('parent').type === 'menu') {
                        store.set('hoverEnabled', false);
                    }
                },
                onClick: () => {
                    if (store.select('hoverEnabled')) {
                        store.set('hoverEnabled', false);
                    }
                },
                onKeyDown: (event: KeyboardEventWithPropagation) => {
                    // With detached triggers, forward keyboard events to the menubar's composite root manually.
                    const relay = store.select('keyboardEventRelay');
                    const stopped = event.isPropagationStopped ? event.isPropagationStopped() : event.cancelBubble;
                    if (relay && !stopped) {
                        relay(event);
                    }
                }
            },
            list,
            'floating'
        );

        store.update({
            activeTriggerProps: activeTriggerProps as ElementProps,
            inactiveTriggerProps: inactiveTriggerProps as ElementProps,
            popupProps: popupProps as ElementProps,
            itemProps: mergeInteractionProps(undefined, list, 'item') as ElementProps
        });
    }
}
