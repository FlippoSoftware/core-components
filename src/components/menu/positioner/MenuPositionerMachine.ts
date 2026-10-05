import { getDisabledMountTransitionStyles } from '~@attributes/getDisabledMountTransitionStyles';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { ListRegistry } from '~@components/composite/list/ListRegistry';
import { getInternalBackdropProps } from '~@dom/internalBackdrop';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { DROPDOWN_COLLISION_AVOIDANCE, POPUP_COLLISION_AVOIDANCE } from '~@lib/constants';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { PopupPositionerController } from '~@popup/PopupPositionerController';
import { mergeProps } from '~@props/mergeProps';

import type { Align, Side } from '~@lib/types';
import type { PopupPositionerOptions } from '~@popup/PopupPositionerController';
import type { Props } from '~@props/mergeProps';

import type { MenuRootMachine } from '../root/MenuRootMachine';
import type { MenuChangeEventReason, MenuState, MenuStore } from '../store/MenuStore';

export type MenuOpenEventDetails = {
    open: boolean;
    nodeId: string | undefined;
    parentNodeId: string | null | undefined;
    reason: MenuChangeEventReason | null | undefined;
};

export type MenuPositionerState = {
    open: boolean;
    side: Side;
    align: Align;
    anchorHidden: boolean;
    nested: boolean;
};

/**
 * State machine of `Menu.Positioner`: positioning (submenus open to the inline end, context menus at
 * the cursor), the item list registry, and sibling/parent coordination through the floating tree.
 */
export class MenuPositionerMachine<Payload = unknown> {
    readonly controller: PopupPositionerController<MenuState<Payload>>;

    /**
     * Registry of the menu's items (DOM order, labels for typeahead).
     */
    readonly items: ListRegistry;

    private options: PopupPositionerOptions;

    private readonly root: MenuRootMachine<Payload>;

    private readonly menuOpenChangeEffect = new Effect(() => this.emitMenuOpenChange());

    private readonly unsubscribers: (() => void)[] = [];

    constructor(root: MenuRootMachine<Payload>, options: PopupPositionerOptions = {}) {
        this.root = root;
        this.options = options;
        this.items = new ListRegistry({
            elementsRef: root.store.context.itemDomElements,
            labelsRef: root.store.context.itemLabels
        });
        this.controller = new PopupPositionerController(root.store, {}, this.getPositionerOptions());
        root.node.attach(root.floatingRoot, () => this.controller.anchorPositioner.store.state.placement);

        const events = root.tree.events;
        events.on('menuopenchange', this.onMenuOpenChange);
        events.on('menuopenchange', this.onParentClose);
        events.on('itemhover', this.onItemHover);
        this.unsubscribers.push(
            () => {
                events.off('menuopenchange', this.onMenuOpenChange);
                events.off('menuopenchange', this.onParentClose);
                events.off('itemhover', this.onItemHover);
            },
            root.store.subscribe(() => this.sync())
        );
        this.sync();
    }

    private get store(): MenuStore<Payload> {
        return this.root.store;
    }

    setOptions(options: PopupPositionerOptions) {
        this.options = options;
        this.controller.setOptions(this.getPositionerOptions());
    }

    setElement = (element: HTMLElement | null) => {
        this.controller.setElement(element);
    };

    /**
     * The floating tree node ID of the menu (items emit it on hover).
     */
    get nodeId(): string | undefined {
        return this.store.select('floatingNodeId');
    }

    getState(): MenuPositionerState {
        return { ...this.controller.getState(), nested: this.store.select('parent').type === 'menu' };
    }

    static attrs(state: MenuPositionerState) {
        return getStyleHookProps(state, popupStateMapping);
    }

    getPositionerProps(elementProps: Props = {}): Props {
        return mergeProps(
            this.controller.getPositionerProps(),
            getDisabledMountTransitionStyles(this.store.select('transitionStatus')),
            elementProps
        );
    }

    /**
     * Whether the adapter renders the internal backdrop.
     */
    shouldRenderInternalBackdrop(): boolean {
        const { store } = this;
        const parent = store.select('parent');
        return (
            store.select('mounted') &&
            parent.type !== 'menu' &&
            ((parent.type !== 'menubar' && store.select('modal') && store.select('lastOpenChangeReason') !== REASONS.triggerHover) ||
                (parent.type === 'menubar' && Boolean(parent.context.modal)))
        );
    }

