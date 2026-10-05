import { EMPTY_OBJECT } from '~@lib/constants';
import { createRef } from '~@lib/ref';
import { FloatingTreeStore } from '~@packages/floating-ui/FloatingTreeStore';
import { PopupTriggerMap } from '~@popup/PopupTriggerMap';
import { createInitialPopupStoreState, popupStoreSelectors } from '~@popup/popupStoreState';
import { ComponentStore } from '~@store/ComponentStore';
import { createSelector } from '~@store/createSelector';

import type { PopupChangeEventDetails } from '~@events/changeEventDetails';
import type { REASONS } from '~@events/reasons';
import type { BivariantEventHandler, ElementProps, KeyboardEventLike, MutableRef } from '~@lib/types';
import type { PopupStoreContext, PopupStoreState } from '~@popup/popupStoreState';

export type MenuChangeEventReason =
    | typeof REASONS.triggerHover
    | typeof REASONS.triggerFocus
    | typeof REASONS.triggerPress
    | typeof REASONS.outsidePress
    | typeof REASONS.focusOut
    | typeof REASONS.listNavigation
    | typeof REASONS.escapeKey
    | typeof REASONS.itemPress
    | typeof REASONS.closePress
    | typeof REASONS.siblingOpen
    | typeof REASONS.cancelOpen
    | typeof REASONS.imperativeAction
    | typeof REASONS.none;

export type MenuChangeEventDetails = PopupChangeEventDetails<MenuChangeEventReason>;

export type MenuOrientation = 'horizontal' | 'vertical';

/**
 * Data a menu needs from a parent menubar.
 */
export type MenubarParentContext = {
    disabled: boolean;
    rootId: string | undefined;
    allowMouseUpTriggerRef: MutableRef<boolean>;
    modal?: boolean | undefined;
    orientation?: MenuOrientation | undefined;
    hasSubmenuOpen?: boolean | undefined;
    contentElement?: HTMLElement | null | undefined;
    /**
     * Floating tree shared by the menubar's menus.
     */
    tree?: FloatingTreeStore | undefined;
    /**
     * Floating tree node ID of the menubar (parent of its menus).
     */
    nodeId?: string | undefined;
};

/**
 * Data a menu needs from a parent context menu.
 */
export type ContextMenuParentContext = {
    rootId: string | undefined;
    allowMouseUpTriggerRef: MutableRef<boolean>;
    anchor?: { getBoundingClientRect: () => DOMRect } | undefined;
    backdropRef?: MutableRef<HTMLDivElement | null> | undefined;
    internalBackdropRef?: MutableRef<HTMLDivElement | null> | undefined;
    positionerRef?: MutableRef<HTMLElement | null> | undefined;
    initialCursorPointRef?: MutableRef<{ x: number; y: number } | null> | undefined;
    /**
     * Set by the menu root: changes the open state of the context menu.
     */
    actionsRef?: MutableRef<{ setOpen: (open: boolean, eventDetails: never) => void } | null> | undefined;
};

export type MenuParent =
    | {
          type: 'menu';
          store: MenuStore<unknown>;
      }
    | {
          type: 'menubar';
          context: MenubarParentContext;
      }
    | {
          type: 'context-menu';
          context: ContextMenuParentContext;
      }
    | {
          type: 'nested-context-menu';
          context: ContextMenuParentContext;
          menuContext: {
              store: MenuStore<unknown>;
              parent: MenuParent;
          };
      }
    | {
          type: undefined;
      };

export type MenuKeyboardEventRelay = BivariantEventHandler<KeyboardEventLike>;

export type MenuState<Payload> = PopupStoreState<Payload> & {
    disabled: boolean;
    modal: boolean;
    allowMouseEnter: boolean;
    parent: MenuParent;
    rootId: string | undefined;
    activeIndex: number | null;
    hoverEnabled: boolean;
    stickIfOpen: boolean;
    instantType: 'dismiss' | 'click' | 'group' | undefined;
    openChangeReason: MenuChangeEventReason | null;
    floatingTreeRoot: FloatingTreeStore;
    floatingNodeId: string | undefined;
    floatingParentNodeId: string | null;
    itemProps: ElementProps;
    closeDelay: number;
    keyboardEventRelay: MenuKeyboardEventRelay | undefined;
};

export type MenuContext = PopupStoreContext<MenuChangeEventDetails> & {
    readonly positionerRef: MutableRef<HTMLElement | null>;
    readonly typingRef: MutableRef<boolean>;
    readonly itemDomElements: MutableRef<(HTMLElement | null)[]>;
    readonly itemLabels: MutableRef<(string | null)[]>;
    allowMouseUpTriggerRef: MutableRef<boolean>;
    readonly triggerFocusTargetRef: MutableRef<HTMLElement | null>;
    readonly beforeContentFocusGuardRef: MutableRef<HTMLElement | null>;
};

type S = MenuState<unknown>;