    /**
     * Props of the internal backdrop; the cutout keeps the menubar or the trigger interactive.
     */
    getInternalBackdropProps() {
        const parent = this.store.select('parent');
        let cutout: Element | null = null;
        if (parent.type === 'menubar') {
            cutout = parent.context.contentElement ?? null;
        } else if (parent.type === undefined) {
            cutout = this.store.select('activeTriggerElement');
        }
        return getInternalBackdropProps(cutout, !this.store.select('open'));
    }

    /**
     * Ref callback for the internal backdrop (context menus track it for outside presses).
     */
    setInternalBackdrop = (element: HTMLDivElement | null) => {
        const parent = this.store.select('parent');
        if ((parent.type === 'context-menu' || parent.type === 'nested-context-menu') && parent.context.internalBackdropRef) {
            parent.context.internalBackdropRef.current = element;
        }
    };

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.menuOpenChangeEffect.destroy();
        this.controller.destroy();
        this.items.destroy();
    }

    private getPositionerOptions(): PopupPositionerOptions {
        const parent = this.store.select('parent');
        const options = this.options;
        let { anchor, sideOffset = 0, alignOffset = 0, align, side } = options;
        let collisionAvoidance = options.collisionAvoidance ?? DROPDOWN_COLLISION_AVOIDANCE;

        if (parent.type === 'context-menu') {
            anchor = anchor ?? parent.context.anchor;
            align = align ?? 'start';
            if (!side && align !== 'center') {
                alignOffset = options.alignOffset ?? 2;
                sideOffset = options.sideOffset ?? -5;
            }
        }

        if (parent.type === 'menu') {
            side = side ?? 'inline-end';
            align = align ?? 'start';
            collisionAvoidance = options.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE;
        } else if (parent.type === 'menubar') {
            side = side ?? 'bottom';
            align = align ?? 'start';
        }

        const contextMenu = parent.type === 'context-menu';
        return {
            ...options,
            anchor,
            side,
            align,
            sideOffset,
            alignOffset,
            collisionAvoidance,
            positionMethod: contextMenu ? 'fixed' : (options.positionMethod ?? 'absolute'),
            shiftCrossAxis: contextMenu && !('side' in collisionAvoidance && collisionAvoidance.side === 'flip'),
            arrowPadding: contextMenu ? 0 : (options.arrowPadding ?? 5)
        };
    }

    private sync() {
        const { store } = this;
        // The context menu anchor and the parent type may change.
        this.controller?.setOptions(this.getPositionerOptions());
        this.menuOpenChangeEffect.sync([store.select('open'), store.select('floatingNodeId'), store.select('floatingParentNodeId')]);
    }

    private emitMenuOpenChange() {
        const { store } = this;
        const details: MenuOpenEventDetails = {
            open: store.select('open'),
            nodeId: store.select('floatingNodeId'),
            parentNodeId: store.select('floatingParentNodeId'),
            reason: store.select('lastOpenChangeReason')
        };
        this.root.tree.events.emit('menuopenchange', details);
        return;
    }

    private readonly onMenuOpenChange = (details: MenuOpenEventDetails) => {
        const { store } = this;
        if (!details.open) {
            return;
        }
        if (details.parentNodeId === store.select('floatingNodeId')) {
            store.set('hoverEnabled', false);
        }
        if (details.nodeId !== store.select('floatingNodeId') && details.parentNodeId === store.select('floatingParentNodeId')) {
            store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
        }
    };

    private readonly onParentClose = (details: MenuOpenEventDetails) => {
        const { store } = this;
        const parentNodeId = store.select('floatingParentNodeId');
        if (parentNodeId == null || details.open || details.nodeId !== parentNodeId) {
            return;
        }
        store.setOpen(false, createChangeEventDetails(details.reason ?? REASONS.siblingOpen));
    };

    /**
     * Closes this submenu when a different item of the parent menu is hovered.
     */
    private readonly onItemHover = (event: { nodeId: string | undefined; target: Element | null }) => {
        const { store } = this;
        if (!store.select('open') || event.nodeId !== store.select('floatingParentNodeId')) {
            return;
        }
        const triggerElement = store.select('activeTriggerElement');
        if (event.target && triggerElement && triggerElement !== event.target) {
            store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
        }
    };
}