export const menuSelectors = {
    ...popupStoreSelectors,
    disabled: createSelector((state: S) =>
        state.parent.type === 'menubar' ? state.parent.context.disabled || state.disabled : state.disabled
    ),

    modal: createSelector((state: S) => (state.parent.type === undefined || state.parent.type === 'context-menu') && (state.modal ?? true)),

    allowMouseEnter: createSelector((state: S) => state.allowMouseEnter),
    stickIfOpen: createSelector((state: S) => state.stickIfOpen),
    parent: createSelector((state: S) => state.parent),
    rootId: createSelector((state: S): string | undefined => {
        if (state.parent.type === 'menu') {
            return state.parent.store.select('rootId');
        }

        return state.parent.type !== undefined ? state.parent.context.rootId : state.rootId;
    }),
    activeIndex: createSelector((state: S) => state.activeIndex),
    isActive: createSelector((state: S, itemIndex: number) => state.activeIndex === itemIndex),
    hoverEnabled: createSelector((state: S) => state.hoverEnabled),
    instantType: createSelector((state: S) => state.instantType),
    lastOpenChangeReason: createSelector((state: S) => state.openChangeReason),
    floatingTreeRoot: createSelector((state: S): FloatingTreeStore => {
        if (state.parent.type === 'menu') {
            return state.parent.store.select('floatingTreeRoot');
        }

        return state.floatingTreeRoot;
    }),
    floatingNodeId: createSelector((state: S) => state.floatingNodeId),
    floatingParentNodeId: createSelector((state: S) => state.floatingParentNodeId),
    itemProps: createSelector((state: S) => state.itemProps),
    closeDelay: createSelector((state: S) => state.closeDelay),
    keyboardEventRelay: createSelector((state: S): MenuKeyboardEventRelay | undefined => {
        if (state.keyboardEventRelay) {
            return state.keyboardEventRelay;
        }

        if (state.parent.type === 'menu') {
            return state.parent.store.select('keyboardEventRelay');
        }

        return undefined;
    })
};

export type MenuSelectors = typeof menuSelectors;

function createInitialState<Payload>(): MenuState<Payload> {
    return {
        ...createInitialPopupStoreState<Payload>(),
        disabled: false,
        modal: true,
        allowMouseEnter: false,
        stickIfOpen: true,
        parent: {
            type: undefined
        },
        rootId: undefined,
        activeIndex: null,
        hoverEnabled: true,
        instantType: undefined,
        openChangeReason: null,
        floatingTreeRoot: new FloatingTreeStore(),
        floatingNodeId: undefined,
        floatingParentNodeId: null,
        itemProps: EMPTY_OBJECT as ElementProps,
        keyboardEventRelay: undefined,
        closeDelay: 0
    };
}

/**
 * State machine of a menu (also used by ContextMenu and Menubar submenus).
 */
export class MenuStore<Payload = unknown> extends ComponentStore<Readonly<MenuState<Payload>>, MenuContext, MenuSelectors> {
    private unsubscribeParentListener: (() => void) | null = null;

    private readonly unobserveParent: () => void;

    constructor(initialState?: Partial<MenuState<Payload>>) {
        super(
            { ...createInitialState<Payload>(), ...initialState },
            {
                positionerRef: createRef<HTMLElement>(),
                popupRef: createRef<HTMLElement>(),
                typingRef: { current: false },
                itemDomElements: { current: [] },
                itemLabels: { current: [] },
                allowMouseUpTriggerRef: { current: false },
                triggerFocusTargetRef: createRef<HTMLElement>(),
                beforeContentFocusGuardRef: createRef<HTMLElement>(),
                onOpenChangeComplete: undefined,
                triggerElements: new PopupTriggerMap()
            },
            menuSelectors
        );

        // Set up propagation of state from parent menu if applicable.
        this.unobserveParent = this.observe('parent', (parent) => {
            this.unsubscribeParentListener?.();

            if (parent.type === 'menu') {
                this.unsubscribeParentListener = parent.store.subscribe(() => {
                    this.notifyAll();
                });

                this.context.allowMouseUpTriggerRef = parent.store.context.allowMouseUpTriggerRef;
                return;
            }

            if (parent.type !== undefined) {
                this.context.allowMouseUpTriggerRef = parent.context.allowMouseUpTriggerRef;
            }

            this.unsubscribeParentListener = null;
        });
    }

    /**
     * Requests an open state change. The floating root of the menu performs it
     * (it listens to the `setOpen` event).
     */
    setOpen(open: boolean, eventDetails: Omit<MenuChangeEventDetails, 'preventUnmountOnClose'>) {
        this.state.floatingRootContext.context.events.emit('setOpen', { open, eventDetails });
    }

    /**
     * Stops propagating the parent menu's updates.
     */
    destroy() {
        this.unobserveParent();
        this.unsubscribeParentListener?.();
        this.unsubscribeParentListener = null;
    }
}
